/**
 * Employee Master Data Excel template builder (xlsx, exceljs).
 *
 * Produces a download where each tab mirrors the export/import contract:
 *   Instructions | Employees | Addresses | Insurance | Bank Accounts | Family |
 *   Education | Documents | Custom Fields
 *
 * Core columns carry in-cell dropdowns (status / gender / marital status /
 * employment type / address type / booleans) so editors pick valid values.
 * Custom Field columns are appended dynamically from the organization's active
 * field definitions — administrators create fields in Settings → Employee
 * Fields and the template follows automatically.
 */

import ExcelJS from "exceljs";

import {
  ADDRESS_SHEET_COLUMNS,
  ADDRESS_SHEET_NAME,
  BANK_SHEET_COLUMNS,
  BANK_SHEET_NAME,
  columnHeaders,
  customFieldColumnHeader,
  CUSTOM_FIELDS_SHEET_NAME,
  type CustomFieldWorkbookColumn,
  DOCUMENTS_SHEET_NAME,
  EDUCATION_SHEET_COLUMNS,
  EDUCATION_SHEET_NAME,
  EMPLOYEE_SHEET_COLUMNS,
  EMPLOYEE_SHEET_NAME,
  FAMILY_SHEET_COLUMNS,
  FAMILY_SHEET_NAME,
  INSURANCE_SHEET_COLUMNS,
  INSURANCE_SHEET_NAME,
} from "./columns.ts";
import {
  planCustomTabSheets,
  type CustomTabWorkbookPlan,
} from "./custom-tab-sheets.ts";

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "1FB6E8" },
} as const;

const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } } as const;

/** Rows of editor space every dropdown covers (matches import row cap). */
const TEMPLATE_LAST_ROW = 500;

/** Hidden sheet that stores dropdown option lists for long/quoted values. */
const LISTS_SHEET_NAME = "_Lists";

/**
 * exceljs 4.4.0 ships a partial `.d.ts` that omits data-validations. This
 * minimal typed surface keeps the in-cell dropdowns without a global `any`.
 */
interface WorksheetWithDataValidations {
  dataValidations: {
    add(range: string, options: unknown): void;
  };
}

interface TemplateSheetSpec {
  name: string;
  headers: string[];
  /** column-number (1-based) → comma-separated dropdown values */
  dropdowns?: Record<number, string[]>;
}

/**
 * One dynamic custom-field column for the Custom Fields sheet. Drives both
 * the header (label) and the in-cell dropdown (options), straight from the
 * organization's ACTIVE field definition — no hard-coded option lists.
 */
export interface TemplateCustomFieldSpec {
  fieldKey?: string;
  label: string;
  /** select / radio get a strict list; multiselect a warning-only list. */
  fieldType: string;
  options: readonly string[];
  /**
   * Custom Tab key this field belongs to, or null when it is unassigned. Used
   * only to decide which worksheet the column lands on; import never reads the
   * assignment back out of the file.
   */
  tabKey?: string | null;
}

function columnLetter(columnNumber: number): string {
  let column = "";
  let n = columnNumber;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    n = Math.floor((n - 1) / 26);
  }
  return column;
}

/**
 * Attach a list data-validation to a column using the fixed, comma-free core
 * option lists. Core dropdowns keep the compact inline literal form so they
 * stay byte-for-byte compatible with previously generated templates.
 */
function addInlineDropdown(
  worksheet: ExcelJS.Worksheet,
  columnNumber: number,
  values: readonly string[],
  strict: boolean
): void {
  const letter = columnLetter(columnNumber);
  const range = `${letter}2:${letter}${TEMPLATE_LAST_ROW}`;
  const withDataValidations = worksheet as unknown as WorksheetWithDataValidations;
  withDataValidations.dataValidations.add(range, {
    type: "list",
    allowBlank: true,
    formulae: [`"${values.join(",")}"`],
    showErrorMessage: strict,
  });
}

/**
 * Attach a dynamic custom-field dropdown to a column, reading its options
 * from the hidden `_Lists` sheet instead of an inline literal. This avoids
 * Excel's ~255-character inline-list cap and lets option values contain
 * commas/spaces without corrupting the list. The `_Lists` column is created
 * lazily; each spec consumes its own column so lists never collide.
 *
 * `strict` = true rejects anything outside the list (select/radio). For
 * multiselect it is false: the dropdown still suggests the defined options,
 * but comma-joined multi-values (the storage/import representation, e.g.
 * `"M,L"`) stay editable, so normal spreadsheet editing is never broken.
 */
