/**
 * Excel export/template/import — shared column contract (pure).
 *
 * The template builder, the export writer and the import analyzer across all
 * these files read these constants, so the workbook sheets stay in lockstep.
 * Headers are stable English labels (stable machine keys are matched by the
 * import parser via `features/employees/import/import-core.ts` aliases).
 */

/** Stable machine key → human-readable worksheet header. */
export const EMPLOYEE_SHEET_COLUMNS: readonly { key: string; header: string }[] =
  [
    { key: "employee number", header: "Employee No." },
    { key: "first name", header: "First Name" },
    { key: "last name", header: "Last Name" },
    { key: "email", header: "Email" },
    { key: "phone", header: "Phone" },
    { key: "hire date", header: "Hire Date" },
    { key: "status", header: "Status" },
    { key: "nik", header: "NIK" },
    { key: "birth date", header: "Birth Date" },
    { key: "nickname", header: "Nickname" },
    { key: "birth place", header: "Birth Place" },
    { key: "gender", header: "Gender" },
    { key: "religion", header: "Religion" },
    { key: "marital status", header: "Marital Status" },
    { key: "nationality", header: "Nationality" },
    { key: "personal email", header: "Personal Email" },
    { key: "division", header: "Division" },
    { key: "department", header: "Department" },
    { key: "position", header: "Position" },
    { key: "work location", header: "Work Location" },
    { key: "manager", header: "Manager Employee No." },
    { key: "employment type", header: "Employment Type" },
    { key: "contract start", header: "Contract Start" },
    { key: "contract end", header: "Contract End" },
    { key: "resignation date", header: "Resignation Date" },
    { key: "termination date", header: "Termination Date" },
    { key: "reason for leaving", header: "Reason for Leaving" },
  ] as const;

export const ADDRESS_SHEET_COLUMNS: readonly { key: string; header: string }[] = [
  { key: "employee number", header: "Employee No." },
  { key: "address type", header: "Address Type" },
  { key: "address", header: "Address" },
  { key: "rt/rw", header: "RT/RW" },
  { key: "village", header: "Village / Kelurahan" },
  { key: "district", header: "District / Kecamatan" },
  { key: "city", header: "City" },
  { key: "province", header: "Province" },
  { key: "postal code", header: "Postal Code" },
  { key: "same as ktp", header: "Same As KTP" },
];

export const INSURANCE_SHEET_COLUMNS: readonly {
  key: string;
  header: string;
}[] = [
  { key: "employee number", header: "Employee No." },
  { key: "npwp", header: "NPWP" },
  { key: "bpjs kesehatan number", header: "BPJS Kesehatan No." },
  { key: "bpjs kesehatan status", header: "BPJS Kesehatan Status" },
  { key: "bpjs kesehatan class", header: "BPJS Kesehatan Class" },
  { key: "bpjs ketenagakerjaan number", header: "BPJS Ketenagakerjaan No." },
  { key: "bpjs ketenagakerjaan status", header: "BPJS Ketenagakerjaan Status" },
];

export const BANK_SHEET_COLUMNS: readonly { key: string; header: string }[] = [
  { key: "employee number", header: "Employee No." },
  { key: "bank name", header: "Bank Name" },
  { key: "account number", header: "Account Number" },
  { key: "account holder", header: "Account Holder" },
  { key: "branch", header: "Branch" },
  { key: "status", header: "Status" },
  { key: "is primary", header: "Is Primary" },
];

export const FAMILY_SHEET_COLUMNS: readonly { key: string; header: string }[] = [
  { key: "employee number", header: "Employee No." },
  { key: "name", header: "Name" },
  { key: "relationship", header: "Relationship" },
  { key: "nik", header: "NIK" },
  { key: "birth date", header: "Birth Date" },
  { key: "gender", header: "Gender" },
  { key: "occupation", header: "Occupation" },
  { key: "dependent status", header: "Dependent Status" },
  { key: "bpjs status", header: "BPJS Status" },
  { key: "notes", header: "Notes" },
];

export const EDUCATION_SHEET_COLUMNS: readonly {
  key: string;
  header: string;
}[] = [
  { key: "employee number", header: "Employee No." },
  { key: "education level", header: "Education Level" },
  { key: "institution", header: "Institution" },
  { key: "major", header: "Major" },
  { key: "start year", header: "Start Year" },
  { key: "graduation year", header: "Graduation Year" },
  { key: "gpa score", header: "GPA / Score" },
  { key: "certificate number", header: "Certificate No." },
  { key: "notes", header: "Notes" },
];

export const CUSTOM_FIELDS_SHEET_NAME = "Custom Fields";
export const ADDRESS_SHEET_NAME = "Addresses";
export const INSURANCE_SHEET_NAME = "Insurance";
export const BANK_SHEET_NAME = "Bank Accounts";
export const FAMILY_SHEET_NAME = "Family";
export const EDUCATION_SHEET_NAME = "Education";
export const DOCUMENTS_SHEET_NAME = "Documents";
export const EMPLOYEE_SHEET_NAME = "Employees";

