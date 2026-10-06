import { SUPERADMIN_ROLE_CODE } from "../../lib/auth/roles.ts";

/**
 * User account CRUD safety policy (Phase 12).
 *
 * PURE decision logic — no `server-only`, no DB, no framework imports — so the
 * guardrails can be unit-tested with `node --test` (mirroring the
 * `features/work-locations/guardrails.ts` pattern). The server actions invoke
 * these functions AFTER authenticating the actor and org-scoping their DB
 * reads; they answer the "may this operation happen at all" questions:
 *
 * - Self-destruction / self-deactivation protection.
 * - Last active Super Administrator protection (deletion AND deactivation).
 * - Protected historical-record dependency protection.
 * - Cross-organization isolation and SUPERADMIN privilege protection.
 */

export const USER_STATUSES = [
  "pending",
  "active",
  "suspended",
  "locked",
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

/** Human-friendly display pairs (the UI maps schema statuses to labels). */
export const STATUS_DISPLAY: Record<UserStatus, { label: string; tone: "ok" | "warn" | "muted" | "danger" }> = {
  active: { label: "Active", tone: "ok" },
  suspended: { label: "Inactive", tone: "warn" },
  pending: { label: "Invited", tone: "muted" },
  locked: { label: "Locked", tone: "danger" },
};

export function isActivationTransition(
  from: string,
  to: string
): boolean {
  return to === "active" && from !== "active";
}

export function isDeactivationTransition(
  from: string,
  to: string
): boolean {
  return from === "active" && to !== "active";
}

/* ------------------------------------------------------------------ */
/* Deletion                                                           */
/* ------------------------------------------------------------------ */

export const DELETE_REJECTION_MESSAGES = {
  SELF_DELETE: "You cannot delete your own account.",
  LAST_SUPERADMIN:
    "Cannot delete the last active Super Administrator account.",
  PROTECTED_HISTORY:
    "This account cannot be deleted because it has protected historical records. Deactivate the account instead.",
} as const;

export type DeleteRejectionCode =
  | "SELF_DELETE"
  | "LAST_SUPERADMIN"
  | "PROTECTED_HISTORY";

export type DeleteDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: DeleteRejectionCode;
      message: string;
    };

export interface DeletePolicyInput {
  /** Id of the authenticated actor running the operation. */
  actorUserId: string;
  /** Id of the account being deleted. */
  targetUserId: string;
  /** Whether the target holds the system-level SUPERADMIN role. */
  targetIsSuperAdmin: boolean;
  /** Number of ACTIVE SUPERADMIN accounts in scope (includes the target). */
  activeSuperAdminCount: number;
  /** Whether protected business history references the target account. */
  hasProtectedHistory: boolean;
}

/**
 * Decide whether the account deletion may proceed.
 *
 * Rule order matters: self-deletion is rejected first, then the last-Super
 * Administrator guarantee, then protected-history dependencies. Only when the
 * caller reaches the end may the database delete run (always within the
 * authorized organization scope).
 */
export function evaluateUserDeletion(
  input: DeletePolicyInput
): DeleteDecision {
  if (input.targetUserId === input.actorUserId) {
    return {
      allowed: false,
      code: "SELF_DELETE",
      message: DELETE_REJECTION_MESSAGES.SELF_DELETE,
    };
  }

  if (input.targetIsSuperAdmin && input.activeSuperAdminCount <= 1) {
    return {
      allowed: false,
      code: "LAST_SUPERADMIN",
      message: DELETE_REJECTION_MESSAGES.LAST_SUPERADMIN,
    };
  }

  if (input.hasProtectedHistory) {
    return {
      allowed: false,
      code: "PROTECTED_HISTORY",
      message: DELETE_REJECTION_MESSAGES.PROTECTED_HISTORY,
    };
  }

  return { allowed: true };
}

/** Whether a deletion rejection code exists (used for tests/callers). */
export function isDeleteRejectionCode(
  value: unknown
): value is DeleteRejectionCode {
  return (
    value === "SELF_DELETE" ||
    value === "LAST_SUPERADMIN" ||
    value === "PROTECTED_HISTORY"
  );
}

/* ------------------------------------------------------------------ */
/* Deactivation (status → inactive/suspended)                        */
/* ------------------------------------------------------------------ */

export const DEACTIVATION_REJECTION_MESSAGES = {
  SELF_DEACTIVATION: "You cannot deactivate your own account.",
  LAST_SUPERADMIN:
    "Cannot deactivate the last active Super Administrator account.",
} as const;

