import "server-only";

import { and, asc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  employeeAddresses,
  employeeBankAccounts,
  employeeCustomFieldDefinitions,
  employeeCustomFieldValues,
  employeeDependents,
  employeeDocuments,
  employeeEducations,
  employeeInsurances,
  employees,
  workLocations,
} from "@/db/schema";

import type { EmployeeListSearchInput } from "../schemas.ts";
import type { CustomFieldWorkbookColumn } from "./columns.ts";
import { listActiveFieldDefinitions } from "../../employee-fields/queries.ts";
import { formatStoredValue } from "../../employee-fields/validation.ts";
import { isFieldVisibleToRoles } from "../../employee-fields/filtering.ts";
import type {
  AddressExportRow,
  BankExportRow,
  CustomFieldExportRow,
  DocumentExportRow,
  EducationExportRow,
  EmployeeExportRow,
  EmployeeMasterExportData,
  FamilyExportRow,
  InsuranceExportRow,
} from "./export.ts";

/**
 * Server-only assembly of the export data set (Employee Master Data 2.0).
 *
 * Everything is organization-scoped and bounded to `employeeNumbers` (when
 * given). Which employees the caller may include is decided by the ROUTE
 * (RBAC + filters); this module only fetches rows in the caller's
 * organization for the given employee numbers, so a tampered selection can
 * never reach another tenant.
 */

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  const normalized = new Date(value);
  if (Number.isNaN(normalized.getTime())) return null;
  return normalized.toISOString().slice(0, 10);
}

/**
 * Resolve an arbitrary (employee number OR employee id) selection to the
 * organization's employee ids + numbers. Returns the matched employees only.
 */
