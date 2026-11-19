"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  HOLIDAY_TYPES,
  employees,
  holidays,
  overtimeRequests,
  shifts,
  workGroupMembers,
  workGroups,
} from "@/db/schema";
import { writeAuditLog, type AuditAction } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import {
  finalApprovalBlock,
  managerStepTypes,
  recordManagerDecision,
  resolveManager,
} from "@/features/approval-chain/chain";
import { getEmployeeByUserId } from "@/features/employees/queries";

import { isTimeModuleReady, TIME_MIGRATION } from "./module";
import { CLOCK, MAX_OVERTIME_MINUTES, parseWorkingDays, spanMinutes } from "./rules";

/**
 * Time-management mutations (holidays, shifts, work groups, overtime).
 * Every action re-checks the session, the permission, that migration 0024 is
 * applied and that each referenced row belongs to the caller's organization.
 *
 * - holidays / shifts / work groups: attendance.manage
 * - own overtime (submit / cancel): attendance.view + a linked employee
 * - overtime on behalf of an employee: attendance.manage
 * - approve / reject overtime: attendance.approve or attendance.manage
 */

export interface TimeResult {
  ok: boolean;
  message: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const date = z
  .string()
  .regex(DATE, "Gunakan format tanggal YYYY-MM-DD.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Tanggal tidak valid.");
const clock = z.string().trim().regex(CLOCK, "Gunakan format jam HH:MM.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .optional()
    .transform((v) => (v ? v : null));

const holidaySchema = z.object({
  holidayDate: date,
  name: z.string().trim().min(2, "Nama hari libur wajib diisi.").max(150),
  holidayType: z.enum(HOLIDAY_TYPES),
});

const shiftSchema = z
  .object({
    name: z.string().trim().min(2, "Nama shift wajib diisi.").max(100),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Warna tidak valid.")
      .optional()
      .transform((v) => v ?? "#3B82F6"),
    startTime: clock,
    endTime: clock,
    breakMinutes: z.coerce.number().int().min(0, "Istirahat tidak boleh negatif.").max(600),
    workingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Pilih minimal satu hari kerja."),
  })
  .refine((v) => spanMinutes(v.startTime, v.endTime) !== null, {
    message: "Jam masuk dan jam pulang tidak boleh sama.",
    path: ["endTime"],
  })
  .refine((v) => (spanMinutes(v.startTime, v.endTime) ?? 0) > v.breakMinutes, {
    message: "Durasi istirahat harus lebih pendek dari jam kerja.",
    path: ["breakMinutes"],
  });

const groupSchema = z.object({
  name: z.string().trim().min(2, "Nama grup wajib diisi.").max(100),
  shiftId: z
    .union([z.string().regex(UUID), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  description: optionalText(500),
});

const overtimeSchema = z
  .object({
    overtimeDate: date,
    startTime: clock,
    endTime: clock,
    reason: z.string().trim().min(5, "Uraikan pekerjaan lembur (min. 5 karakter).").max(1000),
    spklNumber: optionalText(100),
  })
  .superRefine((v, ctx) => {
    const minutes = spanMinutes(v.startTime, v.endTime);
    if (minutes === null) {
      ctx.addIssue({ code: "custom", message: "Jam mulai dan selesai tidak boleh sama.", path: ["endTime"] });
    } else if (minutes > MAX_OVERTIME_MINUTES) {
      ctx.addIssue({ code: "custom", message: "Lembur maksimal 12 jam per pengajuan.", path: ["endTime"] });
    }
  });

function formObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Data tidak valid.";
}

type Context = { userId: string; organizationId: string; granted: Set<string> };

const NOT_READY: TimeResult = {
  ok: false,
  message: `Modul belum aktif: migrasi ${TIME_MIGRATION} belum dijalankan di server.`,
};
const FORBIDDEN: TimeResult = { ok: false, message: "Anda tidak memiliki akses untuk tindakan ini." };

async function authorize(anyOf: Permission[]): Promise<Context | TimeResult> {
  const user = await requireUser();
  const authorization = await getUserAuthorization(user.id);
  const granted = new Set<string>(authorization.permissionCodes);
  if (!authorization.isSuperAdmin && !anyOf.some((p) => granted.has(p))) return FORBIDDEN;
  if (!user.organizationId) {
    return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  }
  if (!(await isTimeModuleReady())) return NOT_READY;
  return { userId: user.id, organizationId: user.organizationId, granted };
}

const isContext = (value: Context | TimeResult): value is Context => "organizationId" in value;

async function audit(
  ctx: Context,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
) {
  try {
    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action,
      entityType,
      entityId,
      metadata,
    });
  } catch (error) {
    console.error("[time] audit failed", error);
  }
}

/** Postgres unique violation → friendly message. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ??
    (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

function revalidateTime() {
  revalidatePath("/time/calendar");
  revalidatePath("/time/shifts");
  revalidatePath("/overtime");
  revalidatePath("/overtime/management");
  revalidatePath("/approvals");
}

/* ------------------------------------------------------------------ */
/* Holidays                                                            */
/* ------------------------------------------------------------------ */

export async function saveHolidayAction(formData: FormData): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!isContext(ctx)) return ctx;
  const parsed = holidaySchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    const inserted = await db
      .insert(holidays)
      .values({ ...parsed.data, organizationId: ctx.organizationId })
      .returning({ id: holidays.id });
    await audit(ctx, "holiday.created", "holiday", inserted[0]?.id ?? null, parsed.data);
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "Hari libur ini sudah tercatat." };
    throw error;
  }
  revalidateTime();
  return { ok: true, message: "Hari libur ditambahkan." };
}

