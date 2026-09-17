import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPayslipPassword,
  buildPayslipPasswordV1,
} from "../../lib/payroll/payslip-pdf-password.ts";

test("builds current V2 password: NIK + DD + MM + YYYY", () => {
  const password = buildPayslipPassword(
    "123456789",
    new Date("1998-07-05T00:00:00.000Z")
  );

  assert.equal(password, "12345678905071998");
});

test("builds legacy V1 password: NIK + DD + YYYY", () => {
  const password = buildPayslipPasswordV1(
    "123456789",
    new Date("1998-07-05T00:00:00.000Z")
  );

  assert.equal(password, "123456789051998");
});

test("supports one-digit NIK in current V2 password", () => {
  const password = buildPayslipPassword(
    "1",
    new Date("2000-01-02T00:00:00.000Z")
  );

  assert.equal(password, "102012000");
});

test("supports 32-digit NIK in current V2 password", () => {
  const nik = "12345678901234567890123456789012";

  const password = buildPayslipPassword(
    nik,
    new Date("1990-12-31T00:00:00.000Z")
  );

  assert.equal(password, `${nik}31121990`);
});

test("rejects non-numeric NIK", () => {
  assert.throws(
    () =>
      buildPayslipPassword(
        "123ABC",
        new Date("1998-07-05T00:00:00.000Z")
      ),
    /NIK/
  );
});

test("rejects NIK longer than 32 digits", () => {
  assert.throws(
    () =>
      buildPayslipPassword(
        "123456789012345678901234567890123",
        new Date("1998-07-05T00:00:00.000Z")
      ),
    /NIK/
  );
});

test("rejects invalid birth date", () => {
  assert.throws(
    () =>
      buildPayslipPassword(
        "123456",
        new Date("invalid")
      ),
    /birth date/
  );
});
