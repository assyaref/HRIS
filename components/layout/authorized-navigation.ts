import "server-only";

import { getUserAuthorization } from "@/lib/auth/rbac";
import type { NavItem, NavSection } from "@/types/navigation";

import { navigationSections } from "./navigation";

export { flattenNavHrefs } from "./navigation";

/**
 * Permission-aware navigation resolver (server-only).
 *
 * Items that declare a required permission are included only when the user
 * holds that capability in the database. This is a UX filter: every route is
 * independently protected server-side by its page/action guards. A single
 * authorization resolution is shared across all sections per request.
 * Collapsible groups are filtered child-by-child and dropped when empty; a
 * group left with a single child collapses into that child.
 */
export async function getAuthorizedSections(
  userId: string
): Promise<NavSection[]> {
  const authorization = await getUserAuthorization(userId);
  const granted = new Set(authorization.permissionCodes);

  const allowed = (item: NavItem): boolean =>
    (!item.permission || granted.has(item.permission)) &&
    (!item.anyPermission ||
      item.anyPermission.some((code) => granted.has(code))) &&
    (!item.superadminOnly || authorization.isSuperAdmin);

  const resolve = (item: NavItem): NavItem | null => {
    if (!allowed(item)) return null;
    if (!item.children) return item;
    const children = item.children
      .map(resolve)
      .filter((child): child is NavItem => child !== null);
    if (children.length === 0) return null;
    if (children.length === 1) {
      return { ...children[0], icon: children[0].icon ?? item.icon };
    }
    return { ...item, children };
  };

  const sections: NavSection[] = [];
  for (const section of navigationSections) {
    const items = section.items
      .map(resolve)
      .filter((item): item is NavItem => item !== null);

    if (items.length > 0) {
      sections.push({
        ...(section.title ? { title: section.title } : {}),
        items,
      });
    }
  }

  return sections;
}
