/**
 * Employee Master Data Excel import analyzer (pure apart from exceljs).
 *
 * Parses an uploaded .xlsx buffer using the shared column contract. Produces:
 *  - `rows` — the Employees tab analyzed with the same row rules as the CSV
 *    import (employee number required + unique, first/last name, status,
 *    email, hire date). Reuses `validateNormalizedEmployee`.
 *  - `secondary` — Addresses / Insurance / Bank Accounts / Family / Education /
 *    Custom Fields tab rows keyed by employee number, ready to be applied by
 *    the server action (which also performs existence + RBAC checks).
 *
 * The server action performs the non-pure parts: authentication, RBAC
 * (`employees.import`), organization scoping, database lookups, the
 * transaction, and audit logging.
 */

import ExcelJS from "exceljs";

import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
} from "../constants.ts";
import { validateNormalizedEmployee } from "../import/import-core.ts";
import { parseCustomFieldValue, type CustomFieldType } from "../../employee-fields/validation.ts";
import {
  ADDRESS_SHEET_COLUMNS,
  ADDRESS_SHEET_NAME,
  BANK_SHEET_COLUMNS,
  BANK_SHEET_NAME,
  columnKeyByHeader,
  customFieldColumnHeader,
  CUSTOM_FIELDS_SHEET_NAME,
  type CustomFieldWorkbookColumn,
  EDUCATION_SHEET_COLUMNS,
  EDUCATION_SHEET_NAME,
  EMPLOYEE_SHEET_COLUMNS,
  EMPLOYEE_SHEET_NAME,
  FAMILY_SHEET_COLUMNS,
  FAMILY_SHEET_NAME,
  INSURANCE_SHEET_COLUMNS,
  INSURANCE_SHEET_NAME,
} from "./columns.ts";

export const EXCEL_IMPORT_MAX_ROWS = 500;

/** Required Employees-tab columns (status optional, defaults to active). */
export const REQUIRED_EXCEL_EMPLOYEE_COLUMNS = [
  "employee number",
  "first name",
  "last name",
] as const;

export type ImportStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface ExcelEmployeeRow {
  /** 1-based sheet row (header omitted). */
  rowNumber: number;
  employeeNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  hireDate: string | null;
  status: ImportStatus | null;
  error: string | null;
  validationStatus: "valid" | "error";
  /** Canonical Employees-tab keys → trimmed cell text (all contract columns). */
  cells?: Record<string, string>;
}

export type SecondarySheetName =
  | typeof ADDRESS_SHEET_NAME
  | typeof INSURANCE_SHEET_NAME
  | typeof BANK_SHEET_NAME
  | typeof FAMILY_SHEET_NAME
  | typeof EDUCATION_SHEET_NAME
  | typeof CUSTOM_FIELDS_SHEET_NAME;

export interface SecondarySheetRow {
  sheet: SecondarySheetName;
  rowNumber: number;
  /** Employees-tab employee number (the join key). */
  employeeNumber: string;
  /** Canonical resolved header keys → cell text (custom sheet: label → text). */
  cells: Record<string, string>;
  /** Non-empty header columns that had no canonical key (unknown columns). */
  unknownHeaders: string[];
  error: string | null;
}

export interface ExcelImportAnalysis {
  sheetNames: string[];
  employeesSheetFound: boolean;
  missingColumns: string[];
  rows: ExcelEmployeeRow[];
  validEmployees: ExcelEmployeeRow[];
  errorEmployees: ExcelEmployeeRow[];
  secondary: SecondarySheetRow[];
  /** Number of data rows on the Employees sheet (validation against cap). */
  employeeRowCount: number;
  rowLimitExceeded: boolean;
}

export interface CustomFieldImportSpec extends CustomFieldWorkbookColumn {
  fieldDefinitionId: string;
  fieldType: CustomFieldType;
  options: string[];
  isRequired?: boolean;
}

const ADDRESS_TYPES = ["ktp", "domicile"];

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isEducationYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= 1900 && year <= 2200;
}

/**
 * Validate the typed Employees-sheet cells against the application-level
 * column contract (dates, gender, employment type, NIK digits). Pure and
 * rule-driven: no per-field name checks beyond the column key itself.
 */
