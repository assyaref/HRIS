import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  analyzeExcelImport,
  EXCEL_IMPORT_MAX_ROWS,
  planExcelImport,
  type ExcelImportAnalysis,
} from "../../features/employees/excel/import.ts";
import {
  buildMainExportWorkbook,
  type EmployeeMasterExportData,
} from "../../features/employees/excel/export.ts";
import { buildTemplateWorkbook } from "../../features/employees/excel/template.ts";
import {
  CUSTOM_FIELDS_SHEET_NAME,
  EMPLOYEE_SHEET_COLUMNS,
  EMPLOYEE_SHEET_NAME,
  EXPORT_SHEETS,
} from "../../features/employees/excel/columns.ts";

const sampleData: EmployeeMasterExportData = {
  employees: [
    {
      employeeNumber: "EMP-001",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@acme.test",
      phone: "081234567890",
      hireDate: "2023-01-15",
      status: "active",
      nik: "1234123412341234",
      birthDate: "1995-04-20",
      nickname: "Jane",
      birthPlace: "Jakarta",
      gender: "Female",
      religion: "Kristen",
      maritalStatus: "Single",
      nationality: "WNI",
      personalEmail: "jane.personal@gmail.test",
      division: "Operations",
      department: "Support",
      position: "Analyst",
      workLocation: "HQ",
      managerEmployeeNumber: "EMP-000",
      employmentType: "Permanent",
      contractStart: "2023-01-15",
      contractEnd: null,
      resignationDate: null,
      terminationDate: null,
      reasonForLeaving: null,
    },
  ],
  addresses: [
    {
      employeeNumber: "EMP-001",
      addressType: "KTP",
      address: "Jl. Merdeka 1",
      rtRw: "001/002",
      village: "Menteng",
      district: "Menteng",
      city: "Jakarta Pusat",
      province: "DKI Jakarta",
      postalCode: "10310",
      sameAsKtp: true,
    },
  ],
  insurances: [
    {
      employeeNumber: "EMP-001",
      npwp: "123456789012345",
      bpjsKesehatanNumber: "2201123401234567",
      bpjsKesehatanStatus: "active",
      bpjsKesehatanClass: "II",
      bpjsKetenagakerjaanNumber: "0987654321",
      bpjsKetenagakerjaanStatus: "active",
    },
  ],
  bankAccounts: [
    {
      employeeNumber: "EMP-001",
      bankName: "BCA",
      accountNumber: "12345678",
      accountHolder: "Jane Doe",
      branch: "Sudirman",
      status: "active",
      isPrimary: true,
    },
  ],
  family: [
    {
      employeeNumber: "EMP-001",
      name: "John Doe",
      relationship: "Spouse",
      nik: "2234234234234234",
      birthDate: "1993-01-01",
      gender: "Male",
      occupation: "Engineer",
      dependentStatus: "active",
      bpjsStatus: "active",
      notes: null,
    },
  ],
  education: [
    {
      employeeNumber: "EMP-001",
      educationLevel: "S1",
      institution: "UI",
      major: "Informatics",
      startYear: 2013,
      graduationYear: 2017,
      gpaScore: "3.7",
      certificateNumber: "CERT-1",
      notes: null,
    },
  ],
  customValues: [
    {
      employeeNumber: "EMP-001",
      fieldKey: "shirt_size",
      label: "Shirt Size",
      value: "M",
    },
  ],
};

async function workbookFrom(buffer: ArrayBuffer | Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
}

test("excel export: produces every sheet in contract order", async () => {
  const { buffer } = await buildMainExportWorkbook(sampleData, {
    maskSensitiveFields: false,
    customFieldLabels: ["Shirt Size"],
  });
  const workbook = await workbookFrom(buffer);
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    [...EXPORT_SHEETS]
  );
});

