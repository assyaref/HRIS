import {
  boolean,
  date,
  index,
  integer,
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
 * Time management (migration 0024): holiday calendar, shifts, work groups and
 * overtime requests (SPKL).
 *
 * Employee foreign keys are `ON DELETE RESTRICT` like every other
 * employee-scoped table: permanent deletion removes `work_group_members` and
 * `overtime_requests` explicitly ("Other related records"), and the test-data
 * purge does the same ("Shift & overtime").
 */

export const HOLIDAY_TYPES = ["national", "collective_leave", "company"] as const;

export const holidays = pgTable(
  "holidays",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    holidayDate: date("holiday_date", { mode: "string" }).notNull(),
    name: text("name").notNull(),
    /** national | collective_leave | company */
    holidayType: text("holiday_type").notNull().default("national"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("holidays_org_date_name_unique").on(
      table.organizationId,
      table.holidayDate,
      table.name
    ),
  ]
);

export const shifts = pgTable(
  "shifts",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    color: text("color").notNull().default("#3B82F6"),
    /** "HH:MM", local time. An end before the start crosses midnight. */
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    breakMinutes: integer("break_minutes").notNull().default(60),
    /** ISO weekdays (1 = Monday … 7 = Sunday), comma separated. */
    workingDays: text("working_days").notNull().default("1,2,3,4,5"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("shifts_org_name_unique").on(table.organizationId, table.name)]
);

export const workGroups = pgTable(
  "work_groups",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "restrict" }),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("work_groups_org_name_unique").on(table.organizationId, table.name)]
);

/** An employee belongs to at most one work group per organization. */
export const workGroupMembers = pgTable(
  "work_group_members",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    workGroupId: uuid("work_group_id")
      .notNull()
      .references(() => workGroups.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("work_group_members_org_employee_unique").on(
      table.organizationId,
      table.employeeId
    ),
    index("work_group_members_group_idx").on(table.workGroupId),
  ]
);

export const OVERTIME_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

export const overtimeRequests = pgTable(
  "overtime_requests",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    overtimeDate: date("overtime_date", { mode: "string" }).notNull(),
    /** "HH:MM"; an end before the start crosses midnight. */
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    totalMinutes: integer("total_minutes").notNull(),
    /** Surat Perintah Kerja Lembur number, when issued. */
    spklNumber: text("spkl_number"),
    reason: text("reason").notNull(),
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
    index("overtime_requests_org_status_idx").on(table.organizationId, table.status),
    index("overtime_requests_org_employee_idx").on(
      table.organizationId,
      table.employeeId,
      table.overtimeDate
    ),
  ]
);
