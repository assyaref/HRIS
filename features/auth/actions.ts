"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authenticateUser, logoutUser } from "@/lib/auth/auth";
import {
  createSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { isProduction } from "@/lib/config/env";

import { loginSchema } from "./login-schema";

/**
 * Authentication server actions.
 *
 * The browser never talks to PostgreSQL: credentials are POSTed to these
 * Server Actions (origin/host checked by the framework), validated, checked
 * against the users table, and — on success — an HttpOnly session cookie is
 * set before redirecting to /dashboard.
 */

export interface LoginState {
  status: "idle" | "error";
  error?: string;
  fieldErrors?: { email?: string; password?: string };
}

const GENERIC_AUTH_ERROR = "Invalid email or password.";
const LOCKED_ERROR =
  "Too many failed sign-in attempts. Try again later.";

/* ---------------------------------------------------------------------- */
/* Login throttling (in-memory, per-process)                               */
/*                                                                        */
/* Minimal dependency-free guard for login rate limiting + lockout. The   */
/* production deployment runs a single `next start` process (hris.service */
/* on port 3000), so a per-process ledger is consistent there. A          */
/* persistent store (Redis/DB) is recommended before scaling horizontally */
/* or across multiple server processes.                                   */
/*                                                                        */
/* Design choices:                                                         */
/* - Key = normalized email + client IP: blocks distributed-but-same-IP   */
/*   brute force without enabling cross-IP account lockout attacks.       */
/* - After MAX_FAILED_ATTEMPTS failures inside ATTEMPT_WINDOW_MS the key  */
/*   is locked for LOCKOUT_MS; further attempts for that key are rejected */
/*   with a generic message.                                              */
/* - Only failed *credential* checks (reason === "invalid_credentials")   */
/*   advance the counter; success resets it; malformed/non-active         */
/*   accounts are not throttled.                                          */
/* - Enforced only in production to keep local development frictionless.  */
/* ---------------------------------------------------------------------- */

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding window
const LOCKOUT_MS = 15 * 60 * 1000; // 15-minute lockout
const MAX_LEDGER_ENTRIES = 10_000;

interface LoginAttemptLedger {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number | null;
}

const loginAttempts = new Map<string, LoginAttemptLedger>();

function loginThrottleKey(email: string, ip: string | null): string {
  return `${ip ?? "unknown"}|${email.trim().toLowerCase()}`;
}

/** Best-effort client IP from the standard proxy headers. */
function resolveClientIp(
  headerStore: Awaited<ReturnType<typeof headers>>
): string | null {
  const xForwardedFor = headerStore.get("x-forwarded-for");
  return (
    (xForwardedFor ? xForwardedFor.split(",")[0]?.trim() : null) ??
    headerStore.get("x-real-ip") ??
    null
  );
}

/** Drop stale entries once the ledger grows beyond its cap. */
function pruneLoginAttempts(now = Date.now()): void {
  if (loginAttempts.size <= MAX_LEDGER_ENTRIES) return;
  for (const [key, entry] of loginAttempts) {
    const expired =
      now - entry.firstFailureAt > ATTEMPT_WINDOW_MS ||
      (entry.lockedUntil !== null && entry.lockedUntil <= now);
    if (expired) loginAttempts.delete(key);
  }
}

function isLoginLocked(email: string, ip: string | null): boolean {
  pruneLoginAttempts();
  const entry = loginAttempts.get(loginThrottleKey(email, ip));
  if (!entry || entry.lockedUntil === null) return false;
  return entry.lockedUntil > Date.now();
}

function recordLoginFailure(email: string, ip: string | null): void {
  pruneLoginAttempts();
  const key = loginThrottleKey(email, ip);
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || now - current.firstFailureAt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, {
      failures: 1,
      firstFailureAt: now,
      lockedUntil: null,
    });
    return;
  }

  const failures = current.failures + 1;
  loginAttempts.set(key, {
    failures,
    firstFailureAt: current.firstFailureAt,
    lockedUntil:
      failures >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : current.lockedUntil,
  });
}

function clearLoginFailures(email: string, ip: string | null): void {
  loginAttempts.delete(loginThrottleKey(email, ip));
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const headerStore = await headers();
  const clientIp = resolveClientIp(headerStore);

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) {
    const fieldErrors: NonNullable<LoginState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "email" || key === "password") {
        fieldErrors[key] = issue.message;
      }
    }
    return { status: "error", fieldErrors };
  }

  // Reject attempts from a throttled key before doing any work. Gated on
  // production so development flows are never locked out.
  if (isProduction() && isLoginLocked(parsed.data.email, clientIp)) {
    return { status: "error", error: LOCKED_ERROR };
  }

  try {
    const result = await authenticateUser(parsed.data.email, parsed.data.password);
    if (!result.ok) {
      if (result.reason === "account_not_active") {
        // Only reachable with a correct password — no unauthenticated
        // enumeration. The message still avoids leaking internal details.
        return {
          status: "error",
          error: "This account is not active. Contact your administrator.",
        };
      }
      // Wrong credentials: advance the throttle counter for this email+IP.
      if (isProduction()) {
        recordLoginFailure(parsed.data.email, clientIp);
      }
      return { status: "error", error: GENERIC_AUTH_ERROR };
    }

    // Valid credentials reset the attempt counter for this key.
    if (isProduction()) {
      clearLoginFailures(parsed.data.email, clientIp);
    }

    const session = await createSession(result.user.id, {
      ipAddress: clientIp,
      userAgent: headerStore.get("user-agent"),
    });

    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    // Never surface stack traces or SQL details to the client. The error is
    // logged server-side without credential material.
    console.error("[auth] login failed", error);
    return {
      status: "error",
      error: "Something went wrong. Please try again.",
    };
  }

  // Successful login. `redirect` throws, so it stays outside try/catch.
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  try {
    await logoutUser();
  } catch (error) {
    console.error("[auth] logout failed", error);
  }
  redirect("/login");
}