export async function deleteHolidayAction(id: string): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Hari libur tidak ditemukan." };
  const deleted = await db
    .delete(holidays)
    .where(and(eq(holidays.id, id), eq(holidays.organizationId, ctx.organizationId)))
    .returning({ name: holidays.name, holidayDate: holidays.holidayDate });
  if (!deleted[0]) return { ok: false, message: "Hari libur tidak ditemukan." };
  await audit(ctx, "holiday.deleted", "holiday", id, deleted[0]);
  revalidateTime();
  return { ok: true, message: "Hari libur dihapus." };
}

/* ------------------------------------------------------------------ */
/* Shifts                                                              */
/* ------------------------------------------------------------------ */

export async function saveShiftAction(id: string | null, formData: FormData): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!isContext(ctx)) return ctx;
  const parsed = shiftSchema.safeParse({
    ...formObject(formData),
    workingDays: formData.getAll("workingDays").map(String),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const values = {
    name: parsed.data.name,
    color: parsed.data.color,
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    breakMinutes: parsed.data.breakMinutes,
    workingDays: parseWorkingDays(parsed.data.workingDays.join(",")).join(","),
  };
  try {
    if (id) {
      if (!UUID.test(id)) return { ok: false, message: "Shift tidak ditemukan." };
      const updated = await db
        .update(shifts)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(shifts.id, id), eq(shifts.organizationId, ctx.organizationId)))
        .returning({ id: shifts.id });
      if (!updated[0]) return { ok: false, message: "Shift tidak ditemukan." };
      await audit(ctx, "shift.updated", "shift", id, values);
    } else {
      const inserted = await db
        .insert(shifts)
        .values({ ...values, organizationId: ctx.organizationId })
        .returning({ id: shifts.id });
      await audit(ctx, "shift.created", "shift", inserted[0]?.id ?? null, values);
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "Nama shift sudah dipakai." };
    throw error;
  }
  revalidateTime();
  return { ok: true, message: id ? "Shift diperbarui." : "Shift ditambahkan." };
}

export async function setShiftActiveAction(id: string, active: boolean): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Shift tidak ditemukan." };
  const updated = await db
    .update(shifts)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, ctx.organizationId)))
    .returning({ id: shifts.id });
  if (!updated[0]) return { ok: false, message: "Shift tidak ditemukan." };
  await audit(ctx, "shift.updated", "shift", id, { active });
  revalidateTime();
  return { ok: true, message: active ? "Shift diaktifkan." : "Shift dinonaktifkan." };
}

export async function deleteShiftAction(id: string): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Shift tidak ditemukan." };
  const used = await db
    .select({ id: workGroups.id })
    .from(workGroups)
    .where(and(eq(workGroups.shiftId, id), eq(workGroups.organizationId, ctx.organizationId)))
    .limit(1);
  if (used[0]) {
    return { ok: false, message: "Shift masih dipakai grup kerja. Ganti shift grup tersebut atau nonaktifkan shift." };
  }
  const deleted = await db
    .delete(shifts)
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, ctx.organizationId)))
    .returning({ name: shifts.name });
  if (!deleted[0]) return { ok: false, message: "Shift tidak ditemukan." };
  await audit(ctx, "shift.deleted", "shift", id, deleted[0]);
  revalidateTime();
  return { ok: true, message: "Shift dihapus." };
}

