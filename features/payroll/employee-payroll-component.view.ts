/**
 * PM-03.3 — Pure UI-view helpers for the employee payroll component manager.
 *
 * No server imports and no React: the manager component renders with these
 * helpers so the RBAC mode, client-side amount guidance and the exact
 * client → server payload shape are unit-testable with `node:test`.
 *
 * Security notes:
 * - The client forms never include `organizationId`, `active` or server-only
 *   identifiers; the build* helpers only forward the whitelisted fields the
 *   server actions accept. The server remains the enforcement boundary.
 * - The amount check below is UX only. The server guard never trusts it and
 *   re-validates against the component's real calculation method.
 */

export type EmployeePayrollComponentManagerMode =
  | "hidden"
  | "readonly"
  | "manage";

/**
 * RBAC mode for the manager (mirrors the page's gating):
 * - `hidden`   → no payroll view permission at all (`PAYROLL_VIEW` +
 *   `PAYROLL_MANAGE` both absent).
 * - `readonly` → can view but does NOT have `PAYROLL_MANAGE`.
 * - `manage`   → has `PAYROLL_MANAGE` (create / update / end enabled).
 */
export function resolveEmployeePayrollComponentManagerMode(
  canView: boolean,
  canManage: boolean
): EmployeePayrollComponentManagerMode {
  if (!canView) return "hidden";
  return canManage ? "manage" : "readonly";
}

/** Client create payload — only fields the server action accepts. */
export interface EmployeePayrollComponentCreateClientInput {
  employeeId: string;
  componentId: string;
  amount: number;
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
}

export function buildEmployeePayrollComponentCreateInput(values: {
  employeeId: string;
  componentId: string;
  amount: number;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
}): EmployeePayrollComponentCreateClientInput {
  return {
    employeeId: values.employeeId,
    componentId: values.componentId,
    amount: values.amount,
    effectiveFrom: values.effectiveFrom,
    ...(values.effectiveTo ? { effectiveTo: values.effectiveTo } : {}),
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
  };
}

/** Client update payload — replace semantics. Empty `effectiveTo` clears it. */
export interface EmployeePayrollComponentUpdateClientInput {
  amount: number;
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
}

export function buildEmployeePayrollComponentUpdateInput(values: {
  amount: number;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
}): EmployeePayrollComponentUpdateClientInput {
  return {
    amount: values.amount,
    effectiveFrom: values.effectiveFrom,
    ...(values.effectiveTo ? { effectiveTo: values.effectiveTo } : {}),
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
  };
}

/** Client end payload. Empty date → omit so the server defaults to today. */
export function buildEmployeePayrollComponentEndInput(effectiveTo: string): {
  effectiveTo?: string;
} {
  return effectiveTo ? { effectiveTo } : {};
}

/**
 * UX-only amount bound. Percentage assignments are capped at 100 the same way
 * the server guard enforces them; fixed/manual accept any non-negative IDR.
 */
export function amountForMethodError(
  method: string,
  amount: number
): string | null {
  if (method === "percentage" && amount > 100) {
    return "Persentase harus antara 0 dan 100.";
  }
  return null;
}

/** Method-aware helper text for the amount field (Indonesian). */
export function amountForMethodHelp(method: string): string {
  if (method === "percentage") {
    return "Persentase berupa bilangan bulat 0–100 dari penghasilan tetap.";
  }
  return "Jumlah nominal Rupiah berupa bilangan bulat.";
}

/** Indonesian display labels for payroll component enum values. */
export const COMPONENT_TYPE_LABELS: Record<string, string> = {
  earning: "Pendapatan",
  deduction: "Potongan",
};

export const COMPONENT_METHOD_LABELS: Record<string, string> = {
  fixed: "Jumlah tetap",
  percentage: "Persentase penghasilan tetap",
  manual: "Manual",
};

/** Strings referenced by the end-confirmation dialog (asserted in tests). */
export const END_CONFIRMATION_TITLE = "Akhiri komponen gaji";
export const END_CONFIRMATION_BUTTON = "Akhiri komponen";