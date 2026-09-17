"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { db } from "@/db";
import {
  employees,
  employeePayrollComponents,
  organizations,
  payrollComponents,
  payrollEvents,
  payrollItemComponents,
  payrollItems,
  payrollPeriods,
  payrollRuns,
  payslips,
  payslipDocuments,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  requireAnyPermission,
  requirePermission,
} from "@/lib/auth/rbac";
import {
  encryptAndStorePayslipPdf,
  removeStoredPayslipPdf,
  renderPostScriptToPdf,
} from "@/lib/payroll/payslip-pdf";

import {
  calculateEmployeePayroll,
  type CalculationComponent,
  type EmployeeComponentAssignment,
} from "./calculation";
import {
  createPayrollPeriodSchema,
  dateToUtc,
  payrollComponentSchema,
  rejectPayrollSchema,
} from "./schemas";
import {
  countPayslipsMissingDocuments,
  sanitizePayslipOriginalFilename,
} from "./payslip-document.guard";
import { buildPayslipPostScript } from "./payslip-pdf-builder";
import {
  classifyPayslipPdfCandidates,
  runStatusAllowsDocumentGeneration,
} from "./payslip-pdf-generator.guard";

/**
 * Payroll server actions (Phase 8).
 *
 * - Periods and runs are org-scoped; the organization always comes from
 *   `requireUser()`. A period/run id from another organization resolves to
 *   `forbidden()` so existence never leaks.
 * - Amounts, totals and statuses are computed/transitioned server-side only.
 *   Every workflow transition runs in a transaction with a row lock on the
 *   period (serializing double submission/approval), appends an immutable
 *   `payroll_events` row, and writes a best-effort audit entry.
 * - Runs become immutable once locked; finalized payroll data (items,
 *   components, payslips) is never physically deleted.
 */

export interface PayrollActionResult {
  ok: boolean;
  message: string;
}

type AuditAction =
  | "payroll.period.created"
  | "payroll.calculated"
  | "payroll.submitted"
  | "payroll.approved"
  | "payroll.rejected"
  | "payroll.locked"
  | "payroll.cancelled"
  | "payslip.generated"
  | "payslip.document.generated"
  | "payslip.published";

async function auditPayroll(input: {
  organizationId: string;
  actorUserId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.error("[payroll] audit failed", error);
  }
}

interface PeriodWithRunRow {
  periodId: string;
  periodCode: string;
  periodName: string;
  periodStatus: string;
  periodEnd: Date;
  runId: string | null;
  runStatus: string | null;
}

/** Lock the org-scoped period row for the duration of a transition. */
async function lockPeriod(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
  periodId: string
): Promise<PeriodWithRunRow | null> {
  // Lock only the payroll period row. Do not use FOR UPDATE on a LEFT JOIN,
  // because PostgreSQL rejects locking the nullable side of an outer join.
  const periodRows = await tx
    .select({
      periodId: payrollPeriods.id,
      periodCode: payrollPeriods.code,
      periodName: payrollPeriods.name,
      periodStatus: payrollPeriods.status,
      periodEnd: payrollPeriods.periodEnd,
    })
    .from(payrollPeriods)
    .where(
      and(
        eq(payrollPeriods.id, periodId),
        eq(payrollPeriods.organizationId, organizationId)
      )
    )
    .for("update")
    .limit(1);

  const period = periodRows[0];
  if (!period) return null;

  // The period row is now locked for this transaction, so all payroll
  // transitions for this period are serialized before reading/updating its run.
  const runRows = await tx
    .select({
      runId: payrollRuns.id,
      runStatus: payrollRuns.status,
    })
    .from(payrollRuns)
    .where(eq(payrollRuns.payrollPeriodId, period.periodId))
    .limit(1);

  const run = runRows[0];

  return {
    periodId: period.periodId,
    periodCode: period.periodCode,
    periodName: period.periodName,
    periodStatus: period.periodStatus,
    periodEnd: period.periodEnd,
    runId: run?.runId ?? null,
    runStatus: run?.runStatus ?? null,
  };
}

function messageFromParseError(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

/** Create a payroll period (org-scoped). No run is created until calculate. */
export async function createPayrollPeriodAction(
  input: unknown
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYROLL_CREATE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  const parsed = createPayrollPeriodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: messageFromParseError(parsed.error) };
  }
  const values = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(payrollPeriods)
        .values({
          organizationId,
          code: values.code,
          name: values.name,
          periodStart: dateToUtc(values.periodStart),
          periodEnd: dateToUtc(values.periodEnd),
          paymentDate: dateToUtc(values.paymentDate),
          status: "draft",
        })
        .returning({ id: payrollPeriods.id });

      const periodId = inserted[0]?.id;
      if (!periodId) {
        throw new Error("Payroll period insert returned no row.");
      }

      await tx.insert(payrollEvents).values({
        organizationId,
        payrollPeriodId: periodId,
        actorUserId: user.id,
        eventType: "payroll.period_created",
        fromStatus: null,
        toStatus: "draft",
        reason: null,
        metadata: JSON.stringify({
          code: values.code,
          periodStart: values.periodStart,
          periodEnd: values.periodEnd,
        }),
      });
    });

    await auditPayroll({
      organizationId,
      actorUserId: user.id,
      action: "payroll.period.created",
      entityType: "payroll_period",
      metadata: {
        code: values.code,
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
      },
    });
    return { ok: true, message: "Payroll period created." };
  } catch (error) {
    console.error("[payroll] create period failed", error);
    return {
      ok: false,
      message:
        "The payroll period could not be created. A period with this code may already exist.",
    };
  }
}