/* ------------------------------------------------------------------ */
/* Work groups                                                         */
/* ------------------------------------------------------------------ */

async function shiftInOrganization(shiftId: string, organizationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.organizationId, organizationId)))
    .limit(1);
  return Boolean(rows[0]);
}

export async function saveWorkGroupAction(id: string | null, formData: FormData): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!isContext(ctx)) return ctx;
  const parsed = groupSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (parsed.data.shiftId && !(await shiftInOrganization(parsed.data.shiftId, ctx.organizationId))) {
    return { ok: false, message: "Shift tidak ditemukan." };
  }
  try {
    if (id) {
      if (!UUID.test(id)) return { ok: false, message: "Grup kerja tidak ditemukan." };
      const updated = await db
        .update(workGroups)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(workGroups.id, id), eq(workGroups.organizationId, ctx.organizationId)))
        .returning({ id: workGroups.id });
      if (!updated[0]) return { ok: false, message: "Grup kerja tidak ditemukan." };
      await audit(ctx, "work_group.updated", "work_group", id, parsed.data);
    } else {
      const inserted = await db
        .insert(workGroups)
        .values({ ...parsed.data, organizationId: ctx.organizationId })
        .returning({ id: workGroups.id });
      await audit(ctx, "work_group.created", "work_group", inserted[0]?.id ?? null, parsed.data);
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "Nama grup kerja sudah dipakai." };
    throw error;
  }
  revalidateTime();
  return { ok: true, message: id ? "Grup kerja diperbarui." : "Grup kerja ditambahkan." };
}

export async function deleteWorkGroupAction(id: string): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Grup kerja tidak ditemukan." };
  // Members cascade with the group (membership only, no employee data).
  const deleted = await db
    .delete(workGroups)
    .where(and(eq(workGroups.id, id), eq(workGroups.organizationId, ctx.organizationId)))
    .returning({ name: workGroups.name });
  if (!deleted[0]) return { ok: false, message: "Grup kerja tidak ditemukan." };
  await audit(ctx, "work_group.deleted", "work_group", id, deleted[0]);
  revalidateTime();
  return { ok: true, message: "Grup kerja dihapus." };
}

/**
 * Replaces a group's members. An employee belongs to one group at a time:
 * picking someone who is in another group moves them here.
 */
export async function setWorkGroupMembersAction(groupId: string, employeeIds: string[]): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(groupId)) return { ok: false, message: "Grup kerja tidak ditemukan." };
  const ids = [...new Set(employeeIds)].filter((v) => UUID.test(v));
  if (ids.length > 2000) return { ok: false, message: "Terlalu banyak anggota dalam satu grup." };

  const group = await db
    .select({ id: workGroups.id })
    .from(workGroups)
    .where(and(eq(workGroups.id, groupId), eq(workGroups.organizationId, ctx.organizationId)))
    .limit(1);
  if (!group[0]) return { ok: false, message: "Grup kerja tidak ditemukan." };

  if (ids.length > 0) {
    const found = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.organizationId, ctx.organizationId), inArray(employees.id, ids)));
    if (found.length !== ids.length) return { ok: false, message: "Sebagian karyawan tidak ditemukan." };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(workGroupMembers)
      .where(and(eq(workGroupMembers.organizationId, ctx.organizationId), eq(workGroupMembers.workGroupId, groupId)));
    if (ids.length > 0) {
      // Move employees out of any other group first (one group per employee).
      await tx
        .delete(workGroupMembers)
        .where(
          and(
            eq(workGroupMembers.organizationId, ctx.organizationId),
            ne(workGroupMembers.workGroupId, groupId),
            inArray(workGroupMembers.employeeId, ids)
          )
        );
      await tx.insert(workGroupMembers).values(
        ids.map((employeeId) => ({ organizationId: ctx.organizationId, workGroupId: groupId, employeeId }))
      );
    }
  });
  await audit(ctx, "work_group.members_updated", "work_group", groupId, { members: ids.length });
  revalidateTime();
  return { ok: true, message: `Anggota grup disimpan (${ids.length} karyawan).` };
}

/* ------------------------------------------------------------------ */
/* Overtime                                                            */
/* ------------------------------------------------------------------ */

