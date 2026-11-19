"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { AGENDA_CATEGORIES, AGENDA_RESPONSES, agendaEvents, agendaResponses, employees } from "@/db/schema";
import { writeAuditLog, type AuditAction } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { localInstant } from "@/features/time/schedule";

import { AGENDA_MIGRATION, isAgendaReady } from "./module";
import { isForDepartment, parseAudience, TIME } from "./rules";

/**
 * Agenda mutations.
 * - create / edit / cancel events: announcements.create (the people who
 *   publish company information);
 * - RSVP: any employee the event is for (linked employee record).
 * Times are entered in the app time zone (Asia/Jakarta).
 */

export interface AgendaResult {
  ok: boolean;
  message: string;
  id?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_READY: AgendaResult = { ok: false, message: `Fitur belum aktif: migrasi ${AGENDA_MIGRATION} belum dijalankan di server.` };

type Ctx = { userId: string; organizationId: string; canManage: boolean };

async function context(): Promise<Ctx | AgendaResult> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  if (!(await isAgendaReady())) return NOT_READY;
  const authorization = await getUserAuthorization(user.id);
  return {
    userId: user.id,
    organizationId,
    canManage: authorization.isSuperAdmin || authorization.permissionCodes.includes(PERMISSIONS.ANNOUNCEMENTS_CREATE),
  };
}
const isCtx = (v: Ctx | AgendaResult): v is Ctx => "organizationId" in v;
const FORBIDDEN: AgendaResult = { ok: false, message: "Anda tidak memiliki akses untuk tindakan ini." };

async function audit(ctx: Ctx, action: AuditAction, entityId: string | null, metadata: Record<string, unknown>) {
  try {
    await writeAuditLog({ organizationId: ctx.organizationId, actorUserId: ctx.userId, action, entityType: "agenda_event", entityId, metadata });
  } catch (error) {
    console.error("[agenda] audit failed", error);
  }
}