const DATE_CELL_KEYS = [
  "hire date",
  "birth date",
  "contract start",
  "contract end",
  "resignation date",
  "termination date",
] as const;

export function validateEmployeeCells(cells: Record<string, string>): string[] {
  const errors: string[] = [];

  for (const key of DATE_CELL_KEYS) {
    const raw = cells[key];
    if (raw && !isCalendarDate(raw)) {
      errors.push(`Invalid ${key}. Use YYYY-MM-DD.`);
    }
  }

  if (cells["contract start"] && cells["contract end"]) {
    if (cells["contract end"] < cells["contract start"]) {
      errors.push("Contract end cannot be before contract start.");
    }
  }

  if (cells["gender"] && !GENDERS.some((g) => g.toLowerCase() === cells["gender"].toLowerCase())) {
    errors.push(`Invalid gender. Allowed values: ${GENDERS.join("/")}.`);
  }

  if (
    cells["employment type"] &&
    !EMPLOYMENT_TYPES.some((t) => t.toLowerCase() === cells["employment type"].toLowerCase())
  ) {
    errors.push(
      `Invalid employment type. Allowed values: ${EMPLOYMENT_TYPES.join("/")}.`
    );
  }

  if (cells["status"] && !(EMPLOYEE_STATUSES as readonly string[]).includes(cells["status"].toLowerCase())) {
    errors.push(`Invalid status. Allowed values: ${EMPLOYEE_STATUSES.join("/")}.`);
  }

  if (cells["nik"] && !/^\d{1,32}$/.test(cells["nik"])) {
    errors.push("NIK must contain digits only.");
  }

  return errors;
}

export type ExcelUpdatePatch = Record<string, string | Date>;

export function buildExcelUpdatePatch(
  cells: Record<string, string>,
  permissions: { personal: boolean; employment: boolean }
): ExcelUpdatePatch {
  const patch: ExcelUpdatePatch = {};
  const text = (key: string): string | undefined => {
    const value = (cells[key] ?? "").trim();
    return value === "" ? undefined : value;
  };
  const date = (key: string): Date | undefined => {
    const value = text(key);
    return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
  };
  const fields: Array<[string, string]> = [
    ["first name", "firstName"],
    ["last name", "lastName"],
    ["email", "email"],
    ["status", "employmentStatus"],
  ];
  if (permissions.personal) {
    fields.push(
      ["phone", "phone"],
      ["nik", "nik"],
      ["nickname", "nickname"],
      ["birth place", "birthPlace"],
      ["gender", "gender"],
      ["religion", "religion"],
      ["marital status", "maritalStatus"],
      ["nationality", "nationality"],
      ["personal email", "personalEmail"]
    );
  }
  if (permissions.employment) {
    fields.push(
      ["division", "division"],
      ["department", "department"],
      ["position", "position"],
      ["employment type", "employmentType"],
      ["reason for leaving", "reasonForLeaving"]
    );
  }
  for (const [key, property] of fields) {
    const value = text(key);
    if (value !== undefined) {
      patch[property] = property === "employmentStatus" ? value.toLowerCase() : value;
    }
  }
  if (permissions.personal) {
    const birthDate = date("birth date");
    if (birthDate) patch.birthDate = birthDate;
  }
  if (permissions.employment) {
    for (const [key, property] of [
      ["hire date", "hireDate"],
      ["contract start", "contractStart"],
      ["contract end", "contractEnd"],
      ["resignation date", "resignationDate"],
      ["termination date", "terminationDate"],
    ] as const) {
      const value = date(key);
      if (value) patch[property] = value;
    }
  }
  return patch;
}

/** Normalize any cell value (including Excel dates/numbers) to trimmed text. */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

