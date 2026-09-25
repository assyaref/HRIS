/**
 * Employee Master Data Excel export builder (xlxs).
 *
 * Uses exceljs (installed) to produce a multi-sheet workbook:
 *   Employees | Addresses | Insurance | Bank Accounts | Family | Education |
 *   Documents | Custom Fields
 *
 * The authenticated route (`app/api/employees/export/route.ts`) supplies
 * org-scoped rows and RBAC decisions; this module is a pure writer so its
 * output shape is unit-testable with `node --test`.
 *
 * Sensitive columns (NIK/NPWP/BPJS/bank/phone/personal email) are written raw
 * only when `maskSensitiveFields: false`. When true — the default proxy for a
 * viewer without the reveal permission — they are scrubbed through
 * `features/employees/masking.ts` before writing.
 */

import ExcelJS from "exceljs";

import { maskSensitiveField } from "../masking.ts";
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

export interface EmployeeExportRow {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  hireDate: string | null;
  status: string;
  nik: string | null;
  birthDate: string | null;
  nickname: string | null;
  birthPlace: string | null;
  gender: string | null;
  religion: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  personalEmail: string | null;
  division: string | null;
  department: string | null;
  position: string | null;
  workLocation: string | null;
  managerEmployeeNumber: string | null;
  employmentType: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  resignationDate: string | null;
  terminationDate: string | null;
  reasonForLeaving: string | null;
}

export interface AddressExportRow {
  employeeNumber: string;
  addressType: string;
  address: string | null;
  rtRw: string | null;
  village: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  sameAsKtp: boolean;
}

export interface InsuranceExportRow {
  employeeNumber: string;
  npwp: string | null;
  bpjsKesehatanNumber: string | null;
  bpjsKesehatanStatus: string | null;
  bpjsKesehatanClass: string | null;
  bpjsKetenagakerjaanNumber: string | null;
  bpjsKetenagakerjaanStatus: string | null;
}

export interface BankExportRow {
  employeeNumber: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string | null;
  status: string;
  isPrimary: boolean;
}

export interface FamilyExportRow {
  employeeNumber: string;
  name: string;
  relationship: string;
  nik: string | null;
  birthDate: string | null;
  gender: string | null;
  occupation: string | null;
  dependentStatus: string | null;
  bpjsStatus: string | null;
  notes: string | null;
}

export interface EducationExportRow {
  employeeNumber: string;
  educationLevel: string;
  institution: string;
  major: string | null;
  startYear: number | null;
  graduationYear: number | null;
  gpaScore: string | null;
  certificateNumber: string | null;
  notes: string | null;
}

export interface CustomFieldExportRow {
  employeeNumber: string;
  fieldKey: string;
  label: string;
  value: string;
}

export interface DocumentExportRow {
  employeeNumber: string;
  documentType: string;
  documentNumber: string | null;
  originalFilename: string;
  expiryDate: string | null;
  notes: string | null;
}

export interface EmployeeMasterExportData {
  employees: EmployeeExportRow[];
  addresses: AddressExportRow[];
  insurances: InsuranceExportRow[];
  bankAccounts: BankExportRow[];
  family: FamilyExportRow[];
  education: EducationExportRow[];
  customValues: CustomFieldExportRow[];
  /** Optional document metadata rows (files are never embedded). */
  documents?: DocumentExportRow[];
}

/** Per-column masking decisions supplied by the RBAC-aware route. */
export interface ExportMaskPolicy {
  nik: boolean;
  phone: boolean;
  email: boolean;
  personalEmail: boolean;
  npwp: boolean;
  bpjs: boolean;
  bankAccount: boolean;
  familyNik: boolean;
  /** When true the Documents sheet metadata is omitted (no permission). */
  hideDocuments: boolean;
  /** When true the Custom Fields sheet is omitted entirely. */
  hideCustomFields: boolean;
}

export interface ExportBuildOptions {
  /** Organization name written on the workbook title/metadata. */
  organizationName?: string;
  /**
   * Master switch scrubbing NIK/NPWP/BPJS/bank/phone columns through the
   * masking helpers. `policy` (when given) overrides per column group.
   */
  maskSensitiveFields: boolean;
  /** Optional per-column RBAC masking policy (routes compute this). */
  policy?: Partial<ExportMaskPolicy>;
  customFieldLabels?: string[];
  customFields?: CustomFieldWorkbookColumn[];
}

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "1FB6E8" },
} as const;

const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } } as const;