function addDropdownFromLists(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  listsSheet: ExcelJS.Worksheet,
  listColumn: number,
  columnIndex: number,
  options: readonly string[],
  strict: boolean
): void {
  // `listColumn` indexes the hidden `_Lists` sheet (one column per field, so
  // lists never collide across the custom-data sheets); `columnIndex` indexes
  // the visible worksheet.
  const letter = columnLetter(listColumn);
  options.forEach((option, index) => {
    listsSheet.getCell(`${letter}${index + 1}`).value = option;
  });
  const source = `'${LISTS_SHEET_NAME}'!$${letter}$1:$${letter}$${options.length}`;
  const range = `${columnLetter(columnIndex)}2:${columnLetter(columnIndex)}${TEMPLATE_LAST_ROW}`;
  const withDataValidations = worksheet as unknown as WorksheetWithDataValidations;
  withDataValidations.dataValidations.add(range, {
    type: "list",
    allowBlank: true,
    formulae: [source],
    showErrorMessage: strict,
  });
}

function addTemplateSheet(
  workbook: ExcelJS.Workbook,
  spec: TemplateSheetSpec
): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet(spec.name);
  const headerRow = worksheet.addRow(spec.headers);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle" };
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  spec.headers.forEach((header, index) => {
    const column = worksheet.getColumn(index + 1);
    column.width = Math.min(Math.max(header.length + 6, 12), 42);
  });

  if (spec.dropdowns) {
    for (const [columnNumber, values] of Object.entries(spec.dropdowns)) {
      addInlineDropdown(worksheet, Number(columnNumber), values, true);
    }
  }

  return worksheet;
}

/** Known dropdown option lists for the Employees sheet. */
export const EMPLOYEE_TEMPLATE_DROPDOWNS: Record<number, string[]> = {
  7: ["active", "inactive"], // status
  12: ["Male", "Female"], // gender
  13: ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu", "Other"], // religion
  14: ["Single", "Married", "Divorced", "Widowed"], // marital status
  22: ["Probation", "Contract", "Permanent", "Daily", "Internship", "Freelance"], // employment type
};

const ADDRESS_TEMPLATE_DROPDOWNS: Record<number, string[]> = {
  2: ["KTP", "Domicile"],
  10: ["Yes", "No"],
};

const BANK_TEMPLATE_DROPDOWNS: Record<number, string[]> = {
  6: ["active", "inactive"],
  7: ["Yes", "No"],
};

export interface TemplateBuildOptions {
  /**
   * Active custom fields for the Custom Fields sheet columns (label order).
   * Kept for backward compatibility: when provided together with
   * `customFields` it is ignored (the specs carry the labels), and when it is
   * the ONLY source, those columns render without dropdowns.
   */
  customFieldLabels?: string[];
  /**
   * Active custom fields WITH their definitions (type + options), in display
   * order. When present the Custom Fields sheet is built from it and
   * select/radio/multiselect columns get in-cell dropdowns generated
   * dynamically from each definition's options.
   */
  customFields?: TemplateCustomFieldSpec[];
  /**
   * Custom Tab worksheet layout, already filtered to the tabs the requesting
   * user may see. Omit it and the template keeps its historical single
   * `Custom Fields` sheet, so existing callers and tests are unaffected.
   */
  customTabPlan?: CustomTabWorkbookPlan;
}

/**
 * Build the template workbook. Returns an xlsx buffer plus a filename in
 * `employee-master-data-template.xlsx` format.
 */