test("excel export: writes raw sensitive values when masking is off", async () => {
  const { buffer } = await buildMainExportWorkbook(sampleData, {
    maskSensitiveFields: false,
    customFieldLabels: ["Shirt Size"],
  });
  const workbook = await workbookFrom(buffer);
  const employees = workbook.getWorksheet(EMPLOYEE_SHEET_NAME);
  const headers = employees?.getRow(1);
  let nikCell = "";
  headers?.eachCell((cell, colNumber) => {
    if (cell.text === "NIK") nikCell = employees?.getRow(2).getCell(colNumber).text ?? "";
  });
  assert.equal(nikCell, "1234123412341234");
});

test("excel export: masks sensitive values when masking is on", async () => {
  const { buffer } = await buildMainExportWorkbook(sampleData, {
    maskSensitiveFields: true,
    customFieldLabels: ["Shirt Size"],
  });
  const workbook = await workbookFrom(buffer);
  const employees = workbook.getWorksheet(EMPLOYEE_SHEET_NAME);
  const headers = employees?.getRow(1);
  let nikCell = "";
  headers?.eachCell((cell, colNumber) => {
    if (cell.text === "NIK") nikCell = employees?.getRow(2).getCell(colNumber).text ?? "";
  });
  assert.equal(nikCell, "**** **** **** 1234");

  const bank = workbook.getWorksheet("Bank Accounts");
  let accountCell = "";
  bank?.getRow(1).eachCell((cell, colNumber) => {
    if (cell.text === "Account Number") accountCell = bank.getRow(2).getCell(colNumber).text ?? "";
  });
  assert.equal(accountCell, "****5678");
});

test("excel export: writes custom field column values", async () => {
  const { buffer } = await buildMainExportWorkbook(sampleData, {
    maskSensitiveFields: false,
    customFieldLabels: ["Shirt Size"],
  });
  const workbook = await workbookFrom(buffer);
  const custom = workbook.getWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  assert.equal(custom?.getRow(1).getCell(2).text, "Shirt Size");
  assert.equal(custom?.getRow(2).getCell(2).text, "M");
});

test("excel export: stable keys prevent duplicate-label collisions and ignore hidden values", async () => {
  const data: EmployeeMasterExportData = {
    ...sampleData,
    customValues: [
      { employeeNumber: "EMP-001", fieldKey: "grade_public", label: "Grade", value: "Public" },
      { employeeNumber: "EMP-001", fieldKey: "grade_private", label: "Grade", value: "Secret" },
      { employeeNumber: "EMP-001", fieldKey: "hidden_field", label: "Hidden", value: "Must not export" },
    ],
  };
  const { buffer } = await buildMainExportWorkbook(data, {
    maskSensitiveFields: false,
    customFields: [
      { fieldKey: "grade_public", label: "Grade", fieldType: "text", options: [] },
      { fieldKey: "grade_private", label: "Grade", fieldType: "text", options: [] },
    ],
  });
  const workbook = await workbookFrom(buffer);
  const custom = workbook.getWorksheet(CUSTOM_FIELDS_SHEET_NAME)!;
  assert.equal(custom.getRow(1).getCell(2).text, "Grade [grade_public]");
  assert.equal(custom.getRow(1).getCell(3).text, "Grade [grade_private]");
  assert.equal(custom.getRow(2).getCell(2).text, "Public");
  assert.equal(custom.getRow(2).getCell(3).text, "Secret");
  assert.equal(custom.getRow(2).getCell(4).value, null);
});

test("excel template: contains instructions and all sheets", async () => {
  const { buffer } = await buildTemplateWorkbook({
    customFieldLabels: ["Blood Type"],
  });
  const workbook = await workbookFrom(buffer);
  const names = workbook.worksheets.map((sheet) => sheet.name);
  assert.ok(names.includes("Instructions"));
  assert.ok(names.includes(CUSTOM_FIELDS_SHEET_NAME));
  assert.ok(names.includes(EMPLOYEE_SHEET_NAME));
  const custom = workbook.getWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  assert.equal(custom?.getRow(1).getCell(2).text, "Blood Type");
});