/** Map a worksheet's header cells to canonical keys for a column contract. */
function buildHeaderMap(
  worksheet: ExcelJS.Worksheet,
  contract: readonly { key: string; header: string }[],
  fallback?: (raw: string) => string | null
): { headerMap: Record<string, number>; rawHeaders: string[]; unknownHeaders: string[] } {
  const byHeader = columnKeyByHeader(contract);
  const headerMap: Record<string, number> = {};
  const rawHeaders: string[] = [];
  const unknownHeaders: string[] = [];

  const headerRow = worksheet.getRow(1);
  for (let column = 1; column <= headerRow.cellCount; column++) {
    const raw = cellText(headerRow.getCell(column).value);
    if (!raw) break;
    rawHeaders.push(raw);
    let key: string | null = byHeader[raw.toLowerCase()] ?? null;
    if (!key && fallback) key = fallback(raw);
    if (key && !(key in headerMap)) {
      headerMap[key] = column;
    } else if (!key) {
      unknownHeaders.push(raw);
    }
  }
  return { headerMap, rawHeaders, unknownHeaders };
}

function getCell(
  row: ExcelJS.Row,
  headerMap: Record<string, number>,
  key: string
): string {
  const column = headerMap[key];
  if (column === undefined) return "";
  return cellText(row.getCell(column).value);
}

function validateSecondaryRow(
  sheet: SecondarySheetName,
  employeeNumber: string,
  cells: Record<string, string>
): string | null {
  if (!employeeNumber) return "Employee number is required.";
  switch (sheet) {
    case ADDRESS_SHEET_NAME: {
      const type = (cells["address type"] ?? "ktp").toLowerCase();
      if (!ADDRESS_TYPES.includes(type)) {
        return 'Address Type must be "KTP" or "Domicile".';
      }
      return null;
    }
    case BANK_SHEET_NAME:
      if (!cells["bank name"]) return "Bank Name is required.";
      if (!cells["account number"]) return "Account Number is required.";
      if (!cells["account holder"]) return "Account Holder is required.";
      return null;
    case FAMILY_SHEET_NAME:
      if (!cells["name"]) return "Name is required.";
      if (!cells["relationship"]) return "Relationship is required.";
      if (cells["birth date"] && !isCalendarDate(cells["birth date"])) {
        return "Birth Date must be a valid date in YYYY-MM-DD format.";
      }
      return null;
    case EDUCATION_SHEET_NAME:
      if (!cells["education level"]) return "Education Level is required.";
      if (!cells["institution"]) return "Institution is required.";
      if (
        cells["start year"] &&
        !isEducationYear(cells["start year"])
      ) {
        return "Start Year must be between 1900 and 2200.";
      }
      if (
        cells["graduation year"] &&
        !isEducationYear(cells["graduation year"])
      ) {
        return "Graduation Year must be between 1900 and 2200.";
      }
      return null;
    default:
      return null;
  }
}

function collectSecondarySheet(
  worksheet: ExcelJS.Worksheet,
  sheet: SecondarySheetName,
  contract: readonly { key: string; header: string }[],
  unknownHeaderMode: "report" | "ignore",
  out: SecondarySheetRow[]
): void {
  const { headerMap, unknownHeaders } = buildHeaderMap(worksheet, contract);
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    let hasContent = false;
    for (let column = 1; column <= row.cellCount; column++) {
      if (cellText(row.getCell(column).value)) {
        hasContent = true;
        break;
      }
    }
    if (!hasContent) continue;

    const cells: Record<string, string> = {};
    for (const column of contract) {
      cells[column.key] = getCell(row, headerMap, column.key);
    }
    const employeeNumber = cells["employee number"];
    const error = validateSecondaryRow(sheet, employeeNumber, cells);
    out.push({
      sheet,
      rowNumber,
      employeeNumber,
      cells,
      unknownHeaders: unknownHeaderMode === "report" ? unknownHeaders : [],
      error,
    });
  }
}

function resolveCustomFieldHeader(
  raw: string,
  specs: readonly CustomFieldImportSpec[]
): { key: string | null; ambiguous: boolean } {
  const normalized = raw.toLowerCase();
  const stable = specs.find(
    (spec) =>
      customFieldColumnHeader(spec).toLowerCase() === normalized ||
      normalized.endsWith(` [${spec.fieldKey.toLowerCase()}]`)
  );
  if (stable) return { key: stable.fieldKey, ambiguous: false };
  const legacy = specs.filter((spec) => spec.label.toLowerCase() === normalized);
  if (legacy.length === 1) {
    return { key: legacy[0]?.fieldKey ?? null, ambiguous: false };
  }
  return { key: null, ambiguous: legacy.length > 1 };
}

