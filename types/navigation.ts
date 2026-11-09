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
  | "profile"
  | "bell"
  | "home"
  | "user"
  | "plane"
  | "clipboard"
  | "wallet"
  | "megaphone"
  | "network"
  | "layers"
  | "users-cog"
  | "map-pin"
  | "calendar-check"
  | "bar-chart"
  | "link"
  | "edit";

export interface NavItem {
  title: string;
  href: string;
  permission?: Permission;
  /** Shown when the user holds ANY of these permissions. */
  anyPermission?: Permission[];
  /**
   * System-level (Super Administrator only) item. Unlike `permission`, this
   * is decided by the SUPERADMIN role directly (`authorization.isSuperAdmin`),
   * never by a permission code — so a tenant role cannot gain the entry by
   * holding a catalog code.
   */
  superadminOnly?: boolean;
  /** Icon shown beside the label in the sidebar / drawer. */
  icon?: NavIconKey;
  /** Live counter rendered as a red pill next to the label. */
  badge?: "notifications";
  /**
   * Collapsible group. A group has no page of its own: `href` only keys the
   * group and marks it active when the current route is under it. Children
   * are permission-filtered like top-level items; an empty group is dropped.
   */
  children?: NavItem[];
}

/** A group of navigation items with an optional section heading. */
export interface NavSection {
  title?: string;
  items: NavItem[];
}