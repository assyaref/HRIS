import "server-only";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
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
 * "email unknown" and "wrong password" (see Task 16); the database and the
 * HTTP layer never see password material from here.
 */

function toCurrentUser(row: {
  id: string;
  email: string;
  status: string;
  organizationId: string | null;
  createdAt: Date;
}): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    status: row.status as UserStatus,
    organizationId: row.organizationId,
    createdAt: row.createdAt,
  };
}

/**
 * Authenticate an email + password pair.
 *
 * Returns a discriminated result — never throws for bad credentials, never
 * returns the password hash or any session material.
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthenticateResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  const userRow = rows[0];

  // Unknown email or account without a password yet: still burn one Argon2id
  // verification so response timing does not reveal account existence.
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

/**
 * Server-side auth guard for protected route groups/layouts.
 * Redirects unauthenticated requests to /login and returns the current user
 * for authenticated ones.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
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
