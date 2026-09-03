import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { employees } from "./employees";
import { organizations } from "./organizations";
import { projects } from "./projects";

/**
 * Employee ↔ project assignments (Phase 6).
 *
 * Connects an employee to one or more projects they are eligible to attend.
 * Every row is organization scoped; application logic ensures the employee and
 * the project belong to the same organization before an assignment is created.
 *
 * `active` marks the current assignment. A partial unique index prevents
 * duplicate *active* assignments for the same (organization, employee,
 * project); ending an assignment (`active = false` + `ended_at`) frees the
 * slot for a future re-assignment.
 */
export const employeeProjectAssignments = pgTable(
  "employee_project_assignments",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    active: boolean("active").notNull().default(true),
    assignedAt: timestamp("assigned_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("employee_project_assignments_org_idx").on(table.organizationId),
    index("employee_project_assignments_employee_idx").on(table.employeeId),
    index("employee_project_assignments_project_idx").on(table.projectId),
    uniqueIndex("employee_project_assignments_active_unique")
      .on(table.organizationId, table.employeeId, table.projectId)
      .where(sql`active = true`),
  ]
);
