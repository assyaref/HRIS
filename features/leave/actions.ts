"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { db } from "@/db";
import {
  employees,
  leaveBalances,
  leaveRequestEvents,
  leaveRequests,
  leaveTypes,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  requireAnyPermission,
  requirePermission,
} from "@/lib/auth/rbac";
import type { CurrentUser } from "@/lib/auth/types";

import type { LinkedEmployee } from "@/features/employees/queries";
import { getEmployeeByUserId } from "@/features/employees/queries";
import {
  createLeaveRequestSchema,
  reviewRequestSchema,
} from "./schemas";
import { inclusiveDayCount } from "./format";

/**
 * Leave server actions (Phase 7).
 *
 * - Employee submit/cancel is resolved from the authenticated user's linked
 *   employee record; never from a client-supplied employee id.
 * - Approvals run in transactions with row locks (double-approval safe) and
 *   adjust balances atomically.
 * - Every transition appends an immutable `leave_request_events` row and an
 *   audit entry (best-effort).
 */

export interface LeaveActionResult {
  ok: boolean;
  message: string;
}

async function resolveEmployeeContext(user: CurrentUser): Promise<{
  ok: boolean;
  message?: string;
  organizationId?: string;
  employee?: LinkedEmployee;
}> {
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const employee = await getEmployeeByUserId(user.id, user.organizationId);
  if (!employee) {
    return {
      ok: false,
      message: "No employee profile is linked to your account.",
    };
  }
  return { ok: true, organizationId: user.organizationId, employee };
}

function dateOnlyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function auditLeave(
  input: {
    organizationId: string;
    actorUserId: string;
    action:
      | "leave.created"
      | "leave.cancelled"
      | "leave.approved"
      | "leave.rejected";
    entityId?: string | null;
    employeeNumber: string;
    eventType: string;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: "leave_request",
      entityId: input.entityId ?? null,
      metadata: {
        eventType: input.eventType,
        employeeNumber: input.employeeNumber,
        ...(input.metadata ?? {}),
      },
    });
  } catch (error) {
    console.error("[leave] audit failed", error);
  }
}

/** Employee submits a leave request (for themselves). */
export async function createLeaveRequestAction(
  input: unknown
): Promise<LeaveActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.LEAVE_CREATE);
  const resolved = await resolveEmployeeContext(user);
  if (!resolved.ok || !resolved.organizationId || !resolved.employee) {
    return { ok: false, message: resolved.message ?? "Request failed." };
  }
  const organizationId = resolved.organizationId;
  const employee = resolved.employee;

  const parsed = createLeaveRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const { leaveTypeId, startDate, endDate, reason } = parsed.data;

  if (endDate < startDate) {
    return {
      ok: false,
      message: "End date must not be before the start date.",
    };
  }
  const totalDays = inclusiveDayCount(startDate, endDate);
  if (totalDays === null) {
    return { ok: false, message: "The requested date range is invalid." };
  }
  const year = startDate.slice(0, 4);
  const startDateValue = dateOnlyToDate(startDate);
  const endDateValue = dateOnlyToDate(endDate);

  try {
    const outcome = await db.transaction(
      async (tx): Promise<{ kind: "error"; message: string } | { kind: "success"; id: string }> => {
      const typeRows = await tx
        .select({
          id: leaveTypes.id,
          defaultAllowanceDays: leaveTypes.defaultAllowanceDays,
          active: leaveTypes.active,
        })
        .from(leaveTypes)
        .where(
          and(
            eq(leaveTypes.id, leaveTypeId),
            eq(leaveTypes.organizationId, organizationId)
          )
        )
        .limit(1);
      const leaveType = typeRows[0];
      if (!leaveType || !leaveType.active) {
        return { kind: "error", message: "This leave type is not available." };
      }

      const overlapRows = await tx
        .select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.organizationId, organizationId),
            eq(leaveRequests.employeeId, employee.id),
            eq(leaveRequests.leaveTypeId, leaveTypeId),
            inArray(leaveRequests.status, ["pending", "approved"]),
            sql`${leaveRequests.startDate} <= ${endDate}`,
            sql`${leaveRequests.endDate} >= ${startDate}`
          )
        )
        .limit(1);
      if (overlapRows[0]) {
        return {
          kind: "error",
          message:
            "You already have a pending or approved request overlapping these dates.",
        };
      }

      // Lock the balance row (if any) so concurrent submissions serialize.
      const balanceRows = await tx
        .select({
          id: leaveBalances.id,
          entitlement: leaveBalances.entitlement,
          used: leaveBalances.used,
          pending: leaveBalances.pending,
          adjustment: leaveBalances.adjustment,
        })
        .from(leaveBalances)
        .where(
          and(
            eq(leaveBalances.organizationId, organizationId),
            eq(leaveBalances.employeeId, employee.id),
            eq(leaveBalances.leaveTypeId, leaveTypeId),
            eq(leaveBalances.year, year)
          )
        )
        .for("update")
        .limit(1);
      const balance = balanceRows[0];

      if (balance) {
        const available =
          balance.entitlement +
          balance.adjustment -
          balance.used -
          balance.pending;
        if (totalDays > available) {
          return {
            kind: "error",
            message: "Insufficient leave balance for this request.",
          };
        }
      } else if (leaveType.defaultAllowanceDays === null) {
        return {
          kind: "error",
          message: "No leave balance is configured for this leave type.",
        };
      } else if (totalDays > leaveType.defaultAllowanceDays) {
        return {
          kind: "error",
          message: "The request exceeds the default annual allowance.",
        };
      }

      const now = new Date();
      const inserted = await tx
        .insert(leaveRequests)
        .values({
          organizationId,
          employeeId: employee.id,
          leaveTypeId,
          startDate: startDateValue,
          endDate: endDateValue,
          totalDays,
          reason,
          status: "pending",
          submittedAt: now,
        })
        .returning({ id: leaveRequests.id });
      const requestId = inserted[0]?.id;
      if (!requestId) throw new Error("Leave request insert returned no row.");

      if (balance) {
        await tx
          .update(leaveBalances)
          .set({ pending: balance.pending + totalDays })
          .where(eq(leaveBalances.id, balance.id));
      } else {
        await tx.insert(leaveBalances).values({
          organizationId,
          employeeId: employee.id,
          leaveTypeId,
          year,
          entitlement: leaveType.defaultAllowanceDays as number,
          used: 0,
          pending: totalDays,
          adjustment: 0,
        });
      }

      await tx.insert(leaveRequestEvents).values({
        organizationId,
        requestId,
        actorUserId: user.id,
        eventType: "submitted",
        reason: null,
        metadata: { leaveTypeId, startDate, endDate, totalDays },
      });

      return { kind: "success", id: requestId };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }

    await auditLeave({
      organizationId,
      actorUserId: user.id,
      action: "leave.created",
      entityId: outcome.id,
      employeeNumber: employee.employeeNumber,
      eventType: "leave.created",
      metadata: { totalDays },
    });
    return { ok: true, message: "Leave request submitted." };
  } catch (error) {
    console.error("[leave] create failed", error);
    return {
      ok: false,
      message: "The leave request could not be submitted. Please try again.",
    };
  }
}


