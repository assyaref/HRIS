/**
 * Employee permanent-deletion CONTROL policy (pure decision logic).
 *
 * This module is ADDITIVE to `permanent-delete-policy.ts`. It does not change
 * the existing direct permanent-delete path; it classifies a deletion attempt
 * into the three tiers of `docs/employee-permanent-delete-policy.md` and decides
 * the dual-control approval outcome.
 *
 * Tiers:
 * - "direct":          no protected historical records, no legal hold. Handled
 *                      by the existing `permanentlyDeleteEmployeeAction`.
 * - "special_approval": only protected categories that Legal/HR have marked
 *                      retention-ELIGIBLE. Requires two distinct Super
 *                      Administrators. EXECUTION IS DISABLED.
 * - "retained":        an active legal hold, or any protected category that is
 *                      not retention-eligible. Absolute refusal.
 *
 * The retention schedule (`RETENTION_ELIGIBLE_CATEGORIES`) is EMPTY until the
 * organisation signs off (`docs/employee-permanent-delete-policy.md` §4). As a
 * result every protected category resolves to "retained" today, and no
 * historical record can be requested for deletion. The functions accept an
 * explicit schedule so the policy can be tested and, later, configured.
 *
 * This module has no database or framework dependency.
 */

import {
  hasProtectedEmployeeDependencies,
  presentEmployeeDeleteDependencies,
  presentEmployeeDependenciesByDisposition,
  type EmployeeDeleteDependency,
  type EmployeeDeleteDependencyLabel,
} from "./permanent-delete-policy.ts";

/* ------------------------------------------------------------------ */
/* Messages                                                           */
/* ------------------------------------------------------------------ */

export const DELETION_LEGAL_HOLD_MESSAGE =
  "Employee cannot be permanently deleted because an active legal hold applies.";

export const DELETION_RETENTION_BOUND_MESSAGE =
  "Employee cannot be permanently deleted because protected records are still subject to a retention obligation that has not been approved for deletion.";

export const DELETION_REASON_REQUIRED_MESSAGE =
  "A deletion reason is required (at least 10 characters).";

export const DELETION_SELF_APPROVAL_MESSAGE =
  "You cannot approve your own deletion request.";

export const DELETION_EXECUTION_DISABLED_MESSAGE =
  "Execution of an approved permanent deletion is disabled pending retention-policy sign-off. No data has been deleted.";

export const DELETION_RETENTION_POLICY_ADVICE =
  "Deactivate/archive the employee, or obtain the required retention-policy approval.";

/* ------------------------------------------------------------------ */
/* Tiers                                                              */
/* ------------------------------------------------------------------ */

export const DELETION_CONTROL_TIERS = [
  "direct",
  "special_approval",
  "retained",
] as const;

export type DeletionTier = (typeof DELETION_CONTROL_TIERS)[number];

export type DeletionRefusalCode = "LEGAL_HOLD" | "RETENTION_BOUND";

/**
 * Protected categories whose deletion the organisation has approved, WITH
 * dual-control approval, under the retention schedule.
 *
 * EMPTY IS THE SAFE DEFAULT: until the §4 sign-off is recorded, every protected
 * category is retained. Do not populate this list without a dated, reviewed
 * change referencing the signed schedule.
 */
export const RETENTION_ELIGIBLE_CATEGORIES: readonly EmployeeDeleteDependencyLabel[] =
  [];

/** Distinct approvals required per tier. A retained record is never approvable. */
export const DELETION_APPROVALS_BY_TIER: Readonly<Record<DeletionTier, number>> =
  {
    direct: 1,
    special_approval: 2,
    retained: 0,
  };

export function requiredApprovalsForTier(tier: DeletionTier): number {
  return DELETION_APPROVALS_BY_TIER[tier];
}

/**
 * Whether execution of an approved deletion is enabled.
 *
 * HARD-CODED `false` until the retention policy is signed off and the enabling
 * change is reviewed. The executor server action asserts this and refuses.
 */
export const DELETION_EXECUTION_ENABLED = false;

export function isDeletionExecutionEnabled(): boolean {
  return DELETION_EXECUTION_ENABLED;
}