export type DeactivationDecision =
  | { allowed: true }
  | { allowed: false; code: "SELF_LOCAL"; message: string }
  | {
      allowed: false;
      code: "LAST_SUPERADMIN";
      message: string;
    };

export interface DeactivationPolicyInput {
  actorUserId: string;
  targetUserId: string;
  targetIsSuperAdmin: boolean;
  activeSuperAdminCount: number;
}

/**
 * Decide whether an account may be deactivated (active → suspended etc.).
 *
 * The last-active Super Administrator guarantee applies to deactivation too:
 * deactivating the final active SUPERADMIN would strand the system without an
 * administrator, which is equivalent to deleting the account.
 */
export function evaluateUserDeactivation(
  input: DeactivationPolicyInput
): DeactivationDecision {
  if (input.targetUserId === input.actorUserId) {
    return {
      allowed: false,
      code: "SELF_LOCAL",
      message: DEACTIVATION_REJECTION_MESSAGES.SELF_DEACTIVATION,
    };
  }

  if (input.targetIsSuperAdmin && input.activeSuperAdminCount <= 1) {
    return {
      allowed: false,
      code: "LAST_SUPERADMIN",
      message: DEACTIVATION_REJECTION_MESSAGES.LAST_SUPERADMIN,
    };
  }

  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/* Management scope / privilege escalation                            */
/* ------------------------------------------------------------------ */

export const MANAGE_REJECTION_MESSAGES = {
  SCOPE_MISMATCH:
    "You do not have permission to manage user accounts in this organization.",
  SUPERADMIN_ROLE_PROTECTED:
    "The SUPERADMIN role cannot be delegated by tenant administrators.",
  SUPERADMIN_TARGET_PROTECTED:
    "You do not have permission to manage a Super Administrator account.",
} as const;

export type ManageDecision =
  | { allowed: true }
  | { allowed: false; code: "SCOPE_MISMATCH"; message: string }
  | {
      allowed: false;
      code: "SUPERADMIN_ROLE_PROTECTED";
      message: string;
    }
  | {
      allowed: false;
      code: "SUPERADMIN_TARGET_PROTECTED";
      message: string;
    };

export interface ManageScopeInput {
  /** Whether the actor holds the system-level SUPERADMIN role. */
  actorIsSuperAdmin: boolean;
  /** The actor's own organization (null for system-level accounts). */
  actorOrganizationId: string | null;
  /** The organization the actor is operating on (the target's org). */
  targetOrganizationId: string | null;
  /** Role code the actor is trying to assign (create/update), if any. */
  targetRoleCode?: string | null;
  /** Whether the target account is an existing SUPERADMIN account. */
  targetIsSuperAdmin?: boolean;
}

/**
 * Decide whether the actor may manage a target account / role.
 *
 * Tenants (non-SUPERADMIN) may only manage accounts inside their own
 * organization, and they can never touch the SUPERADMIN role — which lives in
 * the reserved SYSTEM organization and can never be delegated. SUPERADMIN
 * actors may administer across organizations.
 *
 * Server actions additionally org-scope every DB read by this same rule, so a
 * tampered form can never cross the boundary this function describes.
 */
export function evaluateManageScope(
  input: ManageScopeInput
): ManageDecision {
  if (input.targetRoleCode === SUPERADMIN_ROLE_CODE && !input.actorIsSuperAdmin) {
    return {
      allowed: false,
      code: "SUPERADMIN_ROLE_PROTECTED",
      message: MANAGE_REJECTION_MESSAGES.SUPERADMIN_ROLE_PROTECTED,
    };
  }

  const actorOrg = input.actorOrganizationId ?? null;
  const targetOrg = input.targetOrganizationId ?? null;

  if (!input.actorIsSuperAdmin && actorOrg !== targetOrg) {
    return {
      allowed: false,
      code: "SCOPE_MISMATCH",
      message: MANAGE_REJECTION_MESSAGES.SCOPE_MISMATCH,
    };
  }

  if (
    input.targetIsSuperAdmin &&
    !input.actorIsSuperAdmin
  ) {
    return {
      allowed: false,
      code: "SUPERADMIN_TARGET_PROTECTED",
      message: MANAGE_REJECTION_MESSAGES.SUPERADMIN_TARGET_PROTECTED,
    };
  }

  return { allowed: true };
}

/** Whether two organizations are the same scope (null-safe). */
export function sameOrganization(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return (a ?? null) === (b ?? null);
}