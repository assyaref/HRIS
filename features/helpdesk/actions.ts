"use server";

import { and, eq, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  HELPDESK_PRIORITIES,
  HELPDESK_STATUSES,
  helpdeskCategories,
  helpdeskMessages,
  helpdeskTickets,
  users,
} from "@/db/schema";
import { writeAuditLog, type AuditAction } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { todayKey } from "@/features/reference-shared";

import { HELPDESK_MIGRATION, isHelpdeskModuleReady } from "./module";
import {
  DEFAULT_CATEGORIES,
  formatTicketNumber,
  isFinished,
  nextSequence,
  statusAfterMessage,
  ticketPrefix,
} from "./rules";

/**
 * Helpdesk mutations.
 * - Employees (linked employee record): open tickets, reply on their own
 *   tickets, close them, mark replies as read.
 * - Agents (employees.view + employees.update): reply (public or internal
 *   note), assign, change status / priority / category, manage categories.
 * Every action re-checks the session, the module readiness and that each
 * referenced row belongs to the caller's organization.
 */

export interface HelpdeskResult {
  ok: boolean;
  message: string;
  id?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_READY = `Fitur belum aktif: migrasi ${HELPDESK_MIGRATION} belum dijalankan di server.`;

const ticketSchema = z.object({
  subject: z.string().trim().min(5, "Judul minimal 5 karakter.").max(150, "Judul maksimal 150 karakter."),
  body: z.string().trim().min(10, "Uraikan pertanyaan Anda (min. 10 karakter).").max(5000),
  priority: z.enum(HELPDESK_PRIORITIES),
  categoryId: z
    .union([z.string().regex(UUID), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
});
const messageSchema = z.string().trim().min(1, "Pesan tidak boleh kosong.").max(5000, "Pesan maksimal 5000 karakter.");

type Ctx = { userId: string; organizationId: string; isAgent: boolean; employeeId: string | null };

async function context(): Promise<Ctx | HelpdeskResult> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  if (!(await isHelpdeskModuleReady())) return { ok: false, message: NOT_READY };
  const authorization = await getUserAuthorization(user.id);
  const granted = new Set<string>(authorization.permissionCodes);
  const isAgent =
    authorization.isSuperAdmin ||
    (granted.has(PERMISSIONS.EMPLOYEES_VIEW) && granted.has(PERMISSIONS.EMPLOYEES_UPDATE));
  const employee = await getEmployeeByUserId(user.id, organizationId);
  return { userId: user.id, organizationId, isAgent, employeeId: employee?.id ?? null };
}
const isCtx = (v: Ctx | HelpdeskResult): v is Ctx => "organizationId" in v;
const FORBIDDEN: HelpdeskResult = { ok: false, message: "Anda tidak memiliki akses untuk tindakan ini." };

async function audit(ctx: Ctx, action: AuditAction, entityType: string, entityId: string | null, metadata: Record<string, unknown>) {
  try {
    await writeAuditLog({ organizationId: ctx.organizationId, actorUserId: ctx.userId, action, entityType, entityId, metadata });
  } catch (error) {
    console.error("[helpdesk] audit failed", error);
  }
}

function revalidate(ticketId?: string) {
  revalidatePath("/helpdesk");
  revalidatePath("/helpdesk/management");
  revalidatePath("/notifications");
  if (ticketId) revalidatePath(`/helpdesk/${ticketId}`);
}

const uniqueViolation = (error: unknown) =>
  ((error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code) === "23505";

async function loadTicket(ctx: Ctx, ticketId: string) {
  if (!UUID.test(ticketId)) return null;
  const rows = await db
    .select({ id: helpdeskTickets.id, employeeId: helpdeskTickets.employeeId, status: helpdeskTickets.status, ticketNumber: helpdeskTickets.ticketNumber })
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.organizationId, ctx.organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Employee                                                            */
/* ------------------------------------------------------------------ */

export async function createTicketAction(formData: FormData): Promise<HelpdeskResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.employeeId) return { ok: false, message: "Akun Anda belum terhubung dengan data karyawan." };
  const parsed = ticketSchema.safeParse({
    subject: formData.get("subject") ?? "",
    body: formData.get("body") ?? "",
    priority: formData.get("priority") ?? "normal",
    categoryId: formData.get("categoryId") ?? "",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const data = parsed.data;
  if (data.categoryId) {
    const category = await db
      .select({ id: helpdeskCategories.id })
      .from(helpdeskCategories)
      .where(and(eq(helpdeskCategories.id, data.categoryId), eq(helpdeskCategories.organizationId, ctx.organizationId)))
      .limit(1);
    if (!category[0]) return { ok: false, message: "Kategori tidak ditemukan." };
  }

  const prefix = ticketPrefix(todayKey());
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db
      .select({ n: helpdeskTickets.ticketNumber })
      .from(helpdeskTickets)
      .where(and(eq(helpdeskTickets.organizationId, ctx.organizationId), like(helpdeskTickets.ticketNumber, `${prefix}%`)));
    const ticketNumber = formatTicketNumber(todayKey(), nextSequence(existing.map((r) => r.n), prefix) + attempt);
    try {
      const id = await db.transaction(async (tx) => {
        const now = new Date();
        const inserted = await tx
          .insert(helpdeskTickets)
          .values({
            organizationId: ctx.organizationId,
            ticketNumber,
            employeeId: ctx.employeeId!,
            categoryId: data.categoryId,
            subject: data.subject,
            priority: data.priority,
            status: "open",
            createdBy: ctx.userId,
            lastMessageAt: now,
            lastMessageFromAgent: false,
            employeeLastReadAt: now,
          })
          .returning({ id: helpdeskTickets.id });
        const ticketId = inserted[0]!.id;
        await tx.insert(helpdeskMessages).values({
          organizationId: ctx.organizationId,
          ticketId,
          authorUserId: ctx.userId,
          fromAgent: false,
          body: data.body,
        });
        return ticketId;
      });
      await audit(ctx, "helpdesk.ticket_created", "helpdesk_ticket", id, { ticketNumber });
      revalidate(id);
      return { ok: true, message: `Tiket ${ticketNumber} dibuat. HR akan segera membalas.`, id };
    } catch (error) {
      if (!uniqueViolation(error)) throw error;
    }
  }
  return { ok: false, message: "Gagal membuat nomor tiket. Coba lagi." };
}

/** Reply on a ticket: the owner (public) or an agent (public or internal note). */
export async function addMessageAction(ticketId: string, body: string, internal = false): Promise<HelpdeskResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  const ticket = await loadTicket(ctx, ticketId);
  if (!ticket) return { ok: false, message: "Tiket tidak ditemukan." };
  const isOwner = ctx.employeeId !== null && ticket.employeeId === ctx.employeeId;
  // An agent writing on their OWN ticket writes as the employee.
  const asAgent = ctx.isAgent && !isOwner;
  if (!isOwner && !asAgent) return FORBIDDEN;
  if (internal && !asAgent) return FORBIDDEN;
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Pesan tidak valid." };

  const now = new Date();
  const nextStatus = statusAfterMessage(ticket.status, asAgent, internal);
  await db.transaction(async (tx) => {
    await tx.insert(helpdeskMessages).values({
      organizationId: ctx.organizationId,
      ticketId: ticket.id,
      authorUserId: ctx.userId,
      fromAgent: asAgent,
      internal,
      body: parsed.data,
    });
    if (!internal) {
      await tx
        .update(helpdeskTickets)
        .set({
          lastMessageAt: now,
          lastMessageFromAgent: asAgent,
          status: nextStatus,
          resolvedAt: isFinished(nextStatus) ? undefined : null,
          ...(isOwner ? { employeeLastReadAt: now } : {}),
          updatedAt: now,
        })
        .where(and(eq(helpdeskTickets.id, ticket.id), eq(helpdeskTickets.organizationId, ctx.organizationId)));
    }
  });
  await audit(ctx, "helpdesk.message_added", "helpdesk_ticket", ticket.id, { internal, fromAgent: asAgent });
  revalidate(ticket.id);
  return { ok: true, message: internal ? "Catatan internal disimpan." : "Pesan terkirim." };
}

/** Owner closes their own ticket (problem solved). */
export async function closeOwnTicketAction(ticketId: string): Promise<HelpdeskResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  const ticket = await loadTicket(ctx, ticketId);
  if (!ticket || !ctx.employeeId || ticket.employeeId !== ctx.employeeId) return { ok: false, message: "Tiket tidak ditemukan." };
  if (ticket.status === "closed") return { ok: false, message: "Tiket sudah ditutup." };
  await db
    .update(helpdeskTickets)
    .set({ status: "closed", resolvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(helpdeskTickets.id, ticket.id), eq(helpdeskTickets.organizationId, ctx.organizationId)));
  await audit(ctx, "helpdesk.ticket_updated", "helpdesk_ticket", ticket.id, { status: "closed", by: "employee" });
  revalidate(ticket.id);
  return { ok: true, message: "Tiket ditutup. Terima kasih!" };
}

/** Owner opened the ticket: HR replies are now seen. */
export async function markTicketReadAction(ticketId: string): Promise<HelpdeskResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.employeeId || !UUID.test(ticketId)) return { ok: true, message: "" };
  await db
    .update(helpdeskTickets)
    .set({ employeeLastReadAt: new Date() })
    .where(
      and(
        eq(helpdeskTickets.id, ticketId),
        eq(helpdeskTickets.organizationId, ctx.organizationId),
        eq(helpdeskTickets.employeeId, ctx.employeeId)
      )
    );
  revalidatePath("/notifications");
  return { ok: true, message: "" };
}

