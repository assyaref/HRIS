import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { getEnvInteger, isProduction } from "@/lib/config/env";
import type { CurrentUser, SessionMetadata } from "./types";

/**
 * Session management — database-backed, revocable sessions.
 *
 * Security model (documented in docs/auth.md):
 * - The client only ever holds an opaque, high-entropy random token inside an
 *   HttpOnly cookie. JavaScript never sees it.
 * - PostgreSQL stores only the SHA-256 hash of that token (`token_hash`),
 *   never the raw token, so a database leak does not leak usable sessions.
 * - Expiry (`expires_at`), revocation (`revoked_at`) and last activity
 *   (`last_activity_at`) are enforced server-side on every request.
 */

export const SESSION_COOKIE_NAME = "hris_session";

const SESSION_TOKEN_BYTES = 32; // 256 bits of entropy
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SESSION_TTL_ENV = "AUTH_SESSION_TTL_SECONDS";

/** Optional session lifetime override (seconds); defaults to 7 days. */
export function getSessionTtlSeconds(): number {
  return getEnvInteger(SESSION_TTL_ENV) ?? DEFAULT_SESSION_TTL_SECONDS;
}

/** Generate an opaque session token (base64url, 256-bit random). */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

/**
 * Hash a session token for persistence.
 *
 * SHA-256 is the correct primitive here: the input is a freshly generated
 * 256-bit random token (not a low-entropy password), the hash is
 * non-reversible, and the token itself is what authenticates the request.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreatedSession {
  /** Raw token — return this to the cookie layer only, never to the client. */
  token: string;
  expiresAt: Date;
}

/** A validated session joined with its (safe) user. */
export interface ValidatedSession {
  sessionId: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  user: CurrentUser;
}

/**
 * Create a session row in PostgreSQL and return the raw token + expiry.
 * The raw token exists only in the returned value and the secure cookie.
 */
export async function createSession(
  userId: string,
  metadata: SessionMetadata = {}
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getSessionTtlSeconds() * 1000);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent ?? null,
    expiresAt,
    lastActivityAt: now,
  });

  return { token, expiresAt };
}
/**
 * Look up a session row by its token hash without validity checks.
 * Used by logout/revocation paths, which must revoke even expired sessions.
 */
export async function getSession(tokenHash: string) {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Validate a token hash and return the session + safe user.
 *
 * Returns `null` when the session is missing, revoked, expired, orphaned
 * (user deleted) or the owning user is not `active`. Expired and revoked
 * sessions never authenticate the user.
 */
export async function validateSession(
  tokenHash: string
): Promise<ValidatedSession | null> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      sessionExpiresAt: sessions.expiresAt,
      sessionRevokedAt: sessions.revokedAt,
      sessionCreatedAt: sessions.createdAt,
      userId: users.id,
      userEmail: users.email,
      userStatus: users.status,
      userOrganizationId: users.organizationId,
      userCreatedAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.sessionRevokedAt !== null) return null;
  if (row.sessionExpiresAt.getTime() <= Date.now()) return null;
  if (row.userStatus !== "active") return null;

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    expiresAt: row.sessionExpiresAt,
    createdAt: row.sessionCreatedAt,
    user: {
      id: row.userId,
      email: row.userEmail,
      status: row.userStatus as CurrentUser["status"],
      organizationId: row.userOrganizationId,
      createdAt: row.userCreatedAt,
    },
  };
}

/** Revoke a single session (by token hash). Idempotent and safe to re-run. */
export async function revokeSession(tokenHash: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
}

/** Revoke every non-revoked session for a user (e.g. password reset). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/* ------------------------------------------------------------------ */
/* Cookie helpers                                                      */
/* ------------------------------------------------------------------ */

/** Read the raw session token from the request cookie, if present. */
export async function getSessionCookieValue(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  return cookie?.value ?? null;
}

/**
 * Set the session cookie.
 *
 * - HttpOnly — inaccessible to JavaScript.
 * - Secure in production (HTTPS only); localhost dev keeps it usable over HTTP.
 * - SameSite=Lax — CSRF protection for top-level navigations while still
 *   allowing the session on same-site requests.
 * - Path=/ and the session's own expiry so cookie lifetime == session lifetime.
 */
export async function setSessionCookie(
  token: string,
  expiresAt: Date
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Delete the session cookie. Used by logout. */
export async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

