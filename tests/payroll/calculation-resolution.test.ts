/**
 * PM-03.4 — Payroll calculation resolution tests (Node `node:test`).
 *
 * These exercise the PURE resolution engine in features/payroll/calculation.ts:
 * fixed/percentage/manual resolution against employee-specific payroll
 * component assignments, the effective-date window, cross-employee isolation,
 * snapshot independence, and the master-component regression contract.
 * No DB, no browser, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  calculateEmployeePayroll,
  isComponentAssignmentEffective,
  type CalculationComponent,
  type EmployeeComponentAssignment,
} from "../../features/payroll/calculation.ts";

const EMP_A = "11111111-1111-4111-8111-111111111111";
const EMP_B = "22222222-2222-4222-8222-222222222222";

const BASIC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TRANSPORT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BPJS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OVERTIME = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LOAN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHERS = "ffffffff-ffff-4fff-8fff-ffffffffffff";

/** The September 2026 payroll period is calculated for its period end. */
const CALC_DATE = new Date("2026-09-30T00:00:00.000Z");

const date = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

const fixed = (
  id: string,
  code: string,
  name: string,
  type: CalculationComponent["type"],
  defaultAmount: number
): CalculationComponent => ({
  id,
  code,
  name,
  type,
  calculationMethod: "fixed",
  defaultAmount,
});

const percentage = (
  id: string,
  code: string,
  name: string,
  type: CalculationComponent["type"],
  defaultAmount: number
): CalculationComponent => ({
  id,
  code,
  name,
  type,
  calculationMethod: "percentage",
  defaultAmount,
});

const manual = (
  id: string,
  code: string,
  name: string,
  type: CalculationComponent["type"]
): CalculationComponent => ({
  id,
  code,
  name,
  type,
  calculationMethod: "manual",
  defaultAmount: 0,
});

/** The master component set used across most tests. */
const masterComponents: CalculationComponent[] = [
  fixed(BASIC, "basic_salary", "Basic Salary", "earning", 5_000_000),
  fixed(TRANSPORT, "transport", "Transport", "earning", 1_000_000),
  percentage(BPJS, "bpjs", "BPJS", "deduction", 4),
  manual(OVERTIME, "overtime", "Overtime", "earning"),
  fixed(LOAN, "loan", "Loan", "deduction", 500_000),
  manual(OTHERS, "others", "Others", "deduction"),
];

const assignment = (
  overrides: Partial<EmployeeComponentAssignment> & {
    employeeId: string;
    componentId: string;
  }
): EmployeeComponentAssignment => ({
  id: overrides.id ?? "assign-default",
  amount: 0,
  effectiveFrom: date("2026-01-01"),
  effectiveTo: null,
  active: true,
  ...overrides,
});

/** Full-resolution test runner against the default master set. */
function resolve(
  assignments: readonly EmployeeComponentAssignment[],
  employeeId: string = EMP_A,
  calculationDate: Date = CALC_DATE
) {
  return calculateEmployeePayroll({
    employeeId,
    calculationDate,
    components: masterComponents,
    assignments,
  });
}

function componentAmount(
  result: ReturnType<typeof calculateEmployeePayroll>,
  componentId: string
): number {
  return result.components.find((c) => c.componentId === componentId)?.amount ?? NaN;
}

describe("fixed component resolution", () => {
  it("uses the effective employee amount when an override exists", () => {
    const result = resolve([
      assignment({
        id: "assign-basic",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
      }),
    ]);

    assert.equal(componentAmount(result, BASIC), 6_000_000);
    assert.equal(result.totalEarnings, 7_000_000);
  });

  it("falls back to the master defaultAmount without an employee override", () => {
    const result = resolve([]);

    assert.equal(componentAmount(result, BASIC), 5_000_000);
    assert.equal(componentAmount(result, TRANSPORT), 1_000_000);
    assert.equal(result.totalEarnings, 6_000_000);
    assert.equal(result.totalDeductions, 500_000 + 240_000);
  });

  it("does not let an inactive assignment row feed its amount into fixed", () => {
    const result = resolve([
      assignment({
        id: "assign-inactive",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 9_000_000,
        active: false,
      }),
    ]);

    assert.equal(componentAmount(result, BASIC), 5_000_000);
  });
});

