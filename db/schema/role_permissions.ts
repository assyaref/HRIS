import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./common";
import { permissions } from "./permissions";
import { roles } from "./roles";

/**
 * Role ↔ permission junction (normalized RBAC).
 * Composite primary key prevents duplicate grants.
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("role_permissions_permission_id_idx").on(table.permissionId),
  ]
);
