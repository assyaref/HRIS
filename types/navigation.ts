import type { Permission } from "@/lib/auth/permissions";

/**
 * Shared navigation contract for the application shell.
 * `permission` is optional: when present, the item is only shown to users who
 * hold that capability (filtered server-side — the client never decides).
 */

/** Icon keys rendered by the shell navigation (mapped in nav-links). */
export type NavIconKey =
  | "dashboard"
  | "face"
  | "employees"
  | "attendance"
  | "leave"
  | "permission"
  | "payroll"
  | "payslip"
  | "announcements"
  | "organizations"
  | "projects"
  | "users"
  | "roles"
  | "permissions"
  | "work-locations"
  | "employee-fields"
  | "test-data"
  | "settings"
  | "profile";

export interface NavItem {
  title: string;
  href: string;
  permission?: Permission;
  /**
   * System-level (Super Administrator only) item. Unlike `permission`, this
   * is decided by the SUPERADMIN role directly (`authorization.isSuperAdmin`),
   * never by a permission code — so a tenant role cannot gain the entry by
   * holding a catalog code.
   */
  superadminOnly?: boolean;
  /** Icon shown beside the label in the sidebar / drawer. */
  icon?: NavIconKey;
}

/** A group of navigation items with an optional section heading. */
export interface NavSection {
  title?: string;
  items: NavItem[];
}