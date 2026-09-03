"use server";

import { and, eq } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { db } from "@/db";
import {
  employees,
  permissionRequestEvents,
  permissionRequests,
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
  createPermissionRequestSchema,
  reviewPermissionRequestSchema,
} from "./schemas";

/**
 * Permission (absence) request server actions (Phase 7).
 * Employees submit/cancel only their own requests; reviewers require
 * permission.approve/permission.manage. State transitions are locked and
 * audited.
 */

export interface PermissionActionResult {
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
    return {
      ok: false,
      message: "Your account is not assigned to an organization.",
    };
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

interface PermissionRequestForAction {
  id: string;
  employeeId: string;
  employeeUserId: string | null;
  employeeNumber: string;
  status: string;
}

async function loadPermissionRequestForAction(
  organizationId: string,
  requestId: string
): Promise<PermissionRequestForAction | null> {
  const rows = await db
    .select({
      id: permissionRequests.id,
      employeeId: permissionRequests.employeeId,
      employeeUserId: employees.userId,
      employeeNumber: employees.employeeNumber,
      status: permissionRequests.status,
    })
    .from(permissionRequests)
    .innerJoin(employees, eq(employees.id, permissionRequests.employeeId))
    .where(
      and(
        eq(permissionRequests.id, requestId),
        eq(permissionRequests.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row;
}

async function auditPermission(
  input: {
    organizationId: string;
    actorUserId: string;
    action:
      | "permission.created"
      | "permission.cancelled"
      | "permission.approved"
      | "permission.rejected";
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
      entityType: "permission_request",
      entityId: input.entityId ?? null,
      metadata: {
        eventType: input.eventType,
        employeeNumber: input.employeeNumber,
        ...(input.metadata ?? {}),
      },
    });
  } catch (error) {
    console.error("[permission] audit failed", error);
  }
}

function parseDateTime(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Employee submits a permission request (for themselves). */
export async function createPermissionRequestAction(
  input: unknown
): Promise<PermissionActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PERMISSION_CREATE);
  const resolved = await resolveEmployeeContext(user);
  if (!resolved.ok || !resolved.organizationId || !resolved.employee) {
    return { ok: false, message: resolved.message ?? "Request failed." };
  }
  const organizationId = resolved.organizationId;
  const employee = resolved.employee;

  const parsed = createPermissionRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const { permissionType, reason } = parsed.data;

  const startAt = parseDateTime(parsed.data.startAt);
  const endAt = parseDateTime(parsed.data.endAt);
  if (!startAt || !endAt) {
    return { ok: false, message: "The requested time range is invalid." };
  }
  if (endAt.getTime() <= startAt.getTime()) {
    return { ok: false, message: "End time must be after the start time." };
  }

  try {
    const outcome = await db.transaction(
      async (tx): Promise<{ kind: "error"; message: string } | { kind: "success"; id: string }> => {
        const now = new Date();
        const inserted = await tx
          .insert(permissionRequests)
          .values({
            organizationId,
            employeeId: employee.id,
            permissionType,
            startAt,
            endAt,
            reason,
            status: "pending",
            submittedAt: now,
          })
          .returning({ id: permissionRequests.id });
        const requestId = inserted[0]?.id;
        if (!requestId) {
          throw new Error("Permission request insert returned no row.");
        }

        await tx.insert(permissionRequestEvents).values({
          organizationId,
          requestId,
          actorUserId: user.id,
          eventType: "submitted",
          reason: null,
          metadata: { permissionType, startAt, endAt },
        });

        return { kind: "success", id: requestId };
      }
    );

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }

    await auditPermission({
      organizationId,
      actorUserId: user.id,
      action: "permission.created",
      entityId: outcome.id,
      employeeNumber: employee.employeeNumber,
      eventType: "submitted",
      metadata: { permissionType },
    });
    return { ok: true, message: "Permission request submitted." };
  } catch (error) {
    console.error("[permission] create failed", error);
    return {
      ok: false,
      message: "The permission request could not be submitted. Please try again.",
    };
  }
}


