"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  employeeAddresses,
  employeeBankAccounts,
  employeeCustomFieldValues,
  employeeDependents,
  employeeEducations,
  employeeEmploymentHistory,
  employeeInsurances,
  employees,
  workLocations,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getUserAuthorization,
  hasPermission,
  requirePermission,
} from "@/lib/auth/rbac";

import { listEmployeeIdentifiersByOrganization } from "../queries";
import { listActiveFieldDefinitions } from "../../employee-fields/queries";
import { parseCustomFieldValue } from "../../employee-fields/validation";
import { isFieldWritableByRoles } from "../../employee-fields/filtering";
import {
  analyzeExcelImport,
  buildExcelPreviewErrors,
  buildExcelUpdatePatch,
  EXCEL_IMPORT_MAX_ROWS,
  findDuplicateExistingEmailErrors,
  planExcelImport,
  validateRequiredCustomFieldsForCreates,
  type CustomFieldImportSpec,
  type ExcelImportAnalysis,
  type ExcelPlanOperation,
} from "./import.ts";

/**
 * Employee Master Data Excel import (Upload → Validate → Preview → Import).
 *
 * Security rules (mirroring the CSV import and the section actions):
 *  - Both steps re-authenticate and re-authorize against PostgreSQL; the
 *    organization always comes from the session.
 *  - `employees.import` gates the whole flow. Writing update rows additionally
 *    requires `employees.update`, and each section column is only touched when
 *    the actor holds the matching section capability (personal / employment /
 *    address / insurance / bank / family / education / custom data).
 *  - The confirm step RE-ANALYZES and RE-PLANS from the uploaded file. The
 *    client's preview classification is advisory; nothing writable is trusted
 *    from the browser payload.
 *  - Everything commits inside ONE transaction; any failure rolls the whole
 *    import back.
 */

const PERSONAL_KEYS = [
  "nik",
  "birth date",
  "nickname",
  "birth place",
  "gender",
  "religion",
  "marital status",
  "nationality",
  "personal email",
  "phone",
] as const;

const EMPLOYMENT_KEYS = [
  "division",
  "department",
  "position",
  "work location",
  "manager",
  "employment type",
  "contract start",
  "contract end",
  "resignation date",
  "termination date",
  "reason for leaving",
] as const;

function hasAnyCell(cells: Record<string, string>, keys: readonly string[]): boolean {
  return keys.some((key) => (cells[key] ?? "") !== "");
}

function cellOrNull(cells: Record<string, string>, key: string): string | null {
  const raw = (cells[key] ?? "").trim();
  return raw === "" ? null : raw.slice(0, 500);
}

function cellPatch(
  cells: Record<string, string>,
  key: string,
  max = 500
): string | undefined {
  const raw = (cells[key] ?? "").trim();
  return raw === "" ? undefined : raw.slice(0, max);
}

function dateOrNull(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return new Date(`${raw}T00:00:00.000Z`);
}

export interface ExcelImportPreviewResult {
  status: "idle" | "error" | "preview" | "success";
  message?: string;
  totalRows: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  previewErrors: { rowNumber: number; employeeNumber: string; error: string }[];
  sheetNames: string[];
  /** Plan summary sent back on confirm (informational; server re-plans). */
  plan: { rowNumber: number; employeeNumber: string; operation: ExcelPlanOperation }[];
}

function emptyPreview(): ExcelImportPreviewResult {
  return {
    status: "idle",
    totalRows: 0,
    createCount: 0,
    updateCount: 0,
    errorCount: 0,
    previewErrors: [],
    sheetNames: [],
    plan: [],
  };
}

function previewError(message: string): ExcelImportPreviewResult {
  return { ...emptyPreview(), status: "error", message };
}

async function loadImportContext(): Promise<{
  userId: string;
  organizationId: string;
  customSpecs: CustomFieldImportSpec[];
  inaccessibleRequiredField: boolean;
}> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_IMPORT);
  if (!user.organizationId) {
    throw new Error("Your account is not assigned to an organization.");
  }
  const [authorization, definitions] = await Promise.all([
    getUserAuthorization(user.id),
    listActiveFieldDefinitions(user.organizationId),
  ]);
  const canViewCustomData =
    authorization.isSuperAdmin ||
    authorization.permissionCodes.includes(
      PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW
    );
  const canUpdateCustomData =
    authorization.isSuperAdmin ||
    authorization.permissionCodes.includes(
      PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE
    );
  const writableDefinitions =
    canViewCustomData && canUpdateCustomData
      ? definitions.filter((definition) =>
          isFieldWritableByRoles(
            definition.visibilityConfig,
            definition.editableByConfig,
            authorization.roleCodes
          )
        )
      : [];
  const writableKeys = new Set(
    writableDefinitions.map((definition) => definition.fieldKey)
  );
  const inaccessibleRequiredField = definitions.some(
    (definition) => definition.isRequired && !writableKeys.has(definition.fieldKey)
  );
  const customSpecs: CustomFieldImportSpec[] = writableDefinitions.map(
    (definition) => ({
      fieldDefinitionId: definition.id,
      label: definition.label,
      fieldKey: definition.fieldKey,
      fieldType: definition.fieldType,
      options: definition.options,
      isRequired: definition.isRequired,
    })
  );
  return {
    userId: user.id,
    organizationId: user.organizationId,
    customSpecs,
    inaccessibleRequiredField,
  };
}