/* ------------------------------------------------------------------ */
/* Agents                                                              */
/* ------------------------------------------------------------------ */

const updateSchema = z.object({
  status: z.enum(HELPDESK_STATUSES),
  priority: z.enum(HELPDESK_PRIORITIES),
  categoryId: z.union([z.string().regex(UUID), z.literal("")]).transform((v) => (v ? v : null)),
  assignedTo: z.union([z.string().regex(UUID), z.literal("")]).transform((v) => (v ? v : null)),
});

export async function updateTicketAction(ticketId: string, formData: FormData): Promise<HelpdeskResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.isAgent) return FORBIDDEN;
  const ticket = await loadTicket(ctx, ticketId);
  if (!ticket) return { ok: false, message: "Tiket tidak ditemukan." };
  const parsed = updateSchema.safeParse({
    status: formData.get("status"),
    priority: formData.get("priority"),
    categoryId: formData.get("categoryId") ?? "",
    assignedTo: formData.get("assignedTo") ?? "",
  });
  if (!parsed.success) return { ok: false, message: "Data tidak valid." };
  const data = parsed.data;
  if (data.categoryId) {
    const found = await db
      .select({ id: helpdeskCategories.id })
      .from(helpdeskCategories)
      .where(and(eq(helpdeskCategories.id, data.categoryId), eq(helpdeskCategories.organizationId, ctx.organizationId)))
      .limit(1);
    if (!found[0]) return { ok: false, message: "Kategori tidak ditemukan." };
  }
  if (data.assignedTo) {
    const found = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, data.assignedTo), eq(users.organizationId, ctx.organizationId)))
      .limit(1);
    if (!found[0]) return { ok: false, message: "Petugas tidak ditemukan." };
  }
  await db
    .update(helpdeskTickets)
    .set({
      ...data,
      resolvedAt: isFinished(data.status) ? (isFinished(ticket.status) ? undefined : new Date()) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(helpdeskTickets.id, ticket.id), eq(helpdeskTickets.organizationId, ctx.organizationId)));
  await audit(ctx, "helpdesk.ticket_updated", "helpdesk_ticket", ticket.id, data);
  revalidate(ticket.id);
  return { ok: true, message: "Tiket diperbarui." };
}