test("excel import: analyzes valid and invalid employee rows", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  sheet.addRow(["Employee No.", "First Name", "Last Name", "Email", "Status"]);
  sheet.addRow(["EMP-100", "Alice", "Smith", "alice@acme.test", "active"]);
  sheet.addRow(["EMP-101", "Bob", "", "bob@acme.test", "active"]); // missing last name
  sheet.addRow(["ALT-1", "Carol", "Ng", "carol@acme.test", "bogus"]); // bad status
  const buffer = await workbook.xlsx.writeBuffer();

  const analysis = await analyzeExcelImport(buffer as unknown as ArrayBuffer, []);
  assert.equal(analysis.employeesSheetFound, true);
  assert.deepEqual(analysis.missingColumns, []);
  assert.equal(analysis.validEmployees.length, 1);
  assert.equal(analysis.errorEmployees.length, 2);
  assert.equal(analysis.validEmployees[0]?.employeeNumber, "EMP-100");
  assert.ok(
    analysis.errorEmployees.some((row) => row.error === "Name is required.")
  );
  assert.ok(
    analysis.errorEmployees.some((row) => (row.error ?? "").includes("Invalid status"))
  );
});

test("excel import: rows without identity are reported instead of skipped", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  sheet.addRow(["Employee No.", "First Name", "Last Name", "Email", "Status"]);
  sheet.addRow(["", "", "", "orphan@example.test", "active"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const analysis = await analyzeExcelImport(buffer as unknown as ArrayBuffer, []);
  assert.equal(analysis.employeeRowCount, 1);
  assert.equal(analysis.errorEmployees.length, 1);
});

test("excel import: reports missing required columns", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  sheet.addRow(["Name", "Status"]); // no employee number, no first/last
  const buffer = await workbook.xlsx.writeBuffer();

  const analysis = await analyzeExcelImport(buffer as unknown as ArrayBuffer, []);
  assert.equal(analysis.employeesSheetFound, true);
  assert.deepEqual(analysis.missingColumns, ["employee number", "first name", "last name"]);
});

test("excel import: rejects duplicate employee numbers in the file", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  sheet.addRow(["Employee No.", "First Name", "Last Name", "Status"]);
  sheet.addRow(["EMP-1", "A", "B", "active"]);
  sheet.addRow(["EMP-1", "C", "D", "active"]);
  const buffer = await workbook.xlsx.writeBuffer();

  const analysis = await analyzeExcelImport(buffer as unknown as ArrayBuffer, []);
  assert.equal(analysis.validEmployees.length, 1);
  assert.ok(
    analysis.errorEmployees.some((row) => row.error === "Duplicate employee number in the file.")
  );
});

test("excel import: honors the row limit", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  sheet.addRow(["Employee No.", "First Name", "Last Name", "Status"]);
  for (let index = 1; index <= 5; index++) {
    sheet.addRow([`EMP-${index}`, "A", "B", "active"]);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const analysis = await analyzeExcelImport(buffer as unknown as ArrayBuffer, []);
  assert.equal(analysis.rowLimitExceeded, false);
  assert.equal(EXCEL_IMPORT_MAX_ROWS > 0, true);
});

test("excel import: collects secondary address rows with validation", async () => {
  const workbook = new ExcelJS.Workbook();
  const employees = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  employees.addRow(["Employee No.", "First Name", "Last Name", "Status"]);
  employees.addRow(["EMP-1", "A", "B", "active"]);
  const addresses = workbook.addWorksheet("Addresses");
  addresses.addRow(["Employee No.", "Address Type", "Address"]);
  addresses.addRow(["EMP-1", "KTP", "Jl. A 1"]);
  addresses.addRow(["", "Domicile", "Jl. B 2"]); // missing employee number
  addresses.addRow(["EMP-1", "Villa", "Jl. C 3"]); // bad type
  const buffer = await workbook.xlsx.writeBuffer();

  const analysis = await analyzeExcelImport(buffer as unknown as ArrayBuffer, []);
  const addressRows = analysis.secondary.filter((row) => row.sheet === "Addresses");
  assert.equal(addressRows.length, 3);
  assert.equal(addressRows[0]?.error, null);
  assert.ok(
    addressRows.some((row) => row.error === "Employee number is required.")
  );
  assert.ok(
    addressRows.some((row) => (row.error ?? "").includes("Address Type"))
  );
});

