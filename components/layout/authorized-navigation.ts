import "server-only";

import { getUserAuthorization } from "@/lib/auth/rbac";
import type { NavSection } from "@/types/navigation";

import { navigationSections } from "./navigation";

/**
 * Permission-aware navigation resolver (server-only).
 *
 * Items that declare a required permission are included only when the user
 * holds that capability in the database. This is a UX filter: every route is
 * independently protected server-side by its page/action guards. A single
 * authorization resolution is shared across all sections per request.
 */
export async function getAuthorizedSections(
  userId: string
): Promise<NavSection[]> {
  const authorization = await getUserAuthorization(userId);
  const granted = new Set(authorization.permissionCodes);
  const sections: NavSection[] = [];

  for (const section of navigationSections) {
    const items = section.items.filter(
      (item) => !item.permission || granted.has(item.permission)
    );

    if (items.length > 0) {
      sections.push({
        ...(section.title ? { title: section.title } : {}),
        items,
      });
    }
  }

  return sections;
}
