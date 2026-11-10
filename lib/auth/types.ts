/**
 * Shared authentication types.
 *
 * These are safe, serializable shapes only — password hashes and session
 * tokens are never part of this contract and never cross into client code.
 */

/**
 * Application-level user status contract (see db/schema/users.ts).
 * Only `active` accounts may authenticate.
 */
export type UserStatus = "pending" | "active" | "suspended" | "locked";

/**
 * The safe user information returned by the auth service.
 * Deliberately excludes password_hash, session tokens and any credential
 * material.
 */
export interface CurrentUser {
  id: string;
  email: string;
  status: UserStatus;
  /**
   * The organization this request operates in. For every user except a Super
   * Administrator this is their own organization. A Super Administrator (who
   * lives in the reserved SYSTEM organization) operates in the tenant they
   * selected (see lib/auth/acting-organization.ts), so tenant modules read and
   * write that tenant.
   */
  organizationId: string | null;
  /** The user's own organization (`users.organization_id`), never overridden. */
  homeOrganizationId?: string | null;
  createdAt: Date;
  /**
   * Password lifecycle (0020): while true, the authenticated session may only
   * reach /change-password and /logout — every other authenticated surface
   * redirects to /change-password (see `requireUser`).
   */
  mustChangePassword: boolean;
  /** When the owner last set the current password; null after an admin reset. */
  passwordChangedAt: Date | null;
}

export type AuthenticateErrorReason =
  | "invalid_credentials"
  | "account_not_active";

export type AuthenticateResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: AuthenticateErrorReason };

/** Session request metadata persisted for auditability. */
export interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}
