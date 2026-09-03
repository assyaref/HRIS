import type { Permission } from "@/lib/auth/permissions";

/**
 * Shared navigation contract for the application shell.
 * `permission` is optional: when present, the item is only shown to users who
 * hold that capability (filtered server-side — the client never decides).
 */
export interface NavItem {
  title: string;
  href: string;
  permission?: Permission;
}

/** A group of navigation items with an optional section heading. */
export interface NavSection {
  title?: string;
  items: NavItem[];
}