test("excel import: validates custom field values against options", async () => {
  const workbook = new ExcelJS.Workbook();
  const employees = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  employees.addRow(["Employee No.", "First Name", "Last Name", "Status"]);
  employees.addRow(["EMP-1", "A", "B", "active"]);
  const custom = workbook.addWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  custom.addRow(["Employee No.", "Shirt Size"]);
  custom.addRow(["EMP-1", "XL"]); // not in options
  const buffer = await workbook.xlsx.writeBuffer();

  const analysis: ExcelImportAnalysis = await analyzeExcelImport(
    buffer as unknown as ArrayBuffer,
    [{
      fieldDefinitionId: "fid-shirt-size",
      label: "Shirt Size",
      fieldKey: "shirt_size",
      fieldType: "select",
      options: ["S", "M", "L"],
    }]
  );
  const customRows = analysis.secondary.filter((row) => row.sheet === CUSTOM_FIELDS_SHEET_NAME);
  assert.equal(customRows.length, 1);
  assert.ok((customRows[0]?.error ?? "").includes("[Shirt Size]"));

  const okWorkbook = new ExcelJS.Workbook();
  const okEmployees = okWorkbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  okEmployees.addRow(["Employee No.", "First Name", "Last Name", "Status"]);
  okEmployees.addRow(["EMP-1", "A", "B", "active"]);
  const okCustom = okWorkbook.addWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  okCustom.addRow(["Employee No.", "Shirt Size"]);
  okCustom.addRow(["EMP-1", "M"]);
  const okBuffer = await okWorkbook.xlsx.writeBuffer();

  const okAnalysis = await analyzeExcelImport(
    okBuffer as unknown as ArrayBuffer,
    [{
      fieldDefinitionId: "fid-shirt-size",
      label: "Shirt Size",
      fieldKey: "shirt_size",
      fieldType: "select",
      options: ["S", "M", "L"],
    }]
  );
  const okCustomRows = okAnalysis.secondary.filter((row) => row.sheet === CUSTOM_FIELDS_SHEET_NAME);
  assert.equal(okCustomRows[0]?.error, null);
});

