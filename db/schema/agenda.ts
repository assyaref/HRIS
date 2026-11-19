import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt, uuidId } from "./common";
import { employees } from "./employees";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Company agenda / planner (migration 0031): meetings, trainings and events
 * for all employees or selected departments, with optional RSVP.
 *
 * `agenda_responses.employee_id` is `ON DELETE RESTRICT`; permanent
 * deletion / test-data purge remove an employee's responses explicitly.
 */

export const AGENDA_CATEGORIES = ["meeting", "training", "event", "other"] as const;
export const AGENDA_RESPONSES = ["going", "maybe", "not_going"] as const;

export const agendaEvents = pgTable(
  "agenda_events",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    description: text("description"),
    /** meeting | training | event | other */
    category: text("category").notNull().default("meeting"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    /** Department names the event is for; empty = everyone. */
    audienceDepartments: text("audience_departments").array().notNull().default([]),
    requireRsvp: boolean("require_rsvp").notNull().default(false),
    cancelled: boolean("cancelled").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("agenda_events_org_start_idx").on(table.organizationId, table.startAt)]
);

export const agendaResponses = pgTable(
  "agenda_responses",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => agendaEvents.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** going | maybe | not_going */
    response: text("response").notNull(),
    note: text("note"),
    respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agenda_responses_event_employee_unique").on(table.eventId, table.employeeId),
    index("agenda_responses_org_employee_idx").on(table.organizationId, table.employeeId),
  ]
);
