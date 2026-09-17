import assert from "node:assert/strict";
import test from "node:test";

import { payrollComponentSchema } from "../../features/payroll/schemas.ts";

const base = {
  code: "basic_salary",
  name: "Basic Salary",
  type: "earning" as const,
  calculationMethod: "fixed" as const,
  defaultAmount: 5_000_000,
};

test("payroll component accepts valid fixed amount", () => {
  const result = payrollComponentSchema.safeParse({
    ...base,
    calculationMethod: "fixed",
    defaultAmount: 5_000_000,
  });

  assert.equal(result.success, true);
});

test("payroll component accepts valid manual amount", () => {
  const result = payrollComponentSchema.safeParse({
    ...base,
    calculationMethod: "manual",
    defaultAmount: 0,
  });

  assert.equal(result.success, true);
});

test("payroll component accepts percentage 0", () => {
  const result = payrollComponentSchema.safeParse({
    ...base,
    calculationMethod: "percentage",
    defaultAmount: 0,
  });

  assert.equal(result.success, true);
});

test("payroll component accepts percentage 100", () => {
  const result = payrollComponentSchema.safeParse({
    ...base,
    calculationMethod: "percentage",
    defaultAmount: 100,
  });

  assert.equal(result.success, true);
});

test("payroll component rejects percentage above 100", () => {
  const result = payrollComponentSchema.safeParse({
    ...base,
    calculationMethod: "percentage",
    defaultAmount: 101,
  });

  assert.equal(result.success, false);

  if (!result.success) {
    assert.ok(
      result.error.issues.some(
        (issue) =>
          issue.path[0] === "defaultAmount" &&
          issue.message === "Percentage must be between 0 and 100."
      )
    );
  }
});

test("payroll component rejects negative amount", () => {
  const result = payrollComponentSchema.safeParse({
    ...base,
    calculationMethod: "fixed",
    defaultAmount: -1,
  });

  assert.equal(result.success, false);
});

test("payroll component rejects invalid code format", () => {
  const result = payrollComponentSchema.safeParse({
    ...base,
    code: "Basic Salary",
  });

  assert.equal(result.success, false);
});

test("payroll component rejects unsupported calculation method", () => {
  const result = payrollComponentSchema.safeParse({
    ...base,
    calculationMethod: "invalid",
  });

  assert.equal(result.success, false);
});
