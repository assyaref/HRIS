"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { employeePayrollComponents } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import {
  evaluateCreateEmployeePayrollComponentGuard,
  evaluateEndEmployeePayrollComponentGuard,
  evaluateUpdateEmployeePayrollComponentGuard,
} from "./employee-payroll-component.guard";
import {
  getEmployeeForPayrollComponent,
  getEmployeePayrollComponentInOrganization,
  getPayrollComponentForEmployee,
  hasActiveEmployeePayrollComponent,
} from "./employee-payroll-component.queries";
import {
  employeePayrollComponentCreateSchema,
  employeePayrollComponentEndSchema,
  employeePayrollComponentUpdateSchema,
} from "./employee-payroll-component.schemas";
import { dateToUtc } from "./schemas";

/**
 * PM-03.2 — Employee payroll component assignment server actions.
 *
 * Security rules (all enforced server-side on every submission):
 * - `requireUser()` + `requirePermission(PAYROLL_MANAGE)` — ordinary
 *   employees, finance-only and read-only roles can never reach these
 *   mutations. This mirrors the master component management actions.
 * - `organizationId` comes exclusively from the authenticated session.
 * - `employeeId`/`componentId` ownership is re-verified org-scoped; foreign
 *   records resolve to generic "not found" (no existence leak).
 * - At most ONE ACTIVE assignment per (org, employee, component), enforced by
 *   a deterministic pre-check; the DB partial unique index is the final guard.
 * - Ending an assignment is a soft end (`active = false` + `effective_to`) so
 *   the historical row remains for audit and recalculation.
 * - `amount` is always a non-negative magnitude stored server-side; the sign
 *   is implied by the component type at calculation time. Percentage
 *   components reject employee amounts above 100.
 * - Every mutation writes a best-effort audit entry.
 */

export interface EmployeePayrollComponentActionResult {
  ok: boolean;
  message: string;
  assignmentId?: string;
}

const DB_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === DB_UNIQUE_VIOLATION
  );
}

function messageFromIssues(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Isian tidak valid.";
}

/** UTC midnight for today (used as the default end date). */
function todayUtc(): Date {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

/** Assign a payroll component to an active employee (org-scoped). */
export async function createEmployeePayrollComponentAction(
  input: unknown
): Promise<EmployeePayrollComponentActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_MANAGE);
  if (!user.organizationId) {
    return {
      ok: false,
      message: "Akun Anda belum ditetapkan ke organisasi.",
    };
  }
  const organizationId = user.organizationId;

  const parsed = employeePayrollComponentCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: messageFromIssues(parsed.error) };
  }
  const values = parsed.data;

  try {
    const [employee, component, existingActive] = await Promise.all([
      getEmployeeForPayrollComponent(organizationId, values.employeeId),
      getPayrollComponentForEmployee(organizationId, values.componentId),
      hasActiveEmployeePayrollComponent(
        organizationId,
        values.employeeId,
        values.componentId
      ),
    ]);

    const effectiveFrom = dateToUtc(values.effectiveFrom);
    const effectiveTo = values.effectiveTo ? dateToUtc(values.effectiveTo) : null;

    const decision = evaluateCreateEmployeePayrollComponentGuard({
      actorOrganizationId: organizationId,
      employee,
      component,
      existingActiveAssignment: existingActive,
      amount: values.amount,
      effectiveFrom,
      effectiveTo,
    });
    if (!decision.ok) {
      return { ok: false, message: decision.message };
    }

    const inserted = await db
      .insert(employeePayrollComponents)
      .values({
        organizationId,
        employeeId: values.employeeId,
        componentId: values.componentId,
        amount: values.amount,
        effectiveFrom,
        effectiveTo,
        active: true,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      })
      .returning({ id: employeePayrollComponents.id });

    const assignmentId = inserted[0]?.id;
    if (!assignmentId) {
      return { ok: false, message: "Komponen payroll gagal ditetapkan." };
    }

    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "payroll.employee_component.created",
      entityType: "employee_payroll_component",
      entityId: assignmentId,
      metadata: {
        employeeId: values.employeeId,
        employeeNumber: employee?.employeeNumber ?? null,
        componentId: values.componentId,
        componentCode: component?.code ?? null,
        componentName: component?.name ?? null,
        amount: values.amount,
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo ?? null,
      },
    });

    revalidatePath(`/employees/${values.employeeId}`);
    return {
      ok: true,
      message: "Komponen payroll ditetapkan ke karyawan.",
      assignmentId,
    };
  } catch (error) {
    // Rare race on the partial unique index (concurrent duplicate submits).
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message:
          "Karyawan ini sudah memiliki penetapan aktif untuk komponen payroll ini.",
      };
    }
    console.error("[payroll] create employee payroll component failed", error);
    return {
      ok: false,
      message: "Komponen payroll gagal ditetapkan. Silakan coba lagi.",
    };
  }
}

