import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Employee Custom Tabs 2.0 — dynamic tab definitions for the employee
 * profile (Employee Custom Tabs 2.0).
 *
 * HR/Superadmin creates tabs entirely from the UI (e.g. "Sertifikasi",
 * "Training", "Kesehatan"); nothing about a tab is hard-coded in React or
 * Excel code. A tab is organization scoped and identified by a normalized
 * `tabKey` (unique per organization). Custom FIELDS are assigned to a tab
 * through the EXISTING `employee_custom_field_definitions.section` column
 * (the tab key is stored there), so no field-schema change is involved.
 *
 * Status values: active | inactive. There is deliberately no hard delete:
 * deactivating a tab retires it (its fields fall back to the built-in
 * Custom Fields tab) while every stored field value stays untouched.
 *
 * `visibilityConfig` mirrors the custom field contract: role codes allowed
 * to see the tab on the employee profile; an empty config means every role
 * that may already view employee custom data sees it.
 */

export const employeeCustomTabs = pgTable(
  "employee_custom_tabs",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** Unique per organization (e.g. `certification`). */
    tabKey: text("tab_key").notNull(),
    /** Display name (e.g. "Sertifikasi"). */
    name: text("name").notNull(),
    description: text("description"),
    /** Optional short glyph/emoji prefix shown with the tab label. */
    icon: text("icon"),
    displayOrder: integer("display_order").notNull().default(0),
    /** Lifecycle: active | inactive. */
    status: text("status").notNull().default("active"),
    /** Role codes permitted to view this tab (empty = every role). */
    visibilityConfig: jsonb("visibility_config")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("employee_custom_tabs_org_key_unique").on(
      table.organizationId,
      table.tabKey
    ),
    index("employee_custom_tabs_org_status_idx").on(
      table.organizationId,
      table.status
    ),
  ]
);
