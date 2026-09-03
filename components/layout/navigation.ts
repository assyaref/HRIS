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
  { title: "Dashboard", href: "/dashboard" },
];

export const settingsNavigation: NavItem[] = [
  {
    title: "Roles",
    href: "/settings/roles",
    permission: PERMISSIONS.ROLES_VIEW,
  },
  {
    title: "Permissions",
    href: "/settings/permissions",
    permission: PERMISSIONS.PERMISSIONS_VIEW,
  },
];

/** All navigation sections in display order. */
export const navigationSections: NavSection[] = [
  { items: primaryNavigation },
  { title: "Settings", items: settingsNavigation },
];
