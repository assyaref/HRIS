import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, uuidId } from "./common";
import { roles } from "./roles";
import { users } from "./users";

/**
 * User ↔ role junction (normalized RBAC foundation, Phase 4).
 *
 * `scope` / `scope_id` reserve the architecture's row-level scoping
 * (organization | project | department). `granted_by` tracks the granting
 * actor for auditability.
 *
 * No authorization logic is implemented in Phase 2.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuidId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("organization"),
    scopeId: uuid("scope_id"),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    index("user_roles_user_id_idx").on(table.userId),
    index("user_roles_role_id_idx").on(table.roleId),
  ]
);