/* ------------------------------------------------------------------ */
/* Eligibility                                                        */
/* ------------------------------------------------------------------ */

export interface DeletionEligibilityInput {
  /** Whether an active legal hold applies to the employee. */
  legalHoldActive: boolean;
  /** Employee-scoped dependents counted inside the caller's transaction. */
  dependencies: readonly EmployeeDeleteDependency[];
  /** Employee number, for the operator-facing refusal message. */
  employeeNumber?: string;
  /**
   * Retention schedule override. Defaults to `RETENTION_ELIGIBLE_CATEGORIES`
   * (empty). Tests pass an explicit schedule to exercise the special-approval
   * tier; production callers must not.
   */
  retentionEligibleCategories?: readonly EmployeeDeleteDependencyLabel[];
}

export type DeletionEligibility =
  | {
      tier: "direct";
      /** Deletable categories that would be removed with the employee. */
      deletableDependencies: EmployeeDeleteDependency[];
    }
  | {
      tier: "special_approval";
      /** Retention-eligible protected categories requiring dual control. */
      approvalCategories: EmployeeDeleteDependency[];
      deletableDependencies: EmployeeDeleteDependency[];
      requiredApprovals: number;
    }
  | {
      tier: "retained";
      code: DeletionRefusalCode;
      message: string;
      /** The categories that force the absolute refusal. */
      categories: EmployeeDeleteDependency[];
    };

function formatCategoryLines(
  categories: readonly EmployeeDeleteDependency[]
): string {
  return categories
    .map((dependency) => `${dependency.label}: ${dependency.count}`)
    .join("\n");
}

function withEmployeeNumber(message: string, employeeNumber?: string): string {
  if (!employeeNumber) return message;
  return `${message}\n\nCannot delete employee ${employeeNumber}.`;
}

/**
 * Classify a deletion attempt.
 *
 * Order of precedence:
 * 1. active legal hold  → "retained" (LEGAL_HOLD) — absolute.
 * 2. non-eligible protected categories → "retained" (RETENTION_BOUND) — absolute.
 * 3. retention-eligible protected categories → "special_approval".
 * 4. otherwise → "direct".
 *
 * A legal hold dominates everything, including retention eligibility.
 */
export function evaluateDeletionEligibility(
  input: DeletionEligibilityInput
): DeletionEligibility {
  const eligibleSchedule = new Set<EmployeeDeleteDependencyLabel>(
    input.retentionEligibleCategories ?? RETENTION_ELIGIBLE_CATEGORIES
  );
  const present = presentEmployeeDeleteDependencies(input.dependencies);
  const protectedPresent = presentEmployeeDependenciesByDisposition(
    input.dependencies,
    "protected"
  );
  const deletablePresent = presentEmployeeDependenciesByDisposition(
    input.dependencies,
    "deletable"
  );

  if (input.legalHoldActive) {
    return {
      tier: "retained",
      code: "LEGAL_HOLD",
      message: withEmployeeNumber(
        DELETION_LEGAL_HOLD_MESSAGE,
        input.employeeNumber
      ),
      categories: present,
    };
  }

  const retainedCategories = protectedPresent.filter(
    (dependency) => !eligibleSchedule.has(dependency.label)
  );
  if (retainedCategories.length > 0) {
    return {
      tier: "retained",
      code: "RETENTION_BOUND",
      message: `${withEmployeeNumber(
        DELETION_RETENTION_BOUND_MESSAGE,
        input.employeeNumber
      )}\n\nRetained records:\n${formatCategoryLines(retainedCategories)}\n\n${DELETION_RETENTION_POLICY_ADVICE}`,
      categories: retainedCategories,
    };
  }

  const approvalCategories = protectedPresent.filter((dependency) =>
    eligibleSchedule.has(dependency.label)
  );
  if (approvalCategories.length > 0) {
    return {
      tier: "special_approval",
      approvalCategories,
      deletableDependencies: deletablePresent,
      requiredApprovals: requiredApprovalsForTier("special_approval"),
    };
  }

  return { tier: "direct", deletableDependencies: deletablePresent };
}

/** True when the classification is an absolute refusal. */
export function isRetainedEligibility(
  eligibility: DeletionEligibility
): eligibility is Extract<DeletionEligibility, { tier: "retained" }> {
  return eligibility.tier === "retained";
}

