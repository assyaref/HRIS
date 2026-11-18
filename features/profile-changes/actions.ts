"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { employees, profileChangeRequests } from "@/db/schema";
import { writeAuditLog, type AuditAction } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";

import {
  CHANGEABLE_FIELD_KEYS,
  diffProfile,
  fieldLabel,
  isChangeableField,
  validateFieldValue,
  type ChangeableField,
} from "./fields";
import { isProfileChangeModuleReady, PROFILE_CHANGE_MIGRATION } from "./module";
import { getChangeableProfile } from "./queries";

/**
 * Profile change requests.
 * - submit / cancel: the signed-in employee, for their own linked record.
 * - approve / reject: employees.view + employees.personal.update (the same
 *   permissions that edit the Personal section of a profile), never one's own.
 * Approval re-validates every value and applies it to `employees` in a
 * transaction together with the status change.
 */

export interface ProfileChangeResult {
  ok: boolean;
  message: string;
  fieldErrors?: Partial<Record<ChangeableField, string>>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_READY: ProfileChangeResult = {
  ok: false,
  message: `Fitur belum aktif: migrasi ${PROFILE_CHANGE_MIGRATION} belum dijalankan di server.`,
};

async function audit(
  organizationId: string,
  userId: string,
  action: AuditAction,
  entityId: string | null,
  metadata: Record<string, unknown>
) {
  try {
    await writeAuditLog({
      organizationId,
      actorUserId: userId,
      action,
      entityType: "profile_change_request",
      entityId,
      metadata,
    });
  } catch (error) {
    console.error("[profile-change] audit failed", error);
  }
}

function revalidate() {
  revalidatePath("/settings/account");
  revalidatePath("/profile-changes");
  revalidatePath("/approvals");
}

type SelfContext =
  | { error: string }
  | { error?: undefined; userId: string; organizationId: string; employeeId: string };

async function selfContext(): Promise<SelfContext> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) return { error: "Akun Anda belum terhubung ke organisasi." };
  if (!(await isProfileChangeModuleReady())) return { error: NOT_READY.message };
  const employee = await getEmployeeByUserId(user.id, organizationId);
  if (!employee) return { error: "Akun Anda belum terhubung dengan data karyawan." };
  return { userId: user.id, organizationId, employeeId: employee.id };
}

export async function submitProfileChangeAction(formData: FormData): Promise<ProfileChangeResult> {
  const ctx = await selfContext();
  if (ctx.error !== undefined) return { ok: false, message: ctx.error };

  const pending = await db
    .select({ id: profileChangeRequests.id })
    .from(profileChangeRequests)
    .where(
      and(
        eq(profileChangeRequests.organizationId, ctx.organizationId),
        eq(profileChangeRequests.employeeId, ctx.employeeId),
        eq(profileChangeRequests.status, "pending")
      )
    )
    .limit(1);
  if (pending[0]) {
    return { ok: false, message: "Masih ada pengajuan yang menunggu. Batalkan atau tunggu keputusan HR." };
  }

  const current = await getChangeableProfile(ctx.employeeId, ctx.organizationId);
  if (!current) return { ok: false, message: "Data karyawan tidak ditemukan." };
  const input: Record<string, string> = {};
  for (const field of CHANGEABLE_FIELD_KEYS) {
    const value = formData.get(field);
    if (typeof value === "string") input[field] = value;
  }
  const { changes, errors } = diffProfile(current, input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, message: Object.values(errors)[0] ?? "Data tidak valid.", fieldErrors: errors };
  }
  if (Object.keys(changes).length === 0) return { ok: false, message: "Tidak ada data yang berubah." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;

  const inserted = await db
    .insert(profileChangeRequests)
    .values({
      organizationId: ctx.organizationId,
      employeeId: ctx.employeeId,
      changes,
      note,
      status: "pending",
      submittedBy: ctx.userId,
    })
    .returning({ id: profileChangeRequests.id });
  await audit(ctx.organizationId, ctx.userId, "profile_change.submitted", inserted[0]?.id ?? null, {
    fields: Object.keys(changes),
  });
  revalidate();
  return { ok: true, message: "Pengajuan perubahan data dikirim ke HR." };
}

