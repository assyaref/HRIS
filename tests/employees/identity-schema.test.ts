import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmployeeSchema,
  NIK_PATTERN,
  updateEmployeeSchema,
} from "../../features/employees/schemas.ts";

const baseEmployee = {
  employeeNumber: "EMP-IDENTITY-001",
  firstName: "Test",
  lastName: "Employee",
};

test("employee identity validation: NIK and birth date are optional", () => {
  const result = createEmployeeSchema.safeParse(baseEmployee);

  assert.equal(result.success, true);
});

test("employee identity validation: accepts NIK from 1 through 32 digits", () => {
  assert.equal(NIK_PATTERN.test("1"), true);
  assert.equal(
    NIK_PATTERN.test("12345678901234567890123456789012"),
    true,
  );
});

test("employee identity validation: rejects NIK longer than 32 digits", () => {
  const result = createEmployeeSchema.safeParse({
    ...baseEmployee,
    nik: "123456789012345678901234567890123",
  });

  assert.equal(result.success, false);
});

test("employee identity validation: rejects non-numeric NIK", () => {
  const letters = createEmployeeSchema.safeParse({
    ...baseEmployee,
    nik: "1234567890ABC",
  });

  assert.equal(letters.success, false);

  const symbols = createEmployeeSchema.safeParse({
    ...baseEmployee,
    nik: "1234567890-123",
  });

  assert.equal(symbols.success, false);
});

test("employee identity validation: accepts a valid birth date", () => {
  const result = createEmployeeSchema.safeParse({
    ...baseEmployee,
    birthDate: "1999-08-15",
  });

  assert.equal(result.success, true);
});

test("employee identity validation: rejects an invalid calendar date", () => {
  const result = createEmployeeSchema.safeParse({
    ...baseEmployee,
    birthDate: "1999-02-31",
  });

  assert.equal(result.success, false);
});

test("employee identity validation: rejects a future birth date", () => {
  const result = updateEmployeeSchema.safeParse({
    ...baseEmployee,
    birthDate: "2999-01-01",
  });

  assert.equal(result.success, false);
});
