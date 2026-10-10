"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { revokeAllUserSessions } from "@/lib/auth/session";

import { changePasswordSchema } from "./change-password-schema";
import { validatePasswordPolicy, passwordPolicyMessage } from "@/lib/auth/password-policy";

export interface ChangePasswordState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

const DB_UNIQUE_VIOLATION = "23505";

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

function error(message: string): ChangePasswordState {
  return { status: "error", message };
}

function isUniqueViolation(unknownError: unknown): boolean {
  return (
    typeof unknownError === "object" &&
    unknownError !== null &&
    "code" in unknownError &&
    (unknownError as { code?: unknown }).code === DB_UNIQUE_VIOLATION
  );
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function changePasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const isForcedChange = formData.get("forcedChange") === "true";
  const user = await requireUser({ allowPendingPasswordChange: isForcedChange });

  const currentPassword = field(formData, "currentPassword");
  const newPassword = field(formData, "newPassword");
  const confirmPassword = field(formData, "confirmPassword");

  const parsed = changePasswordSchema.safeParse({
    currentPassword,
    newPassword,
    confirmPassword,
  });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  // Validate new password against policy (complexity rules)
  const policyResult = validatePasswordPolicy(parsed.data.newPassword, {
    complexity: true,
  });
  if (!policyResult.ok) {
    const fieldErrors: Record<string, string> = {};
    for (const failure of policyResult.failures) {
      fieldErrors[`newPassword`] = passwordPolicyMessage({ ok: false, failures: [failure] }) ?? "Password tidak memenuhi kebijakan.";
    }
    return {
      status: "error",
      fieldErrors,
    };
  }

  try {
    const rows = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        organizationId: users.organizationId,
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const userRow = rows[0];
    if (!userRow || !userRow.passwordHash) {
      return error("Password saat ini salah.");
    }

    const passwordMatches = await verifyPassword(
      parsed.data.currentPassword,
      userRow.passwordHash
    );
    if (!passwordMatches) {
      return error("Password saat ini salah.");
    }

    const newPasswordHash = await hashPassword(parsed.data.newPassword);

    // For forced change (import/reset flow), clear mustChangePassword and set passwordChangedAt
    const updateData: {
      passwordHash: string;
      updatedAt: Date;
      mustChangePassword?: boolean;
      passwordChangedAt?: Date;
    } = {
      passwordHash: newPasswordHash,
      updatedAt: new Date(),
    };

    if (isForcedChange || userRow.mustChangePassword) {
      updateData.mustChangePassword = false;
      updateData.passwordChangedAt = new Date();
    }

    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id));

    try {
      await writeAuditLog({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: isForcedChange ? "user.password_reset" : "user.password_changed",
        entityType: "user",
        entityId: user.id,
        metadata: {
          reason: isForcedChange ? "admin_reset_password" : "self_service_change_password",
        },
      });
    } catch (auditError) {
      console.error("[account] audit failed", auditError);
    }

    if (isForcedChange) {
      // For forced change, only revoke OTHER sessions, keep current one
      // (The current session is validated by requireUser with allowPendingPasswordChange)
      try {
        await revokeAllUserSessions(user.id);
      } catch (sessionError) {
        console.error("[account] session revocation failed", sessionError);
      }
      redirect("/dashboard");
    } else {
      // Self-service: revoke all sessions, user must log in again
      try {
        await revokeAllUserSessions(user.id);
      } catch (sessionError) {
        console.error("[account] session revocation failed", sessionError);
      }
      revalidatePath("/settings/account");
    }
  } catch (unknownError) {
    // Check if it's a redirect (from forced change flow)
    if (unknownError && typeof unknownError === "object" && "digest" in unknownError) {
      const digest = (unknownError as { digest: string }).digest;
      if (digest.startsWith("NEXT_REDIRECT")) {
        throw unknownError;
      }
    }
    console.error("[account] change password failed", unknownError);
    if (isUniqueViolation(unknownError)) {
      return error("Terjadi kesalahan saat mengubah password. Silakan coba lagi.");
    }
    return error("Terjadi kesalahan saat mengubah password. Silakan coba lagi.");
  }

  return {
    status: "success",
    message: isForcedChange
      ? "Password berhasil diubah. Mengarahkan ke dashboard..."
      : "Password berhasil diubah. Silakan login kembali.",
  };
}
