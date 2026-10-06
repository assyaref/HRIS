import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPayslipPassword,
  buildPayslipPasswordV1,
} from "../../lib/payroll/payslip-pdf-password.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE = path.resolve(HERE, "../../lib/payroll/payslip-pdf-password.ts");

/**
 * Reproduces how node-postgres materialises a PostgreSQL DATE column.
 *
 * `pg.defaults.parseInputDatesAsUTC` is `false` by default, so pg builds the
 * value with `new Date(year, month - 1, day)` — i.e. LOCAL midnight. For
 * birth_date 1999-05-07 on a host in Asia/Jakarta (+07:00) that instant is
 * 1999-05-06T17:00:00.000Z, so `getUTCDate()` returns 6 instead of 7.
 */
function pgDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

test("REGRESSION 03233 + 1999-05-07 => 0323307051999 (pg DATE shape)", () => {
  assert.equal(buildPayslipPassword("03233", pgDate(1999, 5, 7)), "0323307051999");
});

test("REGRESSION 03233 + 1999-05-07 => 0323307051999 (calendar string)", () => {
  assert.equal(buildPayslipPassword("03233", "1999-05-07"), "0323307051999");
});

test("calendar date never shifts to the previous day", () => {
  for (const iso of [
    "1999-05-07",
    "2000-01-01",
    "2024-02-29",
    "1999-12-31",
    "1999-01-01",
  ]) {
    const [y, m, d] = iso.split("-").map(Number);
    const expected = `${String(d).padStart(2, "0")}${String(m).padStart(2, "0")}${y}`;
    assert.equal(
      buildPayslipPassword("03233", iso),
      `03233${expected}`,
      `string form ${iso}`
    );
    assert.equal(
      buildPayslipPassword("03233", pgDate(y, m, d)),
      `03233${expected}`,
      `pg Date form ${iso}`
    );
  }
});

test("07-05-1999 always produces 07051999", () => {
  assert.ok(buildPayslipPassword("03233", "1999-05-07").endsWith("07051999"));
  assert.ok(buildPayslipPassword("03233", pgDate(1999, 5, 7)).endsWith("07051999"));
});

test("preserves leading zeroes in the employee number", () => {
  const birthDate = "1999-05-07";
  assert.equal(buildPayslipPassword("03233", birthDate).slice(0, 5), "03233");
  assert.equal(buildPayslipPassword("0", birthDate), "0" + "07051999");
  assert.equal(buildPayslipPassword("00", birthDate), "00" + "07051999");
  assert.equal(buildPayslipPassword("007", birthDate), "007" + "07051999");
  assert.equal(
    buildPayslipPassword("00000000000000000000000000000001", birthDate),
    "00000000000000000000000000000001" + "07051999"
  );
});

test("NIK is never used by the current V2 contract", () => {
  // Only the employee number is accepted; the function has no NIK parameter.
  assert.equal(buildPayslipPassword.length, 2);
  const password = buildPayslipPassword("03233", "1999-05-07");
  assert.ok(!password.includes("1234567890123456"));
});

test("is timezone independent across host timezones", () => {
  const script = `
    import { buildPayslipPassword } from ${JSON.stringify(MODULE)};
    const fromString = buildPayslipPassword("03233", "1999-05-07");
    const fromPgDate = buildPayslipPassword("03233", new Date(1999, 4, 7));
    process.stdout.write(JSON.stringify({ fromString, fromPgDate }));
  `;
  const expected = { fromString: "0323307051999", fromPgDate: "0323307051999" };

  for (const tz of [
    "UTC",
    "Asia/Jakarta",
    "Asia/Makassar",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
    "Pacific/Kiritimati",
    "Pacific/Niue",
  ]) {
    const out = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      {
        env: { ...process.env, TZ: tz },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    assert.deepEqual(
      JSON.parse(out),
      expected,
      `timezone ${tz} must not change the payslip password`
    );
  }
});

test("legacy V1 password keeps the NIK + DD + YYYY contract", () => {
  assert.equal(
    buildPayslipPasswordV1("123456789", pgDate(1998, 7, 5)),
    "123456789051998"
  );
  assert.equal(buildPayslipPasswordV1("123456789", "1998-07-05"), "123456789051998");
});

test("rejects impossible calendar dates", () => {
  assert.throws(() => buildPayslipPassword("03233", "1999-02-30"), /birth date/);
  assert.throws(() => buildPayslipPassword("03233", "1999-13-01"), /birth date/);
  assert.throws(() => buildPayslipPassword("03233", "not-a-date"), /birth date/);
});