test("excel import: stable keys disambiguate duplicate labels", async () => {
  const workbook = new ExcelJS.Workbook();
  const employees = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  employees.addRow(["Employee No.", "First Name", "Last Name", "Status"]);
  employees.addRow(["EMP-1", "A", "B", "active"]);
  const custom = workbook.addWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  custom.addRow(["Employee No.", "Grade [grade_public]", "Grade [grade_private]"]);
  custom.addRow(["EMP-1", "Public", "Secret"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const specs = [
    {
      fieldDefinitionId: "fid-grade-public",
      label: "Grade",
      fieldKey: "grade_public",
      fieldType: "text" as const,
      options: [],
    },
    {
      fieldDefinitionId: "fid-grade-private",
      label: "Grade",
      fieldKey: "grade_private",
      fieldType: "text" as const,
      options: [],
    },
  ];
  const analysis = await analyzeExcelImport(
    buffer as unknown as ArrayBuffer,
    specs
  );
  const plan = planExcelImport(analysis, new Set(["EMP-1"]));
  assert.equal(plan.rows[0]?.customValues.grade_public, "Public");
  assert.equal(plan.rows[0]?.customValues.grade_private, "Secret");
});

test("excel import: duplicate stable field-key columns are rejected", async () => {
  const workbook = new ExcelJS.Workbook();
  const employees = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  employees.addRow(["Employee No.", "First Name", "Last Name", "Status"]);
  employees.addRow(["EMP-1", "A", "B", "active"]);
  const custom = workbook.addWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  custom.addRow(["Employee No.", "Grade [grade]", "Grade [grade]"]);
  custom.addRow(["EMP-1", "A", "B"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const analysis = await analyzeExcelImport(buffer as unknown as ArrayBuffer, [
    {
      fieldDefinitionId: "fid-grade",
      label: "Grade",
      fieldKey: "grade",
      fieldType: "text",
      options: [],
    },
  ]);
  const row = analysis.secondary.find(
    (entry) => entry.sheet === CUSTOM_FIELDS_SHEET_NAME
  );
  assert.match(row?.error ?? "", /same field key/i);
});

test("excel import: stable keys survive a custom-field label rename", async () => {
  const workbook = new ExcelJS.Workbook();
  const employees = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  employees.addRow(["Employee No.", "First Name", "Last Name", "Status"]);
  employees.addRow(["EMP-1", "A", "B", "active"]);
  const custom = workbook.addWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  custom.addRow(["Employee No.", "Old Grade [grade]"]);
  custom.addRow(["EMP-1", "A"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const analysis = await analyzeExcelImport(buffer as unknown as ArrayBuffer, [
    {
      fieldDefinitionId: "fid-grade",
      label: "New Grade",
      fieldKey: "grade",
      fieldType: "text",
      options: [],
    },
  ]);
  const row = analysis.secondary.find(
    (entry) => entry.sheet === CUSTOM_FIELDS_SHEET_NAME
  );
  assert.equal(row?.error, null);
  assert.equal(row?.cells.grade, "A");
});

test("excel import: ambiguous legacy duplicate labels are rejected", async () => {
  const workbook = new ExcelJS.Workbook();
  const employees = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  employees.addRow(["Employee No.", "First Name", "Last Name", "Status"]);
  employees.addRow(["EMP-1", "A", "B", "active"]);
  const custom = workbook.addWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  custom.addRow(["Employee No.", "Grade"]);
  custom.addRow(["EMP-1", "Public"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const analysis = await analyzeExcelImport(buffer as unknown as ArrayBuffer, [
    {
      fieldDefinitionId: "fid-grade-public",
      label: "Grade",
      fieldKey: "grade_public",
      fieldType: "text",
      options: [],
    },
    {
      fieldDefinitionId: "fid-grade-private",
      label: "Grade",
      fieldKey: "grade_private",
      fieldType: "text",
      options: [],
    },
  ]);
  const row = analysis.secondary.find(
    (entry) => entry.sheet === CUSTOM_FIELDS_SHEET_NAME
  );
  assert.match(row?.error ?? "", /ambiguous legacy column label/i);
});

test("excel import: unknown custom columns are rejected as unauthorized", async () => {
  const workbook = new ExcelJS.Workbook();
  const employees = workbook.addWorksheet(EMPLOYEE_SHEET_NAME);
  employees.addRow(["Employee No.", "First Name", "Last Name", "Status"]);
  employees.addRow(["EMP-1", "A", "B", "active"]);
  const custom = workbook.addWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  custom.addRow(["Employee No.", "Hidden Field"]);
  custom.addRow(["EMP-1", "Secret"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const analysis = await analyzeExcelImport(buffer as unknown as ArrayBuffer, []);
  const row = analysis.secondary.find(
    (entry) => entry.sheet === CUSTOM_FIELDS_SHEET_NAME
  );
  assert.match(row?.error ?? "", /unknown or unauthorized/i);
});

test("excel import: full round trip export → template → analyze", async () => {
  const { buffer: exportBuffer } = await buildMainExportWorkbook(sampleData, {
    maskSensitiveFields: false,
    customFieldLabels: ["Shirt Size"],
  });
  const analysis = await analyzeExcelImport(exportBuffer, [
    {
      fieldDefinitionId: "fid-shirt-size",
      label: "Shirt Size",
      fieldKey: "shirt_size",
      fieldType: "select",
      options: ["M"],
    },
  ]);
  assert.equal(analysis.employeesSheetFound, true);
  assert.equal(analysis.validEmployees.length, 1);
  assert.equal(analysis.secondary.find((r) => r.sheet === "Addresses")?.employeeNumber, "EMP-001");
  assert.equal(EMPLOYEE_SHEET_COLUMNS.length > 10, true);
});