function collectCustomFieldsSheet(
  worksheet: ExcelJS.Worksheet,
  specs: CustomFieldImportSpec[],
  out: SecondarySheetRow[]
): void {
  const headerRow = worksheet.getRow(1);
  const columnKeys: string[] = [];
  const unknownLabels: string[] = [];
  const seenKeys = new Set<string>();
  let ambiguousHeader = false;
  let duplicateHeader = false;
  for (let column = 1; column <= headerRow.cellCount; column++) {
    const raw = cellText(headerRow.getCell(column).value);
    if (!raw) break;
    if (column === 1) {
      columnKeys.push("employee number");
      continue;
    }
    const resolved = resolveCustomFieldHeader(raw, specs);
    columnKeys.push(resolved.key ?? "");
    if (!resolved.key) unknownLabels.push(raw);
    if (resolved.key) {
      if (seenKeys.has(resolved.key)) duplicateHeader = true;
      seenKeys.add(resolved.key);
    }
    ambiguousHeader ||= resolved.ambiguous;
  }

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    let hasContent = false;
    for (let column = 1; column <= row.cellCount; column++) {
      if (cellText(row.getCell(column).value)) {
        hasContent = true;
        break;
      }
    }
    if (!hasContent) continue;

    const cells: Record<string, string> = {};
    columnKeys.forEach((key, index) => {
      const columnNumber = index + 1;
      const raw = cellText(row.getCell(columnNumber).value);
      if (index === 0) {
        cells["employee number"] = raw;
      } else if (key) {
        cells[key] = raw;
      }
    });
    const employeeNumber = cells["employee number"];
    if (!employeeNumber) {
      out.push({
        sheet: CUSTOM_FIELDS_SHEET_NAME,
        rowNumber,
        employeeNumber: "",
        cells,
        unknownHeaders: [...unknownLabels],
        error: "Employee number is required.",
      });
      continue;
    }

    let firstError: string | null = null;
    if (duplicateHeader) {
      firstError = "Custom Fields contains the same field key in more than one column.";
    } else if (unknownLabels.length > 0) {
      firstError = ambiguousHeader
        ? "Custom Fields contains an ambiguous legacy column label. Download a current template."
        : "Custom Fields contains an unknown or unauthorized column.";
    } else {
      for (const spec of specs) {
        const rawValue = cells[spec.fieldKey] ?? "";
        if (!rawValue) continue;
        const parsed = parseCustomFieldValue(
          spec.fieldType,
          rawValue,
          spec.options
        );
        if (!parsed.ok) {
          firstError = `[${spec.label}] ${parsed.error}`;
          break;
        }
      }
    }

    out.push({
      sheet: CUSTOM_FIELDS_SHEET_NAME,
      rowNumber,
      employeeNumber,
      cells,
      unknownHeaders: [...unknownLabels],
      error: firstError,
    });
  }
}

/**
 * Analyze an uploaded workbook. `customFields` mirrors the organization's
 * active custom field definitions so Custom Fields values can be validated
 * during preview (options, types, etc.).
 */