describe("percentage component resolution", () => {
  it("uses the employee percentage override", () => {
    const result = resolve([
      assignment({
        id: "assign-bpjs",
        employeeId: EMP_A,
        componentId: BPJS,
        amount: 5,
      }),
    ]);

    assert.equal(componentAmount(result, BPJS), 300_000);
  });

  it("falls back to the master percentage without an employee override", () => {
    const result = resolve([]);

    assert.equal(componentAmount(result, BPJS), 240_000);
  });

  it("bases the percentage on the employee's own resolved fixed earnings", () => {
    // Basic raised to 6,000,000 + Transport 1,000,000 => base 7,000,000.
    const result = resolve([
      assignment({
        id: "assign-basic",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
      }),
    ]);

    assert.equal(componentAmount(result, BASIC), 6_000_000);
    assert.equal(componentAmount(result, BPJS), 280_000);
  });

  it("keeps manual earnings out of the fixed earnings base", () => {
    const result = resolve([
      assignment({
        id: "assign-overtime",
        employeeId: EMP_A,
        componentId: OVERTIME,
        amount: 500_000,
      }),
    ]);

    // Overtime (manual earning) = 500k, but the percentage base stays 6,000,000.
    assert.equal(componentAmount(result, OVERTIME), 500_000);
    assert.equal(componentAmount(result, BPJS), 240_000);
  });

  it("keeps fixed deduction amounts out of the percentage base", () => {
    const result = resolve([
      assignment({
        id: "assign-loan",
        employeeId: EMP_A,
        componentId: LOAN,
        amount: 800_000,
      }),
    ]);

    assert.equal(componentAmount(result, LOAN), 800_000);
    assert.equal(componentAmount(result, BPJS), 240_000);
  });
});

describe("manual component resolution", () => {
  it("uses the employee configured amount", () => {
    const result = resolve([
      assignment({
        id: "assign-overtime",
        employeeId: EMP_A,
        componentId: OVERTIME,
        amount: 500_000,
      }),
    ]);

    assert.equal(componentAmount(result, OVERTIME), 500_000);
    assert.equal(componentAmount(result, OTHERS), 0);
  });

  it("resolves manual components to 0 when no employee config is effective", () => {
    const result = resolve([]);

    assert.equal(componentAmount(result, OVERTIME), 0);
    assert.equal(componentAmount(result, OTHERS), 0);
  });
});

describe("effective-date window", () => {
  it("is effective when effectiveFrom equals the calculation date", () => {
    const result = resolve([
      assignment({
        id: "assign-basic",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_500_000,
        effectiveFrom: CALC_DATE,
      }),
    ]);

    assert.equal(componentAmount(result, BASIC), 6_500_000);
  });

  it("is not effective when effectiveFrom is after the calculation date (future)", () => {
    const result = resolve([
      assignment({
        id: "assign-future",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 7_000_000,
        effectiveFrom: date("2026-10-01"),
      }),
    ]);

    assert.equal(componentAmount(result, BASIC), 5_000_000);
  });

  it("is effective strictly before effectiveTo (boundary day excluded)", () => {
    const result = resolve([
      assignment({
        id: "assign-basic",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
        effectiveFrom: date("2026-09-01"),
        effectiveTo: date("2026-10-01"),
      }),
    ]);

    assert.equal(componentAmount(result, BASIC), 6_000_000);
  });

  it("is not effective on the effectiveTo day", () => {
    const result = resolve([
      assignment({
        id: "assign-ending",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
        effectiveFrom: date("2026-09-01"),
        effectiveTo: CALC_DATE,
      }),
    ]);

    assert.equal(componentAmount(result, BASIC), 5_000_000);
  });

  it("is not effective after the window ends (expired)", () => {
    const result = resolve([
      assignment({
        id: "assign-expired",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
        effectiveFrom: date("2026-01-01"),
        effectiveTo: date("2026-08-31"),
      }),
    ]);

    assert.equal(componentAmount(result, BASIC), 5_000_000);
  });

  it("is not effective when the assignment is inactive even inside the window", () => {
    const result = resolve([
      assignment({
        id: "assign-inactive-window",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 8_000_000,
        effectiveFrom: date("2026-01-01"),
        active: false,
      }),
    ]);

    assert.equal(componentAmount(result, BASIC), 5_000_000);
  });

  it("isComponentAssignmentEffective encodes the whole window contract", () => {
    const windowed = assignment({
      employeeId: EMP_A,
      componentId: BASIC,
      amount: 1,
      effectiveFrom: date("2026-09-01"),
      effectiveTo: date("2026-10-31"),
    });

    assert.equal(isComponentAssignmentEffective(windowed, date("2026-08-31")), false);
    assert.equal(isComponentAssignmentEffective(windowed, date("2026-09-01")), true);
    assert.equal(isComponentAssignmentEffective(windowed, date("2026-10-30")), true);
    assert.equal(isComponentAssignmentEffective(windowed, date("2026-10-31")), false);
    assert.equal(isComponentAssignmentEffective(windowed, date("2027-01-01")), false);

    const inactive = { ...windowed, active: false };
    assert.equal(isComponentAssignmentEffective(inactive, date("2026-09-15")), false);

    const openEnded = { ...windowed, effectiveTo: null };
    assert.equal(isComponentAssignmentEffective(openEnded, date("2030-12-31")), true);
  });
});

