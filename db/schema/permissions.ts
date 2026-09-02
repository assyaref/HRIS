import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, uuidId } from "./common";

/**
 * Permissions — a global catalog of capability codes (RBAC foundation,
 * Phase 4), e.g. `attendance:approve`, `payroll:run`.
 * `module` groups permissions by feature area.
 *
 * No authorization logic is implemented in Phase 2.
 */
export const permissions = pgTable(
  "permissions",
  {
    id: uuidId(),
    code: text("code").notNull(),
    module: text("module").notNull(),
    description: text("description"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("permissions_code_unique").on(table.code)]
);
