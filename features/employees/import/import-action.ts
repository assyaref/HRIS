"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import { listEmployeeIdentifiersByOrganization } from "../queries";
import {
  analyzeImportRows,
  buildHeaderMap,
  IMPORT_MAX_ROWS,
  missingRequiredColumns,
  parseCsvRow,
  payloadRowToImportedEmployee,
  type ImportRow,
  type ImportedEmployee,
} from "./import-core";

export interface ImportResult {
  status: "idle" | "error" | "preview" | "success";
  validRows: ImportRow[];
  errorRows: ImportRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  message?: string;
  successCount?: number;
}

const IMPORT_MODE_CONFIRM = "confirm";

const DB_UNIQUE_VIOLATION = "23505";

function initialState(): ImportResult {
  return {
    status: "idle",
    validRows: [],
    errorRows: [],
    totalRows: 0,
    validCount: 0,
    errorCount: 0,
  };
}

function toError(message: string): ImportResult {
  return { ...initialState(), status: "error", message };
}

function toDateValue(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === DB_UNIQUE_VIOLATION
  );
}

/**
 * Provisional duplicate check against employees that already exist in the
 * organization. Runs AFTER schema validation; only requested columns are read.
 */
async function rejectExistingInOrganization(
  validRows: ImportRow[],
  errorRows: ImportRow[],
  organizationId: string
): Promise<{ validRows: ImportRow[]; errorRows: ImportRow[] }> {
  if (validRows.length === 0) return { validRows, errorRows };

  const identifiers = await listEmployeeIdentifiersByOrganization(organizationId);
  const existingNumbers = new Set(
    identifiers.map((row) => row.employeeNumber)
  );
  const existingEmails = new Set(
    identifiers
      .map((row) => row.email?.toLowerCase())
      .filter((email): email is string => typeof email === "string")
  );

  const dbRejected = new Map<number, ImportRow>();
  for (const row of validRows) {
    if (!row.employeeNumber) continue;
    if (existingNumbers.has(row.employeeNumber)) {
      dbRejected.set(row.rowNumber, {
        ...row,
        status: null,
        error: "Employee number already exists in your organization.",
        validationStatus: "error",
      });
    } else if (
      row.email &&
      existingEmails.has(row.email.toLowerCase())
    ) {
      dbRejected.set(row.rowNumber, {
        ...row,
        status: null,
        error: "Email already exists in your organization.",
        validationStatus: "error",
      });
    }
  }

  const finalValid = validRows.filter(
    (row) => !dbRejected.has(row.rowNumber)
  );
  const finalErrors = [...errorRows, ...dbRejected.values()].sort(
    (a, b) => a.rowNumber - b.rowNumber
  );

  return { validRows: finalValid, errorRows: finalErrors };
}

/**
 * Step 1 — parse + validate the uploaded CSV and build the review preview.
 * NOTHING is written here; the preview is confirmed by a second dispatch.
 */
async function previewImport(
  formData: FormData,
  organizationId: string
): Promise<ImportResult> {
  const file = formData.get("csvFile");
  if (!(file instanceof File)) {
    return toError("No file selected.");
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return toError("Could not read the uploaded file. Please try again.");
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    return toError("CSV must contain a header row and at least one data row.");
  }

  const dataRowCount = lines.length - 1;
  if (dataRowCount > IMPORT_MAX_ROWS) {
    return toError(
      `Import rejected: maximum ${IMPORT_MAX_ROWS} employees per import. Found ${dataRowCount} rows.`
    );
  }

  const headers = parseCsvRow(lines[0]);
  const headerMap = buildHeaderMap(headers);
  const missingColumns = missingRequiredColumns(headerMap);
  if (missingColumns.length > 0) {
    return toError(
      `Missing required columns in CSV: ${missingColumns.join(", ")}.`
    );
  }

  const dataRows = lines.slice(1).map((line) => parseCsvRow(line));
  const analyzed = analyzeImportRows(dataRows, headerMap);
  const final = await rejectExistingInOrganization(
    analyzed.validRows,
    analyzed.errorRows,
    organizationId
  );

  return {
    ...initialState(),
    status: "preview",
    totalRows: dataRowCount,
    validRows: final.validRows,
    errorRows: final.errorRows,
    validCount: final.validRows.length,
    errorCount: final.errorRows.length,
    message:
      final.errorRows.length > 0
        ? `${final.validRows.length} ready, ${final.errorRows.length} need attention. Review before importing.`
        : `${final.validRows.length} employees ready to import.`,
  };
}

/**
 * Step 2 — commit the confirmed preview rows inside one transaction.
 * Every payload row is re-validated from scratch (format, whitelist statuses,
 * in-file duplicates, in-organization duplicates). Any failure rolls back the
 * whole import: no partial writes ever reach the database.
 */
