/**
 * Employee deactivation policy.
 *
 * PURE decision logic with no database or framework dependencies. The server
 * action uses it for self-protection before deactivation. Physical employee
 * deletion is disabled, so attendance, payroll, leave, audit, master-data,
 * document, custom-value, and employment history remain intact.
 */

export const EMPLOYEE_DELETE_NO_PROTECTED_HISTORY: readonly string[] = [];

/**
 * Protected dependency categories, in display order. Anything an employee has
 * touched that must be preserved (never cascade-deleted) blocks permanent
 * deletion and directs the user to deactivate instead.
 */
export const EMPLOYEE_DELETE_PROTECTED_CATEGORIES = [
  "Attendance",
  "Leave",
  "Permission",
  "Payroll",
  "Payslip",
  "Face identity",
  "Project assignments",
] as const;

export type EmployeeProtectedCategory =
  (typeof EMPLOYEE_DELETE_PROTECTED_CATEGORIES)[number];

export const EMPLOYEE_DELETE_PROTECTED_HISTORY_MESSAGE =
  "Physical employee deletion is disabled. Deactivate the employee instead.";

/** Safe message identifying the dependency categories that block deletion. */
export function buildProtectedHistoryMessage(
  categories: readonly EmployeeProtectedCategory[]
): string {
  const unique = [
    ...new Set(
      categories.map((category) =>
        EMPLOYEE_DELETE_PROTECTED_CATEGORIES.includes(category)
          ? category
          : ("Other protected records" as const)
      )
    ),
  ];
  if (unique.length === 0) {
    return EMPLOYEE_DELETE_PROTECTED_HISTORY_MESSAGE;
  }
  return `${EMPLOYEE_DELETE_PROTECTED_HISTORY_MESSAGE} Protected records were found in: ${unique.join(", ")}.`;
}

export type EmployeeDeleteDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "SELF_LINKED";
      message: string;
    }
  | {
      allowed: false;
      code: "PROTECTED_HISTORY";
      message: string;
      categories: EmployeeProtectedCategory[];
    };

export interface EmployeeDeletePolicyInput {
  /** The authenticated actor running the deletion. */
  actorUserId: string;
  /** Id of the employee record being deleted. */
  employeeId: string;
  /** Linked user account, if any (employees.user_id). */
  linkedUserId: string | null;
  /** Protected dependency categories present for this employee. */
  protectedCategories: readonly EmployeeProtectedCategory[];
}

/** Decide whether the employee deactivation request may proceed. */
export function evaluateEmployeeDeletion(
  input: EmployeeDeletePolicyInput
): EmployeeDeleteDecision {
  if (input.linkedUserId === input.actorUserId) {
    return {
      allowed: false,
      code: "SELF_LINKED",
      message: "You cannot deactivate your own linked employee record.",
    };
  }

  if (input.protectedCategories.length > 0) {
    const categories = input.protectedCategories.filter((category) =>
      EMPLOYEE_DELETE_PROTECTED_CATEGORIES.includes(category)
    );
    return {
      allowed: false,
      code: "PROTECTED_HISTORY",
      message: buildProtectedHistoryMessage(categories),
      categories,
    };
  }

  return { allowed: true };
}

/** Whether a rejection code exists (used by tests/callers). */
export function isEmployeeDeleteRejectionCode(
  value: unknown
): value is "SELF_LINKED" | "PROTECTED_HISTORY" {
  return value === "SELF_LINKED" || value === "PROTECTED_HISTORY";
}