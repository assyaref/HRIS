import {
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
 * Payroll foundation (Phase 8).
 *
 * Money is stored as INTEGER IDR units (no floating point). Statuses are
 * application-level text contracts documented in features/payroll/constants.ts:
 * - payroll_periods:    draft | processing | pending_approval | approved | locked | cancelled
 * - payroll_items:      included | excluded
 * - payslips:           generated | published | revoked
 *
 * Finalized data (items, item components, payslips, events) is never
 * physically deleted, and names/numbers are snapshotted onto payroll items so
 * historical payslips stay stable when employee profiles change.
 */

/** Payroll periods — one period per payroll cycle (unique org + code). */
export const payrollPeriods = pgTable(
  "payroll_periods",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    periodStart: timestamp("period_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    periodEnd: timestamp("period_end", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    paymentDate: timestamp("payment_date", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payroll_periods_org_code_unique").on(
      table.organizationId,
      table.code
    ),
    index("payroll_periods_org_status_idx").on(
      table.organizationId,
      table.status
    ),
    index("payroll_periods_org_dates_idx").on(
      table.organizationId,
      table.periodStart,
      table.periodEnd
    ),
  ]
);

/**
 * Payroll runs — one calculation per period (unique org+period). The run
 * carries the workflow timestamps (calculated/approved/locked).
 */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    payrollPeriodId: uuid("payroll_period_id")
      .notNull()
      .references(() => payrollPeriods.id),
    status: text("status").notNull().default("draft"),
    calculatedAt: timestamp("calculated_at", {
      withTimezone: true,
      mode: "date",
    }),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "date",
    }),
    submittedBy: uuid("submitted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "date",
    }),
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    lockedAt: timestamp("locked_at", {
      withTimezone: true,
      mode: "date",
    }),
    lockedBy: uuid("locked_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payroll_runs_org_period_unique").on(
      table.organizationId,
      table.payrollPeriodId
    ),
    index("payroll_runs_org_status_idx").on(
      table.organizationId,
      table.status
    ),
  ]
);

/**
 * Payroll components — master salary component definitions.
 * Types: earning | deduction. Methods: fixed | percentage | manual.
 * Default amounts are integer IDR.
 */
export const payrollComponents = pgTable(
  "payroll_components",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    calculationMethod: text("calculation_method").notNull(),
    defaultAmount: integer("default_amount").notNull().default(0),
    active: text("active").notNull().default("true"),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payroll_components_org_code_unique").on(
      table.organizationId,
      table.code
    ),
    index("payroll_components_org_idx").on(table.organizationId),
  ]
);

/**
 * Payroll items — one employee result per run (unique run+employee).
 * Names/numbers are snapshotted for historical payslips.
 */
export const payrollItems = pgTable(
  "payroll_items",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    employeeNumberSnapshot: text("employee_number_snapshot").notNull(),
    employeeNameSnapshot: text("employee_name_snapshot").notNull(),
    grossAmount: integer("gross_amount").notNull().default(0),
    totalEarnings: integer("total_earnings").notNull().default(0),
    totalDeductions: integer("total_deductions").notNull().default(0),
    netAmount: integer("net_amount").notNull().default(0),
    status: text("status").notNull().default("processing"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payroll_items_run_employee_unique").on(
      table.payrollRunId,
      table.employeeId
    ),
    index("payroll_items_org_idx").on(table.organizationId),
    index("payroll_items_run_idx").on(table.payrollRunId),
    index("payroll_items_employee_idx").on(table.employeeId),
  ]
);

/** Payroll item components — actual values used (snapshotted) per item. */
export const payrollItemComponents = pgTable(
  "payroll_item_components",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    payrollItemId: uuid("payroll_item_id")
      .notNull()
      .references(() => payrollItems.id, { onDelete: "cascade" }),
    componentId: uuid("component_id").references(
      () => payrollComponents.id,
      { onDelete: "set null" }
    ),
    componentCodeSnapshot: text("component_code_snapshot").notNull(),
    componentNameSnapshot: text("component_name_snapshot").notNull(),
    componentTypeSnapshot: text("component_type_snapshot").notNull(),
    amount: integer("amount").notNull().default(0),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (table) => [
    index("payroll_item_components_org_idx").on(table.organizationId),
    index("payroll_item_components_item_idx").on(table.payrollItemId),
    index("payroll_item_components_component_idx").on(table.componentId),
  ]
);

/** Payslips — finalized, printable salary statements over a payroll item. */
export const payslips = pgTable(
  "payslips",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    payrollItemId: uuid("payroll_item_id")
      .notNull()
      .references(() => payrollItems.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    payslipNumber: text("payslip_number").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("generated"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("payslips_org_payslip_number_unique").on(
      table.organizationId,
      table.payslipNumber
    ),
    index("payslips_org_idx").on(table.organizationId),
    index("payslips_employee_idx").on(table.employeeId),
    index("payslips_item_idx").on(table.payrollItemId),
  ]
);

/**
 * Payroll events — append-only workflow history.
 * No UPDATE/DELETE path exists for these rows.
 */
export const payrollEvents = pgTable(
  "payroll_events",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    payrollPeriodId: uuid("payroll_period_id").references(
      () => payrollPeriods.id,
      { onDelete: "set null" }
    ),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    reason: text("reason"),
    metadata: text("metadata"),
    eventAt: timestamp("event_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    index("payroll_events_org_idx").on(table.organizationId),
    index("payroll_events_period_idx").on(table.payrollPeriodId),
    index("payroll_events_org_event_at_idx").on(
      table.organizationId,
      table.eventAt
    ),
  ]
);