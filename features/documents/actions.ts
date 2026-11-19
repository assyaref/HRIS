"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { NUMBER_RESET_PERIODS, documentTypes, employees, issuedDocuments } from "@/db/schema";
import { writeAuditLog, type AuditAction } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import { DOCUMENTS_MIGRATION, isDocumentsModuleReady } from "./module";
import {
  DEFAULT_DOCUMENT_TYPES,
  formatDocumentNumber,
  numberingPeriod,
  validateNumberFormat,
} from "./numbering";
import { getPkwtEmployeeData } from "./queries";

/**
 * Letter numbering and generated letters.
 * - manage types, issue / void numbers: employees.view + employees.document.upload
 * - generate a PKWT: the above + employees.employment.view; updating the
 *   employee's contract dates additionally needs employees.employment.update
 *
 * Numbers are issued inside a transaction that locks the document type row,
 * so concurrent requests get consecutive numbers; unique indexes on
 * (type, period, sequence) and (organization, number) are the backstop.
 */

export interface DocumentResult {
  ok: boolean;
  message: string;
  id?: string;
  documentNumber?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN: DocumentResult = { ok: false, message: "Anda tidak memiliki akses untuk tindakan ini." };

type Ctx = { userId: string; organizationId: string; granted: Set<string>; superAdmin: boolean };

async function context(required: Permission[]): Promise<Ctx | DocumentResult> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  const authorization = await getUserAuthorization(user.id);
  const granted = new Set<string>(authorization.permissionCodes);
  if (!authorization.isSuperAdmin && !required.every((p) => granted.has(p))) return FORBIDDEN;
  if (!(await isDocumentsModuleReady())) {
    return { ok: false, message: `Fitur belum aktif: migrasi ${DOCUMENTS_MIGRATION} belum dijalankan di server.` };
  }
  return { userId: user.id, organizationId, granted, superAdmin: authorization.isSuperAdmin };
}
const isCtx = (v: Ctx | DocumentResult): v is Ctx => "organizationId" in v;
const can = (ctx: Ctx, p: Permission) => ctx.superAdmin || ctx.granted.has(p);

const MANAGE = [PERMISSIONS.EMPLOYEES_VIEW, PERMISSIONS.EMPLOYEES_DOCUMENT_UPLOAD];

async function audit(ctx: Ctx, action: AuditAction, entityType: string, entityId: string | null, metadata: Record<string, unknown>) {
  try {
    await writeAuditLog({ organizationId: ctx.organizationId, actorUserId: ctx.userId, action, entityType, entityId, metadata });
  } catch (error) {
    console.error("[documents] audit failed", error);
  }
}

const uniqueViolation = (error: unknown) =>
  ((error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code) === "23505";

function revalidate(id?: string) {
  revalidatePath("/documents");
  if (id) revalidatePath(`/documents/${id}`);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .optional()
    .transform((v) => (v ? v : null));
const dateField = z
  .string()
  .regex(DATE, "Tanggal tidak valid.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Tanggal tidak valid.");

/* ------------------------------------------------------------------ */
/* Document types                                                      */
/* ------------------------------------------------------------------ */

const typeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9.-]{0,15}$/, "Kode 1–16 karakter: huruf besar, angka, titik atau strip."),
  name: z.string().trim().min(3, "Nama jenis surat minimal 3 karakter.").max(120),
  numberFormat: z.string().trim(),
  sequencePadding: z.coerce.number().int().min(1).max(8),
  resetPeriod: z.enum(NUMBER_RESET_PERIODS),
});

