import type { PayslipStatus } from "./constants";

/**
 * Payslip revocation guard — pure, deterministic, side-effect free.
 *
 * The payslip lifecycle is:
 *
 *   generated -> published -> revoked
 *
 * Only a **published** payslip may be revoked. A payslip that is still
 * `generated` has never been made available to the employee and therefore
 * cannot be revoked; an already-`revoked` payslip is terminal and must not be
 * revoked twice; any unknown/foreign status is never revocable.
 *
 * The guard intentionally knows nothing about organizations, permissions, the
 * session, the database or the filesystem. Organization scoping, RBAC and the
 * actual status transition are enforced server-side by the caller
 * (`revokePayslipAction`). Keeping the rule pure makes the transition
 * semantics unit-testable without any runtime dependencies.
 */

/**
 * Upper bound for a payroll-generated (or operator-entered) revocation reason.
 * Chosen to be generous for a short administrative note while still bounded so
 * the reason can never be used as an unbounded payload/audit vector.
 */
export const PAYSLIP_REVOCATION_REASON_MAX_LENGTH = 1000;

/**
 * Returns whether the given payslip status may legally transition to
 * `revoked`. Only `published` payslips can be revoked.
 */
export function canRevokePayslip(status: PayslipStatus | string): boolean {
  return status === "published";
}

/**
 * Context for building a revocation access + audit decision.
 *
 * `managementAllowed` reflects the actor's explicit, server-side payroll
 * management authorization; it is never derived from the client.
 */
export interface PayslipRevocationDecisionContext {
  /** Current payslip status. */
  payslipStatus: PayslipStatus | string;
  /**
   * Operator-entered reason for the revocation. Trimmed and length-bounded
   * inside the guard; never contains document passwords, NIKs or stored
   * PDF keys.
   */
  reason: string;
  /** Whether the actor holds explicit payroll/payslip management access. */
  managementAllowed: boolean;
}

export interface PayslipRevocationDecision {
  /** Whether the payslip may be transitioned to `revoked`. */
  allowed: boolean;
  /**
   * Whether the `payslip.revoked` audit event must be recorded. Always
   * `true` when the revocation is allowed and `false` when it is not, so the
   * audit trail reflects exactly the authorizations that succeeded.
   */
  recordAudit: boolean;
  /**
   * Operator-facing message describing why the revocation is not permitted,
   * or `null` when it is permitted. Does not leak cross-organization
   * information; statuses and reasons are always organization-scoped before
   * this guard runs.
   */
  message: string | null;
}

/**
 * Builds the revocation + audit decision for one payslip.
 *
 * Rule: the transition `published -> revoked` requires BOTH:
 *  - the payslip is currently `published` (never `generated`/`revoked`), AND
 *  - management access is explicitly allowed (server-side), AND
 *  - the reason is non-empty after trimming and within the maximum length.
 *
 * Pure function — no DB, no auth session, no filesystem.
 */
export function buildPayslipRevocationDecision(
  context: PayslipRevocationDecisionContext
): PayslipRevocationDecision {
  if (!context.managementAllowed) {
    return {
      allowed: false,
      recordAudit: false,
      message:
        "You need payroll or payslip management access to revoke a payslip.",
    };
  }

  if (!canRevokePayslip(context.payslipStatus)) {
    return {
      allowed: false,
      recordAudit: false,
      message: "Only a published payslip can be revoked.",
    };
  }

  const reason = context.reason.trim();
  if (reason.length === 0) {
    return {
      allowed: false,
      recordAudit: false,
      message: "A revocation reason is required.",
    };
  }

  if (reason.length > PAYSLIP_REVOCATION_REASON_MAX_LENGTH) {
    return {
      allowed: false,
      recordAudit: false,
      message: `The revocation reason must be ${PAYSLIP_REVOCATION_REASON_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { allowed: true, recordAudit: true, message: null };
}

/**
 * Pure reason validator: trims and returns `true` when the reason is usable
 * for a revocation (non-empty after trimming and within the length bound).
 */
export function isValidPayslipRevocationReason(
  reason: string
): boolean {
  const trimmed = reason.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= PAYSLIP_REVOCATION_REASON_MAX_LENGTH
  );
}
