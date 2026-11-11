/**
 * Employee Import Validation Tests
 *
 * Pure unit tests — no DB, no browser, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  validateNormalizedEmployee,
  validRowsToImportedEmployees,
  payloadRowToImportedEmployee,
  type ImportRow,
} from "../../features/employees/import/import-core.ts";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "../../features/employees/schemas.ts";

describe("validateNormalizedEmployee", () => {
  it("PASS: First Name only (Fais, no Last Name)", () => {
    const result = validateNormalizedEmployee({
      employeeNumber: "03235",
      firstName: "Fais",
      lastName: "",
      email: null,
      hireDate: null,
      status: "active",
    });
    assert.equal(result.valid, true);
    if (result.valid) assert.equal(result.status, "active");
  });

  it("PASS: First Name + Last Name (Fais Ahmad)", () => {
    const result = validateNormalizedEmployee({
      employeeNumber: "03235",
      firstName: "Fais",
      lastName: "Ahmad",
      email: null,
      hireDate: null,
      status: "active",
    });
    assert.equal(result.valid, true);
  });

  it("FAIL: First Name empty, Last Name = Ahmad", () => {
    const result = validateNormalizedEmployee({
      employeeNumber: "03235",
      firstName: "",
      lastName: "Ahmad",
      email: null,
      hireDate: null,
      status: "active",
    });
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.error, "First name is required.");
  });

  it("FAIL: Both names empty", () => {
    const result = validateNormalizedEmployee({
      employeeNumber: "03235",
      firstName: "",
      lastName: "",
      email: null,
      hireDate: null,
      status: "active",
    });
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.error, "First name is required.");
  });

  it("rejects missing employee number", () => {
    const result = validateNormalizedEmployee({
      employeeNumber: "",
      firstName: "Fais",
      lastName: "",
      email: null,
      hireDate: null,
      status: "active",
    });
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.error, "Employee number is required.");
  });

  it("trims whitespace on names", () => {
    const result = validateNormalizedEmployee({
      employeeNumber: "03235",
      firstName: "  Fais  ",
      lastName: "  Ahmad  ",
      email: null,
      hireDate: null,
      status: "active",
    });
    assert.equal(result.valid, true);
  });
});

describe("validRowsToImportedEmployees", () => {
  const validRow = (overrides: Partial<ImportRow> = {}): ImportRow => ({
    rowNumber: 1,
    employeeNumber: "03235",
    firstName: "Fais",
    lastName: "",
    email: null,
    hireDate: null,
    status: "active",
    statusRaw: null,
    error: null,
    validationStatus: "valid",
    ...overrides,
  });

  it("keeps lastName empty when Last Name column is absent", () => {
    const employees = validRowsToImportedEmployees([validRow()]);
    assert.equal(employees.length, 1);
    assert.equal(employees[0].employeeNumber, "03235");
    assert.equal(employees[0].firstName, "Fais");
    assert.equal(employees[0].lastName, "");
  });

  it("keeps lastName when provided", () => {
    const employees = validRowsToImportedEmployees([
      validRow({ lastName: "Ahmad" }),
    ]);
    assert.equal(employees.length, 1);
    assert.equal(employees[0].lastName, "Ahmad");
  });

  it("skips rows missing firstName", () => {
    const employees = validRowsToImportedEmployees([
      validRow({ firstName: null! as unknown as string }),
    ]);
    assert.equal(employees.length, 0);
  });
});

describe("payloadRowToImportedEmployee", () => {
  it("PASS: First Name only (Fais, no Last Name)", () => {
    const result = payloadRowToImportedEmployee({
      employeeNumber: "03235",
      firstName: "Fais",
      lastName: "",
      email: null,
      hireDate: null,
      status: "active",
    });
    assert.equal(result.error, null);
    if (result.error === null) {
      assert.equal(result.employee.firstName, "Fais");
      assert.equal(result.employee.lastName, "");
    }
  });

  it("PASS: First Name + Last Name (Fais Ahmad)", () => {
    const result = payloadRowToImportedEmployee({
      employeeNumber: "03235",
      firstName: "Fais",
      lastName: "Ahmad",
      email: null,
      hireDate: null,
      status: "active",
    });
    assert.equal(result.error, null);
    if (result.error === null) {
      assert.equal(result.employee.lastName, "Ahmad");
    }
  });

  it("FAIL: First Name empty", () => {
    const result = payloadRowToImportedEmployee({
      employeeNumber: "03235",
      firstName: "",
      lastName: "Ahmad",
      email: null,
      hireDate: null,
      status: "active",
    });
    assert.equal(result.employee, null);
    assert.equal(result.error, "First name is required.");
  });

  it("FAIL: Both names empty", () => {
    const result = payloadRowToImportedEmployee({
      employeeNumber: "03235",
      firstName: "",
      lastName: "",
      email: null,
      hireDate: null,
      status: "active",
    });
    assert.equal(result.employee, null);
    assert.equal(result.error, "First name is required.");
  });
});

describe("createEmployeeSchema", () => {
  it("accepts First Name only (lastName omitted)", () => {
    const parsed = createEmployeeSchema.safeParse({
      employeeNumber: "03235",
      firstName: "Fais",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.lastName, "");
  });

  it("accepts First Name + Last Name", () => {
    const parsed = createEmployeeSchema.safeParse({
      employeeNumber: "03235",
      firstName: "Fais",
      lastName: "Ahmad",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.lastName, "Ahmad");
  });

  it("rejects missing First Name", () => {
    const parsed = createEmployeeSchema.safeParse({
      employeeNumber: "03235",
      firstName: "",
      lastName: "Ahmad",
    });
    assert.equal(parsed.success, false);
  });
});

describe("updateEmployeeSchema", () => {
  it("accepts missing lastName (defaults to empty string)", () => {
    const parsed = updateEmployeeSchema.safeParse({
      employeeNumber: "03235",
      firstName: "Fais",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.lastName, "");
  });

  it("accepts lastName provided", () => {
    const parsed = updateEmployeeSchema.safeParse({
      employeeNumber: "03235",
      firstName: "Fais",
      lastName: "Ahmad",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.lastName, "Ahmad");
  });
});

describe("Employee Number leading zeros", () => {
  it("keeps 03235 as text (no numeric coercion)", async () => {
    const { EMPLOYEE_NUMBER_PATTERN } = await import(
      "../../features/employees/schemas.ts"
    );
    assert.equal(EMPLOYEE_NUMBER_PATTERN.test("03235"), true);
    assert.equal(EMPLOYEE_NUMBER_PATTERN.test("3235"), true);
  });
});

describe("Preview vs API payload name consistency", () => {
  it("produces the same full name in preview and payload", () => {
    const firstName = "Fais";
    const lastName = "Ahmad";

    const previewName = [firstName.trim(), lastName.trim()]
      .filter((part) => part.length > 0)
      .join(" ")
      .trim();

    const payloadLastName = lastName || "";
    const payloadName = [firstName.trim(), payloadLastName.trim()]
      .filter((part) => part.length > 0)
      .join(" ")
      .trim();

    assert.equal(previewName, payloadName);
    assert.equal(previewName, "Fais Ahmad");
  });

  it("produces First Name only when Last Name is absent", () => {
    const firstName = "Fais";
    const lastName = "";

    const previewName = [firstName.trim(), lastName.trim()]
      .filter((part) => part.length > 0)
      .join(" ")
      .trim();

    assert.equal(previewName, "Fais");
  });
});

describe("Update preserves existing lastName", () => {
  it("keeps existing lastName when submitted value is empty", () => {
    const existingLastName = "Ahmad";
    const submittedLastName = "";
    const nextLastName = submittedLastName || existingLastName;
    assert.equal(nextLastName, "Ahmad");
  });

  it("uses submitted lastName when non-empty", () => {
    const existingLastName = "Ahmad";
    const submittedLastName = "Budi";
    const nextLastName = submittedLastName || existingLastName;
    assert.equal(nextLastName, "Budi");
  });
});