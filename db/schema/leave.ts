import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
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
 * Leave foundation (Phase 7).
 *
 * Status contract (application level): pending | approved | rejected |
 * cancelled. Leave days are inclusive calendar days computed server-side; no
 * speculative payroll/attendance fields are added.
 */

/**
 * Leave types — organization-scoped categories (unique org + code). Each type
 * may define a default annual allowance used to bootstrap a first balance
 * when an employee requests leave and no balance row exists yet.
 */
export const leaveTypes = pgTable(
  "leave_types",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    defaultAllowanceDays: numeric("default_allowance_days", {
      precision: 8,
      scale: 2,
      mode: "number",
    }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("leave_types_org_code_unique").on(
      table.organizationId,
      table.code
    ),
    index("leave_types_org_idx").on(table.organizationId),
  ]
);

/**
 * Leave balances — one row per employee/type/year (unique triple).
 * Entitlement is granted by HR; `used` grows on approval, `pending` tracks
 * outstanding requests. Employees never edit balances directly.
 */
export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),
    year: text("year").notNull(),
    entitlement: numeric("entitlement", {
      precision: 8,
      scale: 2,
      mode: "number",
    }).notNull(),
    used: numeric("used", { precision: 8, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    pending: numeric("pending", { precision: 8, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    adjustment: numeric("adjustment", {
      precision: 8,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("leave_balances_employee_type_year_unique").on(
      table.employeeId,
      table.leaveTypeId,
      table.year
    ),
    index("leave_balances_org_idx").on(table.organizationId),
    index("leave_balances_employee_idx").on(table.employeeId),
    index("leave_balances_type_idx").on(table.leaveTypeId),
  ]
);

/**
 * Leave requests — employee submissions reviewed by HR/management.
 * reviewed_by/reviewed_at are set by the decision action only.
 */
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    startDate: date("start_date", { mode: "date" }).notNull(),
    endDate: date("end_date", { mode: "date" }).notNull(),
    totalDays: numeric("total_days", {
      precision: 8,
      scale: 2,
      mode: "number",
    }).notNull(),
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
    index("leave_requests_org_idx").on(table.organizationId),
    index("leave_requests_employee_idx").on(table.employeeId),
    index("leave_requests_type_idx").on(table.leaveTypeId),
    index("leave_requests_status_idx").on(table.status),
    index("leave_requests_org_status_idx").on(
      table.organizationId,
      table.status
    ),
  ]
);

/**
 * Immutable approval/request history for leave (append-only).
 * No UPDATE/DELETE path is exposed for these rows.
 */
export const leaveRequestEvents = pgTable(
  "leave_request_events",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    requestId: uuid("request_id")
      .notNull()
      .references(() => leaveRequests.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (table) => [
    index("leave_request_events_org_idx").on(table.organizationId),
    index("leave_request_events_request_idx").on(table.requestId),
  ]
);