export async function saveDocumentTypeAction(id: string | null, formData: FormData): Promise<DocumentResult> {
  const ctx = await context(MANAGE);
  if (!isCtx(ctx)) return ctx;
  const parsed = typeSchema.safeParse({
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
    numberFormat: formData.get("numberFormat") ?? "",
    sequencePadding: formData.get("sequencePadding") ?? "3",
    resetPeriod: formData.get("resetPeriod") ?? "yearly",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const formatError = validateNumberFormat(parsed.data.numberFormat);
  if (formatError) return { ok: false, message: formatError };

  try {
    if (id) {
      if (!UUID.test(id)) return { ok: false, message: "Jenis surat tidak ditemukan." };
      const current = await db
        .select({ code: documentTypes.code, used: sql<number>`(SELECT COUNT(*)::int FROM ${issuedDocuments} WHERE ${issuedDocuments.documentTypeId} = ${documentTypes.id})` })
        .from(documentTypes)
        .where(and(eq(documentTypes.id, id), eq(documentTypes.organizationId, ctx.organizationId)))
        .limit(1);
      if (!current[0]) return { ok: false, message: "Jenis surat tidak ditemukan." };
      if (current[0].used > 0 && current[0].code !== parsed.data.code) {
        return { ok: false, message: "Kode tidak bisa diubah karena sudah ada surat dengan jenis ini." };
      }
      await db
        .update(documentTypes)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(documentTypes.id, id), eq(documentTypes.organizationId, ctx.organizationId)));
      await audit(ctx, "document_type.updated", "document_type", id, parsed.data);
    } else {
      const inserted = await db
        .insert(documentTypes)
        .values({ ...parsed.data, organizationId: ctx.organizationId })
        .returning({ id: documentTypes.id });
      await audit(ctx, "document_type.created", "document_type", inserted[0]?.id ?? null, parsed.data);
    }
  } catch (error) {
    if (uniqueViolation(error)) return { ok: false, message: "Kode jenis surat sudah dipakai." };
    throw error;
  }
  revalidate();
  return { ok: true, message: id ? "Jenis surat diperbarui." : "Jenis surat ditambahkan." };
}

export async function seedDocumentTypesAction(): Promise<DocumentResult> {
  const ctx = await context(MANAGE);
  if (!isCtx(ctx)) return ctx;
  const inserted = await db
    .insert(documentTypes)
    .values(DEFAULT_DOCUMENT_TYPES.map((t) => ({ ...t, organizationId: ctx.organizationId })))
    .onConflictDoNothing()
    .returning({ id: documentTypes.id });
  await audit(ctx, "document_type.created", "document_type", null, { defaults: inserted.length });
  revalidate();
  return { ok: true, message: `${inserted.length} jenis surat standar ditambahkan.` };
}

export async function setDocumentTypeActiveAction(id: string, active: boolean): Promise<DocumentResult> {
  const ctx = await context(MANAGE);
  if (!isCtx(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Jenis surat tidak ditemukan." };
  const updated = await db
    .update(documentTypes)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(documentTypes.id, id), eq(documentTypes.organizationId, ctx.organizationId)))
    .returning({ id: documentTypes.id });
  if (!updated[0]) return { ok: false, message: "Jenis surat tidak ditemukan." };
  await audit(ctx, "document_type.updated", "document_type", id, { active });
  revalidate();
  return { ok: true, message: active ? "Jenis surat diaktifkan." : "Jenis surat dinonaktifkan." };
}

/* ------------------------------------------------------------------ */
/* Issuing                                                             */
/* ------------------------------------------------------------------ */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Locks the type row, takes the next sequence of the period and inserts the
 * letter. Must run inside a transaction.
 */
async function issueInTx(
  tx: Tx,
  ctx: Ctx,
  typeId: string,
  data: {
    issuedDate: string;
    subject: string;
    recipient: string | null;
    employeeId: string | null;
    notes: string | null;
    content?: Record<string, unknown> | null;
  }
): Promise<{ id: string; documentNumber: string } | { error: string }> {
  const locked = await tx.execute(sql`
    SELECT id, code, number_format, sequence_padding, reset_period, active
    FROM document_types
    WHERE id = ${typeId} AND organization_id = ${ctx.organizationId}
    FOR UPDATE
  `);
  const type = locked.rows[0] as
    | { id: string; code: string; number_format: string; sequence_padding: number; reset_period: string; active: boolean }
    | undefined;
  if (!type) return { error: "Jenis surat tidak ditemukan." };
  if (!type.active) return { error: "Jenis surat ini nonaktif." };

  const period = numberingPeriod(type.reset_period, data.issuedDate);
  const next = await tx.execute(sql`
    SELECT COALESCE(MAX(sequence), 0) + 1 AS next
    FROM issued_documents
    WHERE organization_id = ${ctx.organizationId} AND document_type_id = ${type.id} AND period = ${period}
  `);
  const sequence = Number((next.rows[0] as { next: number | string }).next);
  const documentNumber = formatDocumentNumber(type.number_format, {
    sequence,
    padding: type.sequence_padding,
    code: type.code,
    issuedDate: data.issuedDate,
  });
  const inserted = await tx
    .insert(issuedDocuments)
    .values({
      organizationId: ctx.organizationId,
      documentTypeId: type.id,
      period,
      sequence,
      documentNumber,
      issuedDate: data.issuedDate,
      subject: data.subject,
      recipient: data.recipient,
      employeeId: data.employeeId,
      content: data.content ?? null,
      notes: data.notes,
      issuedBy: ctx.userId,
    })
    .returning({ id: issuedDocuments.id });
  return { id: inserted[0]!.id, documentNumber };
}