/** Own overtime request (self-service). */
export async function submitOvertimeAction(formData: FormData): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_VIEW]);
  if (!isContext(ctx)) return ctx;
  const self = await getEmployeeByUserId(ctx.userId, ctx.organizationId);
  if (!self) return { ok: false, message: "Akun Anda belum terhubung dengan data karyawan." };
  const parsed = overtimeSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const data = parsed.data;
  const inserted = await db
    .insert(overtimeRequests)
    .values({
      organizationId: ctx.organizationId,
      employeeId: self.id,
      overtimeDate: data.overtimeDate,
      startTime: data.startTime,
      endTime: data.endTime,
      totalMinutes: spanMinutes(data.startTime, data.endTime) ?? 0,
      reason: data.reason,
      spklNumber: data.spklNumber,
      status: "pending",
      submittedBy: ctx.userId,
    })
    .returning({ id: overtimeRequests.id });
  await audit(ctx, "overtime.submitted", "overtime_request", inserted[0]?.id ?? null, {
    overtimeDate: data.overtimeDate,
  });
  revalidateTime();
  return { ok: true, message: "Pengajuan lembur dikirim. Menunggu persetujuan." };
}

/** Cancels the caller's own pending request. */
export async function cancelOvertimeAction(id: string): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_VIEW]);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Pengajuan tidak ditemukan." };
  const self = await getEmployeeByUserId(ctx.userId, ctx.organizationId);
  if (!self) return { ok: false, message: "Akun Anda belum terhubung dengan data karyawan." };
  const updated = await db
    .update(overtimeRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(overtimeRequests.id, id),
        eq(overtimeRequests.organizationId, ctx.organizationId),
        eq(overtimeRequests.employeeId, self.id),
        eq(overtimeRequests.status, "pending")
      )
    )
    .returning({ id: overtimeRequests.id });
  if (!updated[0]) return { ok: false, message: "Hanya pengajuan yang masih menunggu yang bisa dibatalkan." };
  await audit(ctx, "overtime.cancelled", "overtime_request", id, {});
  revalidateTime();
  return { ok: true, message: "Pengajuan lembur dibatalkan." };
}

/** HR records overtime for an employee (approved immediately: an SPKL). */
export async function createOvertimeForEmployeeAction(formData: FormData): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!isContext(ctx)) return ctx;
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!UUID.test(employeeId)) return { ok: false, message: "Pilih karyawan." };
  const employee = await db
    .select({ id: employees.id, employeeNumber: employees.employeeNumber })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, ctx.organizationId)))
    .limit(1);
  if (!employee[0]) return { ok: false, message: "Karyawan tidak ditemukan di organisasi ini." };
  const parsed = overtimeSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const data = parsed.data;
  const now = new Date();
  const inserted = await db
    .insert(overtimeRequests)
    .values({
      organizationId: ctx.organizationId,
      employeeId,
      overtimeDate: data.overtimeDate,
      startTime: data.startTime,
      endTime: data.endTime,
      totalMinutes: spanMinutes(data.startTime, data.endTime) ?? 0,
      reason: data.reason,
      spklNumber: data.spklNumber,
      status: "approved",
      submittedBy: ctx.userId,
      reviewedBy: ctx.userId,
      reviewedAt: now,
      reviewerNote: "Dicatat oleh HR (SPKL).",
    })
    .returning({ id: overtimeRequests.id });
  await audit(ctx, "overtime.created", "overtime_request", inserted[0]?.id ?? null, {
    employeeNumber: employee[0].employeeNumber,
    overtimeDate: data.overtimeDate,
  });
  revalidateTime();
  return { ok: true, message: "Lembur dicatat dan disetujui." };
}