/* ------------------------------------------------------------------ */
/* Payroll components (master salary component definitions)            */
/* ------------------------------------------------------------------ */

/** Create an org payroll component. */
export async function createPayrollComponentAction(
  input: unknown
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_MANAGE);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  const parsed = payrollComponentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: messageFromParseError(parsed.error) };
  }
  const values = parsed.data;

  try {
    await db.insert(payrollComponents).values({
      organizationId,
      code: values.code,
      name: values.name,
      type: values.type,
      calculationMethod: values.calculationMethod,
      defaultAmount: values.defaultAmount ?? 0,
      description: values.description?.trim() || null,
    });
    return { ok: true, message: "Payroll component created." };
  } catch (error) {
    console.error("[payroll] create component failed", error);
    return {
      ok: false,
      message: "The component could not be created. A component with this code may already exist.",
    };
  }
}

/** Update an org payroll component. */
export async function updatePayrollComponentAction(
  componentId: string,
  input: unknown
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_MANAGE);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  const parsed = payrollComponentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: messageFromParseError(parsed.error) };
  }
  const values = parsed.data;

  const existing = await db
    .select({ id: payrollComponents.id })
    .from(payrollComponents)
    .where(
      and(
        eq(payrollComponents.id, componentId),
        eq(payrollComponents.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!existing[0]) forbidden();

  try {
    await db
      .update(payrollComponents)
      .set({
        code: values.code,
        name: values.name,
        type: values.type,
        calculationMethod: values.calculationMethod,
        defaultAmount: values.defaultAmount ?? 0,
        description: values.description?.trim() || null,
      })
      .where(eq(payrollComponents.id, componentId));
    return { ok: true, message: "Payroll component updated." };
  } catch (error) {
    console.error("[payroll] update component failed", error);
    return {
      ok: false,
      message: "The component could not be updated. A component with this code may already exist.",
    };
  }
}

/** Activate/deactivate an org payroll component. */
export async function setPayrollComponentActiveAction(
  componentId: string,
  active: boolean
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_MANAGE);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  const existing = await db
    .select({ id: payrollComponents.id })
    .from(payrollComponents)
    .where(
      and(
        eq(payrollComponents.id, componentId),
        eq(payrollComponents.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!existing[0]) forbidden();

  await db
    .update(payrollComponents)
    .set({ active: active ? "true" : "false" })
    .where(eq(payrollComponents.id, componentId));
  return {
    ok: true,
    message: active ? "Component activated." : "Component deactivated.",
  };
}


/* ------------------------------------------------------------------ */
/* Run calculation                                                     */
/* ------------------------------------------------------------------ */

/**
 * Calculate a payroll run for a period.
 *
 * Creates the run (first calculation) or rewrites a draft/rejected run, then
 * computes one item per active employee. Each employee's own active + effective
 * employee component assignments (PM-03.4) override the organization's active
 * master component defaults; see features/payroll/calculation.ts. Deterministic
 * integer math only (see features/payroll/money.ts).
 */
export async function calculatePayrollAction(
  periodId: string
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYROLL_CALCULATE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) {
    return {
      ok: false,
      message: "Your account is not assigned to an organization.",
    };
  }
  const organizationId = user.organizationId;

  try {
    const outcome = await db.transaction(async (tx) => {
      const period = await lockPeriod(tx, organizationId, periodId);
      if (!period) {
        return { kind: "error" as const, message: "Period not found." };
      }
      if (period.periodStatus !== "draft") {
        return {
          kind: "error" as const,
          message: "Only draft periods can be (re)calculated.",
        };
      }
      if (
        period.runId &&
        period.runStatus !== "draft" &&
        period.runStatus !== "rejected"
      ) {
        return {
          kind: "error" as const,
          message:
            "This run has already progressed and can no longer be calculated.",
        };
      }

      // Ensure the run row exists (first calculation) before writing items.
      let runId = period.runId;
      if (!runId) {
        const runRows = await tx
          .insert(payrollRuns)
          .values({
            organizationId,
            payrollPeriodId: period.periodId,
            status: "draft",
          })
          .returning({ id: payrollRuns.id });
        runId = runRows[0]?.id ?? null;
      }
      if (!runId) {
        return {
          kind: "error" as const,
          message: "The run could not be created.",
        };
      }

      // Recalculate: replace any previous non-finalized item set (components
      // cascade; payslips can never exist while the run is still draftable).
      await tx.delete(payrollItems).where(eq(payrollItems.payrollRunId, runId));

      const employeeRows = await tx
        .select({
          id: employees.id,
          employeeNumber: employees.employeeNumber,
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(employees)
        .where(
          and(
            eq(employees.organizationId, organizationId),
            eq(employees.employmentStatus, "active")
          )
        )
        .orderBy(asc(employees.employeeNumber));

      const masterRows = await tx
        .select({
          id: payrollComponents.id,
          code: payrollComponents.code,
          name: payrollComponents.name,
          type: payrollComponents.type,
          calculationMethod: payrollComponents.calculationMethod,
          defaultAmount: payrollComponents.defaultAmount,
        })
        .from(payrollComponents)
        .where(
          and(
            eq(payrollComponents.organizationId, organizationId),
            eq(payrollComponents.active, "true")
          )
        )
        .orderBy(asc(payrollComponents.code));
      const componentRows = masterRows.map((row) => ({
        ...row,
        type: row.type as CalculationComponent["type"],
        calculationMethod:
          row.calculationMethod as CalculationComponent["calculationMethod"],
      }));

      // PM-03.4 — the employee's own ACTIVE assignments (org-scoped). Only the
      // pure engine decides whether a row is effective for the calculation
      // date (the period's end); inactive/future/ended rows never apply.
      const rawAssignmentRows = await tx
        .select({
          id: employeePayrollComponents.id,
          employeeId: employeePayrollComponents.employeeId,
          componentId: employeePayrollComponents.componentId,
          amount: employeePayrollComponents.amount,
          effectiveFrom: employeePayrollComponents.effectiveFrom,
          effectiveTo: employeePayrollComponents.effectiveTo,
          active: employeePayrollComponents.active,
        })
        .from(employeePayrollComponents)
        .where(
          and(
            eq(employeePayrollComponents.organizationId, organizationId),
            eq(employeePayrollComponents.active, true)
          )
        )
        .orderBy(
          asc(employeePayrollComponents.employeeId),
          asc(employeePayrollComponents.componentId)
        );
      const assignmentRows = rawAssignmentRows as EmployeeComponentAssignment[];

      let grossTotal = 0;
      let deductionTotal = 0;
      let netTotal = 0;
      let includedCount = 0;

      for (const employee of employeeRows) {
        const result = calculateEmployeePayroll({
          employeeId: employee.id,
          calculationDate: period.periodEnd,
          components: componentRows,
          assignments: assignmentRows,
        });
        const computed = result.components;
        const earnings = result.totalEarnings;
        const deductions = result.totalDeductions;
        const net = result.netAmount;
        grossTotal += earnings;
        deductionTotal += deductions;
        netTotal += net;
        includedCount += 1;

        const itemRows = await tx
          .insert(payrollItems)
          .values({
            organizationId,
            payrollRunId: runId,
            employeeId: employee.id,
            employeeNumberSnapshot: employee.employeeNumber,
            employeeNameSnapshot: `${employee.firstName} ${employee.lastName}`.trim(),
            grossAmount: earnings,
            totalEarnings: earnings,
            totalDeductions: deductions,
            netAmount: net,
            status: "included",
          })
          .returning({ id: payrollItems.id });
        const itemId = itemRows[0]?.id;
        if (!itemId) continue;

        if (computed.length > 0) {
          await tx.insert(payrollItemComponents).values(
            computed.map((component) => ({
              organizationId,
              payrollItemId: itemId,
              componentId: component.componentId,
              componentCodeSnapshot: component.componentCode,
              componentNameSnapshot: component.componentName,
              componentTypeSnapshot: component.componentType,
              amount: component.amount,
              notes: null,
            }))
          );
        }
      }


      const now = new Date();
      await tx
        .update(payrollRuns)
        .set({ status: "calculated", calculatedAt: now })
        .where(eq(payrollRuns.id, runId));
      await tx
        .update(payrollPeriods)
        .set({ status: "pending_approval" })
        .where(eq(payrollPeriods.id, period.periodId));

      await tx.insert(payrollEvents).values({
        organizationId,
        payrollPeriodId: period.periodId,
        actorUserId: user.id,
        eventType: "payroll.calculated",
        fromStatus: period.runStatus ?? null,
        toStatus: "calculated",
        reason: null,
        metadata: JSON.stringify({
          employeeCount: includedCount,
          grossTotal,
          deductionTotal,
          netTotal,
        }),
      });

      return {
        kind: "success" as const,
        message: `Calculated payroll for ${includedCount} employee${
          includedCount === 1 ? "" : "s"
        }.`,
        grossTotal,
        deductionTotal,
        netTotal,
      };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }
    await auditPayroll({
      organizationId,
      actorUserId: user.id,
      action: "payroll.calculated",
      entityType: "payroll_run",
      metadata: {
        grossTotal: outcome.grossTotal,
        deductionTotal: outcome.deductionTotal,
        netTotal: outcome.netTotal,
      },
    });
    return { ok: true, message: outcome.message };
  } catch (error) {
    console.error("[payroll] calculate failed", error);
    return {
      ok: false,
      message: "The payroll run could not be calculated. Please try again.",
    };
  }
}


/** Submit a calculated run to the approver. */
export async function submitPayrollRunAction(
  periodId: string
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYROLL_UPDATE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  try {
    const outcome = await db.transaction(async (tx) => {
      const period = await lockPeriod(tx, organizationId, periodId);
      if (!period) return { kind: "error" as const, message: "Period not found." };
      if (!period.runId || period.runStatus !== "calculated") {
        return {
          kind: "error" as const,
          message: "The run must be calculated before it can be submitted.",
        };
      }
      if (period.periodStatus !== "pending_approval") {
        return {
          kind: "error" as const,
          message: "The period is not waiting for approval.",
        };
      }
      const now = new Date();
      await tx
        .update(payrollRuns)
        .set({ status: "submitted", submittedAt: now, submittedBy: user.id })
        .where(eq(payrollRuns.id, period.runId));
      await tx.insert(payrollEvents).values({
        organizationId,
        payrollPeriodId: period.periodId,
        actorUserId: user.id,
        eventType: "payroll.submitted",
        fromStatus: "calculated",
        toStatus: "submitted",
        reason: null,
        metadata: null,
      });
      return { kind: "success" as const };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }
    await auditPayroll({
      organizationId,
      actorUserId: user.id,
      action: "payroll.submitted",
      entityType: "payroll_run",
    });
    return { ok: true, message: "Run submitted for approval." };
  } catch (error) {
    console.error("[payroll] submit failed", error);
    return { ok: false, message: "The run could not be submitted. Please try again." };
  }
}

/** Approve a submitted run and move the period to approved. */
export async function approvePayrollRunAction(
  periodId: string
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYROLL_APPROVE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  try {
    const outcome = await db.transaction(async (tx) => {
      const period = await lockPeriod(tx, organizationId, periodId);
      if (!period) return { kind: "error" as const, message: "Period not found." };
      if (!period.runId || period.runStatus !== "submitted") {
        return {
          kind: "error" as const,
          message: "Only submitted runs can be approved.",
        };
      }
      const now = new Date();
      await tx
        .update(payrollRuns)
        .set({ status: "approved", approvedAt: now, approvedBy: user.id })
        .where(eq(payrollRuns.id, period.runId));
      await tx
        .update(payrollPeriods)
        .set({ status: "approved" })
        .where(eq(payrollPeriods.id, period.periodId));
      await tx.insert(payrollEvents).values({
        organizationId,
        payrollPeriodId: period.periodId,
        actorUserId: user.id,
        eventType: "payroll.approved",
        fromStatus: "submitted",
        toStatus: "approved",
        reason: null,
        metadata: null,
      });
      return { kind: "success" as const };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }
    await auditPayroll({
      organizationId,
      actorUserId: user.id,
      action: "payroll.approved",
      entityType: "payroll_run",
    });
    return { ok: true, message: "Run approved. Payslips can now be generated." };
  } catch (error) {
    console.error("[payroll] approve failed", error);
    return { ok: false, message: "The run could not be approved. Please try again." };
  }
}


/** Reject a submitted run (returns the period to draft for recalculation). */
export async function rejectPayrollRunAction(
  periodId: string,
  reason: string
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYROLL_APPROVE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  const parsed = rejectPayrollSchema.safeParse({ reason });
  if (!parsed.success) {
    return { ok: false, message: messageFromParseError(parsed.error) };
  }
  const trimmedReason = parsed.data.reason;

  try {
    const outcome = await db.transaction(async (tx) => {
      const period = await lockPeriod(tx, organizationId, periodId);
      if (!period) return { kind: "error" as const, message: "Period not found." };
      if (!period.runId || period.runStatus !== "submitted") {
        return {
          kind: "error" as const,
          message: "Only submitted runs can be rejected.",
        };
      }
      await tx
        .update(payrollRuns)
        .set({ status: "rejected" })
        .where(eq(payrollRuns.id, period.runId));
      await tx
        .update(payrollPeriods)
        .set({ status: "draft" })
        .where(eq(payrollPeriods.id, period.periodId));
      await tx.insert(payrollEvents).values({
        organizationId,
        payrollPeriodId: period.periodId,
        actorUserId: user.id,
        eventType: "payroll.rejected",
        fromStatus: "submitted",
        toStatus: "rejected",
        reason: trimmedReason,
        metadata: null,
      });
      return { kind: "success" as const };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }
    await auditPayroll({
      organizationId,
      actorUserId: user.id,
      action: "payroll.rejected",
      entityType: "payroll_run",
      metadata: { reason: trimmedReason },
    });
    return { ok: true, message: "Run rejected. The period is back to draft." };
  } catch (error) {
    console.error("[payroll] reject failed", error);
    return { ok: false, message: "The run could not be rejected. Please try again." };
  }
}

/** Lock an approved run and its period (final; no further changes). */
export async function lockPayrollRunAction(
  periodId: string
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYROLL_LOCK,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  try {
    const outcome = await db.transaction(async (tx) => {
      const period = await lockPeriod(tx, organizationId, periodId);
      if (!period) return { kind: "error" as const, message: "Period not found." };
      if (!period.runId || period.runStatus !== "approved") {
        return {
          kind: "error" as const,
          message: "Only approved runs can be locked.",
        };
      }
      const now = new Date();
      await tx
        .update(payrollRuns)
        .set({ status: "locked", lockedAt: now, lockedBy: user.id })
        .where(eq(payrollRuns.id, period.runId));
      await tx
        .update(payrollPeriods)
        .set({ status: "locked" })
        .where(eq(payrollPeriods.id, period.periodId));
      await tx.insert(payrollEvents).values({
        organizationId,
        payrollPeriodId: period.periodId,
        actorUserId: user.id,
        eventType: "payroll.locked",
        fromStatus: "approved",
        toStatus: "locked",
        reason: null,
        metadata: null,
      });
      return { kind: "success" as const };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }
    await auditPayroll({
      organizationId,
      actorUserId: user.id,
      action: "payroll.locked",
      entityType: "payroll_run",
    });
    return { ok: true, message: "Run locked. The payroll is now final." };
  } catch (error) {
    console.error("[payroll] lock failed", error);
    return { ok: false, message: "The run could not be locked. Please try again." };
  }
}


/** Cancel a draft payroll period. */
export async function cancelPayrollPeriodAction(
  periodId: string
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYROLL_UPDATE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  try {
    const outcome = await db.transaction(async (tx) => {
      const period = await lockPeriod(tx, organizationId, periodId);
      if (!period) return { kind: "error" as const, message: "Period not found." };
      if (period.periodStatus !== "draft") {
        return {
          kind: "error" as const,
          message: "Only draft periods can be cancelled.",
        };
      }
      if (period.runId) {
        if (
          period.runStatus !== "draft" &&
          period.runStatus !== "rejected" &&
          period.runStatus !== null
        ) {
          return {
            kind: "error" as const,
            message: "Cancel the run state first (reject or recalculate).",
          };
        }
        await tx
          .update(payrollRuns)
          .set({ status: "cancelled" })
          .where(eq(payrollRuns.id, period.runId));
      }
      await tx
        .update(payrollPeriods)
        .set({ status: "cancelled" })
        .where(eq(payrollPeriods.id, period.periodId));
      await tx.insert(payrollEvents).values({
        organizationId,
        payrollPeriodId: period.periodId,
        actorUserId: user.id,
        eventType: "payroll.cancelled",
        fromStatus: "draft",
        toStatus: "cancelled",
        reason: null,
        metadata: null,
      });
      return { kind: "success" as const };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }
    await auditPayroll({
      organizationId,
      actorUserId: user.id,
      action: "payroll.cancelled",
      entityType: "payroll_period",
    });
    return { ok: true, message: "Payroll period cancelled." };
  } catch (error) {
    console.error("[payroll] cancel failed", error);
    return { ok: false, message: "The period could not be cancelled. Please try again." };
  }
}


/* ------------------------------------------------------------------ */
/* Payslips                                                            */
/* ------------------------------------------------------------------ */

/**
 * Generate payslip rows for an approved/locked run.
 *
 * Idempotency is structural: one payslip row per included payroll item, and
 * generation is only allowed once per run (guarded inside the transaction).
 */
export async function generatePayslipsAction(
  periodId: string
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYSLIP_PUBLISH,
    PERMISSIONS.PAYSLIP_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  try {
    const outcome = await db.transaction(async (tx) => {
      const period = await lockPeriod(tx, organizationId, periodId);
      if (!period) return { kind: "error" as const, message: "Period not found." };
      if (!period.runId || (period.runStatus !== "approved" && period.runStatus !== "locked")) {
        return {
          kind: "error" as const,
          message: "Payslips can only be generated for approved or locked runs.",
        };
      }

      const runId = period.runId;
      const existing = await tx
        .select({ id: payslips.id })
        .from(payslips)
        .innerJoin(payrollItems, eq(payrollItems.id, payslips.payrollItemId))
        .where(
          and(
            eq(payrollItems.payrollRunId, runId),
            eq(payrollItems.organizationId, organizationId)
          )
        )
        .limit(1);
      if (existing[0]) {
        return {
          kind: "error" as const,
          message: "Payslips were already generated for this run.",
        };
      }

      const itemRows = await tx
        .select({
          id: payrollItems.id,
          employeeId: payrollItems.employeeId,
        })
        .from(payrollItems)
        .where(
          and(
            eq(payrollItems.payrollRunId, runId),
            eq(payrollItems.organizationId, organizationId),
            eq(payrollItems.status, "included")
          )
        )
        .orderBy(asc(payrollItems.employeeNameSnapshot));
      if (itemRows.length === 0) {
        return {
          kind: "error" as const,
          message: "There are no included employees to issue payslips for.",
        };
      }

      await tx.insert(payslips).values(
        itemRows.map((item, index) => ({
          organizationId,
          payrollItemId: item.id,
          employeeId: item.employeeId,
          payslipNumber: `PS-${period.periodCode}-${String(index + 1).padStart(4, "0")}`,
          status: "generated",
        }))
      );

      await tx.insert(payrollEvents).values({
        organizationId,
        payrollPeriodId: period.periodId,
        actorUserId: user.id,
        eventType: "payslip.generated",
        fromStatus: period.runStatus,
        toStatus: "generated",
        reason: null,
        metadata: JSON.stringify({ count: itemRows.length }),
      });
      return { kind: "success" as const, count: itemRows.length };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }
    await auditPayroll({
      organizationId,
      actorUserId: user.id,
      action: "payslip.generated",
      entityType: "payslip",
      metadata: { count: outcome.count },
    });
    return {
      ok: true,
      message: `Generated ${outcome.count} payslip${outcome.count === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    console.error("[payroll] generate payslips failed", error);
    return {
      ok: false,
      message: "Payslips could not be generated. Please try again.",
    };
  }
}


/**
 * Generate encrypted payslip PDF documents for an approved/locked run.
 *
 * PM-05 — Automated payslip document generation.
 *
 * The document content is assembled ONLY from immutable payroll snapshots
 * (payroll_item field/name/number snapshots, payroll_item_component
 * snapshots, payslip fields, period/organization metadata). Live employee
 * payroll configuration is never consulted, so a configuration change after
 * calculation can never alter a generated historical payslip.
 *
 * Rendering and encryption happen OUTSIDE the database transaction (they are
 * IO-heavy: Ghostscript + private filesystem), then the document metadata is
 * committed transactionally in a second transaction that re-locks every
 * payslip row and re-checks for an existing document (never generating a
 * duplicate, never overwriting). A stored file is removed again if its
 * database insert fails.
 *
 * Payslips whose employee identity is missing (NIK or birth date) or that
 * already have a document are skipped and reported, never blocking the rest
 * of the run. Published/revoked payslips are never touched.
 */
export interface GeneratePayslipPdfsResult extends PayrollActionResult {
  generated?: number;
  skipped?: number;
}

export async function generatePayslipPdfsAction(
  periodId: string
): Promise<GeneratePayslipPdfsResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYSLIP_PUBLISH,
    PERMISSIONS.PAYSLIP_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  try {
    // ---------------------------------------------------------------- phase 1
    // Lock the period row, gather org-scoped snapshot data, classify
    // candidates and build the (pure, deterministic) PostScript per payslip.
    const outcome = await db.transaction(async (tx) => {
      const period = await lockPeriod(tx, organizationId, periodId);
      if (!period) return { kind: "error" as const, message: "Period not found." };
      if (
        !period.runId ||
        !runStatusAllowsDocumentGeneration(period.runStatus)
      ) {
        return {
          kind: "error" as const,
          message:
            "Payslip documents can only be generated for approved or locked runs.",
        };
      }
      const runId = period.runId;

      const metaRows = await tx
        .select({
          code: payrollPeriods.code,
          name: payrollPeriods.name,
          periodStart: payrollPeriods.periodStart,
          periodEnd: payrollPeriods.periodEnd,
          paymentDate: payrollPeriods.paymentDate,
          organizationName: organizations.name,
          organizationCode: organizations.code,
        })
        .from(payrollPeriods)
        .innerJoin(
          organizations,
          eq(organizations.id, payrollPeriods.organizationId)
        )
        .where(
          and(
            eq(payrollPeriods.id, periodId),
            eq(payrollPeriods.organizationId, organizationId)
          )
        )
        .limit(1);

      const meta = metaRows[0];
      if (!meta) return { kind: "error" as const, message: "Period not found." };

      const payslipRows = await tx
        .select({
          id: payslips.id,
          payrollItemId: payslips.payrollItemId,
          employeeId: payslips.employeeId,
          payslipNumber: payslips.payslipNumber,
          issuedAt: payslips.issuedAt,
          status: payslips.status,
          employeeName: payrollItems.employeeNameSnapshot,
          employeeNumber: payrollItems.employeeNumberSnapshot,
          grossAmount: payrollItems.grossAmount,
          totalEarnings: payrollItems.totalEarnings,
          totalDeductions: payrollItems.totalDeductions,
          netAmount: payrollItems.netAmount,
        })
        .from(payslips)
        .innerJoin(payrollItems, eq(payrollItems.id, payslips.payrollItemId))
        .where(
          and(
            eq(payrollItems.payrollRunId, runId),
            eq(payrollItems.organizationId, organizationId)
          )
        )
        .orderBy(asc(payslips.payslipNumber));

      const payslipIds = payslipRows.map((row) => row.id);
      const payslipIdsHaveDocuments =
        payslipIds.length > 0
          ? await tx
              .select({ payslipId: payslipDocuments.payslipId })
              .from(payslipDocuments)
              .where(
                and(
                  eq(payslipDocuments.organizationId, organizationId),
                  inArray(payslipDocuments.payslipId, payslipIds)
                )
              )
          : [];
      const documentPayslipIds = new Set(
        payslipIdsHaveDocuments.map((row) => row.payslipId)
      );

      const employeeIds = payslipRows.map((row) => row.employeeId);
      const identityRows =
        employeeIds.length > 0
          ? await tx
              .select({
                id: employees.id,
                nik: employees.nik,
                birthDate: employees.birthDate,
              })
              .from(employees)
              .where(
                and(
                  eq(employees.organizationId, organizationId),
                  inArray(employees.id, employeeIds)
                )
              )
          : [];
      const identityByEmployee = new Map(
        identityRows.map((row) => [row.id, row])
      );

      const itemIds = payslipRows.map((row) => row.payrollItemId);
      const componentRows =
        itemIds.length > 0
          ? await tx
              .select({
                payrollItemId: payrollItemComponents.payrollItemId,
                code: payrollItemComponents.componentCodeSnapshot,
                name: payrollItemComponents.componentNameSnapshot,
                type: payrollItemComponents.componentTypeSnapshot,
                amount: payrollItemComponents.amount,
                notes: payrollItemComponents.notes,
              })
              .from(payrollItemComponents)
              .where(
                and(
                  eq(payrollItemComponents.organizationId, organizationId),
                  inArray(payrollItemComponents.payrollItemId, itemIds)
                )
              )
              .orderBy(
                asc(payrollItemComponents.componentTypeSnapshot),
                asc(payrollItemComponents.componentCodeSnapshot)
              )
          : [];
      const componentsByItem = new Map<string, typeof componentRows>();
      for (const row of componentRows) {
        const list = componentsByItem.get(row.payrollItemId);
        if (list) list.push(row);
        else componentsByItem.set(row.payrollItemId, [row]);
      }

      const { included, skipped } = classifyPayslipPdfCandidates(
        payslipRows.map((row) => ({
          payslipId: row.id,
          status: row.status,
          nik: identityByEmployee.get(row.employeeId)?.nik,
          birthDate: identityByEmployee.get(row.employeeId)?.birthDate,
          existingDocument: documentPayslipIds.has(row.id),
        }))
      );

      const payslipById = new Map(payslipRows.map((row) => [row.id, row]));

      const prepared: {
        payslipId: string;
        employeeId: string;
        nik: string;
        birthDate: Date;
        payslipNumber: string;
        postScript: string;
      }[] = [];

      for (const candidate of included) {
        const row = payslipById.get(candidate.payslipId);
        const identity = row
          ? identityByEmployee.get(row.employeeId)
          : undefined;

        if (!row || !identity || !identity.nik || !identity.birthDate) {
          // Unreachable for `included` entries by the guard's contract; fail
          // loudly rather than silently skip a payslip the guard admitted.
          throw new Error("Payslip PDF eligibility invariant violated.");
        }

        prepared.push({
          payslipId: row.id,
          employeeId: row.employeeId,
          nik: identity.nik,
          birthDate: identity.birthDate,
          payslipNumber: row.payslipNumber,
          postScript: buildPayslipPostScript({
            organizationName: meta.organizationName,
            organizationCode: meta.organizationCode,
            period: {
              code: meta.code,
              name: meta.name,
              periodStart: meta.periodStart,
              periodEnd: meta.periodEnd,
              paymentDate: meta.paymentDate,
            },
            employee: {
              name: row.employeeName,
              number: row.employeeNumber,
            },
            payslip: {
              number: row.payslipNumber,
              issuedAt: row.issuedAt,
            },
            grossAmount: row.grossAmount,
            totalDeductions: row.totalDeductions,
            netAmount: row.netAmount,
            components: componentsByItem.get(row.payrollItemId) ?? [],
          }),
        });
      }

      return {
        kind: "success" as const,
        periodId: period.periodId,
        prepared,
        skippedCount: skipped.length,
        totalCount: payslipRows.length,
      };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }

    if (outcome.totalCount === 0) {
      return { ok: false, message: "There are no generated payslips to process." };
    }

    if (outcome.prepared.length === 0) {
      return {
        ok: true,
        message:
          `No payslip PDFs were generated. ${outcome.skippedCount} ` +
          `payslip${outcome.skippedCount === 1 ? "" : "s"} skipped.`,
        generated: 0,
        skipped: outcome.skippedCount,
      };
    }

    // ---------------------------------------------------------------- phase 2
    // Render (Ghostscript) and encrypt each payslip OUTSIDE the transaction.
    // On any failure, every file stored so far is removed again.
    const stored: {
      payslipId: string;
      employeeId: string;
      payslipNumber: string;
      storageKey: string;
      originalFilename: string;
      fileSize: number;
      sha256: string;
    }[] = [];

    const removeStored = async (): Promise<void> => {
      for (const entry of stored) {
        try {
          await removeStoredPayslipPdf(entry.storageKey);
        } catch (error) {
          console.error("[payroll] stored PDF cleanup failed", error);
        }
      }
    };

    try {
      for (const entry of outcome.prepared) {
        const plaintextPdf = await renderPostScriptToPdf(
          entry.postScript
        );
        const metadata = await encryptAndStorePayslipPdf({
          pdf: plaintextPdf,
          identity: { nik: entry.nik, birthDate: entry.birthDate },
        });
        stored.push({
          payslipId: entry.payslipId,
          employeeId: entry.employeeId,
          payslipNumber: entry.payslipNumber,
          storageKey: metadata.storageKey,
          originalFilename: sanitizePayslipOriginalFilename(
            `${entry.payslipNumber}.pdf`
          ),
          fileSize: metadata.fileSize,
          sha256: metadata.sha256,
        });
      }
    } catch (error) {
      await removeStored();
      console.error("[payroll] payslip PDF generation failed", error);
      return {
        ok: false,
        message: "Payslip PDFs could not be rendered. Please try again.",
      };
    }

    // ---------------------------------------------------------------- phase 3
    // Commit document metadata: re-lock each payslip, re-verify it is still
    // `generated` and still without a document, then insert. A failed insert
    // removes the stored file again.
    try {
      await db.transaction(async (tx) => {
        for (const entry of stored) {
          const lockedRows = await tx
            .select({ id: payslips.id, status: payslips.status })
            .from(payslips)
            .where(
              and(
                eq(payslips.id, entry.payslipId),
                eq(payslips.organizationId, organizationId)
              )
            )
            .for("update")
            .limit(1);

          if (!lockedRows[0] || lockedRows[0].status !== "generated") {
            throw new Error("Payslip is no longer eligible for a PDF document.");
          }

          const existingRows = await tx
            .select({ id: payslipDocuments.id })
            .from(payslipDocuments)
            .where(
              and(
                eq(payslipDocuments.organizationId, organizationId),
                eq(payslipDocuments.payslipId, entry.payslipId)
              )
            )
            .limit(1);

          if (existingRows[0]) {
            throw new Error("A payslip document already exists for this payslip.");
          }

          await tx.insert(payslipDocuments).values({
            organizationId,
            payslipId: entry.payslipId,
            employeeId: entry.employeeId,
            storageKey: entry.storageKey,
            originalFilename: entry.originalFilename,
            mimeType: "application/pdf",
            fileSize: entry.fileSize,
            sha256: entry.sha256,
          });

          await tx.insert(payrollEvents).values({
            organizationId,
            payrollPeriodId: outcome.periodId,
            actorUserId: user.id,
            eventType: "payslip.document.generated",
            fromStatus: "generated",
            toStatus: "generated",
            reason: null,
            metadata: JSON.stringify({ payslipNumber: entry.payslipNumber }),
          });
        }
      });
    } catch (error) {
      await removeStored();
      console.error("[payroll] payslip document commit failed", error);
      return {
        ok: false,
        message: "Payslip PDFs could not be stored. Please try again.",
      };
    }

    await auditPayroll({
      organizationId,
      actorUserId: user.id,
      action: "payslip.document.generated",
      entityType: "payslip",
      metadata: {
        count: stored.length,
        skipped: outcome.skippedCount,
      },
    });

    const suffix =
      outcome.skippedCount > 0
        ? ` ${outcome.skippedCount} payslip${outcome.skippedCount === 1 ? "" : "s"} skipped.`
        : "";
    return {
      ok: true,
      message:
        `Generated ${stored.length} payslip PDF${stored.length === 1 ? "" : "s"}.` +
        suffix,
      generated: stored.length,
      skipped: outcome.skippedCount,
    };
  } catch (error) {
    console.error("[payroll] generate payslip PDFs failed", error);
    return {
      ok: false,
      message: "Payslip PDFs could not be generated. Please try again.",
    };
  }
}


/** Publish generated payslips so employees can view them (self-service). */
export async function publishPayslipsAction(
  periodId: string
): Promise<PayrollActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYSLIP_PUBLISH,
    PERMISSIONS.PAYSLIP_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;

  try {
    const outcome = await db.transaction(async (tx) => {
      const period = await lockPeriod(tx, organizationId, periodId);
      if (!period) return { kind: "error" as const, message: "Period not found." };
      if (!period.runId || (period.runStatus !== "approved" && period.runStatus !== "locked")) {
        return {
          kind: "error" as const,
          message: "Payslips can only be published for approved or locked runs.",
        };
      }
      const runId = period.runId;

      const itemRows = await tx
        .select({ id: payrollItems.id })
        .from(payrollItems)
        .where(
          and(
            eq(payrollItems.payrollRunId, runId),
            eq(payrollItems.organizationId, organizationId)
          )
        );
      if (itemRows.length === 0) {
        return {
          kind: "error" as const,
          message: "This run has no payroll items.",
        };
      }
      const itemIds = itemRows.map((row) => row.id);

      const pendingRows = await tx
        .select({
          id: payslips.id,
          payslipNumber: payslips.payslipNumber,
        })
        .from(payslips)
        .where(
          and(
            eq(payslips.organizationId, organizationId),
            inArray(payslips.payrollItemId, itemIds),
            eq(payslips.status, "generated")
          )
        );
      if (pendingRows.length === 0) {
        return {
          kind: "error" as const,
          message: "There are no generated payslips to publish.",
        };
      }

      // ==========================================================
      // PHASE 21.12D.2C.6 — PDF DOCUMENT PUBLISH GUARD
      //
      // Every generated payslip must have an encrypted PDF
      // document before it can be published to employee
      // self-service.
      //
      // Organization scope is enforced here as an additional
      // server-side boundary.
      // ==========================================================

      const pendingPayslipIds = pendingRows.map(
        (row) => row.id,
      );

      const documentRows = await tx
        .select({
          payslipId: payslipDocuments.payslipId,
        })
        .from(payslipDocuments)
        .where(
          and(
            eq(
              payslipDocuments.organizationId,
              organizationId,
            ),
            inArray(
              payslipDocuments.payslipId,
              pendingPayslipIds,
            ),
          ),
        );

      const documentPayslipIds = documentRows.map(
        (row) => row.payslipId,
      );

      const missingDocumentCount = countPayslipsMissingDocuments(
        pendingPayslipIds,
        documentPayslipIds,
      );

      if (missingDocumentCount > 0) {
        return {
          kind: "error" as const,
          message:
            `Cannot publish payslips. ${missingDocumentCount} ` +
            `payslip(s) do not have PDF documents yet.`,
        };
      }

      const now = new Date();
      await tx
        .update(payslips)
        .set({ status: "published", publishedAt: now })
        .where(
          and(
            eq(payslips.organizationId, organizationId),
            inArray(payslips.id, pendingRows.map((row) => row.id))
          )
        );

      await tx.insert(payrollEvents).values({
        organizationId,
        payrollPeriodId: period.periodId,
        actorUserId: user.id,
        eventType: "payslip.published",
        fromStatus: "generated",
        toStatus: "published",
        reason: null,
        metadata: JSON.stringify({ count: pendingRows.length }),
      });
      return { kind: "success" as const, count: pendingRows.length };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }
    await auditPayroll({
      organizationId,
      actorUserId: user.id,
      action: "payslip.published",
      entityType: "payslip",
      metadata: { count: outcome.count },
    });
    return {
      ok: true,
      message: `Published ${outcome.count} payslip${outcome.count === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    console.error("[payroll] publish payslips failed", error);
    return {
      ok: false,
      message: "Payslips could not be published. Please try again.",
    };
  }
}