/** Update an active assignment's amount / effective window / notes. */
export async function updateEmployeePayrollComponentAction(
  assignmentId: string,
  input: unknown
): Promise<EmployeePayrollComponentActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_MANAGE);
  if (!user.organizationId) {
    return {
      ok: false,
      message: "Akun Anda belum ditetapkan ke organisasi.",
    };
  }
  const organizationId = user.organizationId;

  const parsed = employeePayrollComponentUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: messageFromIssues(parsed.error) };
  }
  const values = parsed.data;

  try {
    const assignment = await getEmployeePayrollComponentInOrganization(
      organizationId,
      assignmentId
    );

    const effectiveFrom = dateToUtc(values.effectiveFrom);
    const effectiveTo = values.effectiveTo ? dateToUtc(values.effectiveTo) : null;

    const decision = evaluateUpdateEmployeePayrollComponentGuard({
      actorOrganizationId: organizationId,
      assignment,
      amount: values.amount,
      effectiveFrom,
      effectiveTo,
    });
    if (!decision.ok) {
      return { ok: false, message: decision.message };
    }

    const updated = await db
      .update(employeePayrollComponents)
      .set({
        amount: values.amount,
        effectiveFrom,
        effectiveTo,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      })
      .where(
        and(
          eq(employeePayrollComponents.id, assignmentId),
          eq(employeePayrollComponents.organizationId, organizationId)
        )
      )
      .returning({ id: employeePayrollComponents.id });

    if (!updated[0]) {
      return { ok: false, message: "Penetapan komponen payroll tidak ditemukan." };
    }

    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "payroll.employee_component.updated",
      entityType: "employee_payroll_component",
      entityId: assignmentId,
      metadata: {
        employeeId: assignment?.employeeId ?? null,
        employeeNumber: assignment?.employeeNumber ?? null,
        componentCode: assignment?.componentCode ?? null,
        componentName: assignment?.componentName ?? null,
        amount: values.amount,
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo ?? null,
      },
    });

    revalidatePath(`/employees/${assignment?.employeeId ?? ""}`);
    return { ok: true, message: "Penetapan komponen payroll diperbarui." };
  } catch (error) {
    console.error("[payroll] update employee payroll component failed", error);
    return {
      ok: false,
      message: "Penetapan komponen payroll gagal diperbarui. Silakan coba lagi.",
    };
  }
}

/**
 * Soft-end an active assignment (`active = false` + `effective_to`). The
 * historical row is preserved for audit and chronological configuration.
 */
export async function endEmployeePayrollComponentAction(
  assignmentId: string,
  input: unknown = {}
): Promise<EmployeePayrollComponentActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_MANAGE);
  if (!user.organizationId) {
    return {
      ok: false,
      message: "Akun Anda belum ditetapkan ke organisasi.",
    };
  }
  const organizationId = user.organizationId;

  const parsed = employeePayrollComponentEndSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: messageFromIssues(parsed.error) };
  }
  const values = parsed.data;

  const effectiveTo = values.effectiveTo ? dateToUtc(values.effectiveTo) : todayUtc();

  try {
    const assignment = await getEmployeePayrollComponentInOrganization(
      organizationId,
      assignmentId
    );

    const decision = evaluateEndEmployeePayrollComponentGuard({
      actorOrganizationId: organizationId,
      assignment,
      effectiveTo,
    });
    if (!decision.ok) {
      return { ok: false, message: decision.message };
    }

    await db
      .update(employeePayrollComponents)
      .set({ active: false, effectiveTo })
      .where(
        and(
          eq(employeePayrollComponents.id, assignmentId),
          eq(employeePayrollComponents.organizationId, organizationId)
        )
      );

    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "payroll.employee_component.ended",
      entityType: "employee_payroll_component",
      entityId: assignmentId,
      metadata: {
        employeeId: assignment?.employeeId ?? null,
        employeeNumber: assignment?.employeeNumber ?? null,
        componentCode: assignment?.componentCode ?? null,
        componentName: assignment?.componentName ?? null,
        active: false,
        effectiveTo: effectiveTo.toISOString(),
      },
    });

    revalidatePath(`/employees/${assignment?.employeeId ?? ""}`);
    return { ok: true, message: "Penetapan komponen payroll diakhiri." };
  } catch (error) {
    console.error("[payroll] end employee payroll component failed", error);
    return {
      ok: false,
      message: "Penetapan komponen payroll gagal diakhiri. Silakan coba lagi.",
    };
  }
}