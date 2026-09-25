/**
 * Centralized permission catalog (RBAC, Phase 4).
 *
 * This module is the single source of truth for permission identifiers in the
 * application. Rules:
 * - Permission strings are written in exactly one place: the `PERMISSIONS`
 *   record below.
 * - Features import `PERMISSIONS.X` / `PERMISSION_CATALOG` — never hardcode a
 *   code elsewhere.
 * - This module is intentionally free of `server-only`: it is pure, inert data
 *   that client components may import for display (e.g. permission checkboxes).
 *   Authorization is NEVER decided from these constants on the client; the
 *   server (`lib/auth/rbac.ts`) is the only enforcement point.
 *
 * Naming contract: `resource.action` (e.g. `users.view`, `attendance.approve`).
 * `module` groups permissions by feature area (the `permissions.module` column).
 */

/** Application modules that own permissions. */
export const PERMISSION_MODULES = {
  DASHBOARD: "dashboard",
  PROFILE: "profile",
  USERS: "users",
  ROLES: "roles",
  PERMISSIONS: "permissions",
  EMPLOYEES: "employees",
  ATTENDANCE: "attendance",
  LEAVE: "leave",
  PERMISSION: "permission",
  PAYROLL: "payroll",
  PAYSLIP: "payslip",
  PROJECTS: "projects",
  REPORTS: "reports",
  SETTINGS: "settings",
  WORK_LOCATIONS: "work_locations",
  AUDIT: "audit",
} as const;

export type PermissionModule =
  (typeof PERMISSION_MODULES)[keyof typeof PERMISSION_MODULES];

