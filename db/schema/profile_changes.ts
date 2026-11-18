import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { createdAt, updatedAt, uuidId } from "./common";
import { employees } from "./employees";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Profile change requests (migration 0025): an employee proposes new values
 * for whitelisted personal fields; HR approves (the values are applied to
 * `employees`) or rejects.
 *
 * `changes` holds `{ field: { from, to } }` captured at submission, so the
 * reviewer sees exactly what was asked even if the profile changed since.
 * The employee foreign key is `ON DELETE RESTRICT`: permanent deletion and
 * the test-data purge remove these rows explicitly.
 */

export const PROFILE_CHANGE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

export type ProfileChangeSet = Record<string, { from: string | null; to: string | null }>;

export const profileChangeRequests = pgTable(
  "profile_change_requests",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    changes: jsonb("changes").$type<ProfileChangeSet>().notNull(),
    note: text("note"),
    /** pending | approved | rejected | cancelled */
    status: text("status").notNull().default("pending"),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerNote: text("reviewer_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("profile_change_requests_org_status_idx").on(table.organizationId, table.status),
    index("profile_change_requests_org_employee_idx").on(table.organizationId, table.employeeId),
  ]
);