/**
 * Step 1+2 — upload + validate. Reads the workbook, analyzes it against the
 * shared column contract and the organization's ACTIVE custom field
 * definitions, and classifies every valid Employees-tab row as CREATE or
 * UPDATE by looking up its employee number in the organization. Writes
 * nothing.
 */
export async function previewExcelImportAction(
  _prevState: ExcelImportPreviewResult,
  formData: FormData
): Promise<ExcelImportPreviewResult> {
  let context: Awaited<ReturnType<typeof loadImportContext>>;
  try {
    context = await loadImportContext();
  } catch {
    return previewError("You are not allowed to import employees.");
  }

  const file = formData.get("excelFile");
  if (!(file instanceof File)) {
    return previewError("No file selected.");
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return previewError("Only .xlsx workbooks are supported. Use the Excel template.");
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return previewError("Could not read the uploaded file. Please try again.");
  }

  let analysis: ExcelImportAnalysis;
  try {
    analysis = await analyzeExcelImport(buffer, context.customSpecs);
  } catch {
    return previewError(
      "The file could not be parsed as an Excel workbook. Use the downloadable template."
    );
  }

  if (!analysis.employeesSheetFound) {
    return previewError('The workbook must contain an "Employees" sheet.');
  }
  if (analysis.missingColumns.length > 0) {
    return previewError(
      `Missing required columns on the Employees sheet: ${analysis.missingColumns.join(", ")}.`
    );
  }
  if (analysis.rowLimitExceeded) {
    return previewError(
      `Import rejected: maximum ${EXCEL_IMPORT_MAX_ROWS} employees per import.`
    );
  }

  const identifiers = await listEmployeeIdentifiersByOrganization(
    context.organizationId
  );
  const existingNumbers = new Set(identifiers.map((row) => row.employeeNumber));
  const plan = planExcelImport(analysis, existingNumbers);

  if (plan.createCount > 0 && context.inaccessibleRequiredField) {
    return previewError(
      "A required custom field is unavailable to your current roles. New employees cannot be imported."
    );
  }

  const permissions = await loadSectionPermissions(context.userId, analysis);
  const unauthorizedSections = findUnauthorizedSections(analysis, permissions);
  if (unauthorizedSections.length > 0) {
    return previewError(
      `Import includes sections you are not authorized to update: ${unauthorizedSections.join(", ")}.`
    );
  }

  const previewErrors = [
    ...buildExcelPreviewErrors(analysis, plan),
    ...findDuplicateExistingEmailErrors(plan, identifiers),
    ...validateRequiredCustomFieldsForCreates(plan, context.customSpecs),
  ];

  return {
    status: "preview",
    totalRows: analysis.employeeRowCount,
    createCount: plan.createCount,
    updateCount: plan.updateCount,
    errorCount: previewErrors.length,
    previewErrors,
    sheetNames: analysis.sheetNames,
    plan: plan.rows.map((row) => ({
      rowNumber: row.rowNumber,
      employeeNumber: row.employeeNumber,
      operation: row.operation,
    })),
    message:
      plan.rows.length === 0
        ? "No valid employee rows were found."
        : `${plan.createCount} to create, ${plan.updateCount} to update of ${plan.rows.length} valid rows. ${previewErrors.length} row(s) need attention.`,
  };
}

interface SectionPermissions {
  personal: boolean;
  employment: boolean;
  address: boolean;
  insurance: boolean;
  bank: boolean;
  family: boolean;
  education: boolean;
  customData: boolean;
}

