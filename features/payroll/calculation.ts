/**
 * PM-03.4 — Payroll calculation engine — PURE, deterministic, testable.
 *
 * No DB, no organization, no auth in this module. Callers (server actions)
 * pass organization-scoped, ACTIVE master component rows and the employee's
 * own payroll component assignments; this module only resolves values.
 *
 * Resolution rules (PM-03.4):
 * - An employee assignment is effective for a `calculationDate` when:
 *     active
 *     && effectiveFrom <= calculationDate
 *     && (effectiveTo IS NULL || calculationDate < effectiveTo)
 *   All dates are UTC-midnight values (see `dateToUtc` in ./schemas), the
 *   same boundary convention used by the PM-03 schema/guards. Inactive, future
 *   and ended assignments are never effective.
 * - fixed:      effective employee amount, otherwise the master defaultAmount.
 * - percentage: effective employee percentage, otherwise master defaultAmount.
 *               Always computed against the employee's OWN resolved fixed
 *               earnings total (never another employee, never org totals, and
 *               deduction amounts are not part of the base). Percentages stay
 *               0-100, enforced upstream by `payrollComponentSchema` and the
 *               employee component guards.
 * - manual:     effective employee amount, otherwise 0.
 * - Only ACTIVE master components participate (callers filter them); inactive
 *   masters never enter new calculations.
 *
 * The result is a materialized snapshot: every resolved value is copied into
 * fresh `ResolvedPayrollComponent` objects, so later edits to the passed-in
 * master/assignment rows can never mutate an already-computed result.
 */
import { applyPercentage } from "./money.ts";

export type CalculationComponentType = "earning" | "deduction";
export type CalculationComponentMethod = "fixed" | "percentage" | "manual";

/** An ACTIVE master payroll component (the amount is the master default). */
export interface CalculationComponent {
  id: string;
  code: string;
  name: string;
  type: CalculationComponentType;
  calculationMethod: CalculationComponentMethod;
  defaultAmount: number;
}

/** One employee payroll component assignment row (org-scoped, pre-loaded). */
export interface EmployeeComponentAssignment {
  id: string;
  employeeId: string;
  componentId: string;
  amount: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  active: boolean;
}

/** A resolved component value, snapshotted for `payroll_item_components`. */
export interface ResolvedPayrollComponent {
  componentId: string;
  componentCode: string;
  componentName: string;
  componentType: CalculationComponentType;
  amount: number;
}

export interface EmployeePayrollResult {
  employeeId: string;
  totalEarnings: number;
  totalDeductions: number;
  netAmount: number;
  components: ResolvedPayrollComponent[];
}

export interface CalculateEmployeePayrollInput {
  employeeId: string;
  /** The date the payroll period is calculated for (period end, UTC-midnight). */
  calculationDate: Date;
  /** ACTIVE master components for the organization. */
  components: readonly CalculationComponent[];
  /** The employee's own component assignments (may include history). */
  assignments: readonly EmployeeComponentAssignment[];
}

/**
 * Whether an assignment is effective on `calculationDate`.
 *
 * Inactive rows are never effective. `effectiveFrom` is inclusive,
 * `effectiveTo` is exclusive (the day the window ends does not count).
 */
export function isComponentAssignmentEffective(
  assignment: Pick<EmployeeComponentAssignment, "active" | "effectiveFrom" | "effectiveTo">,
  calculationDate: Date
): boolean {
  if (!assignment.active) return false;
  const calcTime = calculationDate.getTime();
  if (assignment.effectiveFrom.getTime() > calcTime) return false;
  if (assignment.effectiveTo && calcTime >= assignment.effectiveTo.getTime()) {
    return false;
  }
  return true;
}

/**
 * Resolve every component for one employee and aggregate the item snapshot.
 *
 * Ordering is safe by construction: fixed amounts resolve first, the owner's
 * own fixed earning total becomes the percentage base, then percentages and
 * manual components resolve, then earnings/deductions are split by type and
 * the net is clamped to a non-negative value (matching historical behavior).
 */
export function calculateEmployeePayroll(
  input: CalculateEmployeePayrollInput
): EmployeePayrollResult {
  // Map effective assignments by component. At most one ACTIVE assignment can
  // exist per (employee, component) via the partial unique index, so the
  // effective set per component is at most one row; keep the first for
  // determinism as a defensive fallback.
  const effectiveByComponentId = new Map<string, EmployeeComponentAssignment>();
  for (const assignment of input.assignments) {
    if (assignment.employeeId !== input.employeeId) continue;
    if (!isComponentAssignmentEffective(assignment, input.calculationDate)) {
      continue;
    }
    if (!effectiveByComponentId.has(assignment.componentId)) {
      effectiveByComponentId.set(assignment.componentId, assignment);
    }
  }

  // Pass 1 — resolve fixed amounts first.
  const fixedAmountByComponentId = new Map<string, number>();
  for (const component of input.components) {
    if (component.calculationMethod !== "fixed") continue;
    const assignment = effectiveByComponentId.get(component.id);
    fixedAmountByComponentId.set(
      component.id,
      assignment ? assignment.amount : component.defaultAmount
    );
  }

  // Fixed earnings base = this employee's own resolved fixed EARNING amounts.
  let fixedEarningsBase = 0;
  for (const component of input.components) {
    if (component.calculationMethod === "fixed" && component.type === "earning") {
      fixedEarningsBase +=
        fixedAmountByComponentId.get(component.id) ?? component.defaultAmount;
    }
  }

  // Pass 2/3 — resolve percentages against the base, manuals, and aggregate.
  let totalEarnings = 0;
  let totalDeductions = 0;
  const components: ResolvedPayrollComponent[] = input.components.map(
    (component) => {
      let amount: number;
      if (component.calculationMethod === "fixed") {
        amount = fixedAmountByComponentId.get(component.id) ?? component.defaultAmount;
      } else {
        const assignment = effectiveByComponentId.get(component.id);
        if (component.calculationMethod === "percentage") {
          const percent = assignment ? assignment.amount : component.defaultAmount;
          amount = applyPercentage(fixedEarningsBase, percent);
        } else {
          // manual — employee amount only when effective, otherwise 0.
          amount = assignment ? assignment.amount : 0;
        }
      }

      if (component.type === "earning") totalEarnings += amount;
      else totalDeductions += amount;

      return {
        componentId: component.id,
        componentCode: component.code,
        componentName: component.name,
        componentType: component.type,
        amount,
      };
    }
  );

  return {
    employeeId: input.employeeId,
    totalEarnings,
    totalDeductions,
    netAmount: Math.max(0, totalEarnings - totalDeductions),
    components,
  };
}