/**
 * Every application capability. The Phase 4 catalog is RBAC-only: the
 * Employee/Attendance/Leave/Payroll/etc. modules land in later phases and will
 * check these same identifiers.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  PROFILE_VIEW: "profile.view",
  PROFILE_UPDATE: "profile.update",
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  ROLES_VIEW: "roles.view",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",
  PERMISSIONS_VIEW: "permissions.view",
  PERMISSIONS_MANAGE: "permissions.manage",
  EMPLOYEES_VIEW: "employees.view",
  EMPLOYEES_CREATE: "employees.create",
  EMPLOYEES_UPDATE: "employees.update",
  EMPLOYEES_DELETE: "employees.delete",
  EMPLOYEES_IMPORT: "employees.import",
  EMPLOYEES_EXPORT: "employees.export",
  EMPLOYEES_PERSONAL_VIEW: "employees.personal.view",
  EMPLOYEES_PERSONAL_UPDATE: "employees.personal.update",
  EMPLOYEES_EMPLOYMENT_VIEW: "employees.employment.view",
  EMPLOYEES_EMPLOYMENT_UPDATE: "employees.employment.update",
  EMPLOYEES_ADDRESS_VIEW: "employees.address.view",
  EMPLOYEES_ADDRESS_UPDATE: "employees.address.update",
  EMPLOYEES_INSURANCE_VIEW: "employees.insurance.view",
  EMPLOYEES_INSURANCE_UPDATE: "employees.insurance.update",
  EMPLOYEES_BANK_VIEW: "employees.bank.view",
  EMPLOYEES_BANK_UPDATE: "employees.bank.update",
  EMPLOYEES_FAMILY_VIEW: "employees.family.view",
  EMPLOYEES_FAMILY_UPDATE: "employees.family.update",
  EMPLOYEES_EDUCATION_VIEW: "employees.education.view",
  EMPLOYEES_EDUCATION_UPDATE: "employees.education.update",
  EMPLOYEES_DOCUMENT_VIEW: "employees.document.view",
  EMPLOYEES_DOCUMENT_UPLOAD: "employees.document.upload",
  EMPLOYEES_DOCUMENT_DELETE: "employees.document.delete",
  EMPLOYEE_FIELDS_VIEW: "employee_fields.view",
  EMPLOYEE_FIELDS_CREATE: "employee_fields.create",
  EMPLOYEE_FIELDS_UPDATE: "employee_fields.update",
  EMPLOYEE_FIELDS_DELETE: "employee_fields.delete",
  EMPLOYEE_CUSTOM_DATA_VIEW: "employee_custom_data.view",
  EMPLOYEE_CUSTOM_DATA_CREATE: "employee_custom_data.create",
  EMPLOYEE_CUSTOM_DATA_UPDATE: "employee_custom_data.update",
  EMPLOYEE_CUSTOM_DATA_DELETE: "employee_custom_data.delete",
  ATTENDANCE_VIEW: "attendance.view",
  ATTENDANCE_MANAGE: "attendance.manage",
  ATTENDANCE_APPROVE: "attendance.approve",
  ATTENDANCE_CHECK_IN: "attendance.check_in",
  ATTENDANCE_CHECK_OUT: "attendance.check_out",
  LEAVE_VIEW: "leave.view",
  LEAVE_CREATE: "leave.create",
  LEAVE_MANAGE: "leave.manage",
  LEAVE_APPROVE: "leave.approve",
  PERMISSION_VIEW: "permission.view",
  PERMISSION_CREATE: "permission.create",
  PERMISSION_APPROVE: "permission.approve",
  PERMISSION_MANAGE: "permission.manage",
  PAYROLL_VIEW: "payroll.view",
  PAYROLL_CREATE: "payroll.create",
  PAYROLL_CALCULATE: "payroll.calculate",
  PAYROLL_UPDATE: "payroll.update",
  PAYROLL_APPROVE: "payroll.approve",
  PAYROLL_LOCK: "payroll.lock",
  PAYROLL_MANAGE: "payroll.manage",
  PAYSLIP_VIEW: "payslip.view",
  PAYSLIP_PUBLISH: "payslip.publish",
  PAYSLIP_MANAGE: "payslip.manage",
  PROJECTS_VIEW: "projects.view",
  PROJECTS_MANAGE: "projects.manage",
  REPORTS_VIEW: "reports.view",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_VIEW: "audit.view",
  WORK_LOCATIONS_VIEW: "work_locations.view",
  WORK_LOCATIONS_MANAGE: "work_locations.manage",
} as const;

export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Readable catalog row used by the admin UI and the seed. */
export interface PermissionDefinition {
  code: Permission;
  module: PermissionModule;
  description: string;
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  // Dashboard
  {
    code: PERMISSIONS.DASHBOARD_VIEW,
    module: PERMISSION_MODULES.DASHBOARD,
    description: "View the HRIS dashboard.",
  },
  // Profile (own record)
  {
    code: PERMISSIONS.PROFILE_VIEW,
    module: PERMISSION_MODULES.PROFILE,
    description: "View your own profile.",
  },
  {
    code: PERMISSIONS.PROFILE_UPDATE,
    module: PERMISSION_MODULES.PROFILE,
    description: "Update your own profile.",
  },
  // Users
  {
    code: PERMISSIONS.USERS_VIEW,
    module: PERMISSION_MODULES.USERS,
    description: "View user accounts.",
  },
  {
    code: PERMISSIONS.USERS_CREATE,
    module: PERMISSION_MODULES.USERS,
    description: "Create user accounts.",
  },
  {
    code: PERMISSIONS.USERS_UPDATE,
    module: PERMISSION_MODULES.USERS,
    description: "Update user accounts.",
  },
  {
    code: PERMISSIONS.USERS_DELETE,
    module: PERMISSION_MODULES.USERS,
    description: "Delete user accounts.",
  },
  // Roles
  {
    code: PERMISSIONS.ROLES_VIEW,
    module: PERMISSION_MODULES.ROLES,
    description: "View roles and their permission assignments.",
  },
  {
    code: PERMISSIONS.ROLES_CREATE,
    module: PERMISSION_MODULES.ROLES,
    description: "Create custom roles.",
  },
  {
    code: PERMISSIONS.ROLES_UPDATE,
    module: PERMISSION_MODULES.ROLES,
    description: "Edit roles and assign permissions.",
  },
  {
    code: PERMISSIONS.ROLES_DELETE,
    module: PERMISSION_MODULES.ROLES,
    description: "Delete custom roles.",
  },
  // Permissions (catalog)
  {
    code: PERMISSIONS.PERMISSIONS_VIEW,
    module: PERMISSION_MODULES.PERMISSIONS,
    description: "View the permission catalog.",
  },
  {
    code: PERMISSIONS.PERMISSIONS_MANAGE,
    module: PERMISSION_MODULES.PERMISSIONS,
    description: "Manage the permission catalog (system-level).",
  },
  // Employees
  {
    code: PERMISSIONS.EMPLOYEES_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee records.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_CREATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Create employee records.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Update employee records.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_DELETE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Delete employee records.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_IMPORT,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Import employees from Excel/CSV.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_EXPORT,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Export employees to Excel/CSV.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_PERSONAL_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee personal data (NIK, family, education).",
  },
  {
    code: PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Update employee personal data.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee employment data (position, department, contract).",
  },
  {
    code: PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Update employee employment data.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_ADDRESS_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee addresses.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_ADDRESS_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Update employee addresses.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_INSURANCE_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee insurance and tax identifiers.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_INSURANCE_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Update employee insurance and tax identifiers.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_BANK_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee bank accounts.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_BANK_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Update employee bank accounts.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_FAMILY_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee family/dependents.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_FAMILY_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Update employee family/dependents.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_EDUCATION_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee education history.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_EDUCATION_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Update employee education history.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_DOCUMENT_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee documents.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_DOCUMENT_UPLOAD,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Upload employee documents.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_DOCUMENT_DELETE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Delete employee documents.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_FIELDS_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee custom field definitions.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_FIELDS_CREATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Create employee custom field definitions.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_FIELDS_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Update employee custom field definitions.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_FIELDS_DELETE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Archive/delete employee custom field definitions.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "View employee custom field values.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_CUSTOM_DATA_CREATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Create employee custom field values.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Update employee custom field values.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_CUSTOM_DATA_DELETE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Delete employee custom field values.",
  },
  // Attendance
  {
    code: PERMISSIONS.ATTENDANCE_VIEW,
    module: PERMISSION_MODULES.ATTENDANCE,
    description: "View attendance records.",
  },
  {
    code: PERMISSIONS.ATTENDANCE_MANAGE,
    module: PERMISSION_MODULES.ATTENDANCE,
    description: "Administer attendance records.",
  },
  {
    code: PERMISSIONS.ATTENDANCE_APPROVE,
    module: PERMISSION_MODULES.ATTENDANCE,
    description: "Approve attendance entries.",
  },
  {
    code: PERMISSIONS.ATTENDANCE_CHECK_IN,
    module: PERMISSION_MODULES.ATTENDANCE,
    description: "Check in to attendance.",
  },
  {
    code: PERMISSIONS.ATTENDANCE_CHECK_OUT,
    module: PERMISSION_MODULES.ATTENDANCE,
    description: "Check out of attendance.",
  },
  // Leave
  {
    code: PERMISSIONS.LEAVE_VIEW,
    module: PERMISSION_MODULES.LEAVE,
    description: "View leave records.",
  },
  {
    code: PERMISSIONS.LEAVE_CREATE,
    module: PERMISSION_MODULES.LEAVE,
    description: "Request leave.",
  },
  {
    code: PERMISSIONS.LEAVE_MANAGE,
    module: PERMISSION_MODULES.LEAVE,
    description: "Administer leave records and balances.",
  },
  {
    code: PERMISSIONS.LEAVE_APPROVE,
    module: PERMISSION_MODULES.LEAVE,
    description: "Approve leave requests.",
  },
  // Permission requests (time-based absences, not the permission catalog)
  {
    code: PERMISSIONS.PERMISSION_VIEW,
    module: PERMISSION_MODULES.PERMISSION,
    description: "View permission (absence) requests.",
  },
  {
    code: PERMISSIONS.PERMISSION_CREATE,
    module: PERMISSION_MODULES.PERMISSION,
    description: "Submit permission (absence) requests.",
  },
  {
    code: PERMISSIONS.PERMISSION_APPROVE,
    module: PERMISSION_MODULES.PERMISSION,
    description: "Approve permission (absence) requests.",
  },
  {
    code: PERMISSIONS.PERMISSION_MANAGE,
    module: PERMISSION_MODULES.PERMISSION,
    description: "Manage permission (absence) requests.",
  },
  // Payroll
  {
    code: PERMISSIONS.PAYROLL_VIEW,
    module: PERMISSION_MODULES.PAYROLL,
    description: "View payroll runs.",
  },
  {
    code: PERMISSIONS.PAYROLL_CREATE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Create payroll periods.",
  },
  {
    code: PERMISSIONS.PAYROLL_CALCULATE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Calculate payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_UPDATE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Update payroll periods and runs.",
  },
  {
    code: PERMISSIONS.PAYROLL_APPROVE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Approve payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_LOCK,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Lock and finalize payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_MANAGE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Manage payroll periods and runs.",
  },
  // Payslip
  {
    code: PERMISSIONS.PAYSLIP_VIEW,
    module: PERMISSION_MODULES.PAYSLIP,
    description: "View payslips.",
  },
  {
    code: PERMISSIONS.PAYSLIP_PUBLISH,
    module: PERMISSION_MODULES.PAYSLIP,
    description: "Publish payslips to employees.",
  },
  {
    code: PERMISSIONS.PAYSLIP_MANAGE,
    module: PERMISSION_MODULES.PAYSLIP,
    description: "Manage payslip issuance.",
  },
  // Projects
  {
    code: PERMISSIONS.PROJECTS_VIEW,
    module: PERMISSION_MODULES.PROJECTS,
    description: "View projects.",
  },
  {
    code: PERMISSIONS.PROJECTS_MANAGE,
    module: PERMISSION_MODULES.PROJECTS,
    description: "Administer projects.",
  },
  // Reports
  {
    code: PERMISSIONS.REPORTS_VIEW,
    module: PERMISSION_MODULES.REPORTS,
    description: "View reports and dashboards.",
  },
  // Settings
  {
    code: PERMISSIONS.SETTINGS_VIEW,
    module: PERMISSION_MODULES.SETTINGS,
    description: "View application settings.",
  },
  {
    code: PERMISSIONS.SETTINGS_MANAGE,
    module: PERMISSION_MODULES.SETTINGS,
    description: "Manage application settings.",
  },
  // Work Locations
  {
    code: PERMISSIONS.WORK_LOCATIONS_VIEW,
    module: PERMISSION_MODULES.WORK_LOCATIONS,
    description: "View organization work locations.",
  },
  {
    code: PERMISSIONS.WORK_LOCATIONS_MANAGE,
    module: PERMISSION_MODULES.WORK_LOCATIONS,
    description: "Manage organization work locations.",
  },

