"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { revokeAllUserSessions } from "@/lib/auth/session";

import { changePasswordSchema } from "./change-password-schema";

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
  const user = await requireUser();

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

  try {
    const rows = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        organizationId: users.organizationId,
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

    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    try {
      await writeAuditLog({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "user.password_changed",
        entityType: "user",
        entityId: user.id,
        metadata: {
          reason: "self_service_change_password",
        },
      });
    } catch (auditError) {
      console.error("[account] audit failed", auditError);
    }

    try {
      await revokeAllUserSessions(user.id);
    } catch (sessionError) {
      console.error("[account] session revocation failed", sessionError);
    }

    revalidatePath("/settings/account");
  } catch (unknownError) {
    console.error("[account] change password failed", unknownError);
    if (isUniqueViolation(unknownError)) {
      return error("Terjadi kesalahan saat mengubah password. Silakan coba lagi.");
    }
    return error("Terjadi kesalahan saat mengubah password. Silakan coba lagi.");
  }

  return {
    status: "success",
    message: "Password berhasil diubah. Silakan login kembali.",
  };
}