export async function saveCategoryAction(formData: FormData): Promise<HelpdeskResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.isAgent) return FORBIDDEN;
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, message: "Nama kategori 2–80 karakter." };
  try {
    const inserted = await db
      .insert(helpdeskCategories)
      .values({ organizationId: ctx.organizationId, name })
      .returning({ id: helpdeskCategories.id });
    await audit(ctx, "helpdesk.category_created", "helpdesk_category", inserted[0]?.id ?? null, { name });
  } catch (error) {
    if (uniqueViolation(error)) return { ok: false, message: "Kategori sudah ada." };
    throw error;
  }
  revalidate();
  return { ok: true, message: "Kategori ditambahkan." };
}

/** Adds the default categories that are missing. */
export async function seedDefaultCategoriesAction(): Promise<HelpdeskResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.isAgent) return FORBIDDEN;
  const inserted = await db
    .insert(helpdeskCategories)
    .values(DEFAULT_CATEGORIES.map((name) => ({ organizationId: ctx.organizationId, name })))
    .onConflictDoNothing()
    .returning({ id: helpdeskCategories.id });
  await audit(ctx, "helpdesk.category_created", "helpdesk_category", null, { defaults: inserted.length });
  revalidate();
  return { ok: true, message: `${inserted.length} kategori standar ditambahkan.` };
}

export async function setCategoryActiveAction(id: string, active: boolean): Promise<HelpdeskResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!ctx.isAgent) return FORBIDDEN;
  if (!UUID.test(id)) return { ok: false, message: "Kategori tidak ditemukan." };
  const updated = await db
    .update(helpdeskCategories)
    .set({ active })
    .where(and(eq(helpdeskCategories.id, id), eq(helpdeskCategories.organizationId, ctx.organizationId)))
    .returning({ id: helpdeskCategories.id });
  if (!updated[0]) return { ok: false, message: "Kategori tidak ditemukan." };
  await audit(ctx, "helpdesk.category_updated", "helpdesk_category", id, { active });
  revalidate();
  return { ok: true, message: active ? "Kategori diaktifkan." : "Kategori dinonaktifkan." };
}
