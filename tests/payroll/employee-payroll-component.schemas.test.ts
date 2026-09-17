/**
 * PM-03.2 — Employee payroll component schema tests (Node `node:test`).
 *
 * These exercise the PURE input schemas used by the employee payroll
 * component server actions. No DB, no browser, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  employeePayrollComponentCreateSchema,
  employeePayrollComponentUpdateSchema,
  employeePayrollComponentEndSchema,
} from "../../features/payroll/employee-payroll-component.schemas.ts";

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";
const COMPONENT_A = "33333333-3333-4333-8333-333333333333";

const createBase = {
  employeeId: EMPLOYEE_A,
  componentId: COMPONENT_A,
  amount: 5_000_000,
  effectiveFrom: "2026-09-01",
};

describe("employeePayrollComponentCreateSchema", () => {
  it("accepts a valid fixed amount assignment", () => {
    const parsed = employeePayrollComponentCreateSchema.safeParse({
      ...createBase,
      effectiveTo: "2027-09-01",
      notes: "salary review",
    });
    assert.equal(parsed.success, true);
  });

  it("accepts an open-ended assignment (no effectiveTo)", () => {
    const parsed = employeePayrollComponentCreateSchema.safeParse(createBase);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.effectiveTo, undefined);
    }
  });

  it("accepts an empty effectiveTo/notes from a form", () => {
    const parsed = employeePayrollComponentCreateSchema.safeParse({
      ...createBase,
      effectiveTo: "",
      notes: "",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.effectiveTo, undefined);
      // Notes stay "" (trimmed); the server action maps empty notes to null.
      assert.equal(parsed.data.notes, "");
    }
  });

  it("accepts percentage amount 100", () => {
    const parsed = employeePayrollComponentCreateSchema.safeParse({
      ...createBase,
      amount: 100,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects a negative amount", () => {
    const parsed = employeePayrollComponentCreateSchema.safeParse({
      ...createBase,
      amount: -1,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a fractional amount", () => {
    const parsed = employeePayrollComponentCreateSchema.safeParse({
      ...createBase,
      amount: 1000.5,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a malformed employee id", () => {
    const parsed = employeePayrollComponentCreateSchema.safeParse({
      ...createBase,
      employeeId: "not-a-uuid",
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "employeeId");
    }
  });

  it("rejects a malformed component id", () => {
    const parsed = employeePayrollComponentCreateSchema.safeParse({
      ...createBase,
      componentId: "nope",
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "componentId");
    }
  });

  it("rejects a malformed effectiveFrom date", () => {
    const parsed = employeePayrollComponentCreateSchema.safeParse({
      ...createBase,
      effectiveFrom: "09/01/2026",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects effectiveTo on or before effectiveFrom", () => {
    const same = employeePayrollComponentCreateSchema.safeParse({
      ...createBase,
      effectiveTo: "2026-09-01",
    });
    assert.equal(same.success, false);

    const earlier = employeePayrollComponentCreateSchema.safeParse({
      ...createBase,
      effectiveTo: "2026-08-31",
    });
    assert.equal(earlier.success, false);
    if (!earlier.success) {
      assert.equal(parsedErrorMessage(earlier), "Effective to must be after effective from.");
    }
  });
});

describe("employeePayrollComponentUpdateSchema", () => {
  it("accepts a valid update", () => {
    const parsed = employeePayrollComponentUpdateSchema.safeParse({
      amount: 6_000_000,
      effectiveFrom: "2026-09-01",
      effectiveTo: "2027-06-30",
      notes: "renegotiated",
    });
    assert.equal(parsed.success, true);
  });

  it("accepts clearing effectiveTo", () => {
    const parsed = employeePayrollComponentUpdateSchema.safeParse({
      amount: 5_000_000,
      effectiveFrom: "2026-09-01",
      effectiveTo: "",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.effectiveTo, undefined);
    }
  });

  it("rejects effectiveTo before effectiveFrom", () => {
    const parsed = employeePayrollComponentUpdateSchema.safeParse({
      amount: 5_000_000,
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-08-01",
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsedErrorMessage(parsed), "Effective to must be after effective from.");
    }
  });

  it("rejects a negative amount", () => {
    const parsed = employeePayrollComponentUpdateSchema.safeParse({
      amount: -100,
      effectiveFrom: "2026-09-01",
    });
    assert.equal(parsed.success, false);
  });
});

describe("employeePayrollComponentEndSchema", () => {
  it("accepts an explicit end date", () => {
    const parsed = employeePayrollComponentEndSchema.safeParse({
      effectiveTo: "2027-01-31",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.effectiveTo, "2027-01-31");
    }
  });

  it("accepts an empty end date (defaults to today in the action)", () => {
    const parsed = employeePayrollComponentEndSchema.safeParse({ effectiveTo: "" });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.effectiveTo, undefined);
    }
  });

  it("accepts no input at all", () => {
    const parsed = employeePayrollComponentEndSchema.safeParse({});
    assert.equal(parsed.success, true);
  });

  it("rejects a malformed end date", () => {
    const parsed = employeePayrollComponentEndSchema.safeParse({
      effectiveTo: "jan 2027",
    });
    assert.equal(parsed.success, false);
  });
});

function parsedErrorMessage(result: { success: false; error: { issues: { message: string }[] } }): string {
  return result.error.issues[0]?.message ?? "Invalid input.";
}