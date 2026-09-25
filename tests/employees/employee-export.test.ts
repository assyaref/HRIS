/**
 * Employee CSV export — PURE builder (node:test).
 *
 * Exercises `features/employees/export/export-csv.ts`: the header contract,
 * RFC-style quoting and the generated payload/filename. The authenticated
 * download route itself is covered by the RBAC/source contract test.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEmployeesCsv,
  escapeCsvCell,
  neutralizeSpreadsheetFormula,
  EXPORT_CSV_HEADER,
  type ExportEmployeeRow,
} from "../../features/employees/export/export-csv.ts";

const sampleRow: ExportEmployeeRow = {
  employeeNumber: "EMP-0001",
  name: "Jane Doe",
  email: "jane@acme.test",
  status: "active",
  hireDate: "2024-01-15",
};

describe("escapeCsvCell", () => {
  it("passes plain values through untouched", () => {
    assert.equal(escapeCsvCell("Jane Doe"), "Jane Doe");
    assert.equal(escapeCsvCell("EMP-0001"), "EMP-0001");
  });

  it("quotes cells containing commas", () => {
    assert.equal(escapeCsvCell("Doe, John"), '"Doe, John"');
  });

  it("doubles embedded quotes inside quoted cells", () => {
    assert.equal(escapeCsvCell('Say "hi"'), '"Say ""hi"""');
  });

  it("quotes cells containing newlines", () => {
    assert.equal(escapeCsvCell("line1\nline2"), '"line1\nline2"');
  });

  it("renders null as an empty cell", () => {
    assert.equal(escapeCsvCell(null), "");
  });

  it("neutralizes dangerous spreadsheet formula prefixes", () => {
    for (const value of [
      "=1+1",
      "+1",
      "-1",
      "@SUM(A1)",
      "  =CMD()",
      "\t=CMD()",
      "\r=CMD()",
    ]) {
      assert.equal(neutralizeSpreadsheetFormula(value), `'${value}`);
    }
  });

  it("keeps formula-looking values CSV-safe after escaping", () => {
    assert.equal(
      escapeCsvCell('=HYPERLINK("https://example.test")'),
      "\"'=HYPERLINK(\"\"https://example.test\"\")\""
    );
  });
});

describe("buildEmployeesCsv", () => {
  it("writes the documented header", () => {
    const { csv } = buildEmployeesCsv([]);
    assert.equal(
      EXPORT_CSV_HEADER,
      "Employee No.,Name,Email,Status,Hire Date"
    );
    assert.equal(csv.includes(EXPORT_CSV_HEADER), true);
  });

  it("emits one row per employee with a trailing newline", () => {
    const { csv } = buildEmployeesCsv([sampleRow]);
    const lines = csv.split("\n");
    assert.equal(lines[1], "EMP-0001,Jane Doe,jane@acme.test,active,2024-01-15");
    assert.equal(csv.endsWith("\n"), true);
  });

  it("prepends a UTF-8 BOM for spreadsheet compatibility", () => {
    const { csv } = buildEmployeesCsv([sampleRow]);
    assert.equal(csv.startsWith("\uFEFF"), true);
  });

  it("quotes a name with a comma so columns stay aligned", () => {
    const { csv } = buildEmployeesCsv([
      { ...sampleRow, name: "Doe, John" },
    ]);
    assert.equal(
      csv.split("\n")[1],
      'EMP-0001,"Doe, John",jane@acme.test,active,2024-01-15'
    );
  });

  it("renders null email and hire date as empty cells", () => {
    const { csv } = buildEmployeesCsv([
      { ...sampleRow, email: null, hireDate: null },
    ]);
    assert.equal(csv.split("\n")[1], "EMP-0001,Jane Doe,,active,");
  });

  it("builds a dated filename", () => {
    const today = new Date().toISOString().slice(0, 10);
    const { filename } = buildEmployeesCsv([sampleRow]);
    assert.equal(filename, `employees-${today}.csv`);
  });
});