export async function analyzeExcelImport(
  buffer: ArrayBuffer | Buffer,
  customFields: CustomFieldImportSpec[]
): Promise<ExcelImportAnalysis> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);

  const employeesSheet = workbook.getWorksheet(EMPLOYEE_SHEET_NAME);
  const employeesSheetFound = Boolean(employeesSheet);

  const missingColumns: string[] = [];
  const rows: ExcelEmployeeRow[] = [];
  const secondary: SecondarySheetRow[] = [];

  let employeeRowCount = 0;
  let rowLimitExceeded = false;

  if (employeesSheet) {
    const { headerMap } = buildHeaderMap(employeesSheet, EMPLOYEE_SHEET_COLUMNS);
    for (const required of REQUIRED_EXCEL_EMPLOYEE_COLUMNS) {
      if (!(required in headerMap)) missingColumns.push(required);
    }

    const seenNumbers = new Set<string>();
    const seenEmails = new Set<string>();

    for (let rowNumber = 2; rowNumber <= employeesSheet.rowCount; rowNumber++) {
      const row = employeesSheet.getRow(rowNumber);
      if (row.cellCount === 0) continue;

      const employeeNumber = getCell(row, headerMap, "employee number");
      const firstName = getCell(row, headerMap, "first name");
      const lastName = getCell(row, headerMap, "last name");
      const email = getCell(row, headerMap, "email");
      const hireDate = getCell(row, headerMap, "hire date");
      const statusRaw = getCell(row, headerMap, "status").toLowerCase();

      employeeRowCount += 1;
      if (employeeRowCount > EXCEL_IMPORT_MAX_ROWS) {
        rowLimitExceeded = true;
        continue;
      }

      const cells: Record<string, string> = {};
      for (const column of EMPLOYEE_SHEET_COLUMNS) {
        cells[column.key] = getCell(row, headerMap, column.key);
      }

      buildEmployeeRow(
        rowNumber,
        employeeNumber,
        firstName,
        lastName,
        email,
        hireDate,
        statusRaw,
        seenNumbers,
        seenEmails,
        rows,
        cells
      );
    }
  }

  if (employeesSheetFound) {
    const addressSheet = workbook.getWorksheet(ADDRESS_SHEET_NAME);
    if (addressSheet) {
      collectSecondarySheet(
        addressSheet,
        ADDRESS_SHEET_NAME,
        ADDRESS_SHEET_COLUMNS,
        "report",
        secondary
      );
    }
    const insuranceSheet = workbook.getWorksheet(INSURANCE_SHEET_NAME);
    if (insuranceSheet) {
      collectSecondarySheet(
        insuranceSheet,
        INSURANCE_SHEET_NAME,
        INSURANCE_SHEET_COLUMNS,
        "report",
        secondary
      );
    }
    const bankSheet = workbook.getWorksheet(BANK_SHEET_NAME);
    if (bankSheet) {
      collectSecondarySheet(
        bankSheet,
        BANK_SHEET_NAME,
        BANK_SHEET_COLUMNS,
        "report",
        secondary
      );
    }
    const familySheet = workbook.getWorksheet(FAMILY_SHEET_NAME);
    if (familySheet) {
      collectSecondarySheet(
        familySheet,
        FAMILY_SHEET_NAME,
        FAMILY_SHEET_COLUMNS,
        "report",
        secondary
      );
    }
    const educationSheetName = EDUCATION_SHEET_NAME;
    const educationSheet = workbook.getWorksheet(educationSheetName);
    if (educationSheet) {
      collectSecondarySheet(
        educationSheet,
        EDUCATION_SHEET_NAME,
        EDUCATION_SHEET_COLUMNS,
        "report",
        secondary
      );
    }
    const customSheet = workbook.getWorksheet(CUSTOM_FIELDS_SHEET_NAME);
    if (customSheet) {
      collectCustomFieldsSheet(customSheet, customFields, secondary);
    }
  }

  const validEmployees = rows.filter((row) => row.validationStatus === "valid");
  const errorEmployees = rows.filter((row) => row.validationStatus === "error");

  return {
    sheetNames,
    employeesSheetFound,
    missingColumns,
    rows,
    validEmployees,
    errorEmployees,
    secondary,
    employeeRowCount,
    rowLimitExceeded,
  };
}

