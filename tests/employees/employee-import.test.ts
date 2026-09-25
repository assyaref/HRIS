/**
 * Employee CSV import — PURE validation rules (node:test).
 *
 * Exercises `features/employees/import/import-core.ts` only: CSV parsing,
 * header resolution, schema validation, in-file duplicate detection and the
 * confirm-payload re-validation. Database existence checks and the
 * transactional insert live in the server action and are covered by the
 * RBAC/source contract test.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeImportRows,
  buildHeaderMap,
  IMPORT_MAX_ROWS,
  missingRequiredColumns,
  parseCsvRow,
  payloadRowToImportedEmployee,
  REQUIRED_IMPORT_COLUMNS,
  resolveImportColumn,
  validRowsToImportedEmployees,
  validateNormalizedEmployee,
} from "../../features/employees/import/import-core.ts";

describe("CSV parsing", () => {
  it("splits plain cells on commas", () => {
    assert.deepEqual(parseCsvRow("a,b,c"), ["a", "b", "c"]);
  });

  it("keeps commas inside quoted cells", () => {
    assert.deepEqual(parseCsvRow('a,"b,c",d'), ["a", "b,c", "d"]);
  });

  it("decodes doubled quotes inside a quoted cell", () => {
    assert.deepEqual(parseCsvRow('a,"say ""hi""",b'), ["a", 'say "hi"', "b"]);
  });

  it("handles whitespace around cells", () => {
    assert.deepEqual(parseCsvRow("  a  , b ,c  "), ["a", "b", "c"]);
  });
});

describe("header resolution", () => {
  it("resolves common spellings to canonical columns", () => {
    assert.equal(resolveImportColumn("Employee No."), "employee number");
    assert.equal(resolveImportColumn("Hire Date"), "hiredate");
    assert.equal(resolveImportColumn("Employment Status"), "status");
    assert.equal(resolveImportColumn("Full Name"), "name");
    assert.equal(resolveImportColumn("email"), "email");
    assert.equal(resolveImportColumn("unknown"), null);
  });

  it("builds a case-insensitive map and ignores unknown headers", () => {
    const map = buildHeaderMap([
      "Employee No.",
      "Name",
      "Email",
      "Hire Date",
      "Status",
      "Notes",
    ]);
    assert.equal(map["employee number"], 0);
    assert.equal(map.name, 1);
    assert.equal(map.email, 2);
    assert.equal(map.hiredate, 3);
    assert.equal(map.status, 4);
    assert.equal(missingRequiredColumns(map).length, 0);
  });

  it("reports missing columns (order-insensitive)", () => {
    const map = buildHeaderMap(["Name", "Email"]);
    const missing = missingRequiredColumns(map);
    assert.equal(missing.includes("employee number"), true);
    assert.equal(missing.includes("status"), true);
  });

  it("caps imports at 500 rows", () => {
    assert.equal(IMPORT_MAX_ROWS, 500);
  });

  it("requires exactly the documented columns", () => {
    assert.deepEqual([...REQUIRED_IMPORT_COLUMNS], [
      "employee number",
      "name",
      "email",
      "hiredate",
      "status",
    ]);
  });
});

function analyze(lines: string[]) {
  const headerMap = buildHeaderMap(parseCsvRow(lines[0]));
  const rows = lines.slice(1).map((line) => parseCsvRow(line));
  return analyzeImportRows(rows, headerMap);
}

describe("row validation", () => {
  it("parses a happy-path CSV into valid rows", () => {
    const { validRows, errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP-1001,Jane Doe,jane@acme.test,2024-01-15,Active",
      "EMP-1002,John Roe,john@acme.test,2023-06-01,inactive",
    ]);
    assert.equal(errorRows.length, 0);
    assert.equal(validRows.length, 2);

    const first = validRows[0];
    assert.equal(first.employeeNumber, "EMP-1001");
    assert.equal(first.firstName, "Jane");
    assert.equal(first.lastName, "Doe");
    assert.equal(first.email, "jane@acme.test");
    assert.equal(first.hireDate, "2024-01-15");
    assert.equal(first.status, "active");
    assert.equal(first.validationStatus, "valid");

    // Status is case-insensitive and normalized.
    assert.equal(validRows[1].status, "inactive");
  });

  it("defaults a missing status to active", () => {
    const { validRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP-1001,Jane Doe,jane@acme.test,2024-01-15,",
    ]);
    assert.equal(validRows.length, 1);
    assert.equal(validRows[0].status, "active");
  });

  it("allows optional email and hire date", () => {
    const { validRows, errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP-1001,Jane Doe,,,active",
    ]);
    assert.equal(errorRows.length, 0);
    assert.equal(validRows.length, 1);
    assert.equal(validRows[0].email, null);
    assert.equal(validRows[0].hireDate, null);
  });

  it("rejects a missing employee number", () => {
    const { errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      ",Jane Doe,jane@acme.test,2024-01-15,active",
    ]);
    assert.equal(errorRows.length, 1);
    assert.match(errorRows[0].error ?? "", /employee number/i);
  });

  it("rejects an invalid employee number format", () => {
    const { errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP 1001!,Jane Doe,jane@acme.test,2024-01-15,active",
    ]);
    assert.equal(errorRows.length, 1);
    assert.match(errorRows[0].error ?? "", /employee number/i);
  });

  it("rejects a missing name", () => {
    const { errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP-1001,,jane@acme.test,2024-01-15,active",
    ]);
    assert.equal(errorRows.length, 1);
    assert.match(errorRows[0].error ?? "", /name/i);
  });

  it("rejects an invalid email", () => {
    const { errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP-1001,Jane Doe,not-an-email,2024-01-15,active",
    ]);
    assert.equal(errorRows.length, 1);
    assert.match(errorRows[0].error ?? "", /email/i);
  });

  it("rejects an invalid hire date format", () => {
    const { errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP-1001,Jane Doe,jane@acme.test,15-01-2024,active",
    ]);
    assert.equal(errorRows.length, 1);
    assert.match(errorRows[0].error ?? "", /date/i);
  });

  it("rejects an invalid status", () => {
    const { errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP-1001,Jane Doe,jane@acme.test,2024-01-15,terminated",
    ]);
    assert.equal(errorRows.length, 1);
    assert.match(errorRows[0].error ?? "", /status/i);
  });
});

describe("in-file duplicate detection", () => {
  it("rejects a duplicated employee number", () => {
    const { validRows, errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP-1001,Jane Doe,jane@acme.test,2024-01-15,active",
      "EMP-1001,John Roe,other@acme.test,2024-02-01,active",
    ]);
    assert.equal(validRows.length, 1);
    assert.equal(errorRows.length, 1);
    assert.match(errorRows[0].error ?? "", /duplicate/i);
  });

  it("rejects a duplicated email (case-insensitive)", () => {
    const { validRows, errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP-1001,Jane Doe,jane@acme.test,2024-01-15,active",
      "EMP-1002,John Roe,JANE@acme.test,2024-02-01,active",
    ]);
    assert.equal(validRows.length, 1);
    assert.equal(errorRows.length, 1);
    assert.match(errorRows[0].error ?? "", /duplicate/i);
  });
});

describe("normalized validation", () => {
  it("validates normalized employee fields", () => {
    const ok = validateNormalizedEmployee({
      employeeNumber: "EMP-2000",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@acme.test",
      hireDate: "2024-01-15",
      status: "active",
    });
    assert.equal(ok.valid, true);

    const bad = validateNormalizedEmployee({
      employeeNumber: "EMP-2000",
      firstName: "Jane",
      lastName: "Doe",
      email: "nope",
      hireDate: null,
      status: "active",
    });
    assert.equal(bad.valid, false);
  });
});

describe("confirm payload re-validation", () => {
  it("rebuilds a valid row from the payload", () => {
    const result = payloadRowToImportedEmployee({
      employeeNumber: "EMP-3000",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@acme.test",
      hireDate: "2024-01-15",
      status: "active",
    });
    assert.equal(result.employee?.employeeNumber, "EMP-3000");
    assert.equal(result.employee?.status, "active");
  });

  it("rejects tampered payload rows", () => {
    const invalidNumber = payloadRowToImportedEmployee({
      employeeNumber: "INVALID !",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@acme.test",
      hireDate: "2024-01-15",
      status: "active",
    });
    assert.equal(invalidNumber.employee, null);
    assert.equal(!!invalidNumber.error, true);

    const badStatus = payloadRowToImportedEmployee({
      employeeNumber: "EMP-3001",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@acme.test",
      hireDate: null,
      status: "fired",
    });
    assert.equal(badStatus.employee, null);
  });

  it("rejects a non-object payload row", () => {
    const result = payloadRowToImportedEmployee("not an object");
    assert.equal(result.employee, null);
  });
});

describe("imported employee projection", () => {
  it("flattens valid rows into insertable fields and skips errors", () => {
    const { validRows, errorRows } = analyze([
      "Employee No.,Name,Email,Hire Date,Status",
      "EMP-1001,Jane Doe,jane@acme.test,2024-01-15,active",
      "EMP-1002,,,2024-01-15,active",
    ]);
    const employees = validRowsToImportedEmployees([...validRows, ...errorRows]);
    assert.equal(employees.length, 1);
    assert.equal(employees[0].employeeNumber, "EMP-1001");
    assert.equal(employees[0].hireDate, "2024-01-15");
  });
});