export async function buildTemplateWorkbook(
  options: TemplateBuildOptions
): Promise<{ buffer: ExcelJS.Buffer; filename: string }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRIS";

  // Normalize the custom-field columns: prefer the full specs (they carry
  // type + options for dropdown generation), fall back to labels only.
  const specs: TemplateCustomFieldSpec[] =
    options.customFields ??
    (options.customFieldLabels ?? []).map((label) => ({
      label,
      fieldType: "text",
      options: [],
    }));
  // Custom data layout: one worksheet per Custom Tab the caller can see, plus
  // the built-in `Custom Fields` sheet for unassigned fields. Without a plan we
  // fall back to the historical single sheet.
  const plan: CustomTabWorkbookPlan =
    options.customTabPlan ??
    planCustomTabSheets(
      [],
      specs
        .filter((spec) => spec.fieldKey)
        .map((spec) => ({
          fieldKey: spec.fieldKey as string,
          label: spec.label,
          fieldType: spec.fieldType,
          options: spec.options,
          tabKey: spec.tabKey ?? null,
        }))
    );
  // Label-only callers (no fieldKey) cannot be grouped, so they stay on the
  // built-in sheet.
  const labelOnly = specs.filter((spec) => !spec.fieldKey);
  const leftoverFields = [...plan.leftover, ...labelOnly];

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 30 }, { width: 90 }];
  instructions.addRow(["Guide", "Detail"]).eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
  instructions.addRow(["Purpose", "Employee Master Data template — one row per record."]);
  instructions.addRow(["Employees tab", "Create or update core employee rows. Employee No. is the unique key."]);
  instructions.addRow(["Status", "Allowed: active, inactive"]);
  instructions.addRow(["Gender", "Allowed: Male, Female, or a blank for unspecified."]);
  instructions.addRow(["Address Type", "Allowed: KTP, Domicile (one row per type per employee)."]);
  instructions.addRow(["Custom Fields tab", "Active fields defined in Settings → Employee Fields appear automatically."]);
  instructions.addRow(["Multi Select", "To pick several options join them with commas, e.g. M,L."]);
  instructions.addRow(["Import", "Save as .xlsx and import via the Employees page Import button."]);

  const employees = addTemplateSheet(workbook, {
    name: EMPLOYEE_SHEET_NAME,
    headers: columnHeaders(EMPLOYEE_SHEET_COLUMNS),
    dropdowns: EMPLOYEE_TEMPLATE_DROPDOWNS,
  });
  employees.getCell("H1").font = HEADER_FONT;

  addTemplateSheet(workbook, {
    name: ADDRESS_SHEET_NAME,
    headers: columnHeaders(ADDRESS_SHEET_COLUMNS),
    dropdowns: ADDRESS_TEMPLATE_DROPDOWNS,
  });

  addTemplateSheet(workbook, {
    name: INSURANCE_SHEET_NAME,
    headers: columnHeaders(INSURANCE_SHEET_COLUMNS),
  });

  addTemplateSheet(workbook, {
    name: BANK_SHEET_NAME,
    headers: columnHeaders(BANK_SHEET_COLUMNS),
    dropdowns: BANK_TEMPLATE_DROPDOWNS,
  });

  addTemplateSheet(workbook, {
    name: FAMILY_SHEET_NAME,
    headers: columnHeaders(FAMILY_SHEET_COLUMNS),
    dropdowns: { 6: ["Male", "Female"] },
  });

  addTemplateSheet(workbook, {
    name: EDUCATION_SHEET_NAME,
    headers: columnHeaders(EDUCATION_SHEET_COLUMNS),
  });

  addTemplateSheet(workbook, {
    name: DOCUMENTS_SHEET_NAME,
    headers: [
      "Employee No.",
      "Document Type",
      "Document No.",
      "File Name",
      "Expiry Date",
      "Notes",
    ],
  });

  // Dynamic dropdowns for list-style custom fields. A hidden reference sheet
  // holds each option list so long/comma-containing options stay valid. One
  // list per (field) across ALL custom-data sheets, so each dropdown points at
  // its own `_Lists` column and lists never collide.
  const customDataSheets: { worksheet: ExcelJS.Worksheet; specs: CustomFieldWorkbookColumn[] }[] = [];
  for (const sheet of plan.sheets) {
    if (sheet.fields.length === 0) continue;
    customDataSheets.push({
      worksheet: addTemplateSheet(workbook, {
        name: sheet.sheetName,
        headers: [
          "Employee No.",
          ...sheet.fields.map((field) => customFieldColumnHeader(field)),
        ],
      }),
      specs: sheet.fields,
    });
  }
  if (leftoverFields.length > 0) {
    customDataSheets.push({
      worksheet: addTemplateSheet(workbook, {
        name: CUSTOM_FIELDS_SHEET_NAME,
        // A label-only caller has no fieldKey, so it falls back to the raw
        // label header, exactly as it did before Custom Tabs existed.
        headers: [
          "Employee No.",
          ...leftoverFields.map((spec) =>
            spec.fieldKey
              ? customFieldColumnHeader({
                  fieldKey: spec.fieldKey,
                  label: spec.label,
                  fieldType: spec.fieldType,
                  options: spec.options,
                })
              : spec.label
          ),
        ],
      }),
      // Dropdowns only need type + options, so a synthetic key is safe here.
      specs: leftoverFields.map((spec, index) => ({
        fieldKey: spec.fieldKey ?? `legacy_${index + 1}`,
        label: spec.label,
        fieldType: spec.fieldType,
        options: spec.options,
      })),
    });
  }

  const listStyle = (spec: { options: readonly string[]; fieldType: string }) =>
    spec.options.length > 0 &&
    (spec.fieldType === "select" ||
      spec.fieldType === "radio" ||
      spec.fieldType === "multiselect");
  if (customDataSheets.some((entry) => entry.specs.some(listStyle))) {
    const listsSheet = workbook.addWorksheet(LISTS_SHEET_NAME);
    listsSheet.state = "hidden";
    // Each list-style field needs its own `_Lists` column. Claim the field's
    // own visible column first so a single-sheet template keeps the historical
    // column layout (list for column B lives in column B), and fall back to the
    // next free column when several custom-data sheets would otherwise claim
    // the same one.
    const claimed = new Set<number>();
    const claimListColumn = (preferred: number): number => {
      let candidate = preferred;
      while (claimed.has(candidate)) candidate += 1;
      claimed.add(candidate);
      return candidate;
    };
    for (const entry of customDataSheets) {
      entry.specs.forEach((spec, index) => {
        if (!listStyle(spec)) return;
        // Column 2 onward (column 1 = Employee No.).
        addDropdownFromLists(
          workbook,
          entry.worksheet,
          listsSheet,
          claimListColumn(index + 2),
          index + 2,
          spec.options,
          spec.fieldType !== "multiselect"
        );
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, filename: "employee-master-data-template.xlsx" };
}