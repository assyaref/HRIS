"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authenticateUser, logoutUser } from "@/lib/auth/auth";
import {
  createSession,
  setSessionCookie,
} from "@/lib/auth/session";

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

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
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
      return { status: "error", error: GENERIC_AUTH_ERROR };
    }

    const headerStore = await headers();
    const xForwardedFor = headerStore.get("x-forwarded-for");
    const session = await createSession(result.user.id, {
      ipAddress:
        (xForwardedFor ? xForwardedFor.split(",")[0]?.trim() : null) ??
        headerStore.get("x-real-ip"),
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
