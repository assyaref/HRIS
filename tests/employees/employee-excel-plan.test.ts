/**
 * Excel import planning + dynamic cell validation (Employee Master Data 2.0).
 *
 * Covers:
 *  - planExcelImport: CREATE when the employee number is unknown, UPDATE
 *    when it already exists in the organization, secondary-sheet join and
 *    orphan detection, secondary error count.
 *  - validateEmployeeCells: date/gender/employment-type/NIK/status rules.
 *  - required custom fields (definition-driven; never per-field if-branches).
 */

import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  analyzeExcelImport,
  buildExcelPreviewErrors,
  buildExcelUpdatePatch,
  deduplicateSecondaryRows,
  findDuplicateExistingEmailErrors,
  planExcelImport,
  validateEmployeeCells,
  validateRequiredCustomFieldsForCreates,
  type ExcelImportAnalysis,
} from "../../features/employees/excel/import.ts";

async function workbookWithEmployees(
  employees: string[][],
  extraSheets: [string, string[][]][] = []
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Employees");
  sheet.addRow([
    "Employee No.",
    "First Name",
    "Last Name",
    "Status",
    "Gender",
    "Employment Type",
    "Hire Date",
    "NIK",
  ]);
  for (const row of employees) sheet.addRow(row);
  for (const [name, rows] of extraSheets) {
    const target = workbook.addWorksheet(name);
    for (const row of rows) target.addRow(row);
  }
  return (await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer;
}

async function analyze(buffer: ArrayBuffer): Promise<ExcelImportAnalysis> {
  return analyzeExcelImport(buffer, []);
}

test("plan: unknown employee number classifies as CREATE", async () => {
  const buffer = await workbookWithEmployees([
    ["EMP-NEW", "A", "B", "active"],
  ]);
  const plan = planExcelImport(await analyze(buffer), new Set(["EMP-1"]));
  assert.equal(plan.createCount, 1);
  assert.equal(plan.updateCount, 0);
  assert.equal(plan.rows[0]?.operation, "create");
});

test("plan: existing employee number classifies as UPDATE", async () => {
  const buffer = await workbookWithEmployees([
    ["EMP-1", "A", "B", "active"],
  ]);
  const plan = planExcelImport(await analyze(buffer), new Set(["EMP-1"]));
  assert.equal(plan.createCount, 0);
  assert.equal(plan.updateCount, 1);
  assert.equal(plan.rows[0]?.operation, "update");
});

test("plan: mixed file reports both counts", async () => {
  const buffer = await workbookWithEmployees([
    ["EMP-1", "A", "B", "active"],
    ["EMP-2", "C", "D", "active"],
  ]);
  const plan = planExcelImport(await analyze(buffer), new Set(["EMP-2"]));
  assert.equal(plan.createCount, 1);
  assert.equal(plan.updateCount, 1);
});

test("plan: secondary rows join by employee number", async () => {
  const buffer = await workbookWithEmployees(
    [["EMP-1", "A", "B", "active"]],
    [["Addresses", [
      ["Employee No.", "Address Type", "Address"],
      ["EMP-1", "KTP", "Jl. A 1"],
    ]]]
  );
  const plan = planExcelImport(await analyze(buffer), new Set());
  assert.equal(plan.rows[0]?.secondary.length, 1);
  assert.equal(plan.rows[0]?.secondary[0]?.sheet, "Addresses");
  assert.equal(plan.orphanedSecondaryEmployeeNumbers.length, 0);
});

test("plan: orphan secondary references are reported", async () => {
  const buffer = await workbookWithEmployees(
    [["EMP-1", "A", "B", "active"]],
    [["Addresses", [
      ["Employee No.", "Address Type", "Address"],
      ["EMP-404", "KTP", "Jl. Z 9"],
    ]]]
  );
  const plan = planExcelImport(await analyze(buffer), new Set());
  assert.deepEqual(plan.orphanedSecondaryEmployeeNumbers, ["EMP-404"]);
});

test("plan: secondary validation errors are counted", async () => {
  const buffer = await workbookWithEmployees(
    [["EMP-1", "A", "B", "active"]],
    [["Family", [
      ["Employee No.", "Name", "Relationship"],
      ["EMP-1", "", "spouse"],
    ]]]
  );
  const plan = planExcelImport(await analyze(buffer), new Set());
  assert.equal(plan.secondaryErrorCount, 1);
  assert.ok(plan.rows[0]?.secondary.some((row) => row.error));
});

test("plan: custom field cells attach to the planned row", async () => {
  const buffer = await workbookWithEmployees(
    [["EMP-1", "A", "B", "active"]],
    [["Custom Fields", [
      ["Employee No.", "Shirt Size"],
      ["EMP-1", "M"],
    ]]]
  );
  const specs = [
    {
      fieldDefinitionId: "fid-shirt-size",
      label: "Shirt Size",
      fieldKey: "shirt_size",
      fieldType: "select" as const,
      options: ["S", "M", "L", "XL", "XXL"],
      isRequired: false,
    },
  ];
  const analysis = await analyzeExcelImport(buffer, specs);
  const plan = planExcelImport(analysis, new Set());
  assert.equal(plan.rows[0]?.customValues["shirt_size"], "M");
});

test("plan: required custom field without value fails create preview", async () => {
  const buffer = await workbookWithEmployees(
    [["EMP-1", "A", "B", "active"]],
    [["Custom Fields", [
      ["Employee No.", "Shirt Size"],
      ["EMP-1", ""],
    ]]]
  );
  const specs = [
    {
      fieldDefinitionId: "fid-shirt-size",
      label: "Shirt Size",
      fieldKey: "shirt_size",
      fieldType: "select" as const,
      options: ["S", "M", "L"],
      isRequired: true,
    },
  ];
  const analysis = await analyzeExcelImport(buffer, specs);
  const plan = planExcelImport(analysis, new Set());
  const requiredErrors = validateRequiredCustomFieldsForCreates(plan, specs);
  assert.equal(requiredErrors.length, 1);
  assert.equal(
    requiredErrors[0]?.error,
    "[Shirt Size] This field is required for new employees."
  );
});

test("plan: invalid education years are rejected before update", async () => {
  const buffer = await workbookWithEmployees(
    [["EMP-1", "A", "B", "active"]],
    [["Education", [
      ["Employee No.", "Education Level", "Institution", "Graduation Year"],
      ["EMP-1", "S1", "UI", "20xx"],
    ]]]
  );
  const plan = planExcelImport(await analyze(buffer), new Set(["EMP-1"]));
  const row = plan.rows[0]?.secondary.find(
    (entry) => entry.sheet === "Education"
  );
  assert.match(row?.error ?? "", /Graduation Year/i);
});

test("plan: blank UPDATE cells produce no patch", () => {
  assert.deepEqual(
    buildExcelUpdatePatch(
      {
        "first name": "",
        "last name": "",
        email: "",
        status: "",
        "hire date": "",
        division: "",
      },
      { personal: true, employment: true }
    ),
    {}
  );
});

test("plan: nonblank UPDATE cells produce only the changed fields", () => {
  const patch = buildExcelUpdatePatch(
    {
      "first name": "Updated",
      email: "updated@example.test",
      status: "active",
      "hire date": "2026-01-02",
    },
    { personal: true, employment: true }
  );
  assert.deepEqual(patch, {
    firstName: "Updated",
    email: "updated@example.test",
    employmentStatus: "active",
    hireDate: new Date("2026-01-02T00:00:00.000Z"),
  });
});

test("plan: repeated bank rows collapse by account identity", () => {
  const first = deduplicateSecondaryRows([
    {
      sheet: "Bank Accounts",
      rowNumber: 2,
      employeeNumber: "EMP-1",
      cells: {
        "bank name": "Bank A",
        "account number": "123",
        "account holder": "Jane",
      },
      unknownHeaders: [],
      error: null,
    },
    {
      sheet: "Bank Accounts",
      rowNumber: 3,
      employeeNumber: "EMP-1",
      cells: {
        "bank name": "Bank A",
        "account number": "123",
        "account holder": "Jane Updated",
      },
      unknownHeaders: [],
      error: null,
    },
  ]);
  assert.equal(first.length, 1);
  assert.equal(first[0]?.rowNumber, 3);
  assert.equal(deduplicateSecondaryRows(first).length, 1);
});

test("preview: existing employee emails cannot be reassigned", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Employees");
  sheet.addRow(["Employee No.", "First Name", "Last Name", "Email", "Status"]);
  sheet.addRow(["EMP-1", "A", "B", "", "active"]);
  sheet.addRow(["EMP-2", "C", "D", "existing@example.test", "active"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const plan = planExcelImport(
    await analyze(buffer as unknown as ArrayBuffer),
    new Set(["EMP-1"])
  );
  const errors = findDuplicateExistingEmailErrors(plan, [
    { employeeNumber: "EMP-1", email: "existing@example.test" },
  ]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.employeeNumber, "EMP-2");
  assert.match(errors[0]?.error ?? "", /already assigned/i);
});

test("preview: custom validation errors are included in the error count", async () => {
  const buffer = await workbookWithEmployees(
    [["EMP-1", "A", "B", "active"]],
    [["Custom Fields", [
      ["Employee No.", "Shirt Size"],
      ["EMP-1", "XXL"],
    ]]]
  );
  const analysis = await analyzeExcelImport(buffer, [
    {
      fieldDefinitionId: "fid-shirt-size",
      label: "Shirt Size",
      fieldKey: "shirt_size",
      fieldType: "select",
      options: ["S", "M", "L"],
    },
  ]);
  const plan = planExcelImport(analysis, new Set(["EMP-1"]));
  const errors = buildExcelPreviewErrors(analysis, plan);
  assert.equal(errors.length, 1);
  assert.match(errors[0]?.error ?? "", /Shirt Size/);
});

test("validateEmployeeCells: invalid gender rejected dynamically", () => {
  const errors = validateEmployeeCells({ gender: "Other" });
  assert.equal(errors.some((error) => error.includes("gender")), true);
});

test("validateEmployeeCells: employment type allowed values", () => {
  assert.equal(validateEmployeeCells({ "employment type": "Permanent" }).length, 0);
  assert.equal(
    validateEmployeeCells({ "employment type": "Consultant" }).length > 0,
    true
  );
});

test("validateEmployeeCells: date columns must be valid calendar dates", () => {
  assert.equal(
    validateEmployeeCells({ "hire date": "15-01-2024" }).length,
    1
  );
  assert.equal(
    validateEmployeeCells({ "contract end": "2024-13-01" }).length,
    1
  );
  assert.equal(
    validateEmployeeCells({ "hire date": "2024-02-30" }).length,
    1
  );
  assert.equal(
    validateEmployeeCells({ "birth date": "1990-01-02" }).length,
    0
  );
});

test("validateEmployeeCells: contract end before start rejected", () => {
  const errors = validateEmployeeCells({
    "contract start": "2025-01-01",
    "contract end": "2024-01-01",
  });
  assert.equal(errors.some((error) => error.includes("Contract end")), true);
});

test("validateEmployeeCells: NIK must be digits", () => {
  assert.equal(validateEmployeeCells({ nik: "1234123412341234" }).length, 0);
  assert.equal(validateEmployeeCells({ nik: "1234-1234" }).length, 1);
});

test("validateEmployeeCells: valid status passes", () => {
  assert.equal(validateEmployeeCells({ status: "active" }).length, 0);
  assert.equal(validateEmployeeCells({ status: "terminated" }).length, 1);
});

test("analyze: full Employees sheet cells reach the plan", async () => {
  const buffer = await workbookWithEmployees([
    ["EMP-9", "X", "Y", "active", "Female", "Contract", "2024-02-03", "1234567890123456"],
  ]);
  const analysis = await analyze(buffer);
  const plan = planExcelImport(analysis, new Set());
  assert.equal(plan.rows[0]?.cells["nik"], "1234567890123456");
  assert.equal(plan.rows[0]?.cells["employment type"], "Contract");
});