async function loadSectionPermissions(
  userId: string,
  analysis: ExcelImportAnalysis
): Promise<SectionPermissions> {
  const touches = {
    personal:
      analysis.rows.some((row) => hasAnyCell(row.cells ?? {}, PERSONAL_KEYS)) ||
      analysis.secondary.some(
        (row) => row.sheet === "Family" && (row.cells["nik"] ?? "") !== ""
      ),
    employment:
      analysis.rows.some((row) => hasAnyCell(row.cells ?? {}, EMPLOYMENT_KEYS)) ||
      analysis.rows.some((row) => (row.cells?.["hire date"] ?? "") !== ""),
    address: analysis.secondary.some((row) => row.sheet === "Addresses"),
    insurance: analysis.secondary.some((row) => row.sheet === "Insurance"),
    bank: analysis.secondary.some((row) => row.sheet === "Bank Accounts"),
    family: analysis.secondary.some((row) => row.sheet === "Family"),
    education: analysis.secondary.some((row) => row.sheet === "Education"),
    customData: analysis.secondary.some(
      (row) => row.sheet === "Custom Fields"
    ),
  };

  const checks = await Promise.all([
    touches.personal
      ? hasPermission(userId, PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE)
      : Promise.resolve(true),
    touches.employment
      ? hasPermission(userId, PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE)
      : Promise.resolve(true),
    touches.address
      ? hasPermission(userId, PERMISSIONS.EMPLOYEES_ADDRESS_UPDATE)
      : Promise.resolve(true),
    touches.insurance
      ? hasPermission(userId, PERMISSIONS.EMPLOYEES_INSURANCE_UPDATE)
      : Promise.resolve(true),
    touches.bank
      ? hasPermission(userId, PERMISSIONS.EMPLOYEES_BANK_UPDATE)
      : Promise.resolve(true),
    touches.family
      ? hasPermission(userId, PERMISSIONS.EMPLOYEES_FAMILY_UPDATE)
      : Promise.resolve(true),
    touches.education
      ? hasPermission(userId, PERMISSIONS.EMPLOYEES_EDUCATION_UPDATE)
      : Promise.resolve(true),
    touches.customData
      ? hasPermission(userId, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE)
      : Promise.resolve(true),
  ]);

  return {
    personal: checks[0],
    employment: checks[1],
    address: checks[2],
    insurance: checks[3],
    bank: checks[4],
    family: checks[5],
    education: checks[6],
    customData: checks[7],
  };
}

function findUnauthorizedSections(
  analysis: ExcelImportAnalysis,
  permissions: SectionPermissions
): string[] {
  const unauthorized: string[] = [];
  if (
    !permissions.personal &&
    (analysis.rows.some((row) => hasAnyCell(row.cells ?? {}, PERSONAL_KEYS)) ||
      analysis.secondary.some(
        (row) => row.sheet === "Family" && (row.cells.nik ?? "") !== ""
      ))
  ) {
    unauthorized.push("Personal");
  }
  if (
    !permissions.employment &&
    analysis.rows.some(
      (row) =>
        hasAnyCell(row.cells ?? {}, EMPLOYMENT_KEYS) ||
        (row.cells?.["hire date"] ?? "") !== ""
    )
  ) {
    unauthorized.push("Employment");
  }
  if (!permissions.address && analysis.secondary.some((row) => row.sheet === "Addresses")) {
    unauthorized.push("Address");
  }
  if (!permissions.insurance && analysis.secondary.some((row) => row.sheet === "Insurance")) {
    unauthorized.push("Insurance");
  }
  if (!permissions.bank && analysis.secondary.some((row) => row.sheet === "Bank Accounts")) {
    unauthorized.push("Bank");
  }
  if (!permissions.family && analysis.secondary.some((row) => row.sheet === "Family")) {
    unauthorized.push("Family");
  }
  if (!permissions.education && analysis.secondary.some((row) => row.sheet === "Education")) {
    unauthorized.push("Education");
  }
  if (
    !permissions.customData &&
    analysis.secondary.some((row) => row.sheet === "Custom Fields")
  ) {
    unauthorized.push("Custom Fields");
  }
  return unauthorized;
}

class ImportError extends Error {}

