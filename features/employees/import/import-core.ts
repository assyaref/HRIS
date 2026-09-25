/**
 * Employee CSV import — PURE parsing + row validation.
 *
 * Deliberately free of `server-only`, database, Next.js and browser imports so
 * the rules can be unit-tested with `node --test` (mirroring
 * `features/users/policy.ts` and `features/work-locations/guardrails.ts`).
 *
 * The server action (`import-action.ts`) performs the non-pure parts:
 * authentication, RBAC (`employees.create`), organization scoping, database
 * existence checks, the transactional insert and audit logging.
 */

import { EMPLOYEE_STATUSES } from "../constants.ts";
import { DATE_PATTERN, EMPLOYEE_NUMBER_PATTERN } from "../schemas.ts";

/** Hard cap per import (business rule). A larger file is rejected outright. */
export const IMPORT_MAX_ROWS = 500;

/** Columns the CSV header must contain (any order, case-insensitive). */
export const REQUIRED_IMPORT_COLUMNS = [
  "employee number",
  "name",
  "email",
  "hiredate",
  "status",
] as const;

/** Common header spellings → canonical column. */
const COLUMN_ALIASES: Record<string, string> = {
  employeenumber: "employee number",
  employeeno: "employee number",
  empno: "employee number",
  name: "name",
  fullname: "name",
  employeename: "name",
  email: "email",
  emailaddress: "email",
  hiredate: "hiredate",
  employmentstatus: "status",
  status: "status",
};

/** Lowercase + strip every non-alphanumeric char so `"Employee No."` → `employeeno`. */
function normalizeHeaderToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Map any recognized header spelling to its canonical column name. */
export function resolveImportColumn(alias: string): string | null {
  const token = normalizeHeaderToken(alias);
  return COLUMN_ALIASES[token] ?? null;
}

/** Plain, pragmatic email shape used for bulk CSV rows. */
export const IMPORT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ImportStatus = (typeof EMPLOYEE_STATUSES)[number];

/** One candidate row produced by the CSV analysis (valid or rejected). */
export interface ImportRow {
  /** 1-based CSV data row (header is not counted). */
  rowNumber: number;
  employeeNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  /** `YYYY-MM-DD`. */
  hireDate: string | null;
  /** Normalized status — `null` on rejected rows. */
  status: ImportStatus | null;
  /** Raw status cell as written in the CSV (used on error rows). */
  statusRaw: string | null;
  error: string | null;
  validationStatus: "valid" | "error";
}

/** Normalized employee fields that are actually insertable. */
export interface ImportedEmployee {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  /** `YYYY-MM-DD`. */
  hireDate: string | null;
  status: ImportStatus;
}

/** Parse one CSV line into cells, honoring `"..."` quoting and `""` escapes. */
export function parseCsvRow(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Lowercased header → canonical column name → index. */
export function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((header, index) => {
    const resolved = resolveImportColumn(header);
    if (resolved && !(resolved in map)) {
      map[resolved] = index;
    }
  });
  return map;
}

/** Which of the required columns are missing from the header map. */
export function missingRequiredColumns(
  headerMap: Record<string, number>
): string[] {
  return REQUIRED_IMPORT_COLUMNS.filter(
    (column) => !(column in headerMap)
  );
}

/**
 * Validate the fully-normalized fields of one row. Used both while analyzing
 * the raw CSV and while re-validating the confirm payload.
 */
export function validateNormalizedEmployee(input: {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  hireDate: string | null;
  status: string;
}): { valid: true; status: ImportStatus } | { valid: false; error: string } {
  if (!input.employeeNumber) {
    return { valid: false, error: "Employee number is required." };
  }
  if (!EMPLOYEE_NUMBER_PATTERN.test(input.employeeNumber)) {
    return { valid: false, error: "Invalid employee number format." };
  }
  if (!input.firstName || !input.lastName) {
    return { valid: false, error: "Name is required." };
  }
  if (input.firstName.length > 100 || input.lastName.length > 100) {
    return { valid: false, error: "Name must be 100 characters or fewer." };
  }
  if (input.email && !IMPORT_EMAIL_PATTERN.test(input.email)) {
    return { valid: false, error: "Invalid email address." };
  }
  if (input.hireDate && !DATE_PATTERN.test(input.hireDate)) {
    return { valid: false, error: "Invalid hire date format. Use YYYY-MM-DD." };
  }
  const status = input.status as ImportStatus;
  if (!(EMPLOYEE_STATUSES as readonly string[]).includes(status)) {
    return {
      valid: false,
      error: `Invalid status. Allowed values: ${EMPLOYEE_STATUSES.join("/")}.`,
    };
  }
  return { valid: true, status };
}