async function confirmImport(
  formData: FormData,
  userId: string,
  organizationId: string
): Promise<ImportResult> {
  const rawPayload = formData.get("rows");
  if (typeof rawPayload !== "string" || rawPayload.trim() === "") {
    return toError("Import confirmation is missing its payload.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return toError("Import confirmation payload is invalid.");
  }
  if (!Array.isArray(payload) || payload.length === 0) {
    return toError("No employees to import.");
  }
  if (payload.length > IMPORT_MAX_ROWS) {
    return toError(
      `Import rejected: maximum ${IMPORT_MAX_ROWS} employees per import.`
    );
  }

  const toInsert: ImportedEmployee[] = [];
  const revalidatedErrors: ImportRow[] = [];
  const seenNumbers = new Set<string>();
  const seenEmails = new Set<string>();

  payload.forEach((item, index) => {
    const rowNumber = index + 1;
    const raw = (typeof item === "object" && item !== null
      ? (item as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const rawEmployeeNumber =
      typeof raw.employeeNumber === "string" ? raw.employeeNumber.trim() : "";
    const rawFirstName =
      typeof raw.firstName === "string" ? raw.firstName.trim() : "";
    const rawLastName =
      typeof raw.lastName === "string" ? raw.lastName.trim() : "";
    const rawEmail =
      typeof raw.email === "string" && raw.email.trim() ? raw.email.trim() : null;
    const rawHireDate =
      typeof raw.hireDate === "string" && raw.hireDate.trim()
        ? raw.hireDate.trim()
        : null;
    const rawStatus =
      typeof raw.status === "string" ? raw.status.toLowerCase() : "";

    const parsed = payloadRowToImportedEmployee(item);
    if (!parsed.employee) {
      revalidatedErrors.push({
        rowNumber,
        employeeNumber: rawEmployeeNumber || null,
        firstName: rawFirstName || null,
        lastName: rawLastName || null,
        email: rawEmail,
        hireDate: rawHireDate,
        status: null,
        statusRaw: rawStatus || null,
        error: parsed.error,
        validationStatus: "error",
      });
      return;
    }

    const employee = parsed.employee;
    if (seenNumbers.has(employee.employeeNumber)) {
      revalidatedErrors.push({
        rowNumber,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        hireDate: employee.hireDate,
        status: null,
        statusRaw: rawStatus || null,
        error: "Duplicate employee number in the file.",
        validationStatus: "error",
      });
      return;
    }
    if (employee.email && seenEmails.has(employee.email.toLowerCase())) {
      revalidatedErrors.push({
        rowNumber,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        hireDate: employee.hireDate,
        status: null,
        statusRaw: rawStatus || null,
        error: "Duplicate email in the file.",
        validationStatus: "error",
      });
      return;
    }

    seenNumbers.add(employee.employeeNumber);
    if (employee.email) seenEmails.add(employee.email.toLowerCase());
    toInsert.push(employee);
  });

  if (toInsert.length === 0) {
    return {
      ...initialState(),
      status: "error",
      validRows: [],
      errorRows: revalidatedErrors,
      totalRows: payload.length,
      validCount: 0,
      errorCount: revalidatedErrors.length,
      message: "No valid rows to import. Please fix the CSV and try again.",
    };
  }

  // Re-check company-wide duplicates against the CURRENT database state.
  const existing = await listEmployeeIdentifiersByOrganization(organizationId);
  const existingNumbers = new Set(existing.map((row) => row.employeeNumber));
  const existingEmails = new Set(
    existing
      .map((row) => row.email?.toLowerCase())
      .filter((email): email is string => typeof email === "string")
  );
  const confirmed = toInsert.filter((employee) => {
    if (existingNumbers.has(employee.employeeNumber)) return false;
    if (
      employee.email &&
      existingEmails.has(employee.email.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  if (confirmed.length === 0) {
    return toError(
      "All of the imported employees already exist. No records were changed."
    );
  }

  // Single transaction: any failure rolls the entire import back.
  try {
    await db.transaction(async (tx) => {
      for (const employee of confirmed) {
        await tx.insert(employees).values({
          organizationId,
          employeeNumber: employee.employeeNumber,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          hireDate: toDateValue(employee.hireDate),
          employmentStatus: employee.status,
        });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return toError(
        "Some of the imported employees already exist. No records were changed."
      );
    }
    console.error("[employees] import failed", error);
    return toError("Import failed. No records were changed. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: userId,
      action: "employee.imported",
      entityType: "organization",
      entityId: organizationId,
      metadata: {
        count: confirmed.length,
        employeeNumbers: confirmed.map((employee) => employee.employeeNumber),
      },
    });
  } catch (error) {
    // The import is committed; a lost audit row must not surface as failure.
    console.error("[employees] audit failed after import", error);
  }

  revalidatePath("/employees");

  return {
    ...initialState(),
    status: "success",
    totalRows: payload.length,
    successCount: confirmed.length,
    message: `${confirmed.length} employee${
      confirmed.length === 1 ? "" : "s"
    } imported successfully.`,
  };
}

/**
 * Employee CSV import server action.
 *
 * - RBAC: requires `employees.create` (re-verified against PostgreSQL).
 * - The organization always comes from the authenticated session.
 * - Step 1 previews (reads only); Step 2 (`mode=confirm`) writes inside one
 *   transaction with rollback on any failure.
 */
export async function importEmployeesAction(
  _prevState: ImportResult,
  formData: FormData
): Promise<ImportResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_CREATE);

  if (!user.organizationId) {
    return toError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;

  if (formData.get("mode") === IMPORT_MODE_CONFIRM) {
    return confirmImport(formData, user.id, organizationId);
  }
  return previewImport(formData, organizationId);
}