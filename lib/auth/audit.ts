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
  | "rbac.role.permissions.updated"
  | "rbac.user.role.assigned"
  | "rbac.user.role.removed";

export type EmployeeAuditAction =
  | "employee.created"
  | "employee.updated"
  | "employee.status_changed"
  | "employee.account.created"
  | "employee.deleted"
  | "employee.purged"
  | "employee.imported"
  | "employee.exported";

export type EmployeeMasterDataAuditAction =
  | "employee.personal.updated"
  | "employee.employment.updated"
  | "employee.address.created"
  | "employee.address.updated"
  | "employee.address.deleted"
  | "employee.insurance.updated"
  | "employee.bank_account.created"
  | "employee.bank_account.updated"
  | "employee.bank_account.deleted"
  | "employee.bank_account.primary_changed"
  | "employee.dependent.created"
  | "employee.dependent.updated"
  | "employee.dependent.deleted"
  | "employee.education.created"
  | "employee.education.updated"
  | "employee.education.deleted"
  | "employee.document.uploaded"
  | "employee.document.deleted"
  | "employee.document.downloaded"
  | "employee.employment_history.created"
  | "employee_field.created"
  | "employee_field.updated"
  | "employee_field.status_changed"
  | "employee_field.deleted"
  | "employee_custom_data.updated"
  | "employee_custom_data.deleted";

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
  | "payslip.published"
  | "payslip.document.uploaded"
  | "payslip.document.generated"
  | "payslip.document.viewed"
  | "payslip.revoked"
  | "payroll.employee_component.created"
  | "payroll.employee_component.updated"
  | "payroll.employee_component.ended";

export type WorkLocationAuditAction =
  | "work_location.created"
  | "work_location.updated"
  | "work_location.status_changed"
  | "work_location.deleted";

export type ProjectAuditAction =
  | "project.created"
  | "project.updated"
  | "project.status_changed";

export type AssignmentAuditAction =
  | "assignment.created"
  | "assignment.ended";

export type FaceEnrollmentAuditAction =
  | "face_enrollment.created"
  | "face_enrollment.replaced"
  | "face_enrollment.revoked";

export type FaceVerificationAuditAction =
  | "face_verification.matched"
  | "face_verification.not_matched"
  | "face_verification.unavailable"
  | "face_verification.failed";

export type AuditAction =
  | RbacAuditAction
  | EmployeeAuditAction
  | EmployeeMasterDataAuditAction
  | AttendanceAuditAction
  | LeaveAuditAction
  | PermissionAuditAction
  | PayrollAuditAction
  | WorkLocationAuditAction
  | ProjectAuditAction
  | AssignmentAuditAction
  | FaceEnrollmentAuditAction
  | FaceVerificationAuditAction;

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