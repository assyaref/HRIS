/**
 * Organizations — application-level constants (pure, unit-testable).
 *
 * Mirrors `features/announcements/constants.ts`: no `server-only`, no
 * database and no framework imports so `node --test` can exercise the
 * contracts directly.
 */

export const ORGANIZATION_STATUSES = ["active", "inactive"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const ORGANIZATION_STATUS_LABELS: Record<
  OrganizationStatus,
  string
> = {
  active: "Active",
  inactive: "Inactive",
};

export function isOrganizationStatus(
  value: string
): value is OrganizationStatus {
  return (ORGANIZATION_STATUSES as readonly string[]).includes(value);
}

/** Tenant codes are stable identifiers: uppercase alphanumeric + dash/underscore. */
export const ORGANIZATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,30}$/;
export const ORGANIZATION_CODE_MIN_LENGTH = 2;
export const ORGANIZATION_CODE_MAX_LENGTH = 31;
export const ORGANIZATION_NAME_MAX_LENGTH = 120;

/** Display labels for the dependency categories tracked by the delete guard. */
export const DEPENDENCY_CATEGORY_LABELS = {
  users: "Users",
  employees: "Employees",
  roles: "Roles",
  attendance: "Attendance",
  leave: "Leave",
  permission_requests: "Permission requests",
  payroll: "Payroll",
  payslips: "Payslips",
  payslip_documents: "Payslip documents",
  announcements: "Announcements",
  work_locations: "Work locations",
  projects: "Projects",
  assignments: "Assignments",
  face_enrollments: "Face enrollments",
  audit: "Audit trail",
} as const;
