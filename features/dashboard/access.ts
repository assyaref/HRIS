import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";

/**
 * Which permission set switches the dashboard into "management" mode.
 *
 * A user sees the organization-wide management dashboard when they hold ANY
 * management-type capability (employee oversight, approvals, payroll,
 * settings, report/audit access). Everyone else — including the multi-tenant
 * SERVICE account — falls back to a self-service view. This drives the page
 * decision ONLY; every data query is independently org-scoped server-side.
 */
export const MANAGEMENT_DASHBOARD_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.EMPLOYEES_VIEW,
  PERMISSIONS.USERS_VIEW,
  PERMISSIONS.ROLES_VIEW,
  PERMISSIONS.WORK_LOCATIONS_VIEW,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.ATTENDANCE_MANAGE,
  PERMISSIONS.ATTENDANCE_APPROVE,
  PERMISSIONS.LEAVE_MANAGE,
  PERMISSIONS.LEAVE_APPROVE,
  PERMISSIONS.PERMISSION_MANAGE,
  PERMISSIONS.PERMISSION_APPROVE,
  PERMISSIONS.PAYROLL_VIEW,
  PERMISSIONS.PAYROLL_MANAGE,
  PERMISSIONS.PAYROLL_APPROVE,
  PERMISSIONS.PAYROLL_LOCK,
  PERMISSIONS.PAYSLIP_MANAGE,
  PERMISSIONS.PAYSLIP_PUBLISH,
  PERMISSIONS.PROJECTS_MANAGE,
  PERMISSIONS.SETTINGS_VIEW,
  PERMISSIONS.SETTINGS_MANAGE,
  PERMISSIONS.AUDIT_VIEW,
  PERMISSIONS.ANNOUNCEMENTS_VIEW,
];

const MANAGEMENT_KEYS = new Set<string>(MANAGEMENT_DASHBOARD_PERMISSIONS);

/** True when the user holds at least one organization-management capability. */
export function hasManagementDashboard(
  permissionCodes: readonly Permission[]
): boolean {
  return permissionCodes.some((code) => MANAGEMENT_KEYS.has(code));
}