function applyHeaderRow(
  worksheet: ExcelJS.Worksheet,
  headers: string[]
): void {
  const headerRow = worksheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle" };
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

function autoWidth(worksheet: ExcelJS.Worksheet, headers: string[]): void {
  headers.forEach((header, index) => {
    const column = worksheet.getColumn(index + 1);
    column.width = Math.min(Math.max(header.length + 6, 12), 42);
  });
}

function maskWhen(
  mask: boolean,
  kind: "nik" | "npwp" | "bpjs" | "bank_account" | "phone" | "email",
  value: string | null
): string | null {
  if (!mask) return value;
  return maskSensitiveField(kind, value);
}

/** Resolve the effective masking policy: master switch + per-group override. */
function resolveMaskPolicy(options: ExportBuildOptions): ExportMaskPolicy {
  const base: ExportMaskPolicy = {
    nik: options.maskSensitiveFields,
    phone: options.maskSensitiveFields,
    email: options.maskSensitiveFields,
    personalEmail: options.maskSensitiveFields,
    npwp: options.maskSensitiveFields,
    bpjs: options.maskSensitiveFields,
    bankAccount: options.maskSensitiveFields,
    familyNik: options.maskSensitiveFields,
    hideDocuments: false,
    hideCustomFields: false,
  };
  return { ...base, ...options.policy };
}

/**
 * Build the export workbook. Returns an xlsx buffer and a filename in
 * `employees-master-data-YYYY-MM-DD.xlsx` format.
 */
export async function buildMainExportWorkbook(
  data: EmployeeMasterExportData,
  options: ExportBuildOptions
): Promise<{ buffer: ExcelJS.Buffer; filename: string }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRIS";
  workbook.created = new Date();

  const mask = resolveMaskPolicy(options);
  const stableCustomFields = options.customFields !== undefined;
  const customFieldColumns: CustomFieldWorkbookColumn[] =
    options.customFields ??
    (options.customFieldLabels ?? []).map((label, index) => ({
      fieldKey: `legacy_${index + 1}`,
      label,
      fieldType: "text",
      options: [],
    }));

  // -- Employees ----------------------------------------------------------
  const employeesSheet = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  const employeeHeaders = columnHeaders(EMPLOYEE_SHEET_COLUMNS);
  applyHeaderRow(employeesSheet, employeeHeaders);
  for (const employee of data.employees) {
    employeesSheet.addRow([
      employee.employeeNumber,
      employee.firstName,
      employee.lastName,
      maskWhen(mask.email, "email", employee.email),
      maskWhen(mask.phone, "phone", employee.phone),
      employee.hireDate,
      employee.status,
      maskWhen(mask.nik, "nik", employee.nik),
      employee.birthDate,
      employee.nickname,
      employee.birthPlace,
      employee.gender,
      employee.religion,
      employee.maritalStatus,
      employee.nationality,
      maskWhen(mask.personalEmail, "email", employee.personalEmail),
      employee.division,
      employee.department,
      employee.position,
      employee.workLocation,
      employee.managerEmployeeNumber,
      employee.employmentType,
      employee.contractStart,
      employee.contractEnd,
      employee.resignationDate,
      employee.terminationDate,
      employee.reasonForLeaving,
    ]);
  }
  autoWidth(employeesSheet, employeeHeaders);

  // -- Addresses ----------------------------------------------------------
  const addressSheet = workbook.addWorksheet(ADDRESS_SHEET_NAME);
  const addressHeaders = columnHeaders(ADDRESS_SHEET_COLUMNS);
  applyHeaderRow(addressSheet, addressHeaders);
  for (const address of data.addresses) {
    addressSheet.addRow([
      address.employeeNumber,
      address.addressType,
      address.address,
      address.rtRw,
      address.village,
      address.district,
      address.city,
      address.province,
      address.postalCode,
      address.sameAsKtp ? "Yes" : "No",
    ]);
  }
  autoWidth(addressSheet, addressHeaders);

  // -- Insurance ----------------------------------------------------------
  const insuranceSheet = workbook.addWorksheet(INSURANCE_SHEET_NAME);
  const insuranceHeaders = columnHeaders(INSURANCE_SHEET_COLUMNS);
  applyHeaderRow(insuranceSheet, insuranceHeaders);
  for (const insurance of data.insurances) {
    insuranceSheet.addRow([
      insurance.employeeNumber,
      maskWhen(mask.npwp, "npwp", insurance.npwp),
      maskWhen(mask.bpjs, "bpjs", insurance.bpjsKesehatanNumber),
      insurance.bpjsKesehatanStatus,
      insurance.bpjsKesehatanClass,
      maskWhen(mask.bpjs, "bpjs", insurance.bpjsKetenagakerjaanNumber),
      insurance.bpjsKetenagakerjaanStatus,
    ]);
  }
  autoWidth(insuranceSheet, insuranceHeaders);

  // -- Bank accounts ------------------------------------------------------
  const bankSheet = workbook.addWorksheet(BANK_SHEET_NAME);
  const bankHeaders = columnHeaders(BANK_SHEET_COLUMNS);
  applyHeaderRow(bankSheet, bankHeaders);
  for (const bank of data.bankAccounts) {
    bankSheet.addRow([
      bank.employeeNumber,
      bank.bankName,
      maskWhen(mask.bankAccount, "bank_account", bank.accountNumber),
      bank.accountHolder,
      bank.branch,
      bank.status,
      bank.isPrimary ? "Yes" : "No",
    ]);
  }
  autoWidth(bankSheet, bankHeaders);

  // -- Family -------------------------------------------------------------
  const familySheet = workbook.addWorksheet(FAMILY_SHEET_NAME);
  const familyHeaders = columnHeaders(FAMILY_SHEET_COLUMNS);
  applyHeaderRow(familySheet, familyHeaders);
  for (const family of data.family) {
    familySheet.addRow([
      family.employeeNumber,
      family.name,
      family.relationship,
      maskWhen(mask.familyNik, "nik", family.nik),
      family.birthDate,
      family.gender,
      family.occupation,
      family.dependentStatus,
      family.bpjsStatus,
      family.notes,
    ]);
  }
  autoWidth(familySheet, familyHeaders);

  // -- Education ----------------------------------------------------------
  const educationSheet = workbook.addWorksheet(EDUCATION_SHEET_NAME);
  const educationHeaders = columnHeaders(EDUCATION_SHEET_COLUMNS);
  applyHeaderRow(educationSheet, educationHeaders);
  for (const education of data.education) {
    educationSheet.addRow([
      education.employeeNumber,
      education.educationLevel,
      education.institution,
      education.major,
      education.startYear,
      education.graduationYear,
      education.gpaScore,
      education.certificateNumber,
      education.notes,
    ]);
  }
  autoWidth(educationSheet, educationHeaders);

  // -- Documents (metadata only; files are never embedded) ---------------
  const DOCUMENTS_HEADERS = [
    "Employee No.",
    "Document Type",
    "Document No.",
    "File Name",
    "Expiry Date",
    "Notes",
  ];
  if (!mask.hideDocuments) {
    const documentsSheet = workbook.addWorksheet(DOCUMENTS_SHEET_NAME);
    applyHeaderRow(documentsSheet, DOCUMENTS_HEADERS);
    if (data.documents && data.documents.length > 0) {
      for (const document of data.documents) {
        documentsSheet.addRow([
          document.employeeNumber,
          document.documentType,
          document.documentNumber,
          document.originalFilename,
          document.expiryDate,
          document.notes,
        ]);
      }
    } else {
      documentsSheet.addRow([
        "Files for this sheet are served from the Employee profile's Documents tab.",
      ]);
    }
    autoWidth(documentsSheet, DOCUMENTS_HEADERS);
  }

  // -- Custom Fields ------------------------------------------------------
  if (!mask.hideCustomFields) {
    const customSheet = workbook.addWorksheet(CUSTOM_FIELDS_SHEET_NAME);
    const customHeaders = [
      "Employee No.",
      ...customFieldColumns.map((spec) =>
        stableCustomFields ? customFieldColumnHeader(spec) : spec.label
      ),
    ];
    applyHeaderRow(customSheet, customHeaders);
    const allowedKeys = new Set(
      customFieldColumns.map((spec) =>
        stableCustomFields ? spec.fieldKey : spec.label
      )
    );
    const byEmployee = new Map<string, Record<string, string>>();
    for (const row of data.customValues) {
      const key = stableCustomFields ? row.fieldKey : row.label;
      if (!allowedKeys.has(stableCustomFields ? row.fieldKey : row.label)) continue;
      const entry = byEmployee.get(row.employeeNumber) ?? {};
      entry[key] = row.value;
      byEmployee.set(row.employeeNumber, entry);
    }
    for (const [employeeNumber, values] of byEmployee) {
      customSheet.addRow([
        employeeNumber,
        ...customFieldColumns.map((spec) =>
          values[stableCustomFields ? spec.fieldKey : spec.label] ?? ""
        ),
      ]);
    }
    autoWidth(customSheet, customHeaders);
  }

  if (options.organizationName) {
    workbook.company = options.organizationName;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `employees-master-data-${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  return { buffer, filename };
}