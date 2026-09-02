import { date, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { organizations } from "./organizations";

/**
 * Projects — organizational units employees are assigned to.
 * Status values (application-level contract): active | inactive | completed.
 *
 * No billing or financial fields (payroll/project-finance lives in Phase 11+).
 */
export const projects = pgTable(
  "projects",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    startDate: date("start_date", { mode: "date" }),
    endDate: date("end_date", { mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("projects_org_code_unique").on(table.organizationId, table.code),
  ]
);