function buildEmployeeRow(
  rowNumber: number,
  employeeNumber: string,
  firstName: string,
  lastName: string,
  email: string,
  hireDate: string,
  statusRaw: string,
  seenNumbers: Set<string>,
  seenEmails: Set<string>,
  rows: ExcelEmployeeRow[],
  cells: Record<string, string>
): void {
  const base: ExcelEmployeeRow = {
    rowNumber,
    employeeNumber,
    firstName: firstName || null,
    lastName: lastName || null,
    email: email || null,
    hireDate: hireDate || null,
    status: null,
    error: null,
    validationStatus: "error",
    cells,
  };

  const validation = validateNormalizedEmployee({
    employeeNumber,
    firstName,
    lastName,
    email: email || null,
    hireDate: hireDate || null,
    status: statusRaw || "active",
  });

  if (!validation.valid) {
    rows.push({ ...base, error: validation.error, validationStatus: "error" });
    return;
  }

  const extended = validateEmployeeCells(cells);
  if (extended.length > 0) {
    rows.push({ ...base, error: extended[0], validationStatus: "error" });
    return;
  }
  if (seenNumbers.has(employeeNumber)) {
    rows.push({
      ...base,
      error: "Duplicate employee number in the file.",
      validationStatus: "error",
    });
    return;
  }
  const lowerEmail = email.toLowerCase();
  if (email && seenEmails.has(lowerEmail)) {
    rows.push({
      ...base,
      error: "Duplicate email in the file.",
      validationStatus: "error",
    });
    return;
  }

  seenNumbers.add(employeeNumber);
  if (email) seenEmails.add(lowerEmail);

  rows.push({
    ...base,
    status: validation.status,
    validationStatus: "valid",
  });
}

/* ------------------------------------------------------------------ */
/* Create / Update planning                                            */
/* ------------------------------------------------------------------ */

export type ExcelPlanOperation = "create" | "update";

export interface ExcelPlannedRow {
  rowNumber: number;
  employeeNumber: string;
  operation: ExcelPlanOperation;
  cells: Record<string, string>;
  /** Secondary-sheet rows joined by employee number. */
  secondary: SecondarySheetRow[];
  /** Custom Fields sheet cells (fieldKey → raw text). */
  customValues: Record<string, string>;
}

export interface ExcelImportPlan {
  rows: ExcelPlannedRow[];
  createCount: number;
  updateCount: number;
  /** Employee numbers that appear in secondary sheets but not on the Employees tab. */
  orphanedSecondaryEmployeeNumbers: string[];
  /** Secondary-sheet rows carrying a validation error. */
  secondaryErrorCount: number;
}

export interface ExcelPreviewError {
  rowNumber: number;
  employeeNumber: string;
  error: string;
}

function secondaryIdempotencyKey(row: SecondarySheetRow): string | null {
  if (row.sheet !== BANK_SHEET_NAME || row.error) return null;
  const employee = row.employeeNumber.trim().toLowerCase();
  return `${row.sheet}|${employee}|${row.cells["bank name"]?.trim().toLowerCase() ?? ""}|${row.cells["account number"]?.trim() ?? ""}`;
}

export function deduplicateSecondaryRows(
  rows: readonly SecondarySheetRow[]
): SecondarySheetRow[] {
  const byIdentity = new Map<string, SecondarySheetRow>();
  const output: SecondarySheetRow[] = [];
  for (const row of rows) {
    const key = secondaryIdempotencyKey(row);
    if (!key) {
      output.push(row);
      continue;
    }
    const existing = byIdentity.get(key);
    if (existing) {
      const index = output.indexOf(existing);
      if (index >= 0) output[index] = row;
    } else {
      byIdentity.set(key, row);
      output.push(row);
    }
  }
  return output;
}

export function validateRequiredCustomFieldsForCreates(
  plan: ExcelImportPlan,
  specs: readonly CustomFieldImportSpec[]
): ExcelPreviewError[] {
  const required = specs.filter((spec) => spec.isRequired);
  const errors: ExcelPreviewError[] = [];
  for (const row of plan.rows) {
    if (row.operation !== "create") continue;
    for (const spec of required) {
      if (!(row.customValues[spec.fieldKey] ?? "").trim()) {
        errors.push({
          rowNumber: row.rowNumber,
          employeeNumber: row.employeeNumber,
          error: `[${spec.label}] This field is required for new employees.`,
        });
      }
    }
  }
  return errors;
}

export function findDuplicateExistingEmailErrors(
  plan: ExcelImportPlan,
  existingEmployees: readonly { employeeNumber: string; email: string | null }[]
): ExcelPreviewError[] {
  const ownerByEmail = new Map<string, string>();
  for (const employee of existingEmployees) {
    const email = employee.email?.trim().toLowerCase();
    if (email) ownerByEmail.set(email, employee.employeeNumber);
  }
  const errors: ExcelPreviewError[] = [];
  for (const row of plan.rows) {
    const email = row.cells.email?.trim().toLowerCase();
    const owner = email ? ownerByEmail.get(email) : undefined;
    if (email && owner && owner !== row.employeeNumber) {
      errors.push({
        rowNumber: row.rowNumber,
        employeeNumber: row.employeeNumber,
        error: `Email is already assigned to employee ${owner}.`,
      });
    }
  }
  return errors;
}

