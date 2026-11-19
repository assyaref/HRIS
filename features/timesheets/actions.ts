"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { employees, projects, timesheetEntries } from "@/db/schema";
import { writeAuditLog, type AuditAction } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { todayKey } from "@/features/reference-shared";

import { isTimesheetModuleReady, TIMESHEET_MIGRATION } from "./module";
import { isEditable, MAX_MINUTES_DAY_TOTAL, parseDuration, weekStartOf } from "./rules";

/**
 * Timesheet mutations.
 * - own entries (save, delete, submit week): attendance.view + linked employee;
 *   only while the week's entries are draft or rejected; no future dates.
 * - review an employee-week: attendance.approve or attendance.manage, never
 *   one's own timesheet.
 */

export interface TimesheetResult {
  ok: boolean;
  message: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_READY: TimesheetResult = { ok: false, message: `Fitur belum aktif: migrasi ${TIMESHEET_MIGRATION} belum dijalankan di server.` };
const FORBIDDEN: TimesheetResult = { ok: false, message: "Anda tidak memiliki akses untuk tindakan ini." };

type Ctx = { userId: string; organizationId: string; employeeId: string | null; canReview: boolean; canSelf: boolean };

async function context(): Promise<Ctx | TimesheetResult> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  if (!(await isTimesheetModuleReady())) return NOT_READY;
  const authorization = await getUserAuthorization(user.id);
  const granted = new Set<string>(authorization.permissionCodes);
  const all = authorization.isSuperAdmin;
  const employee = await getEmployeeByUserId(user.id, organizationId);
  return {
    userId: user.id,
    organizationId,
    employeeId: employee?.id ?? null,
    canSelf: all || granted.has(PERMISSIONS.ATTENDANCE_VIEW),
    canReview: all || granted.has(PERMISSIONS.ATTENDANCE_APPROVE) || granted.has(PERMISSIONS.ATTENDANCE_MANAGE),
  };
}
const isCtx = (v: Ctx | TimesheetResult): v is Ctx => "organizationId" in v;

async function audit(ctx: Ctx, action: AuditAction, entityId: string | null, metadata: Record<string, unknown>) {
  try {
    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action,
      entityType: "timesheet",
      entityId,
      metadata,
    });
  } catch (error) {
    console.error("[timesheet] audit failed", error);
  }
}

function revalidate() {
  revalidatePath("/timesheet");
  revalidatePath("/timesheet/management");
  revalidatePath("/approvals");
  revalidatePath("/notifications");
}

/** Statuses of an employee's entries in a week. */
async function weekStatuses(ctx: Ctx, employeeId: string, weekStart: string, excludeId?: string): Promise<string[]> {
  const where = [
    eq(timesheetEntries.organizationId, ctx.organizationId),
    eq(timesheetEntries.employeeId, employeeId),
    eq(timesheetEntries.weekStart, weekStart),
  ];
  if (excludeId) where.push(ne(timesheetEntries.id, excludeId));
  const rows = await db.select({ status: timesheetEntries.status }).from(timesheetEntries).where(and(...where));
  return rows.map((r) => r.status);
}