interface LeaveRequestForAction {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeUserId: string | null;
  employeeNumber: string;
  leaveTypeId: string;
  startDate: Date;
  totalDays: number;
  status: string;
}

async function loadLeaveRequestForAction(
  organizationId: string,
  requestId: string
): Promise<LeaveRequestForAction | null> {
  const rows = await db
    .select({
      id: leaveRequests.id,
      organizationId: leaveRequests.organizationId,
      employeeId: leaveRequests.employeeId,
      employeeUserId: employees.userId,
      employeeNumber: employees.employeeNumber,
      leaveTypeId: leaveRequests.leaveTypeId,
      startDate: leaveRequests.startDate,
      totalDays: leaveRequests.totalDays,
      status: leaveRequests.status,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .where(
      and(
        eq(leaveRequests.id, requestId),
        eq(leaveRequests.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row;
}

/** Management/HR approve or reject a pending leave request. */
export async function reviewLeaveRequestAction(
  requestId: string,
  input: unknown
): Promise<LeaveActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.LEAVE_MANAGE,
  ]);
  if (!user.organizationId) {
    return {
      ok: false,
      message: "Your account is not assigned to an organization.",
    };
  }
  const organizationId = user.organizationId;

  const parsed = reviewRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid decision.",
    };
  }
  const { decision, reviewerNote } = parsed.data;

  const request = await loadLeaveRequestForAction(organizationId, requestId);
  if (!request) forbidden();
  if (request.employeeUserId === user.id) {
    return { ok: false, message: "You cannot review your own request." };
  }

  const now = new Date();
  const year = request.startDate.toISOString().slice(0, 4);

  try {
    const outcome = await db.transaction(async (tx) => {
      const lockedRows = await tx
        .select({
          id: leaveRequests.id,
          employeeId: leaveRequests.employeeId,
          leaveTypeId: leaveRequests.leaveTypeId,
          startDate: leaveRequests.startDate,
          totalDays: leaveRequests.totalDays,
          status: leaveRequests.status,
        })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.id, requestId),
            eq(leaveRequests.organizationId, organizationId)
          )
        )
        .for("update")
        .limit(1);
      const locked = lockedRows[0];
      if (!locked) return { kind: "error", message: "Request not found." };
      if (locked.status !== "pending") {
        return {
          kind: "error",
          message: "This request has already been reviewed or cancelled.",
        };
      }

      const balanceRows = await tx
        .select({
          id: leaveBalances.id,
          pending: leaveBalances.pending,
          used: leaveBalances.used,
        })
        .from(leaveBalances)
        .where(
          and(
            eq(leaveBalances.organizationId, organizationId),
            eq(leaveBalances.employeeId, locked.employeeId),
            eq(leaveBalances.leaveTypeId, locked.leaveTypeId),
            eq(leaveBalances.year, year)
          )
        )
        .for("update")
        .limit(1);
      const balance = balanceRows[0];
      if (!balance) {
        return {
          kind: "error",
          message: "The leave balance could not be found for this request.",
        };
      }
      if (balance.pending - locked.totalDays < 0) {
        return {
          kind: "error",
          message: "The leave balance is inconsistent. Contact an administrator.",
        };
      }

      const nextPending = balance.pending - locked.totalDays;
      if (decision === "approved") {
        await tx
          .update(leaveRequests)
          .set({
            status: "approved",
            reviewedBy: user.id,
            reviewedAt: now,
            reviewerNote: reviewerNote ?? null,
          })
          .where(eq(leaveRequests.id, requestId));
        await tx
          .update(leaveBalances)
          .set({
            pending: nextPending,
            used: balance.used + locked.totalDays,
          })
          .where(eq(leaveBalances.id, balance.id));
      } else {
        await tx
          .update(leaveRequests)
          .set({
            status: "rejected",
            reviewedBy: user.id,
            reviewedAt: now,
            reviewerNote: reviewerNote ?? null,
          })
          .where(eq(leaveRequests.id, requestId));
        await tx
          .update(leaveBalances)
          .set({ pending: nextPending })
          .where(eq(leaveBalances.id, balance.id));
      }

      await tx.insert(leaveRequestEvents).values({
        organizationId,
        requestId,
        actorUserId: user.id,
        eventType: decision,
        reason: reviewerNote ?? null,
        metadata: { totalDays: locked.totalDays, decision },
      });

      return { kind: "success" as const };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }

    await auditLeave({
      organizationId,
      actorUserId: user.id,
      action: decision === "approved" ? "leave.approved" : "leave.rejected",
      entityId: requestId,
      employeeNumber: request.employeeNumber,
      eventType: decision,
      metadata: { totalDays: request.totalDays },
    });
    return {
      ok: true,
      message: decision === "approved" ? "Leave approved." : "Leave rejected.",
    };
  } catch (error) {
    console.error("[leave] review failed", error);
    return {
      ok: false,
      message: "The decision could not be saved. Please try again.",
    };
  }
}