export function buildExcelPreviewErrors(
  analysis: ExcelImportAnalysis,
  plan: ExcelImportPlan
): ExcelPreviewError[] {
  const errors: ExcelPreviewError[] = analysis.errorEmployees.map((row) => ({
    rowNumber: row.rowNumber,
    employeeNumber: row.employeeNumber ?? "",
    error: row.error ?? "Invalid row.",
  }));
  for (const row of plan.rows) {
    const invalid = row.secondary.filter((secondary) => secondary.error);
    if (invalid.length === 0) continue;
    errors.push({
      rowNumber: row.rowNumber,
      employeeNumber: row.employeeNumber,
      error: invalid
        .map(
          (secondary) =>
            `${secondary.sheet} row ${secondary.rowNumber}: ${secondary.error ?? "Invalid row."}`
        )
        .join(" "),
    });
  }
  for (const row of analysis.secondary) {
    if (row.error && !row.employeeNumber) {
      errors.push({
        rowNumber: row.rowNumber,
        employeeNumber: "",
        error: `${row.sheet} sheet: ${row.error}`,
      });
    }
  }
  if (plan.orphanedSecondaryEmployeeNumbers.length > 0) {
    errors.push({
      rowNumber: 0,
      employeeNumber: plan.orphanedSecondaryEmployeeNumbers.join(", "),
      error:
        "Secondary sheets reference employee numbers that are not on the Employees sheet.",
    });
  }
  return errors;
}

/**
 * Classify analyzed rows against the CURRENT organization employees:
 * unknown employee number → CREATE, existing → UPDATE. Secondary sheets are
 * attached to their employees-tab row; rows that reference an employee
 * number absent from the file are reported so the wizard can block the
 * import (they can only be applied to an existing employee via UPDATE).
 */
export function planExcelImport(
  analysis: ExcelImportAnalysis,
  existingEmployeeNumbers: Set<string>
): ExcelImportPlan {
  const rows: ExcelPlannedRow[] = [];
  const fileNumbers = new Set<string>();
  let createCount = 0;
  let updateCount = 0;

  for (const row of analysis.validEmployees) {
    const employeeNumber = row.employeeNumber ?? "";
    if (!employeeNumber) continue;
    fileNumbers.add(employeeNumber);
    const operation: ExcelPlanOperation = existingEmployeeNumbers.has(
      employeeNumber
    )
      ? "update"
      : "create";
    if (operation === "update") updateCount += 1;
    else createCount += 1;
    rows.push({
      rowNumber: row.rowNumber,
      employeeNumber,
      operation,
      cells: row.cells ?? {},
      secondary: [],
      customValues: {},
    });
  }

  const byNumber = new Map(rows.map((row) => [row.employeeNumber, row]));
  const orphans = new Set<string>();
  let secondaryErrorCount = 0;

  for (const secondary of deduplicateSecondaryRows(analysis.secondary)) {
    if (secondary.error) secondaryErrorCount += 1;
    const planned = byNumber.get(secondary.employeeNumber);
    if (!planned) {
      if (secondary.employeeNumber) orphans.add(secondary.employeeNumber);
      continue;
    }
    if (secondary.error) {
      planned.secondary.push(secondary);
      continue;
    }
    if (secondary.sheet === CUSTOM_FIELDS_SHEET_NAME) {
      for (const [key, raw] of Object.entries(secondary.cells)) {
        if (key === "employee number") continue;
        if (raw) planned.customValues[key] = raw;
      }
    } else {
      planned.secondary.push(secondary);
    }
  }

  return {
    rows,
    createCount,
    updateCount,
    orphanedSecondaryEmployeeNumbers: [...orphans].sort(),
    secondaryErrorCount,
  };
}