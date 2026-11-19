"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { departments, employees, jobGrades, jobPositions } from "@/db/schema";
import { writeAuditLog, type AuditAction } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import { isOrgMasterReady, ORG_MASTER_MIGRATION } from "./module";
import { listEmployeeValues } from "./queries";
import { cleanName, groupValues, nameKey, unregistered } from "./rules";

/**
 * Organization master mutations. All need employees.view +
 * employees.employment.update (department / position are employment data);
 * the bulk employee updates (rename, unify spelling) only touch the
 * department / position text of employees of the caller's organization and
 * are audit-logged with counts.
 */

export interface OrgMasterResult {
  ok: boolean;
  message: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { userId: string; organizationId: string };

async function context(): Promise<Ctx | OrgMasterResult> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  const authorization = await getUserAuthorization(user.id);
  const granted = new Set<string>(authorization.permissionCodes);
  const allowed =
    authorization.isSuperAdmin ||
    (granted.has(PERMISSIONS.EMPLOYEES_VIEW) && granted.has(PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE));
  if (!allowed) return { ok: false, message: "Anda tidak memiliki akses untuk tindakan ini." };
  if (!(await isOrgMasterReady())) {
    return { ok: false, message: `Fitur belum aktif: migrasi ${ORG_MASTER_MIGRATION} belum dijalankan di server.` };
  }
  return { userId: user.id, organizationId };
}
const isCtx = (v: Ctx | OrgMasterResult): v is Ctx => "organizationId" in v;

async function audit(ctx: Ctx, action: AuditAction, entityType: string, entityId: string | null, metadata: Record<string, unknown>) {
  try {
    await writeAuditLog({ organizationId: ctx.organizationId, actorUserId: ctx.userId, action, entityType, entityId, metadata });
  } catch (error) {
    console.error("[org-master] audit failed", error);
  }
}

const uniqueViolation = (error: unknown) =>
  ((error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code) === "23505";

function revalidate() {
  revalidatePath("/organization/master");
  revalidatePath("/employees");
  revalidatePath("/organization/chart");
}

const name = (label: string) =>
  z
    .string()
    .transform(cleanName)
    .pipe(z.string().min(2, `${label} minimal 2 karakter.`).max(100, `${label} maksimal 100 karakter.`));
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
const optionalId = z
  .union([z.string().regex(UUID), z.literal("")])
  .optional()
  .transform((v) => (v ? v : null));

/**
 * Sets employees' `column` to `to` for every value matching `fromKey`
 * (case / space-insensitive). Returns the number of employees updated.
 */
async function renameEmployeeValues(ctx: Ctx, column: "department" | "position", fromKey: string, to: string): Promise<number> {
  const col = column === "department" ? employees.department : employees.position;
  const updated = await db
    .update(employees)
    .set(column === "department" ? { department: to, updatedAt: new Date() } : { position: to, updatedAt: new Date() })
    .where(
      and(
        eq(employees.organizationId, ctx.organizationId),
        sql`lower(regexp_replace(btrim(${col}), '\\s+', ' ', 'g')) = ${fromKey}`,
        sql`${col} IS DISTINCT FROM ${to}`
      )
    )
    .returning({ id: employees.id });
  return updated.length;
}

/* ------------------------------------------------------------------ */
/* Departments                                                         */
/* ------------------------------------------------------------------ */

const departmentSchema = z.object({
  name: name("Nama departemen"),
  division: optional(100),
  description: optional(500),
  renameEmployees: z.boolean(),
});

export async function saveDepartmentAction(id: string | null, formData: FormData): Promise<OrgMasterResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  const parsed = departmentSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    division: String(formData.get("division") ?? ""),
    description: String(formData.get("description") ?? ""),
    renameEmployees: formData.get("renameEmployees") === "on",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { renameEmployees, ...values } = parsed.data;
  let renamed = 0;
  try {
    if (id) {
      if (!UUID.test(id)) return { ok: false, message: "Departemen tidak ditemukan." };
      const current = (
        await db
          .select({ name: departments.name })
          .from(departments)
          .where(and(eq(departments.id, id), eq(departments.organizationId, ctx.organizationId)))
          .limit(1)
      )[0];
      if (!current) return { ok: false, message: "Departemen tidak ditemukan." };
      await db
        .update(departments)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(departments.id, id), eq(departments.organizationId, ctx.organizationId)));
      if (renameEmployees && current.name !== values.name) {
        renamed = await renameEmployeeValues(ctx, "department", nameKey(current.name), values.name);
      }
      await audit(ctx, "org_master.department_updated", "department", id, { from: current.name, to: values.name, employeesUpdated: renamed });
    } else {
      const inserted = await db.insert(departments).values({ ...values, organizationId: ctx.organizationId }).returning({ id: departments.id });
      await audit(ctx, "org_master.department_created", "department", inserted[0]?.id ?? null, values);
    }
  } catch (error) {
    if (uniqueViolation(error)) return { ok: false, message: "Nama departemen sudah ada." };
    throw error;
  }
  revalidate();
  return { ok: true, message: renamed > 0 ? `Departemen disimpan; ${renamed} karyawan ikut diperbarui.` : "Departemen disimpan." };
}

