import "server-only";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { employees, users } from "@/db/schema";
import {
  deleteSessionCookie,
  getSessionCookieValue,
  hashSessionToken,
  revokeSession,
  validateSession,
} from "./session";
import { verifyPassword, verifyPasswordTimingEqualizer } from "./password";
import type {
  AuthenticateResult,
  CurrentUser,
  UserStatus,
} from "./types";

/**
 * Authentication orchestration — the single entry point used by server
 * actions and route guards.
 *
 * Only `active` users authenticate (see db/schema/users.ts for the status
 * contract). Credential errors are intentionally indistinguishable between
 * "identifier unknown" and "wrong password" (see Task 16); the database and
 * the HTTP layer never see password material from here.
 */

function toCurrentUser(row: {
  id: string;
  email: string;
  status: string;
  organizationId: string | null;
  createdAt: Date;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
}): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    status: row.status as UserStatus,
    organizationId: row.organizationId,
    createdAt: row.createdAt,
    mustChangePassword: row.mustChangePassword,
    passwordChangedAt: row.passwordChangedAt,
  };
}

/**
 * Resolve a login identifier to candidate user rows.
 *
 * The identifier is either the account email or the linked employee's
 * employee number (the import provisions accounts whose initial password is
 * the employee number, and the login page accepts both). The employee-number
 * path joins through `employees.user_id`; when several organizations reuse
 * the same employee number the lookup is ambiguous and fails closed.
 */
async function findUserRowsByIdentifier(
  identifier: string
): Promise<Array<typeof users.$inferSelect>> {
  const normalized = identifier.trim();

  if (normalized.includes("@")) {
    return db
      .select()
      .from(users)
      .where(eq(users.email, normalized.toLowerCase()))
      .limit(2);
  }

  const rows = await db
    .select({ user: users })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(sql`lower(${employees.employeeNumber}) = lower(${normalized})`)
    .limit(2);

  return rows.map((row) => row.user);
}

/**
 * Authenticate an identifier (email OR employee number) + password pair.
 *
 * Returns a discriminated result — never throws for bad credentials, never
 * returns the password hash or any session material.
 */
export async function authenticateUser(
  identifier: string,
  password: string
): Promise<AuthenticateResult> {
  const trimmed = identifier.trim();

  // Unknown identifier, lookup failure or account without a password yet:
  // still burn one Argon2id verification so response timing does not reveal
  // account existence.
  let candidates: Array<typeof users.$inferSelect>;
  try {
    candidates = await findUserRowsByIdentifier(trimmed);
  } catch (error) {
    // Lookup failures must behave exactly like unknown credentials.
    console.error("[auth] identifier lookup failed", error);
    await verifyPasswordTimingEqualizer(password);
    return { ok: false, reason: "invalid_credentials" };
  }

  const userRow = candidates.length === 1 ? candidates[0] : undefined;
  if (!userRow || !userRow.passwordHash) {
    await verifyPasswordTimingEqualizer(password);
    return { ok: false, reason: "invalid_credentials" };
  }

  const passwordMatches = await verifyPassword(password, userRow.passwordHash);
  if (!passwordMatches) {
    return { ok: false, reason: "invalid_credentials" };
  }

  // Reached only with a correct password, so this does not enable
  // unauthenticated account enumeration.
  if (userRow.status !== "active") {
    return { ok: false, reason: "account_not_active" };
  }

  return { ok: true, user: toCurrentUser(userRow) };
}

/**
 * Resolve the current request's authenticated user, or `null`.
 *
 * Reads the HttpOnly session cookie, hashes the token, validates the session
 * (revocation, expiry, user status) against PostgreSQL and returns safe user
 * information only.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = await getSessionCookieValue();
  if (!token) return null;

  const validated = await validateSession(hashSessionToken(token));
  return validated?.user ?? null;
}

/** Options for `requireUser`. */
export interface RequireUserOptions {
  /**
   * Allow the request through even while `must_change_password` is true.
   * Reserved for the change-password surface itself (and nothing else): the
   * guard is enforced centrally so every other authenticated page, server
   * action and API route is protected without per-caller changes.
   */
  allowPendingPasswordChange?: boolean;
}

/**
 * Server-side auth guard for protected route groups/layouts.
 *
 * Redirects unauthenticated requests to /login. Additionally, when the
 * account still owes a password change (provisioned through the employee
 * import or after an administrative reset), every request is redirected to
 * /change-password — the user cannot reach any other authenticated surface
 * until the password is changed.
 */
export async function requireUser(
  options: RequireUserOptions = {}
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.mustChangePassword && !options.allowPendingPasswordChange) {
    redirect("/change-password");
  }
  return user;
}

/**
 * End the current request's session: revoke the database row, then clear the
 * cookie. Revocation is best-effort (the cookie is cleared even if the
 * database write fails so the browser never keeps a stale credential).
 */
export async function logoutUser(): Promise<void> {
  const token = await getSessionCookieValue();
  if (token) {
    try {
      await revokeSession(hashSessionToken(token));
    } catch (error) {
      // The session row could not be revoked (e.g. DB outage). Clear the
      // cookie anyway and surface the failure to the server log only.
      console.error("[auth] session revocation failed during logout", error);
    }
  }
  await deleteSessionCookie();
}