describe("multiple employees", () => {
  it("employee A's override never affects employee B", () => {
    const assignments = [
      assignment({
        id: "assign-a-basic",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
      }),
    ];

    const resultA = resolve(assignments, EMP_A);
    const resultB = resolve(assignments, EMP_B);

    assert.equal(componentAmount(resultA, BASIC), 6_000_000);
    assert.equal(componentAmount(resultB, BASIC), 5_000_000);

    const a = resultA.components.find((c) => c.componentId === BPJS);
    const b = resultB.components.find((c) => c.componentId === BPJS);
    assert.equal(a?.amount, 280_000); // base 7,000,000 for A
    assert.equal(b?.amount, 240_000); // base 6,000,000 for B
  });

  it("employee B's override never affects employee A", () => {
    const assignments = [
      assignment({
        id: "assign-b-bpjs",
        employeeId: EMP_B,
        componentId: BPJS,
        amount: 10,
      }),
    ];

    const resultA = resolve(assignments, EMP_A);
    const resultB = resolve(assignments, EMP_B);

    assert.equal(componentAmount(resultA, BPJS), 240_000);
    assert.equal(componentAmount(resultB, BPJS), 600_000);
  });
});

describe("multiple components", () => {
  it("each employee/component resolves independently", () => {
    const assignments = [
      // Employee A: higher Basic + BPJS 5%.
      assignment({
        id: "assign-a-basic",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
      }),
      assignment({
        id: "assign-a-bpjs",
        employeeId: EMP_A,
        componentId: BPJS,
        amount: 5,
      }),
      assignment({
        id: "assign-a-overtime",
        employeeId: EMP_A,
        componentId: OVERTIME,
        amount: 250_000,
      }),
      // Employee B: only a manual overtime allowance.
      assignment({
        id: "assign-b-overtime",
        employeeId: EMP_B,
        componentId: OVERTIME,
        amount: 100_000,
      }),
    ];

    const resultA = resolve(assignments, EMP_A);
    const resultB = resolve(assignments, EMP_B);

    assert.equal(componentAmount(resultA, BASIC), 6_000_000);
    assert.equal(componentAmount(resultA, BPJS), 350_000); // 5% x 7,000,000
    assert.equal(componentAmount(resultA, OVERTIME), 250_000);
    assert.equal(resultA.totalEarnings, 7_250_000);

    assert.equal(componentAmount(resultB, BASIC), 5_000_000);
    assert.equal(componentAmount(resultB, BPJS), 240_000); // master 4% x 6,000,000
    assert.equal(componentAmount(resultB, OVERTIME), 100_000);
    assert.equal(resultB.totalEarnings, 6_100_000);
  });
});

describe("historical snapshot independence", () => {
  it("mutating assignments and masters after calculation does not alter the result", () => {
    const assignments = [
      assignment({
        id: "assign-basic",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
        effectiveFrom: date("2026-09-01"),
      }),
    ];
    // Local copy so later "configuration edits" never leak into other tests.
    const components = masterComponents.map((c) => ({ ...c }));

    const result = calculateEmployeePayroll({
      employeeId: EMP_A,
      calculationDate: CALC_DATE,
      components,
      assignments,
    });
    const basicSnapshot = result.components.find((c) => c.componentId === BASIC);
    const bpjsSnapshot = result.components.find((c) => c.componentId === BPJS);
    assert.equal(basicSnapshot?.amount, 6_000_000);
    assert.equal(bpjsSnapshot?.amount, 280_000);
    assert.equal(result.totalDeductions, 500_000 + 280_000);
    assert.equal(result.netAmount, 7_000_000 - 780_000);

    // Simulate later configuration edits (a fresh recalculation).
    assignments[0].amount = 99_000_000;
    components.find((c) => c.id === BPJS)!.defaultAmount = 90;

    const resultAfter = calculateEmployeePayroll({
      employeeId: EMP_A,
      calculationDate: CALC_DATE,
      components,
      assignments,
    });
    assert.equal(resultAfter.components.find((c) => c.componentId === BASIC)?.amount, 99_000_000);
    assert.equal(resultAfter.components.find((c) => c.componentId === BPJS)?.amount, 90_000_000);

    // The previously materialized snapshot is untouched by recalculation.
    assert.equal(basicSnapshot?.amount, 6_000_000);
    assert.equal(bpjsSnapshot?.amount, 280_000);

    // A later deactivation never feeds its amount into a recalculation.
    assignments[0].active = false;
    const afterDeactivate = calculateEmployeePayroll({
      employeeId: EMP_A,
      calculationDate: CALC_DATE,
      components,
      assignments,
    });
    assert.equal(afterDeactivate.components.find((c) => c.componentId === BASIC)?.amount, 5_000_000);
    assert.equal(basicSnapshot?.amount, 6_000_000);
    assert.equal(bpjsSnapshot?.amount, 280_000);
  });
});

