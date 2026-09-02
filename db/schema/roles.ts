import { boolean, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { organizations } from "./organizations";

/**
 * Roles — authorization role definitions (RBAC foundation, Phase 4).
 * `code` values are stable identifiers (e.g. SUPERADMIN, ADMIN_HR) unique
 * within an organization; `is_system` marks seed/immutable roles.
 *
 * No authorization logic is implemented in Phase 2.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("roles_org_code_unique").on(table.organizationId, table.code),
  ]
);