const entrySchema = z.object({
  workDate: z
    .string()
    .regex(DATE, "Tanggal tidak valid.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Tanggal tidak valid."),
  projectId: z
    .union([z.string().regex(UUID), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  task: z.string().trim().min(3, "Uraikan pekerjaan (min. 3 karakter).").max(200, "Uraian maksimal 200 karakter."),
  duration: z.string(),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function saveEntryAction(id: string | null, formData: FormData): Promise<TimesheetResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.canSelf) return FORBIDDEN;
  if (!ctx.employeeId) return { ok: false, message: "Akun Anda belum terhubung dengan data karyawan." };
  const parsed = entrySchema.safeParse({
    workDate: formData.get("workDate") ?? "",
    projectId: formData.get("projectId") ?? "",
    task: formData.get("task") ?? "",
    duration: formData.get("duration") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const data = parsed.data;
  const minutes = parseDuration(data.duration);
  if (minutes === null) return { ok: false, message: "Durasi tidak valid. Contoh: 1:30, 1,5 atau 90m (maks. 16 jam)." };
  if (data.workDate > todayKey()) return { ok: false, message: "Timesheet tidak bisa diisi untuk tanggal yang akan datang." };
  if (data.projectId) {
    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.organizationId, ctx.organizationId)))
      .limit(1);
    if (!project[0]) return { ok: false, message: "Proyek tidak ditemukan." };
  }

  const weekStart = weekStartOf(data.workDate);
  if (id) {
    if (!UUID.test(id)) return { ok: false, message: "Entri tidak ditemukan." };
    const current = (
      await db
        .select({ status: timesheetEntries.status, weekStart: timesheetEntries.weekStart })
        .from(timesheetEntries)
        .where(
          and(
            eq(timesheetEntries.id, id),
            eq(timesheetEntries.organizationId, ctx.organizationId),
            eq(timesheetEntries.employeeId, ctx.employeeId)
          )
        )
        .limit(1)
    )[0];
    if (!current) return { ok: false, message: "Entri tidak ditemukan." };
    if (!isEditable(current.status)) return { ok: false, message: "Entri yang sudah diajukan atau disetujui tidak bisa diubah." };
  }
  const others = await weekStatuses(ctx, ctx.employeeId, weekStart, id ?? undefined);
  if (others.some((s) => !isEditable(s))) {
    return { ok: false, message: "Minggu ini sudah diajukan / disetujui. Pilih minggu lain." };
  }
  const dayTotal = await db
    .select({ total: sql<number>`COALESCE(SUM(${timesheetEntries.minutes}), 0)::int` })
    .from(timesheetEntries)
    .where(
      and(
        eq(timesheetEntries.organizationId, ctx.organizationId),
        eq(timesheetEntries.employeeId, ctx.employeeId),
        eq(timesheetEntries.workDate, data.workDate),
        ...(id ? [ne(timesheetEntries.id, id)] : [])
      )
    );
  if ((dayTotal[0]?.total ?? 0) + minutes > MAX_MINUTES_DAY_TOTAL) {
    return { ok: false, message: "Total jam pada hari itu melebihi 24 jam." };
  }

  const values = {
    workDate: data.workDate,
    weekStart,
    projectId: data.projectId,
    task: data.task,
    minutes,
    notes: data.notes,
    // Editing a rejected entry starts a new draft.
    status: "draft",
    reviewedBy: null,
    reviewedAt: null,
    reviewerNote: null,
    updatedAt: new Date(),
  };
  let entryId = id;
  if (id) {
    await db
      .update(timesheetEntries)
      .set(values)
      .where(and(eq(timesheetEntries.id, id), eq(timesheetEntries.organizationId, ctx.organizationId)));
  } else {
    const inserted = await db
      .insert(timesheetEntries)
      .values({ ...values, organizationId: ctx.organizationId, employeeId: ctx.employeeId })
      .returning({ id: timesheetEntries.id });
    entryId = inserted[0]?.id ?? null;
  }
  await audit(ctx, "timesheet.entry_saved", entryId, { workDate: data.workDate, minutes });
  revalidate();
  return { ok: true, message: id ? "Entri diperbarui." : "Entri ditambahkan." };
}

export async function deleteEntryAction(id: string): Promise<TimesheetResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.canSelf || !ctx.employeeId) return FORBIDDEN;
  if (!UUID.test(id)) return { ok: false, message: "Entri tidak ditemukan." };
  const deleted = await db
    .delete(timesheetEntries)
    .where(
      and(
        eq(timesheetEntries.id, id),
        eq(timesheetEntries.organizationId, ctx.organizationId),
        eq(timesheetEntries.employeeId, ctx.employeeId),
        inArray(timesheetEntries.status, ["draft", "rejected"])
      )
    )
    .returning({ workDate: timesheetEntries.workDate });
  if (!deleted[0]) return { ok: false, message: "Hanya entri draf / ditolak yang bisa dihapus." };
  await audit(ctx, "timesheet.entry_deleted", id, { workDate: deleted[0].workDate });
  revalidate();
  return { ok: true, message: "Entri dihapus." };
}

export async function submitWeekAction(weekStart: string): Promise<TimesheetResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.canSelf || !ctx.employeeId) return FORBIDDEN;
  if (!DATE.test(weekStart) || weekStartOf(weekStart) !== weekStart) return { ok: false, message: "Minggu tidak valid." };
  const updated = await db
    .update(timesheetEntries)
    .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(timesheetEntries.organizationId, ctx.organizationId),
        eq(timesheetEntries.employeeId, ctx.employeeId),
        eq(timesheetEntries.weekStart, weekStart),
        inArray(timesheetEntries.status, ["draft", "rejected"])
      )
    )
    .returning({ minutes: timesheetEntries.minutes });
  if (updated.length === 0) return { ok: false, message: "Tidak ada entri draf untuk diajukan di minggu ini." };
  await audit(ctx, "timesheet.week_submitted", null, {
    weekStart,
    entries: updated.length,
    minutes: updated.reduce((s, r) => s + r.minutes, 0),
  });
  revalidate();
  return { ok: true, message: "Timesheet minggu ini diajukan." };
}

export async function reviewWeekAction(
  employeeId: string,
  weekStart: string,
  decision: "approved" | "rejected",
  note: string
): Promise<TimesheetResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.canReview) return FORBIDDEN;
  if (!UUID.test(employeeId) || !DATE.test(weekStart)) return { ok: false, message: "Data tidak valid." };
  if (decision !== "approved" && decision !== "rejected") return { ok: false, message: "Keputusan tidak valid." };
  if (ctx.employeeId === employeeId) return { ok: false, message: "Anda tidak dapat meninjau timesheet Anda sendiri." };
  const reviewerNote = note.trim().slice(0, 500) || null;
  if (decision === "rejected" && !reviewerNote) return { ok: false, message: "Tuliskan alasan penolakan." };
  const employee = await db
    .select({ id: employees.id, employeeNumber: employees.employeeNumber })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, ctx.organizationId)))
    .limit(1);
  if (!employee[0]) return { ok: false, message: "Karyawan tidak ditemukan." };
  const updated = await db
    .update(timesheetEntries)
    .set({ status: decision, reviewedBy: ctx.userId, reviewedAt: new Date(), reviewerNote, updatedAt: new Date() })
    .where(
      and(
        eq(timesheetEntries.organizationId, ctx.organizationId),
        eq(timesheetEntries.employeeId, employeeId),
        eq(timesheetEntries.weekStart, weekStart),
        eq(timesheetEntries.status, "submitted")
      )
    )
    .returning({ id: timesheetEntries.id });
  if (updated.length === 0) return { ok: false, message: "Tidak ada timesheet yang menunggu di minggu ini." };
  await audit(ctx, decision === "approved" ? "timesheet.week_approved" : "timesheet.week_rejected", null, {
    employeeNumber: employee[0].employeeNumber,
    weekStart,
    entries: updated.length,
    note: reviewerNote,
  });
  revalidate();
  return { ok: true, message: decision === "approved" ? "Timesheet disetujui." : "Timesheet ditolak." };
}