/** Approve or reject a pending request. */
export async function reviewOvertimeAction(
  id: string,
  decision: "approved" | "rejected",
  note: string
): Promise<TimeResult> {
  const ctx = await authorize([PERMISSIONS.ATTENDANCE_APPROVE, PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Pengajuan tidak ditemukan." };
  if (decision !== "approved" && decision !== "rejected") return { ok: false, message: "Keputusan tidak valid." };
  const trimmed = note.trim().slice(0, 500);
  if (decision === "rejected" && trimmed.length < 3) {
    return { ok: false, message: "Tuliskan alasan penolakan." };
  }
  const self = await getEmployeeByUserId(ctx.userId, ctx.organizationId);
  const target = await db
    .select({ employeeId: overtimeRequests.employeeId })
    .from(overtimeRequests)
    .where(and(eq(overtimeRequests.id, id), eq(overtimeRequests.organizationId, ctx.organizationId)))
    .limit(1);
  if (!target[0]) return { ok: false, message: "Pengajuan tidak ditemukan." };
  if (self && target[0].employeeId === self.id) {
    return { ok: false, message: "Anda tidak dapat meninjau pengajuan lembur Anda sendiri." };
  }
  // Two-level approval (opt-in): the direct manager decides first.
  const blocked = await finalApprovalBlock(ctx.organizationId, "overtime", id, target[0].employeeId, ctx.userId);
  if (blocked) return { ok: false, message: blocked };
  const updated = await db
    .update(overtimeRequests)
    .set({
      status: decision,
      reviewedBy: ctx.userId,
      reviewedAt: new Date(),
      reviewerNote: trimmed || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(overtimeRequests.id, id),
        eq(overtimeRequests.organizationId, ctx.organizationId),
        eq(overtimeRequests.status, "pending")
      )
    )
    .returning({ id: overtimeRequests.id });
  if (!updated[0]) return { ok: false, message: "Pengajuan sudah diproses sebelumnya." };
  await audit(ctx, decision === "approved" ? "overtime.approved" : "overtime.rejected", "overtime_request", id, {
    note: trimmed || null,
  });
  revalidateTime();
  return { ok: true, message: decision === "approved" ? "Lembur disetujui." : "Lembur ditolak." };
}

/**
 * Two-level approval: the employee's DIRECT MANAGER approves (the request
 * then waits for the final approver) or rejects (the request is rejected).
 * Only when the manager step is on for overtime.
 */
export async function managerReviewOvertimeAction(
  id: string,
  decision: "approved" | "rejected",
  note: string
): Promise<TimeResult> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  if (!(await isTimeModuleReady())) return NOT_READY;
  if (!UUID.test(id)) return { ok: false, message: "Pengajuan tidak ditemukan." };
  if (decision !== "approved" && decision !== "rejected") return { ok: false, message: "Keputusan tidak valid." };
  if (!(await managerStepTypes(organizationId)).has("overtime")) {
    return { ok: false, message: "Persetujuan atasan tidak aktif untuk lembur." };
  }
  const reviewerNote = note.trim().slice(0, 500) || null;
  if (decision === "rejected" && !reviewerNote) return { ok: false, message: "Tuliskan alasan penolakan." };
  const target = (
    await db
      .select({ employeeId: overtimeRequests.employeeId, status: overtimeRequests.status })
      .from(overtimeRequests)
      .where(and(eq(overtimeRequests.id, id), eq(overtimeRequests.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!target) return { ok: false, message: "Pengajuan tidak ditemukan." };
  if (target.status !== "pending") return { ok: false, message: "Pengajuan sudah diproses sebelumnya." };
  const manager = await resolveManager(organizationId, target.employeeId);
  if (manager.employeeUserId === user.id) return { ok: false, message: "Anda tidak dapat meninjau pengajuan lembur Anda sendiri." };
  if (manager.managerUserId !== user.id) {
    return { ok: false, message: "Hanya atasan langsung karyawan ini yang dapat memberi keputusan." };
  }
  const recorded = await recordManagerDecision(organizationId, "overtime", id, user.id, decision, reviewerNote);
  if (!recorded) return { ok: false, message: "Keputusan atasan untuk pengajuan ini sudah tercatat." };
  const ctx: Context = { userId: user.id, organizationId, granted: new Set() };
  if (decision === "rejected") {
    await db
      .update(overtimeRequests)
      .set({ status: "rejected", reviewedBy: user.id, reviewedAt: new Date(), reviewerNote, updatedAt: new Date() })
      .where(and(eq(overtimeRequests.id, id), eq(overtimeRequests.organizationId, organizationId), eq(overtimeRequests.status, "pending")));
    await audit(ctx, "overtime.rejected", "overtime_request", id, { note: reviewerNote, by: "manager" });
  } else {
    await audit(ctx, "overtime.manager_approved", "overtime_request", id, {});
  }
  revalidateTime();
  return { ok: true, message: decision === "approved" ? "Disetujui atasan. Menunggu keputusan HR." : "Lembur ditolak." };
}