async function resolveScope(
  organizationId: string,
  employeeNumbers: readonly string[] | null
): Promise<{ id: string; employeeNumber: string }[]> {
  if (employeeNumbers === null) {
    return db
      .select({ id: employees.id, employeeNumber: employees.employeeNumber })
      .from(employees)
      .where(eq(employees.organizationId, organizationId))
      .orderBy(asc(employees.employeeNumber));
  }
  if (employeeNumbers.length === 0) return [];
  const ids = [...employeeNumbers].filter((value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
  const numbers = employeeNumbers.filter((value) => !ids.includes(value));
  const rows = await db
    .select({ id: employees.id, employeeNumber: employees.employeeNumber })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        inArray(employees.id, ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"])
      )
    );
  const numberRows =
    numbers.length > 0
      ? await db
          .select({ id: employees.id, employeeNumber: employees.employeeNumber })
          .from(employees)
          .where(
            and(
              eq(employees.organizationId, organizationId),
              inArray(employees.employeeNumber, [...numbers])
            )
          )
      : [];
  const seen = new Set<string>();
  return [...rows, ...numberRows].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export interface ExportDataOptions {
  /** `null` = all employees in the organization (respecting `filters`). */
  employeeNumbers: readonly string[] | null;
  /** Applied ONLY for the all-employees export (filtered export). */
  filters?: EmployeeListSearchInput;
  /** Section capabilities — sheets the caller cannot view are omitted. */
  include: {
    personal: boolean;
    employment: boolean;
    address: boolean;
    insurance: boolean;
    bank: boolean;
    family: boolean;
    education: boolean;
    documents: boolean;
    customFields: boolean;
  };
  customFieldDefinitionIds?: readonly string[];
}

/** Assemble every export sheet in the caller's organization. */
export async function loadEmployeeMasterExportData(
  organizationId: string,
  options: ExportDataOptions
): Promise<EmployeeMasterExportData> {
  const scope = await resolveScope(organizationId, options.employeeNumbers);
  const ids = scope.map((row) => row.id);
  const empty: EmployeeMasterExportData = {
    employees: [],
    addresses: [],
    insurances: [],
    bankAccounts: [],
    family: [],
    education: [],
    customValues: [],
    documents: [],
  };
  if (ids.length === 0) return empty;

  const conditions: SQL<unknown>[] = [
    eq(employees.organizationId, organizationId),
    inArray(employees.id, ids),
  ];
  // Filters only narrow the ALL-employees export; an explicit selection
  // (Export Selected / Export Individual) always wins so the user gets the
  // exact rows they picked.
  if (options.employeeNumbers === null && options.filters) {
    const search = options.filters.q?.trim();
    if (search) {
      const pattern = `%${search}%`;
      const clause = or(
        ilike(employees.employeeNumber, pattern),
        ilike(employees.firstName, pattern),
        ilike(employees.lastName, pattern),
        ilike(employees.email, pattern)
      );
      if (clause) conditions.push(clause);
    }
    if (options.filters.status) {
      conditions.push(eq(employees.employmentStatus, options.filters.status));
    }
  }

  const [
    employeeRows,
    addressRows,
    insuranceRows,
    bankRows,
    dependentRows,
    educationRows,
    documentRows,
    customValueRows,
    locationRows,
  ] = await Promise.all([
    db
      .select()
      .from(employees)
      .where(and(...conditions))
      .orderBy(asc(employees.employeeNumber)),
    options.include.address
      ? db
          .select()
          .from(employeeAddresses)
          .where(
            and(
              eq(employeeAddresses.organizationId, organizationId),
              inArray(employeeAddresses.employeeId, ids)
            )
          )
      : Promise.resolve([]),
    options.include.insurance
      ? db
          .select()
          .from(employeeInsurances)
          .where(
            and(
              eq(employeeInsurances.organizationId, organizationId),
              inArray(employeeInsurances.employeeId, ids)
            )
          )
      : Promise.resolve([]),
    options.include.bank
      ? db
          .select()
          .from(employeeBankAccounts)
          .where(
            and(
              eq(employeeBankAccounts.organizationId, organizationId),
              inArray(employeeBankAccounts.employeeId, ids)
            )
          )
      : Promise.resolve([]),
    options.include.family
      ? db
          .select()
          .from(employeeDependents)
          .where(
            and(
              eq(employeeDependents.organizationId, organizationId),
              inArray(employeeDependents.employeeId, ids)
            )
          )
      : Promise.resolve([]),
    options.include.education
      ? db
          .select()
          .from(employeeEducations)
          .where(
            and(
              eq(employeeEducations.organizationId, organizationId),
              inArray(employeeEducations.employeeId, ids)
            )
          )
      : Promise.resolve([]),
    options.include.documents
      ? db
          .select()
          .from(employeeDocuments)
          .where(
            and(
              eq(employeeDocuments.organizationId, organizationId),
              inArray(employeeDocuments.employeeId, ids)
            )
          )
      : Promise.resolve([]),
    options.include.customFields
      ? db
          .select({
            employeeId: employeeCustomFieldValues.employeeId,
            fieldDefinitionId: employeeCustomFieldValues.fieldDefinitionId,
            valueText: employeeCustomFieldValues.valueText,
            valueNumber: employeeCustomFieldValues.valueNumber,
            valueDate: employeeCustomFieldValues.valueDate,
            valueBoolean: employeeCustomFieldValues.valueBoolean,
            valueJson: employeeCustomFieldValues.valueJson,
            fieldType: employeeCustomFieldDefinitions.fieldType,
            fieldKey: employeeCustomFieldDefinitions.fieldKey,
            label: employeeCustomFieldDefinitions.label,
            displayOrder: employeeCustomFieldDefinitions.displayOrder,
          })
          .from(employeeCustomFieldValues)
          .innerJoin(
            employeeCustomFieldDefinitions,
            eq(
              employeeCustomFieldValues.fieldDefinitionId,
              employeeCustomFieldDefinitions.id
            )
          )
          .where(
            and(
              eq(employeeCustomFieldValues.organizationId, organizationId),
              eq(
                employeeCustomFieldDefinitions.organizationId,
                organizationId
              ),
              inArray(employeeCustomFieldValues.employeeId, ids),
              inArray(
                employeeCustomFieldValues.fieldDefinitionId,
                options.customFieldDefinitionIds?.length
                  ? [...options.customFieldDefinitionIds]
                  : ["00000000-0000-0000-0000-000000000000"]
              )
            )
          )
      : Promise.resolve([]),
    db
      .select({ id: workLocations.id, name: workLocations.name })
      .from(workLocations)
      .where(eq(workLocations.organizationId, organizationId)),
  ]);

  const allNumbersById = new Map(scope.map((row) => [row.id, row.employeeNumber]));
  const locationNameById = new Map(locationRows.map((row) => [row.id, row.name]));
  const managerNumberById = new Map<string, string>();
  if (employeeRows.length > 0) {
    const managerRows = await db
      .select({ id: employees.id, employeeNumber: employees.employeeNumber })
      .from(employees)
      .where(eq(employees.organizationId, organizationId));
    for (const row of managerRows) {
      managerNumberById.set(row.id, row.employeeNumber);
    }
  }

  // Full rows are fetched (they never leave the server); section columns the
  // caller may not view are nulled out BEFORE building the workbook, so a
  // restricted role literally cannot receive the field in any sheet.
  const personal = options.include.personal;
  const employment = options.include.employment;
  const employeesOut: EmployeeExportRow[] = employeeRows.map((row) => ({
    employeeNumber: row.employeeNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email ?? null,
    phone: personal ? row.phone ?? null : null,
    hireDate: isoDate(row.hireDate ?? null),
    status: row.employmentStatus,
    nik: personal ? row.nik ?? null : null,
    birthDate: personal ? isoDate(row.birthDate ?? null) : null,
    nickname: personal ? row.nickname ?? null : null,
    birthPlace: personal ? row.birthPlace ?? null : null,
    gender: personal ? row.gender ?? null : null,
    religion: personal ? row.religion ?? null : null,
    maritalStatus: personal ? row.maritalStatus ?? null : null,
    nationality: personal ? row.nationality ?? null : null,
    personalEmail: personal ? row.personalEmail ?? null : null,
    division: employment ? row.division ?? null : null,
    department: employment ? row.department ?? null : null,
    position: employment ? row.position ?? null : null,
    workLocation: employment
      ? row.workLocationId
        ? locationNameById.get(row.workLocationId) ?? null
        : null
      : null,
    managerEmployeeNumber: employment
      ? row.managerId
        ? managerNumberById.get(row.managerId) ?? null
        : null
      : null,
    employmentType: employment ? row.employmentType ?? null : null,
    contractStart: employment ? isoDate(row.contractStart ?? null) : null,
    contractEnd: employment ? isoDate(row.contractEnd ?? null) : null,
    resignationDate: employment ? isoDate(row.resignationDate ?? null) : null,
    terminationDate: employment ? isoDate(row.terminationDate ?? null) : null,
    reasonForLeaving: employment ? row.reasonForLeaving ?? null : null,
  }));

  const addresses: AddressExportRow[] = addressRows.map((row) => ({
    employeeNumber: allNumbersById.get(row.employeeId) ?? "",
    addressType: row.type,
    address: row.address,
    rtRw: row.rtRw,
    village: row.village,
    district: row.district,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode,
    sameAsKtp: row.sameAsKtp,
  }));

  const insurances: InsuranceExportRow[] = insuranceRows.map((row) => ({
    employeeNumber: allNumbersById.get(row.employeeId) ?? "",
    npwp: row.npwp,
    bpjsKesehatanNumber: row.bpjsKesehatanNumber,
    bpjsKesehatanStatus: row.bpjsKesehatanStatus,
    bpjsKesehatanClass: row.bpjsKesehatanClass,
    bpjsKetenagakerjaanNumber: row.bpjsKetenagakerjaanNumber,
    bpjsKetenagakerjaanStatus: row.bpjsKetenagakerjaanStatus,
  }));

  const bankAccounts: BankExportRow[] = bankRows.map((row) => ({
    employeeNumber: allNumbersById.get(row.employeeId) ?? "",
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    accountHolder: row.accountHolder,
    branch: row.branch,
    status: row.status,
    isPrimary: row.isPrimary,
  }));

  const family: FamilyExportRow[] = dependentRows.map((row) => ({
    employeeNumber: allNumbersById.get(row.employeeId) ?? "",
    name: row.name,
    relationship: row.relationship,
    nik: personal ? row.nik : null,
    birthDate: isoDate(row.birthDate),
    gender: row.gender,
    occupation: row.occupation,
    dependentStatus: row.dependentStatus,
    bpjsStatus: row.bpjsStatus,
    notes: row.notes,
  }));

  const education: EducationExportRow[] = educationRows.map((row) => ({
    employeeNumber: allNumbersById.get(row.employeeId) ?? "",
    educationLevel: row.educationLevel,
    institution: row.institution,
    major: row.major,
    startYear: row.startYear,
    graduationYear: row.graduationYear,
    gpaScore: row.gpaScore,
    certificateNumber: row.certificateNumber,
    notes: row.notes,
  }));

  const documents: DocumentExportRow[] = documentRows.map((row) => ({
    employeeNumber: allNumbersById.get(row.employeeId) ?? "",
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    originalFilename: row.originalFilename,
    expiryDate: isoDate(row.expiryDate),
    notes: row.notes,
  }));

  const customValues: CustomFieldExportRow[] = customValueRows.map((row) => ({
    employeeNumber: allNumbersById.get(row.employeeId) ?? "",
    fieldKey: row.fieldKey,
    label: row.label,
    value: formatStoredValue(
      row.fieldType as Parameters<typeof formatStoredValue>[0],
      {
        valueText: row.valueText,
        valueNumber: row.valueNumber,
        valueDate: row.valueDate,
        valueBoolean: row.valueBoolean,
        valueJson: (row.valueJson ?? null) as string[] | null,
      }
    ),
  }));

  return {
    employees: employeesOut,
    addresses,
    insurances,
    bankAccounts,
    family,
    education,
    customValues,
    documents,
  };
}

/**
 * Custom-field sheet column order (label list) for the CURRENT caller:
 * active definitions only, respecting `visibilityConfig` when the caller's
 * role codes are supplied (an empty config = visible to every role).
 */
export function visibleCustomFieldColumns(
  definitions: Awaited<ReturnType<typeof listActiveFieldDefinitions>>,
  roleCodes: readonly string[]
): CustomFieldWorkbookColumn[] {
  return definitions
    .filter((definition) =>
      isFieldVisibleToRoles(definition.visibilityConfig, roleCodes)
    )
    .map((definition) => ({
      fieldKey: definition.fieldKey,
      label: definition.label,
      fieldType: definition.fieldType,
      options: definition.options,
    }));
}

export function visibleCustomFieldLabels(
  definitions: Awaited<ReturnType<typeof listActiveFieldDefinitions>>,
  roleCodes: readonly string[]
): string[] {
  return visibleCustomFieldColumns(definitions, roleCodes).map(
    (definition) => definition.label
  );
}
