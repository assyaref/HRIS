import { PERMISSIONS } from "@/lib/auth/permissions";
import type { NavItem, NavSection } from "@/types/navigation";

/**
 * Application shell navigation.
 *
 * Items are pure data (safe for client imports). Items with a `permission`
 * are filtered server-side by `getAuthorizedSections` before being rendered,
 * so the client never decides what to show based on stored roles.
 */
export const primaryNavigation: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { title: "Notifikasi", href: "/notifications", icon: "bell" },
  { title: "Face ID", href: "/face-id", icon: "face" },
  {
    title: "Employees",
    href: "/employees",
    permission: PERMISSIONS.EMPLOYEES_VIEW,
    icon: "employees",
  },
  {
    title: "Attendance",
    href: "/attendance",
    permission: PERMISSIONS.ATTENDANCE_VIEW,
    icon: "attendance",
  },
  {
    title: "Leave",
    href: "/leave",
    permission: PERMISSIONS.LEAVE_VIEW,
    icon: "leave",
  },
  {
    title: "Permission",
    href: "/permission",
    permission: PERMISSIONS.PERMISSION_VIEW,
    icon: "permission",
  },
  {
    title: "Payroll",
    href: "/payroll",
    permission: PERMISSIONS.PAYROLL_VIEW,
    icon: "payroll",
  },
  {
    title: "Payslip",
    href: "/payslip",
    permission: PERMISSIONS.PAYSLIP_VIEW,
    icon: "payslip",
  },
  {
    title: "Announcements",
    href: "/announcements",
    icon: "announcements",
  },
];

export const supportNavigation: NavItem[] = [
  {
    title: "Announcements",
    href: "/announcements/management",
    permission: PERMISSIONS.ANNOUNCEMENTS_VIEW,
    icon: "announcements",
  },
  {
    title: "Projects",
    href: "/projects",
    icon: "projects",
    // SUPERADMIN-only (like Organizations, R19): decided by the
    // system-level role, not by the projects.* permission codes. The page
    // and every project server action re-verify requireSuperAdmin.
    superadminOnly: true,
  },
  {
    title: "Attendance Recap",
    href: "/attendance/recap",
    permission: PERMISSIONS.ATTENDANCE_MANAGE,
    icon: "attendance",
  },
];

export const settingsNavigation: NavItem[] = [
  {
    title: "Users",
    href: "/settings/users",
    permission: PERMISSIONS.USERS_VIEW,
    icon: "users",
  },
  {
    title: "Organizations",
    href: "/settings/organizations",
    icon: "organizations",
    // SUPERADMIN-only (R19): decided by the system-level role, not by the
    // organizations.* permission codes seeded to the Super Administrator.
    superadminOnly: true,
  },
  {
    title: "Roles",
    href: "/settings/roles",
    permission: PERMISSIONS.ROLES_VIEW,
    icon: "roles",
  },
  {
    title: "Permissions",
    href: "/settings/permissions",
    permission: PERMISSIONS.PERMISSIONS_VIEW,
    icon: "permissions",
  },
  {
    title: "Work Locations",
    href: "/settings/work-locations",
    permission: PERMISSIONS.WORK_LOCATIONS_VIEW,
    icon: "work-locations",
  },
  {
    title: "Employee Fields",
    href: "/settings/employee-fields",
    permission: PERMISSIONS.EMPLOYEE_FIELDS_VIEW,
    icon: "employee-fields",
  },
  {
    title: "Test Data",
    href: "/settings/test-data",
    icon: "test-data",
    // SUPERADMIN-only, alongside Organizations: the purge needs
    // `employees.test_data_purge` AND the system-level SUPERADMIN role. The
    // page and its server action enforce both; this only keeps the link out of
    // a tenant sidebar.
    superadminOnly: true,
  },
  {
    title: "Account",
    href: "/settings/account",
    icon: "profile",
  },
];

/**
 * All navigation sections in display order.
 *
 * Sections are purely descriptive; `getAuthorizedSections` filters items by
 * permission server-side before they reach the shell. Empty sections drop
 * out automatically, so an employee's drawer never shows management
 * modules and an admin always keeps full access to the authorized set.
 */
export const navigationSections: NavSection[] = [
  { items: primaryNavigation },
  { title: "Insights", items: supportNavigation },
  { title: "Settings", items: settingsNavigation },
];
