import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPayslipPassword,
  buildPayslipPasswordV1,
} from "../../lib/payroll/payslip-pdf-password.ts";

test("builds current V2 password: employee number + DD + MM + YYYY", () => {
  const password = buildPayslipPassword(
    "03233",
    new Date("1995-08-25T00:00:00.000Z")
  );

  assert.equal(password, "0323325081995");
});

test("pads a one-digit day and month to two digits", () => {
  const password = buildPayslipPassword(
    "7",
    new Date("2000-01-02T00:00:00.000Z")
  );

  assert.equal(password, "702012000");
});

test("builds legacy V1 password: NIK + DD + YYYY (legacy decrypt only)", () => {
  const password = buildPayslipPasswordV1(
    "123456789",
    new Date("1998-07-05T00:00:00.000Z")
  );

  assert.equal(password, "123456789051998");
});

test("supports a 32-digit employee number in current V2 password", () => {
  const employeeNumber = "12345678901234567890123456789012";

  const password = buildPayslipPassword(
    employeeNumber,
    new Date("1990-12-31T00:00:00.000Z")
  );

  assert.equal(password, `${employeeNumber}31121990`);
});

test("rejects a non-numeric employee number", () => {
  assert.throws(
    () =>
      buildPayslipPassword(
        "0323A",
        new Date("1995-08-25T00:00:00.000Z")
      ),
    /Employee number/
  );
});

test("rejects an employee number longer than 32 digits", () => {
  assert.throws(
    () =>
      buildPayslipPassword(
        "123456789012345678901234567890123",
        new Date("1995-08-25T00:00:00.000Z")
      ),
    /Employee number/
  );
});

test("rejects an employee number with separators (no slashes, dashes, spaces)", () => {
  assert.throws(
    () =>
      buildPayslipPassword(
        "03233-1",
        new Date("1995-08-25T00:00:00.000Z")
      ),
    /Employee number/
  );
});

test("rejects invalid birth date", () => {
  assert.throws(
    () =>
      buildPayslipPassword(
        "03233",
        new Date("invalid")
      ),
    /birth date/
  );
});