/** An employee cancels their own pending leave request. */
export async function cancelLeaveRequestAction(
  requestId: string
): Promise<LeaveActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.LEAVE_VIEW);
  const resolved = await resolveEmployeeContext(user);
  if (!resolved.ok || !resolved.organizationId || !resolved.employee) {
    return { ok: false, message: resolved.message ?? "Request failed." };
  }
  const organizationId = resolved.organizationId;
  const employee = resolved.employee;

  const request = await loadLeaveRequestForAction(organizationId, requestId);
  if (!request) forbidden();
  if (request.employeeId !== employee.id) {
    // Not this employee's request — never reveal another employee's record.
    forbidden();
  }
  if (request.status !== "pending") {
    return {
      ok: false,
      message: "Only pending requests can be cancelled.",
    };
  }

  const now = new Date();
  const year = request.startDate.toISOString().slice(0, 4);

  try {
    const outcome = await db.transaction(async (tx) => {
      const lockedRows = await tx
        .select({
          id: leaveRequests.id,
          employeeId: leaveRequests.employeeId,
          leaveTypeId: leaveRequests.leaveTypeId,
          startDate: leaveRequests.startDate,
          totalDays: leaveRequests.totalDays,
          status: leaveRequests.status,
        })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.id, requestId),
            eq(leaveRequests.organizationId, organizationId)
          )
        )
        .for("update")
        .limit(1);
      const locked = lockedRows[0];
      if (!locked || locked.status !== "pending") {
        return {
          kind: "error",
          message: "This request can no longer be cancelled.",
        };
      }

      const balanceRows = await tx
        .select({ id: leaveBalances.id, pending: leaveBalances.pending })
        .from(leaveBalances)
        .where(
          and(
            eq(leaveBalances.organizationId, organizationId),
            eq(leaveBalances.employeeId, employee.id),
            eq(leaveBalances.leaveTypeId, locked.leaveTypeId),
            eq(leaveBalances.year, year)
          )
        )
        .for("update")
        .limit(1);
      const balance = balanceRows[0];

      await tx
        .update(leaveRequests)
        .set({ status: "cancelled", updatedAt: now })
        .where(eq(leaveRequests.id, requestId));
      if (balance) {
        await tx
          .update(leaveBalances)
          .set({ pending: Math.max(0, balance.pending - locked.totalDays) })
          .where(eq(leaveBalances.id, balance.id));
      }

      await tx.insert(leaveRequestEvents).values({
        organizationId,
        requestId,
        actorUserId: user.id,
        eventType: "cancelled",
        reason: null,
        metadata: { totalDays: locked.totalDays },
      });

      return { kind: "success" as const };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }

    await auditLeave({
      organizationId,
      actorUserId: user.id,
      action: "leave.cancelled",
      entityId: requestId,
      employeeNumber: employee.employeeNumber,
      eventType: "cancelled",
      metadata: { totalDays: request.totalDays },
    });
    return { ok: true, message: "Leave request cancelled." };
  } catch (error) {
    console.error("[leave] cancel failed", error);
    return {
      ok: false,
      message: "The leave request could not be cancelled. Please try again.",
    };
  }
}