function getCell(
  cells: string[],
  headerMap: Record<string, number>,
  column: string
): string {
  const index = headerMap[column];
  if (index === undefined || !cells[index]) return "";
  return cells[index].trim();
}

/**
 * Analyze every data row of a CSV against schema rules AND duplicates within
 * the file. Database existence checks are intentionally NOT here — they need
 * the organization id and belong in the server action.
 */
export function analyzeImportRows(
  rows: string[][],
  headerMap: Record<string, number>
): { validRows: ImportRow[]; errorRows: ImportRow[] } {
  const validRows: ImportRow[] = [];
  const errorRows: ImportRow[] = [];
  const seenNumbers = new Set<string>();
  const seenEmails = new Set<string>();

  rows.forEach((cells, index) => {
    const rowNumber = index + 1;
    const base: ImportRow = {
      rowNumber,
      employeeNumber: null,
      firstName: null,
      lastName: null,
      email: null,
      hireDate: null,
      status: null,
      statusRaw: null,
      error: null,
      validationStatus: "error",
    };

    const employeeNumber = getCell(cells, headerMap, "employee number");
    const nameFull = getCell(cells, headerMap, "name");
    const email = getCell(cells, headerMap, "email");
    const hireDate = getCell(cells, headerMap, "hiredate");
    const statusRaw = getCell(cells, headerMap, "status").toLowerCase();
    base.employeeNumber = employeeNumber || null;
    base.email = email || null;
    base.hireDate = hireDate || null;
    base.statusRaw = statusRaw || null;

    const nameParts = nameFull ? nameFull.split(/\s+/) : [];
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ");
    base.firstName = firstName || null;
    base.lastName = lastName || null;

    const validation = validateNormalizedEmployee({
      employeeNumber,
      firstName,
      lastName,
      email: email || null,
      hireDate: hireDate || null,
      status: statusRaw || "active",
    });

    if (!validation.valid) {
      base.error = validation.error;
      errorRows.push(base);
      return;
    }

    if (seenNumbers.has(employeeNumber)) {
      base.error = "Duplicate employee number in the file.";
      errorRows.push(base);
      return;
    }
    if (email && seenEmails.has(email.toLowerCase())) {
      base.error = "Duplicate email in the file.";
      errorRows.push(base);
      return;
    }

    seenNumbers.add(employeeNumber);
    if (email) seenEmails.add(email.toLowerCase());

    validRows.push({
      rowNumber,
      employeeNumber,
      firstName,
      lastName,
      email: email || null,
      hireDate: hireDate || null,
      status: validation.status,
      statusRaw: statusRaw || null,
      error: null,
      validationStatus: "valid",
    });
  });

  return { validRows, errorRows };
}

/** Flatten valid preview rows into insertable employee fields. */
export function validRowsToImportedEmployees(
  rows: readonly ImportRow[]
): ImportedEmployee[] {
  const employees: ImportedEmployee[] = [];
  for (const row of rows) {
    if (
      row.validationStatus !== "valid" ||
      !row.employeeNumber ||
      !row.firstName ||
      !row.lastName ||
      !row.status
    ) {
      continue;
    }
    employees.push({
      employeeNumber: row.employeeNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      hireDate: row.hireDate,
      status: row.status,
    });
  }
  return employees;
}

/**
 * Re-validate one confirm-payload row from scratch. The confirm request body
 * comes from the browser, so nothing about it is trusted: every field is
 * type-checked and re-validated against the same rules used for the preview.
 */
export function payloadRowToImportedEmployee(item: unknown):
  | { employee: ImportedEmployee; error: null }
  | { employee: null; error: string } {
  if (typeof item !== "object" || item === null) {
    return { employee: null, error: "Row payload is invalid." };
  }
  const row = item as Record<string, unknown>;
  const employeeNumber =
    typeof row.employeeNumber === "string" ? row.employeeNumber.trim() : "";
  const firstName =
    typeof row.firstName === "string" ? row.firstName.trim() : "";
  const lastName = typeof row.lastName === "string" ? row.lastName.trim() : "";
  const email =
    typeof row.email === "string" && row.email.trim() ? row.email.trim() : null;
  const hireDate =
    typeof row.hireDate === "string" && row.hireDate.trim()
      ? row.hireDate.trim()
      : null;
  const status = typeof row.status === "string" ? row.status.toLowerCase() : "";

  const validation = validateNormalizedEmployee({
    employeeNumber,
    firstName,
    lastName,
    email,
    hireDate,
    status: status || "active",
  });
  if (!validation.valid) {
    return { employee: null, error: validation.error };
  }
  return {
    employee: {
      employeeNumber,
      firstName,
      lastName,
      email,
      hireDate,
      status: validation.status,
    },
    error: null,
  };
}