/**
 * PM-03.2 — Employee payroll component guard tests (Node `node:test`).
 *
 * These exercise the PURE decision functions used by the employee payroll
 * component server actions. No DB, no browser, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCreateEmployeePayrollComponentGuard,
  evaluateUpdateEmployeePayrollComponentGuard,
  evaluateEndEmployeePayrollComponentGuard,
} from "../../features/payroll/employee-payroll-component.guard.ts";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";
const COMPONENT_A = "33333333-3333-4333-8333-333333333333";
const ASSIGNMENT_A = "55555555-5555-4555-8555-555555555555";

const date = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

describe("evaluateCreateEmployeePayrollComponentGuard", () => {
  const validBase = {
    actorOrganizationId: ORG_A,
    employee: {
      id: EMPLOYEE_A,
      organizationId: ORG_A,
      employmentStatus: "active",
    },
    component: {
      id: COMPONENT_A,
      organizationId: ORG_A,
      active: "true",
      calculationMethod: "fixed",
    },
    existingActiveAssignment: false,
    amount: 5_000_000,
    effectiveFrom: date("2026-09-01"),
    effectiveTo: null,
  };

  it("authorizes a valid active employee + active component", () => {
    assert.deepEqual(evaluateCreateEmployeePayrollComponentGuard(validBase), {
      ok: true,
    });
  });

  it("rejects when the employee does not exist", () => {
    const decision = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      employee: null,
    });
    assert.deepEqual(decision, { ok: false, message: "Employee not found." });
  });

  it("rejects an employee from another organization (generic not found)", () => {
    const decision = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      employee: {
        id: EMPLOYEE_A,
        organizationId: ORG_B,
        employmentStatus: "active",
      },
    });
    assert.deepEqual(decision, { ok: false, message: "Employee not found." });
  });

  it("rejects an inactive employee", () => {
    const decision = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      employee: {
        id: EMPLOYEE_A,
        organizationId: ORG_A,
        employmentStatus: "inactive",
      },
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /Inactive employees/i);
    }
  });

  it("rejects when the component does not exist", () => {
    const decision = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      component: null,
    });
    assert.deepEqual(decision, {
      ok: false,
      message: "Payroll component not found.",
    });
  });

  it("rejects a component from another organization (generic not found)", () => {
    const decision = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      component: {
        id: COMPONENT_A,
        organizationId: ORG_B,
        active: "true",
        calculationMethod: "fixed",
      },
    });
    assert.deepEqual(decision, {
      ok: false,
      message: "Payroll component not found.",
    });
  });

  it("rejects an inactive component", () => {
    const decision = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      component: {
        id: COMPONENT_A,
        organizationId: ORG_A,
        active: "false",
        calculationMethod: "fixed",
      },
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /Only active payroll components/i);
    }
  });

  it("rejects a duplicate ACTIVE assignment for the same component", () => {
    const decision = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      existingActiveAssignment: true,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /already has an active assignment/i);
    }
  });

  it("rejects a percentage amount above 100", () => {
    const decision = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      component: {
        id: COMPONENT_A,
        organizationId: ORG_A,
        active: "true",
        calculationMethod: "percentage",
      },
      amount: 101,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.message, "Percentage must be between 0 and 100.");
    }
  });

  it("accepts a percentage amount up to 100", () => {
    const decision = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      component: {
        id: COMPONENT_A,
        organizationId: ORG_A,
        active: "true",
        calculationMethod: "percentage",
      },
      amount: 100,
    });
    assert.deepEqual(decision, { ok: true });
  });

  it("rejects effectiveTo on or before effectiveFrom", () => {
    const sameDay = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      effectiveTo: date("2026-09-01"),
    });
    assert.equal(sameDay.ok, false);

    const earlier = evaluateCreateEmployeePayrollComponentGuard({
      ...validBase,
      effectiveTo: date("2026-08-31"),
    });
    assert.equal(earlier.ok, false);
    if (!earlier.ok) {
      assert.equal(earlier.message, "Effective to must be after effective from.");
    }
  });

  it("is deterministic", () => {
    assert.deepEqual(
      evaluateCreateEmployeePayrollComponentGuard(validBase),
      evaluateCreateEmployeePayrollComponentGuard(validBase)
    );
  });
});

describe("evaluateUpdateEmployeePayrollComponentGuard", () => {
  const validBase = {
    actorOrganizationId: ORG_A,
    assignment: {
      id: ASSIGNMENT_A,
      organizationId: ORG_A,
      employeeId: EMPLOYEE_A,
      active: true,
      calculationMethod: "fixed",
    },
    amount: 5_000_000,
    effectiveFrom: date("2026-09-01"),
    effectiveTo: null,
  };

  it("authorizes updating an active assignment", () => {
    assert.deepEqual(evaluateUpdateEmployeePayrollComponentGuard(validBase), {
      ok: true,
    });
  });

  it("rejects when the assignment does not exist", () => {
    const decision = evaluateUpdateEmployeePayrollComponentGuard({
      ...validBase,
      assignment: null,
    });
    assert.deepEqual(decision, {
      ok: false,
      message: "Payroll component assignment not found.",
    });
  });

  it("rejects a cross-organization assignment (generic not found)", () => {
    const decision = evaluateUpdateEmployeePayrollComponentGuard({
      ...validBase,
      assignment: { ...validBase.assignment, organizationId: ORG_B },
    });
    assert.deepEqual(decision, {
      ok: false,
      message: "Payroll component assignment not found.",
    });
  });

  it("rejects an already-ended assignment", () => {
    const decision = evaluateUpdateEmployeePayrollComponentGuard({
      ...validBase,
      assignment: { ...validBase.assignment, active: false },
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /already ended/i);
    }
  });

  it("rejects a percentage amount above 100", () => {
    const decision = evaluateUpdateEmployeePayrollComponentGuard({
      ...validBase,
      assignment: { ...validBase.assignment, calculationMethod: "percentage" },
      amount: 150,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.message, "Percentage must be between 0 and 100.");
    }
  });

  it("rejects effectiveTo before effectiveFrom", () => {
    const decision = evaluateUpdateEmployeePayrollComponentGuard({
      ...validBase,
      effectiveTo: date("2026-08-31"),
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.message, "Effective to must be after effective from.");
    }
  });
});

describe("evaluateEndEmployeePayrollComponentGuard", () => {
  const validBase = {
    actorOrganizationId: ORG_A,
    assignment: {
      id: ASSIGNMENT_A,
      organizationId: ORG_A,
      employeeId: EMPLOYEE_A,
      active: true,
      effectiveFrom: date("2026-09-01"),
    },
    effectiveTo: date("2027-01-31"),
  };

  it("authorizes ending an active assignment", () => {
    assert.deepEqual(evaluateEndEmployeePayrollComponentGuard(validBase), {
      ok: true,
    });
  });

  it("rejects when the assignment does not exist", () => {
    const decision = evaluateEndEmployeePayrollComponentGuard({
      ...validBase,
      assignment: null,
    });
    assert.deepEqual(decision, {
      ok: false,
      message: "Payroll component assignment not found.",
    });
  });

  it("rejects a cross-organization assignment (generic not found)", () => {
    const decision = evaluateEndEmployeePayrollComponentGuard({
      ...validBase,
      assignment: { ...validBase.assignment, organizationId: ORG_B },
    });
    assert.deepEqual(decision, {
      ok: false,
      message: "Payroll component assignment not found.",
    });
  });

  it("rejects an already-ended assignment", () => {
    const decision = evaluateEndEmployeePayrollComponentGuard({
      ...validBase,
      assignment: { ...validBase.assignment, active: false },
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /already ended/i);
    }
  });

  it("rejects an end date on or before effectiveFrom", () => {
    const sameDay = evaluateEndEmployeePayrollComponentGuard({
      ...validBase,
      effectiveTo: date("2026-09-01"),
    });
    assert.equal(sameDay.ok, false);

    const earlier = evaluateEndEmployeePayrollComponentGuard({
      ...validBase,
      effectiveTo: date("2026-08-31"),
    });
    assert.equal(earlier.ok, false);
    if (!earlier.ok) {
      assert.equal(earlier.message, "Effective to must be after effective from.");
    }
  });
});