async function employeeInOrganization(employeeId: string, organizationId: string) {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
    .limit(1);
  return Boolean(rows[0]);
}

const issueSchema = z.object({
  documentTypeId: z.string().regex(UUID, "Pilih jenis surat."),
  issuedDate: dateField,
  subject: z.string().trim().min(3, "Perihal minimal 3 karakter.").max(250),
  recipient: optionalText(200),
  employeeId: z
    .union([z.string().regex(UUID), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  notes: optionalText(1000),
});

export async function issueNumberAction(formData: FormData): Promise<DocumentResult> {
  const ctx = await context(MANAGE);
  if (!isCtx(ctx)) return ctx;
  const parsed = issueSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { documentTypeId, ...data } = parsed.data;
  if (data.employeeId && !(await employeeInOrganization(data.employeeId, ctx.organizationId))) {
    return { ok: false, message: "Karyawan tidak ditemukan." };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await db.transaction((tx) => issueInTx(tx, ctx, documentTypeId, data));
      if ("error" in result) return { ok: false, message: result.error };
      await audit(ctx, "document.issued", "issued_document", result.id, { documentNumber: result.documentNumber });
      revalidate(result.id);
      return { ok: true, message: `Nomor ${result.documentNumber} diterbitkan.`, ...result };
    } catch (error) {
      if (!uniqueViolation(error)) throw error;
    }
  }
  return { ok: false, message: "Nomor bentrok dengan surat lain. Coba lagi." };
}

export async function voidDocumentAction(id: string, reason: string): Promise<DocumentResult> {
  const ctx = await context(MANAGE);
  if (!isCtx(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Surat tidak ditemukan." };
  const text = reason.trim().slice(0, 500);
  if (text.length < 3) return { ok: false, message: "Tuliskan alasan pembatalan." };
  const updated = await db
    .update(issuedDocuments)
    .set({ voided: true, voidReason: text, voidedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(issuedDocuments.id, id), eq(issuedDocuments.organizationId, ctx.organizationId), eq(issuedDocuments.voided, false))
    )
    .returning({ documentNumber: issuedDocuments.documentNumber });
  if (!updated[0]) return { ok: false, message: "Surat tidak ditemukan atau sudah dibatalkan." };
  await audit(ctx, "document.voided", "issued_document", id, { documentNumber: updated[0].documentNumber, reason: text });
  revalidate(id);
  return { ok: true, message: `Nomor ${updated[0].documentNumber} dibatalkan. Nomor tidak dipakai ulang.` };
}

/* ------------------------------------------------------------------ */
/* PKWT                                                                */
/* ------------------------------------------------------------------ */

const pkwtSchema = z
  .object({
    employeeId: z.string().regex(UUID, "Pilih karyawan."),
    issuedDate: dateField,
    contractStart: dateField,
    contractEnd: dateField,
    position: z.string().trim().min(2, "Jabatan wajib diisi.").max(120),
    department: optionalText(120),
    workLocation: z.string().trim().min(2, "Lokasi kerja wajib diisi.").max(200),
    salary: z
      .union([z.coerce.number().int().min(0).max(10_000_000_000), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    workingHours: optionalText(200),
    signatoryName: z.string().trim().min(2, "Nama penandatangan wajib diisi.").max(120),
    signatoryTitle: z.string().trim().min(2, "Jabatan penandatangan wajib diisi.").max(120),
    city: z.string().trim().min(2, "Kota penandatanganan wajib diisi.").max(80),
    updateEmployee: z.boolean(),
  })
  .refine((v) => v.contractEnd > v.contractStart, {
    message: "Tanggal akhir kontrak harus setelah tanggal mulai.",
    path: ["contractEnd"],
  });

export async function generatePkwtAction(formData: FormData): Promise<DocumentResult> {
  const ctx = await context([...MANAGE, PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW]);
  if (!isCtx(ctx)) return ctx;
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = pkwtSchema.safeParse({ ...raw, updateEmployee: raw.updateEmployee === "on" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const data = parsed.data;
  if (data.updateEmployee && !can(ctx, PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE)) {
    return { ok: false, message: "Anda tidak berhak memperbarui tanggal kontrak karyawan." };
  }
  const employee = await getPkwtEmployeeData(ctx.organizationId, data.employeeId);
  if (!employee) return { ok: false, message: "Karyawan tidak ditemukan." };

  // Use (or create) the organization's PKWT type.
  let type = (
    await db
      .select({ id: documentTypes.id, active: documentTypes.active })
      .from(documentTypes)
      .where(and(eq(documentTypes.organizationId, ctx.organizationId), eq(documentTypes.code, "PKWT")))
      .limit(1)
  )[0];
  if (!type) {
    const pkwt = DEFAULT_DOCUMENT_TYPES[0];
    await db.insert(documentTypes).values({ ...pkwt, organizationId: ctx.organizationId }).onConflictDoNothing();
    type = (
      await db
        .select({ id: documentTypes.id, active: documentTypes.active })
        .from(documentTypes)
        .where(and(eq(documentTypes.organizationId, ctx.organizationId), eq(documentTypes.code, "PKWT")))
        .limit(1)
    )[0];
  }
  if (!type) return { ok: false, message: "Jenis surat PKWT tidak tersedia." };
  if (!type.active) return { ok: false, message: "Jenis surat PKWT nonaktif. Aktifkan di tab Jenis Surat." };

  const content = {
    kind: "pkwt",
    employee: {
      name: employee.name,
      employeeNumber: employee.employeeNumber,
      nik: employee.nik,
      birthPlace: employee.birthPlace,
      birthDate: employee.birthDate,
      gender: employee.gender,
      address: employee.address,
    },
    position: data.position,
    department: data.department,
    workLocation: data.workLocation,
    contractStart: data.contractStart,
    contractEnd: data.contractEnd,
    salary: data.salary,
    workingHours: data.workingHours,
    signatoryName: data.signatoryName,
    signatoryTitle: data.signatoryTitle,
    city: data.city,
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await db.transaction(async (tx) => {
        const issued = await issueInTx(tx, ctx, type.id, {
          issuedDate: data.issuedDate,
          subject: `PKWT ${employee.name} (${data.contractStart} s.d. ${data.contractEnd})`,
          recipient: employee.name,
          employeeId: employee.id,
          notes: null,
          content,
        });
        if ("error" in issued) return issued;
        if (data.updateEmployee) {
          await tx
            .update(employees)
            .set({
              contractStart: new Date(`${data.contractStart}T00:00:00Z`),
              contractEnd: new Date(`${data.contractEnd}T00:00:00Z`),
              employmentType: "Contract",
              updatedAt: new Date(),
            })
            .where(and(eq(employees.id, employee.id), eq(employees.organizationId, ctx.organizationId)));
        }
        return issued;
      });
      if ("error" in result) return { ok: false, message: result.error };
      await audit(ctx, "document.pkwt_generated", "issued_document", result.id, {
        documentNumber: result.documentNumber,
        employeeNumber: employee.employeeNumber,
        contractStart: data.contractStart,
        contractEnd: data.contractEnd,
        employeeUpdated: data.updateEmployee,
      });
      revalidate(result.id);
      revalidatePath(`/employees/${employee.id}`);
      revalidatePath("/monitoring/contracts");
      return { ok: true, message: `PKWT ${result.documentNumber} dibuat.`, ...result };
    } catch (error) {
      if (!uniqueViolation(error)) throw error;
    }
  }
  return { ok: false, message: "Nomor bentrok dengan surat lain. Coba lagi." };
}
