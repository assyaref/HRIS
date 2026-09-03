import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { employees } from "./employees";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Permission (absence) requests — time-based employee requests that are not
 * leave, e.g. a few hours away for an errand or a home-office session.
 *
 * Status contract: pending | approved | rejected | cancelled. Times are
 * timestamptz (server-authoritative).
 */

export const permissionRequests = pgTable(
  "permission_requests",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    permissionType: text("permission_type").notNull(),
    startAt: timestamp("start_at", { withTimezone: true, mode: "date" })
      .notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    reviewerNote: text("reviewer_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("permission_requests_org_idx").on(table.organizationId),
    index("permission_requests_employee_idx").on(table.employeeId),
    index("permission_requests_status_idx").on(table.status),
    index("permission_requests_org_status_idx").on(
      table.organizationId,
      table.status
    ),
  ]
);

/** Immutable approval/request history for permission requests. */
export const permissionRequestEvents = pgTable(
  "permission_request_events",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    requestId: uuid("request_id")
      .notNull()
      .references(() => permissionRequests.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (table) => [
    index("permission_request_events_org_idx").on(table.organizationId),
    index("permission_request_events_request_idx").on(table.requestId),
  ]
);
