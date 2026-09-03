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
  organizationId: string | null;
  createdAt: Date;
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
