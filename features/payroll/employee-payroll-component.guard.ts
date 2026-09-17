/**
 * PM-03.2 — Employee payroll component mutation rules — PURE decision functions.
 *
 * These encode the security/business invariants of create/update/end employee
 * payroll component assignments so the server actions stay thin and the rules
 * become unit-testable with the same `node:test` foundation as the assignment
 * guards. No DB access here: callers (server actions) pass org-scoped rows
 * that they fetched from the database.
 *
 * Every rule mirrors the PM-03 integrity contracts in db/schema/payroll.ts and
 * the existing assignment conventions:
 * - A record that does not belong to the actor's organization is reported as
 *   generic "not found" so cross-organization existence is never revealed.
 * - Only ACTIVE employees and ACTIVE payroll components may be linked.
 * - The partial unique index `(organization, employee, component) WHERE
 *   active = true` enforces at most one active assignment; we pre-check it to
 *   return a deterministic error instead of a raw unique violation.
 * - `percentage` components only accept an employee-level amount of 0–100.
 * - `effective_to`, when set, must be strictly after `effective_from`.
 */

export type EmployeePayrollComponentGuardDecision =
  | { ok: true }
  | { ok: false; message: string };

export interface CreateEmployeePayrollComponentGuardContext {
  /** Authenticated user's organization (from session — never the client). */
  actorOrganizationId: string;
  employee: {
    id: string;
    organizationId: string;
    employmentStatus: string;
  } | null;
  component: {
    id: string;
    organizationId: string;
    /** "true" | "false" — the master table stores active as text. */
    active: string;
    calculationMethod: string;
  } | null;
  /** True when (employee, component) already has an ACTIVE assignment. */
  existingActiveAssignment: boolean;
  amount: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export function evaluateCreateEmployeePayrollComponentGuard(
  context: CreateEmployeePayrollComponentGuardContext
): EmployeePayrollComponentGuardDecision {
  const { employee, component } = context;

  if (!employee || employee.organizationId !== context.actorOrganizationId) {
    return { ok: false, message: "Employee not found." };
  }
  if (employee.employmentStatus !== "active") {
    return {
      ok: false,
      message: "Inactive employees cannot be assigned payroll components.",
    };
  }

  if (!component || component.organizationId !== context.actorOrganizationId) {
    return { ok: false, message: "Payroll component not found." };
  }
  if (component.active !== "true") {
    return {
      ok: false,
      message: "Only active payroll components can be assigned.",
    };
  }

  if (context.existingActiveAssignment) {
    return {
      ok: false,
      message:
        "This employee already has an active assignment for this payroll component.",
    };
  }

  if (component.calculationMethod === "percentage" && context.amount > 100) {
    return { ok: false, message: "Percentage must be between 0 and 100." };
  }

  if (
    context.effectiveTo &&
    context.effectiveTo.getTime() <= context.effectiveFrom.getTime()
  ) {
    return { ok: false, message: "Effective to must be after effective from." };
  }

  return { ok: true };
}

export interface UpdateEmployeePayrollComponentGuardContext {
  actorOrganizationId: string;
  assignment: {
    id: string;
    organizationId: string;
    employeeId: string;
    active: boolean;
    calculationMethod: string;
  } | null;
  amount: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export function evaluateUpdateEmployeePayrollComponentGuard(
  context: UpdateEmployeePayrollComponentGuardContext
): EmployeePayrollComponentGuardDecision {
  const { assignment } = context;

  if (
    !assignment ||
    assignment.organizationId !== context.actorOrganizationId
  ) {
    return { ok: false, message: "Payroll component assignment not found." };
  }
  if (!assignment.active) {
    return { ok: false, message: "This assignment is already ended." };
  }

  if (assignment.calculationMethod === "percentage" && context.amount > 100) {
    return { ok: false, message: "Percentage must be between 0 and 100." };
  }

  if (
    context.effectiveTo &&
    context.effectiveTo.getTime() <= context.effectiveFrom.getTime()
  ) {
    return { ok: false, message: "Effective to must be after effective from." };
  }

  return { ok: true };
}

export interface EndEmployeePayrollComponentGuardContext {
  actorOrganizationId: string;
  assignment: {
    id: string;
    organizationId: string;
    employeeId: string;
    active: boolean;
    effectiveFrom: Date;
  } | null;
  /** Resolved end date (defaults to today in the server action). */
  effectiveTo: Date;
}

export function evaluateEndEmployeePayrollComponentGuard(
  context: EndEmployeePayrollComponentGuardContext
): EmployeePayrollComponentGuardDecision {
  const { assignment } = context;

  if (
    !assignment ||
    assignment.organizationId !== context.actorOrganizationId
  ) {
    return { ok: false, message: "Payroll component assignment not found." };
  }
  if (!assignment.active) {
    return { ok: false, message: "This assignment is already ended." };
  }
  if (context.effectiveTo.getTime() <= assignment.effectiveFrom.getTime()) {
    return { ok: false, message: "Effective to must be after effective from." };
  }

  return { ok: true };
}