/** Management/HR approve or reject a pending permission request. */
export async function reviewPermissionRequestAction(
  requestId: string,
  input: unknown
): Promise<PermissionActionResult> {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PERMISSION_APPROVE,
    PERMISSIONS.PERMISSION_MANAGE,
  ]);
  if (!user.organizationId) {
    return {
      ok: false,
      message: "Your account is not assigned to an organization.",
    };
  }
  const organizationId = user.organizationId;

  const parsed = reviewPermissionRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid decision.",
    };
  }
  const { decision, reviewerNote } = parsed.data;

  const request = await loadPermissionRequestForAction(
    organizationId,
    requestId
  );
  if (!request) forbidden();
  if (request.employeeUserId === user.id) {
    return { ok: false, message: "You cannot review your own request." };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const lockedRows = await tx
        .select({ id: permissionRequests.id, status: permissionRequests.status })
        .from(permissionRequests)
        .where(
          and(
            eq(permissionRequests.id, requestId),
            eq(permissionRequests.organizationId, organizationId)
          )
        )
        .for("update")
        .limit(1);
      const locked = lockedRows[0];
      if (!locked) {
        return { kind: "error", message: "Request not found." };
      }
      if (locked.status !== "pending") {
        return {
          kind: "error",
          message: "This request has already been reviewed or cancelled.",
        };
      }

      const now = new Date();
      await tx
        .update(permissionRequests)
        .set({
          status: decision,
          reviewedBy: user.id,
          reviewedAt: now,
          reviewerNote: reviewerNote ?? null,
        })
        .where(eq(permissionRequests.id, requestId));

      await tx.insert(permissionRequestEvents).values({
        organizationId,
        requestId,
        actorUserId: user.id,
        eventType: decision,
        reason: reviewerNote ?? null,
        metadata: { decision },
      });

      return { kind: "success" as const };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }

    await auditPermission({
      organizationId,
      actorUserId: user.id,
      action:
        decision === "approved" ? "permission.approved" : "permission.rejected",
      entityId: requestId,
      employeeNumber: request.employeeNumber,
      eventType: decision,
    });
    return {
      ok: true,
      message:
        decision === "approved"
          ? "Permission request approved."
          : "Permission request rejected.",
    };
  } catch (error) {
    console.error("[permission] review failed", error);
    return {
      ok: false,
      message: "The decision could not be saved. Please try again.",
    };
  }
}

/** An employee cancels their own pending permission request. */
export async function cancelPermissionRequestAction(
  requestId: string
): Promise<PermissionActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PERMISSION_VIEW);
  const resolved = await resolveEmployeeContext(user);
  if (!resolved.ok || !resolved.organizationId || !resolved.employee) {
    return { ok: false, message: resolved.message ?? "Request failed." };
  }
  const organizationId = resolved.organizationId;
  const employee = resolved.employee;

  const request = await loadPermissionRequestForAction(
    organizationId,
    requestId
  );
  if (!request) forbidden();
  if (request.employeeId !== employee.id) forbidden();
  if (request.status !== "pending") {
    return {
      ok: false,
      message: "Only pending requests can be cancelled.",
    };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const lockedRows = await tx
        .select({ id: permissionRequests.id, status: permissionRequests.status })
        .from(permissionRequests)
        .where(
          and(
            eq(permissionRequests.id, requestId),
            eq(permissionRequests.organizationId, organizationId)
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

      await tx
        .update(permissionRequests)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(permissionRequests.id, requestId));

      await tx.insert(permissionRequestEvents).values({
        organizationId,
        requestId,
        actorUserId: user.id,
        eventType: "cancelled",
        reason: null,
        metadata: null,
      });

      return { kind: "success" as const };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }

    await auditPermission({
      organizationId,
      actorUserId: user.id,
      action: "permission.cancelled",
      entityId: requestId,
      employeeNumber: employee.employeeNumber,
      eventType: "cancelled",
    });
    return { ok: true, message: "Permission request cancelled." };
  } catch (error) {
    console.error("[permission] cancel failed", error);
    return {
      ok: false,
      message: "The permission request could not be cancelled. Please try again.",
    };
  }
}