function revalidate(id?: string) {
  revalidatePath("/agenda");
  revalidatePath("/agenda/management");
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/agenda/${id}`);
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const eventSchema = z
  .object({
    title: z.string().trim().min(3, "Judul minimal 3 karakter.").max(150),
    description: z
      .string()
      .trim()
      .max(3000)
      .optional()
      .transform((v) => (v ? v : null)),
    category: z.enum(AGENDA_CATEGORIES),
    date: z.string().regex(DATE, "Tanggal tidak valid."),
    endDate: z
      .union([z.string().regex(DATE), z.literal("")])
      .optional()
      .transform((v) => (v ? v : null)),
    allDay: z.boolean(),
    startTime: z.union([z.string().regex(TIME), z.literal("")]).optional(),
    endTime: z.union([z.string().regex(TIME), z.literal("")]).optional(),
    location: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v ? v : null)),
    requireRsvp: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.allDay && (!v.startTime || !v.endTime)) ctx.addIssue({ code: "custom", message: "Isi jam mulai dan selesai.", path: ["startTime"] });
    if (v.endDate && v.endDate < v.date) ctx.addIssue({ code: "custom", message: "Tanggal selesai tidak boleh sebelum tanggal mulai.", path: ["endDate"] });
  });

function toInstants(v: z.infer<typeof eventSchema>): { startAt: Date; endAt: Date } | null {
  const endDay = v.endDate ?? v.date;
  const startAt = localInstant(v.date, v.allDay ? 0 : minutesOf(v.startTime!), APP_TIME_ZONE);
  const endAt = localInstant(endDay, v.allDay ? 24 * 60 - 1 : minutesOf(v.endTime!), APP_TIME_ZONE);
  return endAt > startAt ? { startAt, endAt } : null;
}

export async function saveAgendaEventAction(id: string | null, formData: FormData): Promise<AgendaResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.canManage) return FORBIDDEN;
  const parsed = eventSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? "meeting"),
    date: String(formData.get("date") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    allDay: formData.get("allDay") === "on",
    startTime: String(formData.get("startTime") ?? ""),
    endTime: String(formData.get("endTime") ?? ""),
    location: String(formData.get("location") ?? ""),
    requireRsvp: formData.get("requireRsvp") === "on",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const when = toInstants(parsed.data);
  if (!when) return { ok: false, message: "Waktu selesai harus setelah waktu mulai." };
  const values = {
    title: parsed.data.title,
    description: parsed.data.description,
    category: parsed.data.category,
    allDay: parsed.data.allDay,
    location: parsed.data.location,
    requireRsvp: parsed.data.requireRsvp,
    audienceDepartments: parseAudience(formData.getAll("audience").map(String)),
    ...when,
  };
  let eventId = id;
  if (id) {
    if (!UUID.test(id)) return { ok: false, message: "Agenda tidak ditemukan." };
    const updated = await db
      .update(agendaEvents)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(agendaEvents.id, id), eq(agendaEvents.organizationId, ctx.organizationId)))
      .returning({ id: agendaEvents.id });
    if (!updated[0]) return { ok: false, message: "Agenda tidak ditemukan." };
    await audit(ctx, "agenda.updated", id, { title: values.title });
  } else {
    const inserted = await db
      .insert(agendaEvents)
      .values({ ...values, organizationId: ctx.organizationId, createdBy: ctx.userId })
      .returning({ id: agendaEvents.id });
    eventId = inserted[0]?.id ?? null;
    await audit(ctx, "agenda.created", eventId, { title: values.title });
  }
  revalidate(eventId ?? undefined);
  return { ok: true, message: id ? "Agenda diperbarui." : "Agenda dibuat.", id: eventId ?? undefined };
}

export async function setAgendaCancelledAction(id: string, cancelled: boolean): Promise<AgendaResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.canManage) return FORBIDDEN;
  if (!UUID.test(id)) return { ok: false, message: "Agenda tidak ditemukan." };
  const updated = await db
    .update(agendaEvents)
    .set({ cancelled, updatedAt: new Date() })
    .where(and(eq(agendaEvents.id, id), eq(agendaEvents.organizationId, ctx.organizationId)))
    .returning({ title: agendaEvents.title });
  if (!updated[0]) return { ok: false, message: "Agenda tidak ditemukan." };
  await audit(ctx, cancelled ? "agenda.cancelled" : "agenda.updated", id, { title: updated[0].title, cancelled });
  revalidate(id);
  return { ok: true, message: cancelled ? "Agenda dibatalkan." : "Agenda diaktifkan kembali." };
}

export async function respondAgendaAction(eventId: string, response: string, note: string): Promise<AgendaResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!UUID.test(eventId)) return { ok: false, message: "Agenda tidak ditemukan." };
  if (!(AGENDA_RESPONSES as readonly string[]).includes(response)) return { ok: false, message: "Jawaban tidak valid." };
  const user = await requireUser();
  const employee = await getEmployeeByUserId(user.id, ctx.organizationId);
  if (!employee) return { ok: false, message: "Akun Anda belum terhubung dengan data karyawan." };
  const [event, me] = await Promise.all([
    db
      .select({ audience: agendaEvents.audienceDepartments, cancelled: agendaEvents.cancelled, endAt: agendaEvents.endAt })
      .from(agendaEvents)
      .where(and(eq(agendaEvents.id, eventId), eq(agendaEvents.organizationId, ctx.organizationId)))
      .limit(1),
    db.select({ department: employees.department }).from(employees).where(eq(employees.id, employee.id)).limit(1),
  ]);
  if (!event[0]) return { ok: false, message: "Agenda tidak ditemukan." };
  if (event[0].cancelled) return { ok: false, message: "Agenda ini sudah dibatalkan." };
  if (event[0].endAt < new Date()) return { ok: false, message: "Agenda ini sudah lewat." };
  if (!isForDepartment(event[0].audience, me[0]?.department ?? null)) return { ok: false, message: "Agenda ini bukan untuk departemen Anda." };
  const text = note.trim().slice(0, 300) || null;
  await db
    .insert(agendaResponses)
    .values({ organizationId: ctx.organizationId, eventId, employeeId: employee.id, response, note: text })
    .onConflictDoUpdate({
      target: [agendaResponses.eventId, agendaResponses.employeeId],
      set: { response, note: text, respondedAt: new Date() },
    });
  await audit(ctx, "agenda.responded", eventId, { response });
  revalidate(eventId);
  return { ok: true, message: "Jawaban disimpan." };
}