/** Every sheet written by the export/template, in order. */
export const EXPORT_SHEETS = [
  EMPLOYEE_SHEET_NAME,
  ADDRESS_SHEET_NAME,
  INSURANCE_SHEET_NAME,
  BANK_SHEET_NAME,
  FAMILY_SHEET_NAME,
  EDUCATION_SHEET_NAME,
  DOCUMENTS_SHEET_NAME,
  CUSTOM_FIELDS_SHEET_NAME,
] as const;

/** Build a fresh header row array from a column contract. */
export function columnHeaders(
  columns: readonly { key: string; header: string }[]
): string[] {
  return columns.map((column) => column.header);
}

export interface CustomFieldWorkbookColumn {
  fieldKey: string;
  label: string;
  fieldType: string;
  options: readonly string[];
  /**
   * `tabKey` of the Custom Tab this field is assigned to, or null when the
   * field is not assigned to a tab.
   *
   * Metadata only. The workbook is NEVER the source of truth for tab
   * assignment: the assignment lives in the field definition's `section` and
   * the import planner never moves a field between tabs. This is carried only
   * so the export can place the field's columns under the right worksheet, and
   * it is resolved from the caller's VISIBLE tab list, so a field whose tab the
   * caller may not see is grouped onto the built-in `Custom Fields` sheet.
   */
  tabKey?: string | null;
}

/**
 * Header for one custom-field column: `Label [fieldKey]`.
 *
 * The trailing `[<fieldKey>]` is the stable machine token. Import resolves
 * every column by that token, which is why a field can be relocated to a
 * different Custom Tab — or to a different worksheet — without invalidating a
 * previously generated workbook.
 */
export function customFieldColumnHeader(
  spec: CustomFieldWorkbookColumn
): string {
  return `${spec.label} [${spec.fieldKey}]`;
}

/** Build a `header label → key` map for the import analyzer. */
export function columnKeyByHeader(
  columns: readonly { key: string; header: string }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const column of columns) {
    map[column.header.toLowerCase()] = column.key;
  }
  return map;
}

/**
 * Sheet name rules for the Excel workbook.
 *
 * Excel caps a sheet name at 31 characters and rejects `\ / * [ ] : ?`. The
 * core employee sheets are all far shorter than 31, but a Custom Tab is
 * database-driven, so its name is arbitrary user input. These helpers make the
 * name deterministic and collision-free instead of trusting the input.
 */
export const EXCEL_SHEET_NAME_MAX_LENGTH = 31;

/** Characters Excel refuses inside a sheet name. */
const INVALID_SHEET_NAME_CHARS = /[\\/*[\]:?]/g;

/**
 * Sanitize one custom-tab name into a valid Excel sheet name: strip control
 * characters and the characters Excel forbids, collapse whitespace, and cap
 * at 31 characters. Deterministic — the same input always yields the same
 * output, which is what makes the export → import round-trip work.
 *
 * Returns `""` when nothing usable remains, so the caller can fall back
 * rather than emit an invalid sheet.
 */
export function sanitizeSheetName(raw: string): string {
  const cleaned = raw
    // Control characters become a space rather than vanishing, so "Tab\nName"
    // reads as two words instead of running together.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(INVALID_SHEET_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return "";
  return cleaned.slice(0, EXCEL_SHEET_NAME_MAX_LENGTH).trim();
}

/**
 * Resolve the final sheet name for each custom tab, guaranteeing uniqueness
 * against the reserved core sheet names and against each other.
 *
 * Strategy: use the sanitized tab name; on collision append ` (2)`, ` (3)`, …
 * truncated to stay within 31 characters. The suffix is a pure function of the
 * tab's position, so re-running the export produces identical names.
 */
export function resolveCustomTabSheetNames(
  tabs: readonly { tabKey: string; name: string }[],
  reservedNames: readonly string[]
): { tabKey: string; sheetName: string }[] {
  const taken = new Set(
    reservedNames.map((name) => name.trim().toLowerCase())
  );
  const result: { tabKey: string; sheetName: string }[] = [];
  for (const tab of tabs) {
    const base = sanitizeSheetName(tab.name) || `Tab ${tab.tabKey}`;
    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate.toLowerCase())) {
      const marker = ` (${suffix})`;
      const stem = base.slice(
        0,
        Math.max(1, EXCEL_SHEET_NAME_MAX_LENGTH - marker.length)
      );
      candidate = `${stem}${marker}`;
      suffix += 1;
    }
    taken.add(candidate.toLowerCase());
    result.push({ tabKey: tab.tabKey, sheetName: candidate });
  }
  return result;
}