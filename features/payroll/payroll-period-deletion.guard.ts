/**
 * PM-11 — Locked payroll period deletion guard — PURE decision function.
 *
 * Encodes the business rule applied when a LOCKED payroll period is deleted:
 * - If the period owns GENERATED or PUBLISHED payslips (or any payslip status
 *   other than `revoked`), deletion is blocked with a message that names the
 *   actual blocking status(es).
 * - If every payslip belonging to the period is `revoked`, deletion is
 *   allowed and the caller deletes the revoked payslip graph together with
 *   the period's runs/items inside one transaction.
 * - If the period owns no payslips at all, deletion is allowed.
 *
 * The guard intentionally knows nothing about organizations, permissions, the
 * session, the database or the filesystem. Organization scoping, RBAC and the
 * actual deletes are enforced server-side by the caller
 * (`deletePayrollPeriodAction`). Keeping the rule pure makes it unit-testable
 * without any runtime dependencies.
 */

/**
 * Returns whether the given payslip status is still active and therefore
 * blocks deletion of its borrowing locked payroll period.
 *
 * `revoked` is the only deletable status: generated and published payslips are
 * immutable finalized documents, and any unrecognized/unknown status is treated
 * conservatively (never silently deleted).
 */
export function canDeleteLockedPeriodWithPayslipStatus(
  status: string
): boolean {
  return status === "revoked";
}

export interface PayrollPeriodDeletionDecision {
  /** Whether the LOCKED period may be deleted given its payslip statuses. */
  allowed: boolean;
  /**
   * Operator-facing message explaining the actual blocking payslip status(es),
   * or `null` when deletion is allowed. Does not leak cross-organization
   * information; the statuses are always organization-scoped before this guard
   * runs.
   */
  message: string | null;
}

/**
 * Human-readable description for a blocking payslip status.
 *
 * Known statuses resolve to their display names; any unexpected raw status
 * value is surfaced verbatim so the message is always accurate.
 */
function describeBlockingPayslipStatus(status: string): string {
  if (status === "generated") {
    return "generated";
  }
  if (status === "published") {
    return "published";
  }
  return `with status "${status}"`;
}

/**
 * Joins a list into natural English (`a`, `a and b`, `a, b and c`).
 */
function joinNaturalLabels(labels: readonly string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * Decides whether a LOCKED payroll period may be deleted based purely on the
 * statuses of the payslips that belong to it.
 *
 * Rule: deletion is allowed only when every payslip is `revoked` (or there are
 * no payslips). Any `generated`, `published` or unknown payslip blocks the
 * delete, and the rejection message names the actual blocking status(es).
 *
 * Pure function — no DB, no auth session, no filesystem.
 */
export function buildLockedPayrollPeriodDeletionDecision(
  payslipStatuses: readonly string[]
): PayrollPeriodDeletionDecision {
  const blockingStatuses = [
    ...new Set(payslipStatuses.filter((status) => status !== "revoked")),
  ];

  if (blockingStatuses.length === 0) {
    return { allowed: true, message: null };
  }

  const labels = blockingStatuses.map(describeBlockingPayslipStatus);
  const description = joinNaturalLabels(labels);

  return {
    allowed: false,
    message: `This locked payroll period has ${description} payslips and cannot be deleted. Revoke the payslips first.`,
  };
}