export async function cancelProfileChangeAction(id: string): Promise<ProfileChangeResult> {
  const ctx = await selfContext();
  if (ctx.error !== undefined) return { ok: false, message: ctx.error };
  if (!UUID.test(id)) return { ok: false, message: "Pengajuan tidak ditemukan." };
  const updated = await db
    .update(profileChangeRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(profileChangeRequests.id, id),
        eq(profileChangeRequests.organizationId, ctx.organizationId),
        eq(profileChangeRequests.employeeId, ctx.employeeId),
        eq(profileChangeRequests.status, "pending")
      )
    )
    .returning({ id: profileChangeRequests.id });
  if (!updated[0]) return { ok: false, message: "Hanya pengajuan yang masih menunggu yang bisa dibatalkan." };
  await audit(ctx.organizationId, ctx.userId, "profile_change.cancelled", id, {});
  revalidate();
  return { ok: true, message: "Pengajuan dibatalkan." };
}

export async function reviewProfileChangeAction(
  id: string,
  decision: "approved" | "rejected",
  note: string
): Promise<ProfileChangeResult> {
  const user = await requireUser();
  const authorization = await getUserAuthorization(user.id);
  const granted = new Set<string>(authorization.permissionCodes);
  const allowed =
    authorization.isSuperAdmin ||
    (granted.has(PERMISSIONS.EMPLOYEES_VIEW) && granted.has(PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE));
  if (!allowed) return { ok: false, message: "Anda tidak memiliki akses untuk tindakan ini." };
  if (!user.organizationId) return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  const organizationId = user.organizationId;
  if (!(await isProfileChangeModuleReady())) return NOT_READY;
  if (!UUID.test(id)) return { ok: false, message: "Pengajuan tidak ditemukan." };
  if (decision !== "approved" && decision !== "rejected") return { ok: false, message: "Keputusan tidak valid." };
  const reviewerNote = note.trim().slice(0, 500) || null;
  if (decision === "rejected" && !reviewerNote) return { ok: false, message: "Tuliskan alasan penolakan." };

  const rows = await db
    .select({
      employeeId: profileChangeRequests.employeeId,
      changes: profileChangeRequests.changes,
      status: profileChangeRequests.status,
      employeeUserId: employees.userId,
    })
    .from(profileChangeRequests)
    .innerJoin(employees, eq(employees.id, profileChangeRequests.employeeId))
    .where(and(eq(profileChangeRequests.id, id), eq(profileChangeRequests.organizationId, organizationId)))
    .limit(1);
  const request = rows[0];
  if (!request) return { ok: false, message: "Pengajuan tidak ditemukan." };
  if (request.status !== "pending") return { ok: false, message: "Pengajuan sudah diproses sebelumnya." };
  if (request.employeeUserId === user.id) {
    return { ok: false, message: "Anda tidak dapat meninjau perubahan data Anda sendiri." };
  }

  // Re-validate every value (defence in depth) and build the update.
  const update: Record<string, string | Date | null> = {};
  for (const [field, change] of Object.entries(request.changes ?? {})) {
    if (!isChangeableField(field)) return { ok: false, message: `Kolom ${field} tidak dapat diubah lewat pengajuan.` };
    const error = validateFieldValue(field, change.to);
    if (error) return { ok: false, message: `${fieldLabel(field)}: ${error}` };
    update[field] = field === "birthDate" && change.to ? new Date(`${change.to}T00:00:00Z`) : change.to;
  }

  try {
    const done = await db.transaction(async (tx) => {
      const marked = await tx
        .update(profileChangeRequests)
        .set({ status: decision, reviewedBy: user.id, reviewedAt: new Date(), reviewerNote, updatedAt: new Date() })
        .where(
          and(
            eq(profileChangeRequests.id, id),
            eq(profileChangeRequests.organizationId, organizationId),
            eq(profileChangeRequests.status, "pending")
          )
        )
        .returning({ id: profileChangeRequests.id });
      if (!marked[0]) return false;
      if (decision === "approved" && Object.keys(update).length > 0) {
        await tx
          .update(employees)
          .set({ ...update, updatedAt: new Date() })
          .where(and(eq(employees.id, request.employeeId), eq(employees.organizationId, organizationId)));
      }
      return true;
    });
    if (!done) return { ok: false, message: "Pengajuan sudah diproses sebelumnya." };
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code ??
      (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return { ok: false, message: "NIK tersebut sudah dipakai karyawan lain." };
    throw error;
  }

  await audit(
    organizationId,
    user.id,
    decision === "approved" ? "profile_change.approved" : "profile_change.rejected",
    id,
    { employeeId: request.employeeId, changes: request.changes, note: reviewerNote }
  );
  revalidate();
  revalidatePath(`/employees/${request.employeeId}`);
  return {
    ok: true,
    message: decision === "approved" ? "Perubahan disetujui dan diterapkan ke profil." : "Pengajuan ditolak.",
  };
}