describe("master-only regression", () => {
  it("employees without assignments keep the existing master behavior", () => {
    const result = resolve([]);

    assert.equal(componentAmount(result, BASIC), 5_000_000);
    assert.equal(componentAmount(result, TRANSPORT), 1_000_000);
    assert.equal(componentAmount(result, BPJS), 240_000);
    assert.equal(componentAmount(result, OVERTIME), 0);
    assert.equal(componentAmount(result, LOAN), 500_000);

    assert.equal(result.totalEarnings, 6_000_000);
    assert.equal(result.totalDeductions, 740_000);
    assert.equal(result.netAmount, 5_260_000);
  });

  it("deduplicates — an inactive assignment and an active one resolve deterministically", () => {
    // Historical inactive row (amount must be ignored) + active effective row.
    const assignments = [
      assignment({
        id: "assign-history",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 1_000_000,
        effectiveFrom: date("2025-01-01"),
        effectiveTo: date("2025-12-31"),
        active: false,
      }),
      assignment({
        id: "assign-current",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_500_000,
        effectiveFrom: date("2026-01-01"),
      }),
    ];

    const result = resolve(assignments, EMP_A);
    assert.equal(componentAmount(result, BASIC), 6_500_000);
    assert.equal(componentAmount(result, BPJS), 300_000); // 4% x 7,500,000
  });
});

describe("recalculation semantics", () => {
  it("re-running with unchanged inputs reproduces an identical result", () => {
    const assignments = [
      assignment({
        id: "assign-basic",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
      }),
      assignment({
        id: "assign-bpjs",
        employeeId: EMP_A,
        componentId: BPJS,
        amount: 5,
      }),
    ];

    // A draft/rejected run recalculated without a config change must be
    // byte-for-byte identical (deterministic, no ordering side-effects).
    const first = resolve(assignments, EMP_A);
    const second = resolve(assignments, EMP_A);

    assert.deepEqual(second, first);
    assert.equal(second.netAmount, first.netAmount);
    assert.equal(second.components.length, first.components.length);
    assert.equal(second.components[0].amount, first.components[0].amount);
  });

  it("recalculation reflects current config only through a fresh snapshot", () => {
    const assignments = [
      assignment({
        id: "assign-basic",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
        effectiveFrom: date("2026-01-01"),
      }),
    ];
    const components = masterComponents.map((c) => ({ ...c }));

    const initial = calculateEmployeePayroll({
      employeeId: EMP_A,
      calculationDate: CALC_DATE,
      components,
      assignments,
    });
    const captured = initial.components.find((c) => c.componentId === BASIC);
    assert.equal(captured?.amount, 6_000_000);

    // The effective window is later shortened so the assignment no longer
    // covers the calculation date; a recalculated run then uses the default.
    assignments[0].effectiveTo = date("2026-09-15");
    const recalculated = calculateEmployeePayroll({
      employeeId: EMP_A,
      calculationDate: CALC_DATE,
      components,
      assignments,
    });

    assert.equal(recalculated.components.find((c) => c.componentId === BASIC)?.amount, 5_000_000);
    // The earlier materialized item snapshot stays immutable.
    assert.equal(captured?.amount, 6_000_000);
  });

  it("does not mutate the passed-in master or assignment rows", () => {
    const assignments = [
      assignment({
        id: "assign-basic",
        employeeId: EMP_A,
        componentId: BASIC,
        amount: 6_000_000,
        effectiveFrom: date("2026-01-01"),
      }),
    ];
    const components = masterComponents.map((c) => ({ ...c }));

    const assignmentsBefore = structuredClone(assignments);
    const componentsBefore = structuredClone(components);

    calculateEmployeePayroll({
      employeeId: EMP_A,
      calculationDate: CALC_DATE,
      components,
      assignments,
    });

    assert.deepEqual(assignments, assignmentsBefore);
    assert.deepEqual(components, componentsBefore);
  });
});