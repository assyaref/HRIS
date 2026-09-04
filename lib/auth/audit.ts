import "server-only";

import { headers } from "next/headers";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";

/**
 * Audit logging — append-only writes to `audit_logs` (Phases 4+).
 *
 * Rules:
 * - The `audit_logs` table is append-only by design: this module only ever
 *   INSERTs. There is deliberately no UPDATE/DELETE path.
 * - Never log passwords, session tokens, hashes or secrets.
 * - Administrative/business actions are recorded here (RBAC role changes,
 *   employee create/update/status changes, future user-role assignments).
 */

export type RbacAuditAction =
  | "rbac.role.created"
  | "rbac.role.updated"
  | "rbac.role.deleted"
  | "rbac.role.permissions.updated";

export type EmployeeAuditAction =
  | "employee.created"
  | "employee.updated"
  | "employee.status_changed"
  | "employee.account.created";

export type AttendanceAuditAction =
  | "attendance.check_in"
  | "attendance.check_in_rejected"
  | "attendance.check_out"
  | "attendance.check_out_rejected";

export type LeaveAuditAction =
  | "leave.created"
  | "leave.cancelled"
  | "leave.approved"
  | "leave.rejected";

export type PermissionAuditAction =
  | "permission.created"
  | "permission.cancelled"
  | "permission.approved"
  | "permission.rejected";

export type PayrollAuditAction =
  | "payroll.period.created"
  | "payroll.calculated"
  | "payroll.submitted"
  | "payroll.approved"
  | "payroll.rejected"
  | "payroll.locked"
  | "payroll.cancelled"
  | "payslip.generated"
  | "payslip.published";

export type AuditAction =
  | RbacAuditAction
  | EmployeeAuditAction
  | AttendanceAuditAction
  | LeaveAuditAction
  | PermissionAuditAction
  | PayrollAuditAction;

export interface WriteAuditLogInput {
  organizationId: string | null;
  actorUserId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Safe, JSON-serializable metadata. Never secrets. */
  metadata?: Record<string, unknown> | null;
}

/** Derive a best-effort client IP from the standard proxy headers. */
function resolveClientMetadata(
  headerStore: Awaited<ReturnType<typeof headers>>
): { ipAddress: string | null; userAgent: string | null } {
  const xForwardedFor = headerStore.get("x-forwarded-for");
  const ipAddress =
    (xForwardedFor ? xForwardedFor.split(",")[0]?.trim() : null) ??
    headerStore.get("x-real-ip") ??
    null;
  return { ipAddress, userAgent: headerStore.get("user-agent") ?? null };
}

/** Append one row to the audit log. */
export async function writeAuditLog(
  input: WriteAuditLogInput
): Promise<void> {
  const headerStore = await headers();
  const { ipAddress, userAgent } = resolveClientMetadata(headerStore);

  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    ipAddress,
    userAgent,
  });
}