/** Step 3+4 — commit. Re-parses the file and applies everything in one tx. */
export async function confirmExcelImportAction(
  _prevState: ExcelImportPreviewResult,
  formData: FormData
): Promise<ExcelImportPreviewResult> {
  let context: Awaited<ReturnType<typeof loadImportContext>>;
  try {
    context = await loadImportContext();
  } catch {
    return previewError("You are not allowed to import employees.");
  }
  const { userId, organizationId, customSpecs } = context;

  const file = formData.get("excelFile");
  if (!(file instanceof File)) {
    return previewError("The uploaded file is missing. Upload it again.");
  }

  let analysis: ExcelImportAnalysis;
  try {
    const buffer = await file.arrayBuffer();
    analysis = await analyzeExcelImport(buffer, customSpecs);
  } catch {
    return previewError("The file could not be parsed. Upload a valid workbook.");
  }
  if (
    !analysis.employeesSheetFound ||
    analysis.missingColumns.length > 0 ||
    analysis.rowLimitExceeded ||
    analysis.errorEmployees.length > 0 ||
    analysis.secondary.some((row) => row.error)
  ) {
    return previewError(
      "The workbook has validation errors. Preview it again and fix every row before importing."
    );
  }

  const identifiers = await listEmployeeIdentifiersByOrganization(organizationId);
  const existingByNumber = new Map(
    identifiers.map((row) => [row.employeeNumber, row])
  );
  const existingNumbers = new Set(existingByNumber.keys());
  const plan = planExcelImport(analysis, existingNumbers);
  if (plan.orphanedSecondaryEmployeeNumbers.length > 0) {
    return previewError(
      "Secondary sheets reference unknown employee numbers: " +
        plan.orphanedSecondaryEmployeeNumbers.join(", ")
    );
  }
  const duplicateEmailErrors = findDuplicateExistingEmailErrors(plan, identifiers);
  if (duplicateEmailErrors.length > 0) {
    return previewError(duplicateEmailErrors[0]?.error ?? "Duplicate employee email.");
  }
  if (plan.rows.length === 0) {
    return previewError("No valid employee rows to import.");
  }

  if (plan.updateCount > 0) {
    await requirePermission(userId, PERMISSIONS.EMPLOYEES_UPDATE);
  }
  if (plan.createCount > 0) {
    await requirePermission(userId, PERMISSIONS.EMPLOYEES_CREATE);
  }
  if (plan.createCount > 0 && context.inaccessibleRequiredField) {
    return previewError(
      "A required custom field is unavailable to your current roles. New employees cannot be imported."
    );
  }
  const permissions = await loadSectionPermissions(userId, analysis);
  const unauthorizedSections = findUnauthorizedSections(analysis, permissions);
  if (unauthorizedSections.length > 0) {
    return previewError(
      `Import includes sections you are not authorized to update: ${unauthorizedSections.join(", ")}.`
    );
  }
  for (const row of plan.rows) {
    if (row.operation !== "update") continue;
    const requestedStatus = (row.cells.status ?? "").toLowerCase();
    if (!requestedStatus) continue;
    const currentStatus = existingByNumber.get(row.employeeNumber)?.status;
    if (currentStatus === "inactive" && requestedStatus === "active") {
      return previewError(
        `Row for ${row.employeeNumber}: inactive employees cannot be reactivated through Excel import.`
      );
    }
    if (currentStatus === "active" && requestedStatus === "inactive") {
      await requirePermission(userId, PERMISSIONS.EMPLOYEES_DELETE);
    }
  }

  // Resolve work-location names and manager employee numbers in one pass.
  const locationNames = new Set(
    plan.rows
      .map((row) => row.cells["work location"])
      .filter((name) => name)
  );
  const managerNumbers = new Set(
    plan.rows.map((row) => row.cells["manager"]).filter((number) => number)
  );
  const [locations, managers] = await Promise.all([
    locationNames.size > 0
      ? db
          .select({ id: workLocations.id, name: workLocations.name })
          .from(workLocations)
          .where(
            and(
              eq(workLocations.organizationId, organizationId),
              inArray(workLocations.name, [...locationNames])
            )
          )
      : Promise.resolve([]),
    managerNumbers.size > 0
      ? db
          .select({ id: employees.id, employeeNumber: employees.employeeNumber })
          .from(employees)
          .where(
            and(
              eq(employees.organizationId, organizationId),
              inArray(employees.employeeNumber, [...managerNumbers])
            )
          )
      : Promise.resolve([]),
  ]);
  const locationByName = new Map(locations.map((row) => [row.name, row.id]));
  const managerByNumber = new Map(
    managers.map((row) => [row.employeeNumber, row.id])
  );

  const definitionsByFieldKey = new Map(
    customSpecs.map((spec) => [spec.fieldKey, spec])
  );
  const customWrites = new Map<
    string,
    {
      fieldDefinitionId: string;
      valueText: string | null;
      valueNumber: string | null;
      valueDate: Date | null;
      valueBoolean: boolean | null;
      valueJson: unknown[] | null;
    }[]
  >();

  try {
    for (const row of plan.rows) {
      const writes: {
        fieldDefinitionId: string;
        valueText: string | null;
        valueNumber: string | null;
        valueDate: Date | null;
        valueBoolean: boolean | null;
        valueJson: unknown[] | null;
      }[] = [];
      for (const [fieldKey, raw] of Object.entries(row.customValues)) {
        const spec = definitionsByFieldKey.get(fieldKey);
        if (!spec) {
          throw new ImportError(
            `Row for ${row.employeeNumber}: unknown or unauthorized custom field "${fieldKey}".`
          );
        }
        const parsed = parseCustomFieldValue(spec.fieldType, raw, spec.options);
        if (!parsed.ok) {
          throw new ImportError(
            `Row for ${row.employeeNumber}: [${spec.label}] ${parsed.error}`
          );
        }
        writes.push({
          fieldDefinitionId: spec.fieldDefinitionId,
          valueText: parsed.value.valueText,
          valueNumber: parsed.value.valueNumber,
          valueDate: parsed.value.valueDate,
          valueBoolean: parsed.value.valueBoolean,
          valueJson: parsed.value.valueJson,
        });
      }
      if (row.operation === "create") {
        for (const spec of customSpecs) {
          if (spec.isRequired && !row.customValues[spec.fieldKey]) {
            throw new ImportError(
              `Row for ${row.employeeNumber}: [${spec.label}] This field is required.`
            );
          }
        }
      }
      if (writes.length > 0) customWrites.set(row.employeeNumber, writes);
    }
  } catch (error) {
    if (error instanceof ImportError) {
      return previewError(
        `Import rolled back — no records were changed. ${error.message}`
      );
    }
    throw error;
  }

  try {
    const summary = await db.transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let secondaryRows = 0;

      for (const row of plan.rows) {
        const cells = row.cells;
        const requestedStatus = (cells.status ?? "").toLowerCase();
        const employmentTouched =
          hasAnyCell(cells, EMPLOYMENT_KEYS) || Boolean(cells.status);
        const write: Partial<typeof employees.$inferInsert> =
          row.operation === "update"
            ? (buildExcelUpdatePatch(cells, permissions) as Partial<
                typeof employees.$inferInsert
              >)
            : {};
        if (row.operation === "create") {
          write.firstName = (cells["first name"] ?? "").slice(0, 100);
          write.lastName = (cells["last name"] ?? "").slice(0, 100);
          write.email = cellOrNull(cells, "email");
          write.employmentStatus = requestedStatus || "active";
          if (permissions.personal) {
            for (const [key, property] of [
              ["phone", "phone"],
              ["nik", "nik"],
              ["nickname", "nickname"],
              ["birth place", "birthPlace"],
              ["gender", "gender"],
              ["religion", "religion"],
              ["marital status", "maritalStatus"],
              ["nationality", "nationality"],
              ["personal email", "personalEmail"],
            ] as const) {
              const value = cellOrNull(cells, key);
              if (value !== null) write[property] = value;
            }
            write.birthDate = dateOrNull(cells["birth date"]);
          }
          if (permissions.employment) {
            for (const [key, property] of [
              ["division", "division"],
              ["department", "department"],
              ["position", "position"],
              ["employment type", "employmentType"],
              ["reason for leaving", "reasonForLeaving"],
            ] as const) {
              const value = cellOrNull(cells, key);
              if (value !== null) write[property] = value;
            }
            write.hireDate = dateOrNull(cells["hire date"]);
            write.contractStart = dateOrNull(cells["contract start"]);
            write.contractEnd = dateOrNull(cells["contract end"]);
            write.resignationDate = dateOrNull(cells["resignation date"]);
            write.terminationDate = dateOrNull(cells["termination date"]);
          }
        }
        if (permissions.employment && cells["work location"]) {
          const resolved = locationByName.get(cells["work location"]);
          if (!resolved) {
            throw new ImportError(
              `Unknown work location "${cells["work location"]}".`
            );
          }
          write.workLocationId = resolved;
        }
        if (permissions.employment && cells.manager) {
          const resolved = managerByNumber.get(cells.manager);
          if (!resolved) {
            throw new ImportError(
              `Unknown manager employee number "${cells.manager}".`
            );
          }
          write.managerId = resolved;
        }

        let employeeId: string;
        if (row.operation === "create") {
          const inserted = await tx
            .insert(employees)
            .values({
              ...write,
              organizationId,
              employeeNumber: row.employeeNumber,
              firstName: (cells["first name"] ?? "").slice(0, 100),
              lastName: (cells["last name"] ?? "").slice(0, 100),
            })
            .returning({ id: employees.id });
          const record = inserted[0];
          if (!record) throw new Error("Employee insert returned no row.");
          employeeId = record.id;
          await tx.insert(employeeEmploymentHistory).values({
            organizationId,
            employeeId,
            position: write.position ?? null,
            department: write.department ?? null,
            division: write.division ?? null,
            managerId: write.managerId ?? null,
            workLocationId: write.workLocationId ?? null,
            employmentType: write.employmentType ?? null,
            employmentStatus: write.employmentStatus ?? "active",
            effectiveFrom: new Date(),
            notes: "Created through Excel import",
          });
          created += 1;
        } else {
          const existingRows = await tx
            .select({
              id: employees.id,
              status: employees.employmentStatus,
              position: employees.position,
              department: employees.department,
              division: employees.division,
              managerId: employees.managerId,
              workLocationId: employees.workLocationId,
              employmentType: employees.employmentType,
            })
            .from(employees)
            .where(
              and(
                eq(employees.organizationId, organizationId),
                eq(employees.employeeNumber, row.employeeNumber)
              )
            )
            .limit(1);
          const existing = existingRows[0];
          if (!existing) {
            throw new ImportError(
              `Employee ${row.employeeNumber} disappeared during import.`
            );
          }
          if (existing.status === "inactive" && requestedStatus === "active") {
            throw new ImportError(
              `Row for ${row.employeeNumber}: inactive employees cannot be reactivated through Excel import.`
            );
          }
          if (write.managerId === existing.id) {
            throw new ImportError(
              `Row for ${row.employeeNumber}: an employee cannot manage themselves.`
            );
          }
          employeeId = existing.id;
          const effectiveFrom = new Date();
          if (Object.keys(write).length > 0) {
            const changed = await tx
              .update(employees)
              .set({ ...write, updatedAt: effectiveFrom })
              .where(
                and(
                  eq(employees.id, existing.id),
                  eq(employees.organizationId, organizationId)
                )
              )
              .returning({ id: employees.id });
            if (changed.length === 0) {
              throw new ImportError(
                `Employee ${row.employeeNumber} disappeared during import.`
              );
            }
          }
          if (employmentTouched) {
            await tx.insert(employeeEmploymentHistory).values({
              organizationId,
              employeeId,
              position: write.position ?? existing.position,
              department: write.department ?? existing.department,
              division: write.division ?? existing.division,
              managerId: write.managerId ?? existing.managerId,
              workLocationId: write.workLocationId ?? existing.workLocationId,
              employmentType: write.employmentType ?? existing.employmentType,
              employmentStatus: write.employmentStatus ?? existing.status,
              effectiveFrom,
              notes: "Updated through Excel import",
            });
          }
          updated += 1;
        }

        // -- secondary sheets ------------------------------------------------
        for (const secondary of row.secondary) {
          const data = secondary.cells;
          switch (secondary.sheet) {
            case "Addresses": {
              if (!permissions.address) {
                throw new ImportError("Address import is not authorized.");
              }
              const type = (data["address type"] || "ktp").toLowerCase();
              await tx
                .insert(employeeAddresses)
                .values({
                  organizationId,
                  employeeId,
                  type,
                  address: cellOrNull(data, "address"),
                  rtRw: cellOrNull(data, "rt/rw"),
                  village: cellOrNull(data, "village"),
                  district: cellOrNull(data, "district"),
                  city: cellOrNull(data, "city"),
                  province: cellOrNull(data, "province"),
                  postalCode: cellOrNull(data, "postal code"),
                  sameAsKtp:
                    type === "domicile" &&
                    (data["same as ktp"] || "").toLowerCase() === "yes",
                })
                .onConflictDoUpdate({
                  target: [
                    employeeAddresses.organizationId,
                    employeeAddresses.employeeId,
                    employeeAddresses.type,
                  ],
                  set: {
                    address: cellPatch(data, "address"),
                    rtRw: cellPatch(data, "rt/rw"),
                    village: cellPatch(data, "village"),
                    district: cellPatch(data, "district"),
                    city: cellPatch(data, "city"),
                    province: cellPatch(data, "province"),
                    postalCode: cellPatch(data, "postal code"),
                    sameAsKtp:
                      data["same as ktp"] === ""
                        ? undefined
                        : type === "domicile" &&
                          data["same as ktp"]?.toLowerCase() === "yes",
                    updatedAt: new Date(),
                  },
                });
              secondaryRows += 1;
              break;
            }
            case "Insurance": {
              if (!permissions.insurance) {
                throw new ImportError("Insurance import is not authorized.");
              }
              await tx
                .insert(employeeInsurances)
                .values({
                  organizationId,
                  employeeId,
                  npwp: cellOrNull(data, "npwp"),
                  bpjsKesehatanNumber: cellOrNull(
                    data,
                    "bpjs kesehatan number"
                  ),
                  bpjsKesehatanStatus: cellOrNull(
                    data,
                    "bpjs kesehatan status"
                  ),
                  bpjsKesehatanClass: cellOrNull(data, "bpjs kesehatan class"),
                  bpjsKetenagakerjaanNumber: cellOrNull(
                    data,
                    "bpjs ketenagakerjaan number"
                  ),
                  bpjsKetenagakerjaanStatus: cellOrNull(
                    data,
                    "bpjs ketenagakerjaan status"
                  ),
                })
                .onConflictDoUpdate({
                  target: [
                    employeeInsurances.organizationId,
                    employeeInsurances.employeeId,
                  ],
                  set: {
                    npwp: cellPatch(data, "npwp"),
                    bpjsKesehatanNumber: cellPatch(
                      data,
                      "bpjs kesehatan number"
                    ),
                    bpjsKesehatanStatus: cellPatch(
                      data,
                      "bpjs kesehatan status"
                    ),
                    bpjsKesehatanClass: cellPatch(
                      data,
                      "bpjs kesehatan class"
                    ),
                    bpjsKetenagakerjaanNumber: cellPatch(
                      data,
                      "bpjs ketenagakerjaan number"
                    ),
                    bpjsKetenagakerjaanStatus: cellPatch(
                      data,
                      "bpjs ketenagakerjaan status"
                    ),
                    updatedAt: new Date(),
                  },
                });
              secondaryRows += 1;
              break;
            }
            case "Bank Accounts": {
              if (!permissions.bank) {
                throw new ImportError("Bank account import is not authorized.");
              }
              const bankName = (data["bank name"] ?? "").trim().slice(0, 100);
              const accountNumber = (data["account number"] ?? "")
                .trim()
                .slice(0, 40);
              const existingAccounts = await tx
                .select({
                  id: employeeBankAccounts.id,
                  accountHolder: employeeBankAccounts.accountHolder,
                  branch: employeeBankAccounts.branch,
                  status: employeeBankAccounts.status,
                  isPrimary: employeeBankAccounts.isPrimary,
                })
                .from(employeeBankAccounts)
                .where(
                  and(
                    eq(employeeBankAccounts.organizationId, organizationId),
                    eq(employeeBankAccounts.employeeId, employeeId),
                    eq(employeeBankAccounts.bankName, bankName),
                    eq(employeeBankAccounts.accountNumber, accountNumber)
                  )
                );
              const existingAccount = existingAccounts[0];
              const primaryRaw = (data["is primary"] ?? "").trim().toLowerCase();
              const isPrimary = primaryRaw
                ? primaryRaw === "yes"
                : existingAccount?.isPrimary ?? false;
              const accountHolder =
                cellPatch(data, "account holder", 150) ??
                existingAccount?.accountHolder ??
                "";
              const branch =
                cellPatch(data, "branch") ?? existingAccount?.branch ?? null;
              const statusRaw = (data.status ?? "").trim().toLowerCase();
              const accountStatus = statusRaw
                ? statusRaw === "inactive"
                  ? "inactive"
                  : "active"
                : existingAccount?.status ?? "active";
              if (existingAccounts.length > 1) {
                throw new ImportError(
                  `Row for ${row.employeeNumber}: multiple bank accounts match ${bankName} (${accountNumber}). Resolve them before importing.`
                );
              }
              if (existingAccount) {
                if (isPrimary) {
                  await tx
                    .update(employeeBankAccounts)
                    .set({ isPrimary: false })
                    .where(
                      and(
                        eq(employeeBankAccounts.organizationId, organizationId),
                        eq(employeeBankAccounts.employeeId, employeeId),
                        ne(employeeBankAccounts.id, existingAccount.id)
                      )
                    );
                }
                await tx
                  .update(employeeBankAccounts)
                  .set({
                    accountHolder,
                    branch,
                    status: accountStatus,
                    isPrimary,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(employeeBankAccounts.id, existingAccount.id),
                      eq(employeeBankAccounts.organizationId, organizationId),
                      eq(employeeBankAccounts.employeeId, employeeId)
                    )
                  );
              } else {
                if (isPrimary) {
                  await tx
                    .update(employeeBankAccounts)
                    .set({ isPrimary: false })
                    .where(
                      and(
                        eq(employeeBankAccounts.organizationId, organizationId),
                        eq(employeeBankAccounts.employeeId, employeeId)
                      )
                    );
                }
                await tx.insert(employeeBankAccounts).values({
                  organizationId,
                  employeeId,
                  bankName,
                  accountNumber,
                  accountHolder,
                  branch,
                  status: accountStatus,
                  isPrimary,
                });
              }
              secondaryRows += 1;
              break;
            }
            case "Family": {
              if (!permissions.family) {
                throw new ImportError("Family import is not authorized.");
              }
              const name = (data.name ?? "").trim().slice(0, 150);
              const relationship = (data.relationship ?? "")
                .trim()
                .slice(0, 30);
              const existingDependents = await tx
                .select()
                .from(employeeDependents)
                .where(
                  and(
                    eq(employeeDependents.organizationId, organizationId),
                    eq(employeeDependents.employeeId, employeeId)
                  )
                );
              const matchingDependents = existingDependents.filter(
                (dependent) =>
                  dependent.name.trim().toLowerCase() === name.toLowerCase() &&
                  dependent.relationship.trim().toLowerCase() ===
                    relationship.toLowerCase()
              );
              if (matchingDependents.length > 1) {
                throw new ImportError(
                  `Row for ${row.employeeNumber}: multiple dependents match "${name}" (${relationship}). Resolve them before importing.`
                );
              }
              if (matchingDependents.length === 1) {
                const current = matchingDependents[0];
                if (!current) throw new ImportError("Dependent record changed during import.");
                await tx
                  .update(employeeDependents)
                  .set({
                    name,
                    relationship,
                    nik: cellPatch(data, "nik") ?? current.nik,
                    birthDate:
                      data["birth date"] === ""
                        ? current.birthDate
                        : dateOrNull(data["birth date"]),
                    gender: cellPatch(data, "gender") ?? current.gender,
                    occupation: cellPatch(data, "occupation") ?? current.occupation,
                    dependentStatus:
                      cellPatch(data, "dependent status") ?? current.dependentStatus,
                    bpjsStatus: cellPatch(data, "bpjs status") ?? current.bpjsStatus,
                    notes: cellPatch(data, "notes") ?? current.notes,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(employeeDependents.organizationId, organizationId),
                      eq(employeeDependents.id, current.id)
                    )
                  );
              } else {
                await tx.insert(employeeDependents).values({
                  organizationId,
                  employeeId,
                  name,
                  relationship,
                  nik: cellOrNull(data, "nik"),
                  birthDate: dateOrNull(data["birth date"]),
                  gender: cellOrNull(data, "gender"),
                  occupation: cellOrNull(data, "occupation"),
                  dependentStatus: cellOrNull(data, "dependent status"),
                  bpjsStatus: cellOrNull(data, "bpjs status"),
                  notes: cellOrNull(data, "notes"),
                });
              }
              secondaryRows += 1;
              break;
            }
            case "Education": {
              if (!permissions.education) {
                throw new ImportError("Education import is not authorized.");
              }
              const educationLevel = (data["education level"] ?? "")
                .trim()
                .slice(0, 40);
              const institution = (data.institution ?? "").trim().slice(0, 150);
              const existingEducation = await tx
                .select()
                .from(employeeEducations)
                .where(
                  and(
                    eq(employeeEducations.organizationId, organizationId),
                    eq(employeeEducations.employeeId, employeeId)
                  )
                );
              const matchingEducation = existingEducation.filter(
                (education) =>
                  education.educationLevel.trim().toLowerCase() ===
                    educationLevel.toLowerCase() &&
                  education.institution.trim().toLowerCase() ===
                    institution.toLowerCase()
              );
              if (matchingEducation.length > 1) {
                throw new ImportError(
                  `Row for ${row.employeeNumber}: multiple education records match "${educationLevel}" (${institution}). Resolve them before importing.`
                );
              }
              if (matchingEducation.length === 1) {
                const current = matchingEducation[0];
                if (!current) throw new ImportError("Education record changed during import.");
                await tx
                  .update(employeeEducations)
                  .set({
                    educationLevel,
                    institution,
                    major: cellPatch(data, "major") ?? current.major,
                    startYear:
                      data["start year"] === ""
                        ? current.startYear
                        : parseYear(data["start year"]),
                    graduationYear:
                      data["graduation year"] === ""
                        ? current.graduationYear
                        : parseYear(data["graduation year"]),
                    gpaScore: cellPatch(data, "gpa score") ?? current.gpaScore,
                    certificateNumber:
                      cellPatch(data, "certificate number") ??
                      current.certificateNumber,
                    notes: cellPatch(data, "notes") ?? current.notes,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(employeeEducations.organizationId, organizationId),
                      eq(employeeEducations.id, current.id)
                    )
                  );
              } else {
                await tx.insert(employeeEducations).values({
                  organizationId,
                  employeeId,
                  educationLevel,
                  institution,
                  major: cellOrNull(data, "major"),
                  startYear: parseYear(data["start year"]),
                  graduationYear: parseYear(data["graduation year"]),
                  gpaScore: cellOrNull(data, "gpa score"),
                  certificateNumber: cellOrNull(data, "certificate number"),
                  notes: cellOrNull(data, "notes"),
                });
              }
              secondaryRows += 1;
              break;
            }
            default:
              break;
          }
        }

        // -- custom field values (dynamic, definition-driven) ---------------
        if (permissions.customData) {
          const writes = customWrites.get(row.employeeNumber);
          if (writes) {
            for (const write of writes) {
              await tx
                .insert(employeeCustomFieldValues)
                .values({
                  organizationId,
                  employeeId,
                  fieldDefinitionId: write.fieldDefinitionId,
                  valueText: write.valueText,
                  valueNumber: write.valueNumber,
                  valueDate: write.valueDate,
                  valueBoolean: write.valueBoolean,
                  valueJson: write.valueJson,
                })
                .onConflictDoUpdate({
                  target: [
                    employeeCustomFieldValues.organizationId,
                    employeeCustomFieldValues.employeeId,
                    employeeCustomFieldValues.fieldDefinitionId,
                  ],
                  set: {
                    valueText: write.valueText,
                    valueNumber: write.valueNumber,
                    valueDate: write.valueDate,
                    valueBoolean: write.valueBoolean,
                    valueJson: write.valueJson,
                    updatedAt: new Date(),
                  },
                });
            }
          }
        }
      }

      return { created, updated, secondaryRows };
    });

    try {
      await writeAuditLog({
        organizationId,
        actorUserId: userId,
        action: "employee.imported",
        entityType: "organization",
        entityId: organizationId,
        metadata: {
          source: "excel",
          created: summary.created,
          updated: summary.updated,
          secondaryRows: summary.secondaryRows,
          employeeNumbers: plan.rows.map((row) => row.employeeNumber),
        },
      });
    } catch (error) {
      console.error("[employees/excel-import] audit failed after import", error);
    }

    revalidatePath("/employees");
    return {
      ...emptyPreview(),
      status: "success",
      totalRows: plan.rows.length,
      createCount: summary.created,
      updateCount: summary.updated,
      message: `Import complete: ${summary.created} created, ${summary.updated} updated.`,
    };
  } catch (error) {
    if (error instanceof ImportError) {
      return previewError(
        `Import rolled back — no records were changed. ${error.message}`
      );
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
    ) {
      return previewError(
        "Import rolled back — a duplicate employee number or email appeared. No records were changed."
      );
    }
    console.error("[employees/excel-import] import failed", error);
    return previewError(
      "Import failed. No records were changed. Please try again."
    );
  }
}

function parseYear(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1900 || parsed > 2200) return null;
  return parsed;
}
