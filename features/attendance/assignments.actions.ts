"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { employeeProjectAssignments } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import {
  evaluateCreateAssignmentGuard,
  evaluateEndAssignmentGuard,
} from "./assignments.guard";
import {
  getAssignmentWithContextInOrganization,
  getEmployeeForAssignment,
  getProjectForAssignment,
  hasActiveAssignment,
} from "./assignments.queries";
import {
  assignmentCreateSchema,
  type AssignmentActionState,
} from "./assignments.schemas";

/**
 * Employee ↔ project assignment server actions (Phase 9.2).
 *
 * Security rules (all enforced server-side on every submission):
 * - `requireUser()` + `requirePermission(ATTENDANCE_MANAGE)` — ordinary
 *   employees and read-only roles can never reach these mutations.
 * - `organizationId` comes exclusively from the authenticated session.
 * - `employeeId`/`projectId` ownership is re-verified org-scoped; foreign
 *   records are reported as generic "not found" (no existence leak).
 * - Duplicate ACTIVE assignments (same org/employee/project) are rejected
 *   deterministically; the DB partial unique index is the final guard.
 * - Ending an assignment is a soft end (`active = false` + `ended_at`) so the
 *   historical row remains for audit.
 * - Every mutation writes an audit event through the existing audit log.
 */

const DB_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === DB_UNIQUE_VIOLATION
  );
}

/** Create an ACTIVE assignment for an employee on an org-scoped active project. */
export async function createAssignmentAction(
  employeeId: string,
  _prevState: AssignmentActionState,
  formData: FormData
): Promise<AssignmentActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE);

    if (!user.organizationId) {
      return {
        status: "error",
        ok: false,
        message: "Your account is not assigned to an organization.",
      };
    }

    const parsed = assignmentCreateSchema.safeParse({
      employeeId,
      projectId: formData.get("projectId")?.toString() ?? "",
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in fieldErrors)) {
          fieldErrors[key] = issue.message;
        }
      }
      return {
        status: "error",
        ok: false,
        message: "Please correct the errors below.",
        fieldErrors,
      };
    }
    const data = parsed.data;

    // Org-scoped ownership/eligibility reads, resolved in parallel.
    const [employee, project, existingActive] = await Promise.all([
      getEmployeeForAssignment(user.organizationId, data.employeeId),
      getProjectForAssignment(user.organizationId, data.projectId),
      hasActiveAssignment(user.organizationId, data.employeeId, data.projectId),
    ]);

    const decision = evaluateCreateAssignmentGuard({
      actorOrganizationId: user.organizationId,
      employee,
      project,
      existingActiveAssignment: existingActive,
    });
    if (!decision.ok) {
      return { status: "error", ok: false, message: decision.message };
    }

    const inserted = await db
      .insert(employeeProjectAssignments)
      .values({
        organizationId: user.organizationId,
        employeeId: data.employeeId,
        projectId: data.projectId,
        active: true,
      })
      .returning({ id: employeeProjectAssignments.id });

    const assignmentId = inserted[0]?.id;

    await writeAuditLog({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "assignment.created",
      entityType: "employee_project_assignment",
      entityId: assignmentId,
      metadata: {
        employeeId: data.employeeId,
        employeeNumber: employee?.employeeNumber ?? null,
        projectId: data.projectId,
        projectName: project?.name ?? null,
        active: true,
      },
    });

    revalidatePath(`/employees/${data.employeeId}`);
    return {
      status: "success",
      ok: true,
      message: "Employee assigned to the project successfully.",
    };
  } catch (error) {
    // Rare race on the partial unique index (concurrent duplicate submits).
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        ok: false,
        message: "This employee is already actively assigned to the project.",
      };
    }
    console.error("[assignments] create error:", error);
    return {
      status: "error",
      ok: false,
      message: "Failed to assign employee to the project. Please try again.",
    };
  }
}

/** Soft-end an active assignment (historical row is preserved). */
export async function endAssignmentAction(
  assignmentId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE);

    if (!user.organizationId) {
      return {
        ok: false,
        message: "Your account is not assigned to an organization.",
      };
    }

    const assignment = await getAssignmentWithContextInOrganization(
      user.organizationId,
      assignmentId
    );

    const decision = evaluateEndAssignmentGuard({
      actorOrganizationId: user.organizationId,
      assignment,
    });
    if (!decision.ok) {
      return { ok: false, message: decision.message };
    }
    if (!assignment) {
      return { ok: false, message: "Assignment not found." };
    }

    const endedAt = new Date();
    await db
      .update(employeeProjectAssignments)
      .set({ active: false, endedAt })
      .where(
        and(
          eq(employeeProjectAssignments.id, assignmentId),
          eq(employeeProjectAssignments.organizationId, user.organizationId)
        )
      );

    await writeAuditLog({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "assignment.ended",
      entityType: "employee_project_assignment",
      entityId: assignmentId,
      metadata: {
        employeeId: assignment.employeeId,
        employeeNumber: assignment.employeeNumber,
        projectId: assignment.projectId,
        projectName: assignment.projectName,
        active: false,
        endedAt: endedAt.toISOString(),
      },
    });

    revalidatePath(`/employees/${assignment.employeeId}`);
    return { ok: true, message: "Assignment ended successfully." };
  } catch (error) {
    console.error("[assignments] end error:", error);
    return {
      ok: false,
      message: "Failed to end the assignment. Please try again.",
    };
  }
}