/* ------------------------------------------------------------------ */
/* Grades                                                              */
/* ------------------------------------------------------------------ */

const gradeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9.-]{0,15}$/, "Kode grade 1–16 karakter (huruf, angka, titik, strip)."),
  name: name("Nama grade"),
  level: z.coerce.number().int().min(1, "Level minimal 1.").max(99, "Level maksimal 99."),
  description: optional(500),
});

export async function saveGradeAction(id: string | null, formData: FormData): Promise<OrgMasterResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  const parsed = gradeSchema.safeParse({
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    level: String(formData.get("level") ?? "1"),
    description: String(formData.get("description") ?? ""),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  try {
    if (id) {
      if (!UUID.test(id)) return { ok: false, message: "Grade tidak ditemukan." };
      const updated = await db
        .update(jobGrades)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(jobGrades.id, id), eq(jobGrades.organizationId, ctx.organizationId)))
        .returning({ id: jobGrades.id });
      if (!updated[0]) return { ok: false, message: "Grade tidak ditemukan." };
      await audit(ctx, "org_master.grade_updated", "job_grade", id, parsed.data);
    } else {
      const inserted = await db.insert(jobGrades).values({ ...parsed.data, organizationId: ctx.organizationId }).returning({ id: jobGrades.id });
      await audit(ctx, "org_master.grade_created", "job_grade", inserted[0]?.id ?? null, parsed.data);
    }
  } catch (error) {
    if (uniqueViolation(error)) return { ok: false, message: "Kode grade sudah dipakai." };
    throw error;
  }
  revalidate();
  return { ok: true, message: "Grade disimpan." };
}

/* ------------------------------------------------------------------ */
/* Positions                                                           */
/* ------------------------------------------------------------------ */

const positionSchema = z.object({
  name: name("Nama jabatan"),
  departmentId: optionalId,
  gradeId: optionalId,
  jobDescription: optional(5000),
  renameEmployees: z.boolean(),
});

