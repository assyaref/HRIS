import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { employeeCustomFieldDefinitions, employeeCustomTabs } from "@/db/schema";

import type { CustomTabStatus } from "./validation";

/**
 * Organization-scoped custom tab lookups (Employee Custom Tabs 2.0).
 *
 * Every query is filtered by `organization_id` from the authenticated
 * session; an id or key from another tenant resolves to `null`/empty so
 * cross-organization existence is never revealed.
 */

export interface EmployeeCustomTab {
  id: string;
  organizationId: string;
  tabKey: string;
  name: string;
  description: string | null;
  icon: string | null;
  displayOrder: number;
  status: string;
  visibilityConfig: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toTab(row: typeof employeeCustomTabs.$inferSelect): EmployeeCustomTab {
  return {
    id: row.id,
    organizationId: row.organizationId,
    tabKey: row.tabKey,
    name: row.name,
    description: row.description,
    icon: row.icon,
    displayOrder: row.displayOrder,
    status: row.status,
    visibilityConfig: row.visibilityConfig,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Every tab in one organization (active + inactive), in merge order. */
export async function listCustomTabs(
  organizationId: string
): Promise<EmployeeCustomTab[]> {
  const rows = await db
    .select()
    .from(employeeCustomTabs)
    .where(eq(employeeCustomTabs.organizationId, organizationId))
    .orderBy(
      asc(employeeCustomTabs.displayOrder),
      asc(employeeCustomTabs.name)
    );
  return rows.map(toTab);
}

/** Only ACTIVE tabs (employee profile strips, Excel sheets). */
export async function listActiveCustomTabs(
  organizationId: string
): Promise<EmployeeCustomTab[]> {
  const rows = await db
    .select()
    .from(employeeCustomTabs)
    .where(
      and(
        eq(employeeCustomTabs.organizationId, organizationId),
        eq(employeeCustomTabs.status, "active")
      )
    )
    .orderBy(
      asc(employeeCustomTabs.displayOrder),
      asc(employeeCustomTabs.name)
    );
  return rows.map(toTab);
}

/**
 * Load one tab but only when it belongs to `organizationId`. Returns `null`
 * for unknown tabs and tabs owned by another organization (callers respond
 * with forbidden; no existence leak).
 */
export async function getCustomTab(
  tabId: string,
  organizationId: string
): Promise<EmployeeCustomTab | null> {
  const rows = await db
    .select()
    .from(employeeCustomTabs)
    .where(
      and(
        eq(employeeCustomTabs.id, tabId),
        eq(employeeCustomTabs.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  return row ? toTab(row) : null;
}

/** Resolve a tab by its organization-scoped key (used by field actions). */
export async function getCustomTabByKey(
  tabKey: string,
  organizationId: string
): Promise<EmployeeCustomTab | null> {
  const rows = await db
    .select()
    .from(employeeCustomTabs)
    .where(
      and(
        eq(employeeCustomTabs.tabKey, tabKey),
        eq(employeeCustomTabs.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  return row ? toTab(row) : null;
}

/**
 * Number of ACTIVE field definitions assigned to each tab — display-only
 * context for the settings table (drives the "assign fields" hint).
 */
export async function countActiveFieldsPerTab(
  organizationId: string
): Promise<Map<string, number>> {
  const tabs = await listCustomTabs(organizationId);
  if (tabs.length === 0) return new Map();
  const rows = await db
    .select({ section: employeeCustomFieldDefinitions.section })
    .from(employeeCustomFieldDefinitions)
    .where(
      and(
        eq(employeeCustomFieldDefinitions.organizationId, organizationId),
        eq(employeeCustomFieldDefinitions.status, "active")
      )
    );
  const keys = new Set(tabs.map((tab) => tab.tabKey));
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!keys.has(row.section)) continue;
    counts.set(row.section, (counts.get(row.section) ?? 0) + 1);
  }
  return counts;
}

export type { CustomTabStatus };