  // Audit
  {
    code: PERMISSIONS.AUDIT_VIEW,
    module: PERMISSION_MODULES.AUDIT,
    description: "View audit logs.",
  },
];

/** All catalog codes, in display order. */
export const ALL_PERMISSION_CODES: readonly Permission[] =
  PERMISSION_CATALOG.map((definition) => definition.code);

/** Ordered module labels for grouped displays. */
export const PERMISSION_MODULE_LABELS: Record<PermissionModule, string> = {
  dashboard: "Dashboard",
  profile: "Profile",
  users: "Users",
  roles: "Roles",
  permissions: "Permissions",
  employees: "Employees",
  attendance: "Attendance",
  leave: "Leave",
  permission: "Permission Requests",
  payroll: "Payroll",
  payslip: "Payslips",
  projects: "Projects",
  reports: "Reports",
  settings: "Settings",
  work_locations: "Work Locations",
  audit: "Audit",
};

/** Split a `resource.action` code into its resource and action parts. */
export function splitPermissionCode(code: Permission): {
  resource: string;
  action: string;
} {
  const separatorIndex = code.indexOf(".");
  if (separatorIndex === -1) {
    return { resource: code, action: "" };
  }
  return {
    resource: code.slice(0, separatorIndex),
    action: code.slice(separatorIndex + 1),
  };
}