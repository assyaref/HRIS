"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  MEDICAL_CHECKUP_RESULTS,
  TRAINING_TYPES,
  employeeTrainings,
  employees,
  medicalCheckups,
  trainingMasters,
  trainingRequirements,
} from "@/db/schema";
import { writeAuditLog, type AuditAction } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import { isComplianceModuleReady } from "./module";
import { addMonths } from "./validity";

/**
 * MCU / training mutations. Every action re-checks the session, the
 * permission (MCU = personal data → employees.personal.update; trainings =
 * employment data → employees.employment.update), that migration 0023 is
 * applied, and that every referenced row belongs to the caller's
 * organization. Mutations are audit-logged.
 */

export interface ComplianceResult {
  ok: boolean;
  message: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const date = z
  .string()
  .regex(DATE, "Gunakan format tanggal YYYY-MM-DD.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Tanggal tidak valid.");
const optionalDate = z
  .union([date, z.literal("")])
  .optional()
  .transform((v) => (v ? v : null));

const mcuSchema = z
  .object({
    employeeId: z.string().regex(UUID, "Pilih karyawan."),
    checkupDate: date,
    validUntil: optionalDate,
    provider: optionalText(200),
    location: optionalText(200),
    doctor: optionalText(200),
    result: z.enum(MEDICAL_CHECKUP_RESULTS),
    notes: optionalText(1000),
  })
  .refine((v) => !v.validUntil || v.validUntil >= v.checkupDate, {
    message: "Berlaku sampai tidak boleh sebelum tanggal pemeriksaan.",
    path: ["validUntil"],
  });

const trainingSchema = z
  .object({
    employeeId: z.string().regex(UUID, "Pilih karyawan."),
    trainingMasterId: z
      .union([z.string().regex(UUID), z.literal("")])
      .optional()
      .transform((v) => (v ? v : null)),
    title: optionalText(200),
    certificateNumber: optionalText(100),
    issuer: optionalText(200),
    location: optionalText(200),
    trainingDate: date,
    validUntil: optionalDate,
    notes: optionalText(1000),
  })
  .refine((v) => !v.validUntil || v.validUntil >= v.trainingDate, {
    message: "Berlaku sampai tidak boleh sebelum tanggal training.",
    path: ["validUntil"],
  });

const masterSchema = z.object({
  name: z.string().trim().min(2, "Nama training wajib diisi.").max(200),
  category: optionalText(100),
  trainingType: z.enum(TRAINING_TYPES),
  durationHours: z
    .union([z.coerce.number().int().min(0).max(10_000), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  organizer: optionalText(200),
  validityMonths: z
    .union([z.coerce.number().int().min(1).max(600), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  isMandatory: z.boolean(),
});

function formObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Data tidak valid.";
}

type Context = { userId: string; organizationId: string };

async function authorize(permission: Permission): Promise<Context | ComplianceResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  await requirePermission(user.id, permission);
  if (!user.organizationId) {
    return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  }
  if (!(await isComplianceModuleReady())) {
    return {
      ok: false,
      message: "Modul belum aktif: migrasi 0023 belum dijalankan di server.",
    };
  }
  return { userId: user.id, organizationId: user.organizationId };
}

const isContext = (value: Context | ComplianceResult): value is Context =>
  "organizationId" in value;

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
    console.error("[compliance] audit failed", error);
  }
}

async function employeeInOrganization(employeeId: string, organizationId: string) {
  const rows = await db
    .select({ id: employees.id, employeeNumber: employees.employeeNumber })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

async function masterInOrganization(masterId: string, organizationId: string) {
  const rows = await db
    .select({
      id: trainingMasters.id,
      name: trainingMasters.name,
      validityMonths: trainingMasters.validityMonths,
    })
    .from(trainingMasters)
    .where(and(eq(trainingMasters.id, masterId), eq(trainingMasters.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

function revalidateCompliance() {
  revalidatePath("/compliance/mcu");
  revalidatePath("/compliance/trainings");
  revalidatePath("/dashboard");
}

/* ------------------------------------------------------------------ */
/* MCU                                                                 */
/* ------------------------------------------------------------------ */

export async function saveMcuAction(id: string | null, formData: FormData): Promise<ComplianceResult> {
  const ctx = await authorize(PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE);
  if (!isContext(ctx)) return ctx;
  const parsed = mcuSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const data = parsed.data;
  const employee = await employeeInOrganization(data.employeeId, ctx.organizationId);
  if (!employee) return { ok: false, message: "Karyawan tidak ditemukan di organisasi ini." };

  const values = {
    employeeId: data.employeeId,
    checkupDate: data.checkupDate,
    validUntil: data.validUntil,
    provider: data.provider,
    location: data.location,
    doctor: data.doctor,
    result: data.result,
    notes: data.notes,
  };
  if (id) {
    if (!UUID.test(id)) return { ok: false, message: "Data MCU tidak ditemukan." };
    const updated = await db
      .update(medicalCheckups)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(medicalCheckups.id, id), eq(medicalCheckups.organizationId, ctx.organizationId)))
      .returning({ id: medicalCheckups.id });
    if (!updated[0]) return { ok: false, message: "Data MCU tidak ditemukan." };
    await audit(ctx, "mcu.updated", "medical_checkup", id, { employeeNumber: employee.employeeNumber });
  } else {
    const inserted = await db
      .insert(medicalCheckups)
      .values({ ...values, organizationId: ctx.organizationId, createdBy: ctx.userId })
      .returning({ id: medicalCheckups.id });
    await audit(ctx, "mcu.created", "medical_checkup", inserted[0]?.id ?? null, {
      employeeNumber: employee.employeeNumber,
    });
  }
  revalidateCompliance();
  return { ok: true, message: id ? "Data MCU diperbarui." : "Data MCU dicatat." };
}

export async function deleteMcuAction(id: string): Promise<ComplianceResult> {
  const ctx = await authorize(PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Data MCU tidak ditemukan." };
  const removed = await db
    .delete(medicalCheckups)
    .where(and(eq(medicalCheckups.id, id), eq(medicalCheckups.organizationId, ctx.organizationId)))
    .returning({ id: medicalCheckups.id });
  if (!removed[0]) return { ok: false, message: "Data MCU tidak ditemukan." };
  await audit(ctx, "mcu.deleted", "medical_checkup", id, {});
  revalidateCompliance();
  return { ok: true, message: "Data MCU dihapus." };
}

/* ------------------------------------------------------------------ */
/* Training records                                                    */
/* ------------------------------------------------------------------ */

export async function saveTrainingAction(
  id: string | null,
  formData: FormData
): Promise<ComplianceResult> {
  const ctx = await authorize(PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE);
  if (!isContext(ctx)) return ctx;
  const parsed = trainingSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const data = parsed.data;
  const employee = await employeeInOrganization(data.employeeId, ctx.organizationId);
  if (!employee) return { ok: false, message: "Karyawan tidak ditemukan di organisasi ini." };

  let title = data.title;
  let validUntil = data.validUntil;
  if (data.trainingMasterId) {
    const master = await masterInOrganization(data.trainingMasterId, ctx.organizationId);
    if (!master) return { ok: false, message: "Master training tidak ditemukan." };
    title = title ?? master.name;
    // Certificate validity from the master when no date was given.
    if (!validUntil && master.validityMonths) {
      validUntil = addMonths(data.trainingDate, master.validityMonths);
    }
  }
  if (!title) return { ok: false, message: "Isi judul training atau pilih dari master." };

  const values = {
    employeeId: data.employeeId,
    trainingMasterId: data.trainingMasterId,
    title,
    certificateNumber: data.certificateNumber,
    issuer: data.issuer,
    location: data.location,
    trainingDate: data.trainingDate,
    validUntil,
    notes: data.notes,
  };
  if (id) {
    if (!UUID.test(id)) return { ok: false, message: "Data training tidak ditemukan." };
    const updated = await db
      .update(employeeTrainings)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(employeeTrainings.id, id), eq(employeeTrainings.organizationId, ctx.organizationId)))
      .returning({ id: employeeTrainings.id });
    if (!updated[0]) return { ok: false, message: "Data training tidak ditemukan." };
    await audit(ctx, "training.updated", "employee_training", id, { employeeNumber: employee.employeeNumber, title });
  } else {
    const inserted = await db
      .insert(employeeTrainings)
      .values({ ...values, organizationId: ctx.organizationId, createdBy: ctx.userId })
      .returning({ id: employeeTrainings.id });
    await audit(ctx, "training.created", "employee_training", inserted[0]?.id ?? null, {
      employeeNumber: employee.employeeNumber,
      title,
    });
  }
  revalidateCompliance();
  return { ok: true, message: id ? "Data training diperbarui." : "Data training dicatat." };
}

export async function deleteTrainingAction(id: string): Promise<ComplianceResult> {
  const ctx = await authorize(PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Data training tidak ditemukan." };
  const removed = await db
    .delete(employeeTrainings)
    .where(and(eq(employeeTrainings.id, id), eq(employeeTrainings.organizationId, ctx.organizationId)))
    .returning({ id: employeeTrainings.id });
  if (!removed[0]) return { ok: false, message: "Data training tidak ditemukan." };
  await audit(ctx, "training.deleted", "employee_training", id, {});
  revalidateCompliance();
  return { ok: true, message: "Data training dihapus." };
}

/* ------------------------------------------------------------------ */
/* Training masters                                                    */
/* ------------------------------------------------------------------ */

export async function saveTrainingMasterAction(
  id: string | null,
  formData: FormData
): Promise<ComplianceResult> {
  const ctx = await authorize(PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE);
  if (!isContext(ctx)) return ctx;
  const raw = formObject(formData);
  const parsed = masterSchema.safeParse({ ...raw, isMandatory: raw.isMandatory === "on" });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const data = parsed.data;

  const clash = await db
    .select({ id: trainingMasters.id })
    .from(trainingMasters)
    .where(
      and(
        eq(trainingMasters.organizationId, ctx.organizationId),
        sql`lower(${trainingMasters.name}) = lower(${data.name})`
      )
    )
    .limit(1);
  if (clash[0] && clash[0].id !== id) {
    return { ok: false, message: `Training "${data.name}" sudah ada.` };
  }

  if (id) {
    if (!UUID.test(id)) return { ok: false, message: "Master training tidak ditemukan." };
    const updated = await db
      .update(trainingMasters)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(trainingMasters.id, id), eq(trainingMasters.organizationId, ctx.organizationId)))
      .returning({ id: trainingMasters.id });
    if (!updated[0]) return { ok: false, message: "Master training tidak ditemukan." };
    await audit(ctx, "training_master.updated", "training_master", id, { name: data.name });
  } else {
    const inserted = await db
      .insert(trainingMasters)
      .values({ ...data, organizationId: ctx.organizationId })
      .returning({ id: trainingMasters.id });
    await audit(ctx, "training_master.created", "training_master", inserted[0]?.id ?? null, {
      name: data.name,
    });
  }
  revalidateCompliance();
  return { ok: true, message: id ? "Master training diperbarui." : "Master training ditambahkan." };
}

export async function setTrainingMasterActiveAction(
  id: string,
  active: boolean
): Promise<ComplianceResult> {
  const ctx = await authorize(PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Master training tidak ditemukan." };
  const updated = await db
    .update(trainingMasters)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(trainingMasters.id, id), eq(trainingMasters.organizationId, ctx.organizationId)))
    .returning({ id: trainingMasters.id });
  if (!updated[0]) return { ok: false, message: "Master training tidak ditemukan." };
  await audit(ctx, "training_master.updated", "training_master", id, { active });
  revalidateCompliance();
  return { ok: true, message: active ? "Master training diaktifkan." : "Master training dinonaktifkan." };
}

export async function deleteTrainingMasterAction(id: string): Promise<ComplianceResult> {
  const ctx = await authorize(PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Master training tidak ditemukan." };
  const used = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employeeTrainings)
    .where(
      and(
        eq(employeeTrainings.trainingMasterId, id),
        eq(employeeTrainings.organizationId, ctx.organizationId)
      )
    );
  if ((used[0]?.count ?? 0) > 0) {
    return {
      ok: false,
      message: "Master ini sudah dipakai oleh data training karyawan. Nonaktifkan saja.",
    };
  }
  const removed = await db
    .delete(trainingMasters)
    .where(and(eq(trainingMasters.id, id), eq(trainingMasters.organizationId, ctx.organizationId)))
    .returning({ id: trainingMasters.id });
  if (!removed[0]) return { ok: false, message: "Master training tidak ditemukan." };
  await audit(ctx, "training_master.deleted", "training_master", id, {});
  revalidateCompliance();
  return { ok: true, message: "Master training dihapus." };
}

/* ------------------------------------------------------------------ */
/* Matrix requirements                                                 */
/* ------------------------------------------------------------------ */

export async function addTrainingRequirementAction(formData: FormData): Promise<ComplianceResult> {
  const ctx = await authorize(PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE);
  if (!isContext(ctx)) return ctx;
  const position = String(formData.get("position") ?? "").trim();
  const masterId = String(formData.get("trainingMasterId") ?? "");
  if (position.length < 1 || position.length > 100) {
    return { ok: false, message: "Pilih atau isi jabatan." };
  }
  if (!UUID.test(masterId)) return { ok: false, message: "Pilih training." };
  const master = await masterInOrganization(masterId, ctx.organizationId);
  if (!master) return { ok: false, message: "Master training tidak ditemukan." };
  const inserted = await db
    .insert(trainingRequirements)
    .values({ organizationId: ctx.organizationId, position, trainingMasterId: masterId })
    .onConflictDoNothing()
    .returning({ id: trainingRequirements.id });
  if (!inserted[0]) return { ok: false, message: "Training ini sudah wajib untuk jabatan tersebut." };
  await audit(ctx, "training_requirement.created", "training_requirement", inserted[0].id, {
    position,
    training: master.name,
  });
  revalidateCompliance();
  return { ok: true, message: `${master.name} wajib untuk ${position}.` };
}

export async function deleteTrainingRequirementAction(id: string): Promise<ComplianceResult> {
  const ctx = await authorize(PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE);
  if (!isContext(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Data tidak ditemukan." };
  const removed = await db
    .delete(trainingRequirements)
    .where(
      and(eq(trainingRequirements.id, id), eq(trainingRequirements.organizationId, ctx.organizationId))
    )
    .returning({ id: trainingRequirements.id });
  if (!removed[0]) return { ok: false, message: "Data tidak ditemukan." };
  await audit(ctx, "training_requirement.deleted", "training_requirement", id, {});
  revalidateCompliance();
  return { ok: true, message: "Kewajiban training dihapus." };
}
