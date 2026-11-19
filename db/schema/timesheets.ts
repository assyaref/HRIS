import { date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { createdAt, updatedAt, uuidId } from "./common";
import { employees } from "./employees";
import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";

/**
 * Timesheet entries (migration 0029): hours an employee spent per day on a
 * project or task. Entries are drafted, submitted per ISO week, and approved
 * or rejected per employee-week.
 *
 * `employee_id` is `ON DELETE RESTRICT`; permanent deletion / test-data
 * purge remove the rows explicitly. A deleted project only clears the link.
 */

export const TIMESHEET_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;

export const timesheetEntries = pgTable(
  "timesheet_entries",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    workDate: date("work_date", { mode: "string" }).notNull(),
    /** Monday of the ISO week of work_date ("YYYY-MM-DD"). */
    weekStart: date("week_start", { mode: "string" }).notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    task: text("task").notNull(),
    minutes: integer("minutes").notNull(),
    notes: text("notes"),
    /** draft | submitted | approved | rejected */
    status: text("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerNote: text("reviewer_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("timesheet_entries_org_employee_week_idx").on(table.organizationId, table.employeeId, table.weekStart),
    index("timesheet_entries_org_week_status_idx").on(table.organizationId, table.weekStart, table.status),
  ]
);