/** True when protected historical records are present (any tier). */
export function eligibilityHasProtectedRecords(
  dependencies: readonly EmployeeDeleteDependency[]
): boolean {
  return hasProtectedEmployeeDependencies(dependencies);
}

/* ------------------------------------------------------------------ */
/* Reason validation                                                  */
/* ------------------------------------------------------------------ */

export const DELETION_REASON_MIN_LENGTH = 10;
export const DELETION_REASON_MAX_LENGTH = 2000;

/** A deletion reason is mandatory, non-trivial and bounded. */
export function isValidDeletionReason(reason: unknown): reason is string {
  if (typeof reason !== "string") return false;
  const trimmed = reason.trim();
  return (
    trimmed.length >= DELETION_REASON_MIN_LENGTH &&
    trimmed.length <= DELETION_REASON_MAX_LENGTH
  );
}

/* ------------------------------------------------------------------ */
/* Dual-control approval                                              */
/* ------------------------------------------------------------------ */

export type DeletionApprovalDecisionValue = "approved" | "rejected";

export interface DeletionApprovalRecord {
  approverUserId: string;
  decision: DeletionApprovalDecisionValue;
}

export interface DeletionApprovalInput {
  /** The Super Administrator who raised the request. */
  requesterUserId: string;
  /** Distinct approvals required (see `requiredApprovalsForTier`). */
  requiredApprovals: number;
  /** Decisions recorded so far. */
  approvals: readonly DeletionApprovalRecord[];
}

export type DeletionApprovalOutcome =
  | { status: "approved"; approverUserIds: string[] }
  | { status: "rejected"; rejectedByUserId: string }
  | {
      status: "pending";
      approvalsReceived: number;
      approvalsRequired: number;
    }
  | {
      status: "invalid";
      code:
        | "SELF_APPROVAL_FORBIDDEN"
        | "DUPLICATE_APPROVER"
        | "INVALID_REQUIREMENT";
      message: string;
      offenderUserId?: string;
    };

/**
 * Resolve the dual-control outcome for a deletion request.
 *
 * Rules, applied in order:
 * - the requirement must be positive (a retained/non-approvable request can
 *   never be approved);
 * - no approver may appear twice (a forged batch must not count one person
 *   twice);
 * - the requester may NOT approve their own request (`SELF_APPROVAL_FORBIDDEN`);
 * - a single rejection rejects the request;
 * - otherwise it is approved once the number of distinct approvals reaches the
 *   requirement, and pending until then.
 */
export function evaluateDeletionApproval(
  input: DeletionApprovalInput
): DeletionApprovalOutcome {
  if (!Number.isInteger(input.requiredApprovals) || input.requiredApprovals < 1) {
    return {
      status: "invalid",
      code: "INVALID_REQUIREMENT",
      message: "This request is not approvable.",
    };
  }

  const seen = new Set<string>();
  for (const approval of input.approvals) {
    if (seen.has(approval.approverUserId)) {
      return {
        status: "invalid",
        code: "DUPLICATE_APPROVER",
        message: "An approver may only decide once per request.",
        offenderUserId: approval.approverUserId,
      };
    }
    seen.add(approval.approverUserId);

    if (approval.approverUserId === input.requesterUserId) {
      return {
        status: "invalid",
        code: "SELF_APPROVAL_FORBIDDEN",
        message: DELETION_SELF_APPROVAL_MESSAGE,
        offenderUserId: approval.approverUserId,
      };
    }
  }

  const rejection = input.approvals.find(
    (approval) => approval.decision === "rejected"
  );
  if (rejection) {
    return { status: "rejected", rejectedByUserId: rejection.approverUserId };
  }

  const approverUserIds = [
    ...new Set(
      input.approvals
        .filter((approval) => approval.decision === "approved")
        .map((approval) => approval.approverUserId)
    ),
  ];

  if (approverUserIds.length >= input.requiredApprovals) {
    return { status: "approved", approverUserIds };
  }

  return {
    status: "pending",
    approvalsReceived: approverUserIds.length,
    approvalsRequired: input.requiredApprovals,
  };
}