export async function savePositionAction(id: string | null, formData: FormData): Promise<OrgMasterResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  const parsed = positionSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    departmentId: String(formData.get("departmentId") ?? ""),
    gradeId: String(formData.get("gradeId") ?? ""),
    jobDescription: String(formData.get("jobDescription") ?? ""),
    renameEmployees: formData.get("renameEmployees") === "on",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { renameEmployees, ...values } = parsed.data;
  if (values.departmentId) {
    const found = await db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.id, values.departmentId), eq(departments.organizationId, ctx.organizationId)))
      .limit(1);
    if (!found[0]) return { ok: false, message: "Departemen tidak ditemukan." };
  }
  if (values.gradeId) {
    const found = await db
      .select({ id: jobGrades.id })
      .from(jobGrades)
      .where(and(eq(jobGrades.id, values.gradeId), eq(jobGrades.organizationId, ctx.organizationId)))
      .limit(1);
    if (!found[0]) return { ok: false, message: "Grade tidak ditemukan." };
  }
  let renamed = 0;
  try {
    if (id) {
      if (!UUID.test(id)) return { ok: false, message: "Jabatan tidak ditemukan." };
      const current = (
        await db
          .select({ name: jobPositions.name })
          .from(jobPositions)
          .where(and(eq(jobPositions.id, id), eq(jobPositions.organizationId, ctx.organizationId)))
          .limit(1)
      )[0];
      if (!current) return { ok: false, message: "Jabatan tidak ditemukan." };
      await db
        .update(jobPositions)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(jobPositions.id, id), eq(jobPositions.organizationId, ctx.organizationId)));
      if (renameEmployees && current.name !== values.name) {
        renamed = await renameEmployeeValues(ctx, "position", nameKey(current.name), values.name);
      }
      await audit(ctx, "org_master.position_updated", "job_position", id, { from: current.name, to: values.name, employeesUpdated: renamed });
    } else {
      const inserted = await db.insert(jobPositions).values({ ...values, organizationId: ctx.organizationId }).returning({ id: jobPositions.id });
      await audit(ctx, "org_master.position_created", "job_position", inserted[0]?.id ?? null, { name: values.name });
    }
  } catch (error) {
    if (uniqueViolation(error)) return { ok: false, message: "Nama jabatan sudah ada." };
    throw error;
  }
  revalidate();
  return { ok: true, message: renamed > 0 ? `Jabatan disimpan; ${renamed} karyawan ikut diperbarui.` : "Jabatan disimpan." };
}

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

export async function setMasterActiveAction(kind: "department" | "position" | "grade", id: string, active: boolean): Promise<OrgMasterResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, message: "Data tidak ditemukan." };
  const table = kind === "department" ? departments : kind === "position" ? jobPositions : jobGrades;
  const updated = await db
    .update(table)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(table.id, id), eq(table.organizationId, ctx.organizationId)))
    .returning({ id: table.id });
  if (!updated[0]) return { ok: false, message: "Data tidak ditemukan." };
  await audit(ctx, "org_master.status_changed", kind, id, { active });
  revalidate();
  return { ok: true, message: active ? "Diaktifkan." : "Dinonaktifkan." };
}

/** Creates master entries for every department / position used by employees but not registered yet. */
export async function importFromEmployeesAction(kind: "department" | "position"): Promise<OrgMasterResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  const table = kind === "department" ? departments : jobPositions;
  const existing = await db.select({ name: table.name }).from(table).where(eq(table.organizationId, ctx.organizationId));
  const missing = unregistered(groupValues(await listEmployeeValues(ctx.organizationId, kind)), existing.map((e) => e.name));
  if (missing.length === 0) return { ok: true, message: "Semua nilai di data karyawan sudah terdaftar." };
  const rows = missing.map((g) => ({ organizationId: ctx.organizationId, name: g.preferred }));
  const inserted = await db.insert(table).values(rows).onConflictDoNothing().returning({ id: table.id });
  await audit(ctx, "org_master.imported", kind, null, { created: inserted.length });
  revalidate();
  return { ok: true, message: `${inserted.length} ${kind === "department" ? "departemen" : "jabatan"} ditambahkan dari data karyawan.` };
}

/**
 * Rewrites employee spellings that match a master entry to the master's
 * exact name ("akuntansi " → "Akuntansi").
 */
export async function unifySpellingAction(kind: "department" | "position"): Promise<OrgMasterResult> {
  const ctx = await context();
  if (!isCtx(ctx)) return ctx;
  const table = kind === "department" ? departments : jobPositions;
  const names = await db
    .select({ name: table.name })
    .from(table)
    .where(and(eq(table.organizationId, ctx.organizationId), eq(table.active, true)));
  let total = 0;
  for (const { name: master } of names) total += await renameEmployeeValues(ctx, kind, nameKey(master), master);
  await audit(ctx, "org_master.spelling_unified", kind, null, { employeesUpdated: total });
  revalidate();
  return { ok: true, message: total > 0 ? `${total} data karyawan diseragamkan.` : "Ejaan sudah seragam." };
}
