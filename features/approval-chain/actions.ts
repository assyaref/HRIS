"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { APPROVAL_REQUEST_TYPES, approvalSettings } from "@/db/schema";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import { APPROVAL_CHAIN_MIGRATION, isApprovalChainReady } from "./chain";

export interface ApprovalChainResult {
  ok: boolean;
  message: string;
}

/** Turns the direct-manager step on / off per request type (settings.manage). */
export async function saveApprovalSettingsAction(formData: FormData): Promise<ApprovalChainResult> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  const authorization = await getUserAuthorization(user.id);
  if (!authorization.isSuperAdmin && !authorization.permissionCodes.includes(PERMISSIONS.SETTINGS_MANAGE)) {
    return { ok: false, message: "Anda tidak memiliki akses untuk tindakan ini." };
  }
  if (!(await isApprovalChainReady())) {
    return { ok: false, message: `Fitur belum aktif: migrasi ${APPROVAL_CHAIN_MIGRATION} belum dijalankan di server.` };
  }
  const values: Record<string, boolean> = {};
  for (const type of APPROVAL_REQUEST_TYPES) {
    const managerStep = formData.get(type) === "on";
    values[type] = managerStep;
    await db
      .insert(approvalSettings)
      .values({ organizationId, requestType: type, managerStep, updatedBy: user.id })
      .onConflictDoUpdate({
        target: [approvalSettings.organizationId, approvalSettings.requestType],
        set: { managerStep, updatedBy: user.id, updatedAt: new Date() },
      });
  }
  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "approval_settings.updated",
      entityType: "approval_settings",
      entityId: null,
      metadata: values,
    });
  } catch (error) {
    console.error("[approval-chain] audit failed", error);
  }
  revalidatePath("/settings/approval-flow");
  revalidatePath("/approvals");
  revalidatePath("/team-approvals");
  return { ok: true, message: "Pengaturan alur persetujuan disimpan." };
}
