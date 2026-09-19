import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

/**
 * Employee payroll component assignments — payroll configuration per employee.
 *
 * This table stores the employee's current/historical payroll configuration.
 * It is NOT a payroll result and must never replace payroll_items /
 * payroll_item_components historical snapshots.
 *
 * Amount semantics:
 * - fixed      → integer IDR amount
 * - percentage → whole-number percentage from 0 to 100
 * - manual     → integer IDR amount entered for this employee
 *
 * Historical configurations remain stored through effective_from/effective_to.
 *
 * Integrity contracts (PM-03):
 * - At most ONE active assignment per (organization, employee, component),
 *   enforced by a partial unique index on `active = true` rows; ending an
 *   assignment (`active = false` + `effective_to`) frees the slot for a future
 *   re-assignment.
 * - `effective_to`, when set, must be strictly after `effective_from`.
 * - `amount` is stored as a non-negative integer magnitude; the sign is
 *   implied by the component type (earning/deduction) at calculation time.
 */
export const employeePayrollComponents = pgTable(
  "employee_payroll_components",
  {
    id: uuidId(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),

    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    componentId: uuid("component_id")
      .notNull()
      .references(() => payrollComponents.id, { onDelete: "restrict" }),

    amount: integer("amount").notNull().default(0),

    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
      mode: "date",
    }).notNull(),

    effectiveTo: timestamp("effective_to", {
      withTimezone: true,
      mode: "date",
    }),

    active: boolean("active").notNull().default(true),

    notes: text("notes"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("employee_payroll_components_org_idx").on(
      table.organizationId
    ),

    index("employee_payroll_components_employee_idx").on(
      table.employeeId
    ),

    index("employee_payroll_components_component_idx").on(
      table.componentId
    ),

    index("employee_payroll_components_effective_idx").on(
      table.organizationId,
      table.employeeId,
      table.effectiveFrom,
      table.effectiveTo
    ),

    uniqueIndex("employee_payroll_components_active_unique")
      .on(table.organizationId, table.employeeId, table.componentId)
      .where(sql`active = true`),

    check(
      "employee_payroll_components_amount_nonnegative",
      sql`${table.amount} >= 0`
    ),

    check(
      "employee_payroll_components_date_range_check",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} > ${table.effectiveFrom}`
    ),
  ]
);

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

/**
 * Payslips — finalized, printable salary statements.
 *
 * Two modes (Mode A / Mode B):
 * - Mode A (calculated): linked to a `payroll_items` row via `payroll_item_id`;
 *   `payroll_period_id` may still be set so period-scoped queries and the
 *   distribution payslip list can aggregate both modes.
 * - Mode B (distribution): linked only to a `payroll_periods` row via
 *   `payroll_period_id`; the payslip PDF is uploaded by management and does
 *   not use the payroll calculation engine.
 *
 * Exactly one linkage form is required by the server actions: a calculated
 * payslip must carry `payroll_item_id`, a distribution payslip must carry
 * `payroll_period_id`.
 */
export const payslips = pgTable(
  "payslips",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    payrollItemId: uuid("payroll_item_id").references(
      () => payrollItems.id,
      { onDelete: "restrict" }
    ),
    payrollPeriodId: uuid("payroll_period_id").references(
      () => payrollPeriods.id,
      { onDelete: "restrict" }
    ),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /**
     * Historical employee number snapshot.
     *
     * The payslip PDF password contract is `employeeNumberSnapshot + DDMMYYYY`.
     * It is captured when the payslip is created (Mode A: from the payroll
     * item snapshot; Mode B: from the employee record at upload time) so that
     * renaming/reusing an employee number later can never change the opening
     * password of an already-issued payslip.
     *
     * Nullable for additive migration safety; legacy rows are backfilled from
     * the linked payroll item snapshot (Mode A) or the current employee number.
     */
    employeeNumberSnapshot: text("employee_number_snapshot"),
    /**
     * Historical birth date snapshot.
     *
     * The payslip PDF password contract is
     * `employeeNumberSnapshot + DDMMYYYY(birthDateSnapshot)`. It is captured
     * when the payslip is created (Mode A: from the employee record at
     * generation time; Mode B: from the employee record at upload time) so
     * that changing an employee's birth date later can never change the
     * opening password of an already-issued payslip.
     *
     * Nullable for additive migration safety; legacy rows are backfilled from
     * the employee record. Null only survives when the employee has no birth
     * date, in which case PDF generation is skipped (never issued with a
     * weak/blank password).
     */
    birthDateSnapshot: date("birth_date_snapshot", { mode: "date" }),
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
    index("payslips_period_idx").on(table.payrollPeriodId),
  ]
);

/**
 * Payslip documents — private PDF delivery layer.
 *
 * Security contract:
 * - The PDF is stored outside the web/public tree.
 * - No PDF password is stored in the database.
 * - storageKey is generated by the server and never derived from the
 *   original filename.
 * - One document belongs to exactly one organization/payslip/employee.
 */
export const payslipDocuments = pgTable(
  "payslip_documents",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    payslipId: uuid("payslip_id")
      .notNull()
      .references(() => payslips.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    fileSize: integer("file_size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payslip_documents_org_payslip_unique").on(
      table.organizationId,
      table.payslipId
    ),
    index("payslip_documents_org_idx").on(table.organizationId),
    index("payslip_documents_employee_idx").on(table.employeeId),
    index("payslip_documents_payslip_idx").on(table.payslipId),
  ]
);

/**
 * Payslip document version history — append-only, additive.
 *
 * Every stored PDF (whether produced by the automated generator or uploaded by
 * management) is recorded here exactly once, in increasing `version` order.
 * The `payslip_documents` row above always points at the CURRENT version; this
 * table retains the chain so a replacement never destroys the prior document.
 *
 * Security contract (mirrors payslip_documents):
 * - No PDF password, its components, NIK, or birth date is ever stored here.
 * - No PDF bytes are stored here; only the opaque server-generated storage key.
 * - One version belongs to exactly one organization/document/payslip/employee.
 * - `(organizationId, payslipDocumentId, version)` is unique so concurrent
 *   replacements can never collide on a version number.
 */
export const payslipDocumentVersions = pgTable(
  "payslip_document_versions",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    payslipDocumentId: uuid("payslip_document_id")
      .notNull()
      .references(() => payslipDocuments.id, { onDelete: "restrict" }),
    payslipId: uuid("payslip_id")
      .notNull()
      .references(() => payslips.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    fileSize: integer("file_size").notNull(),
    sha256: text("sha256").notNull(),
    /**
     * "generated" (automated generator), "uploaded" (management upload), or
     * "legacy" (pre-version-history document whose origin is not provable).
     */
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("payslip_document_versions_org_document_version_unique").on(
      table.organizationId,
      table.payslipDocumentId,
      table.version
    ),
    index("payslip_document_versions_org_idx").on(table.organizationId),
    index("payslip_document_versions_payslip_idx").on(table.payslipId),
    index("payslip_document_versions_document_idx").on(
      table.payslipDocumentId
    ),
    check(
      "payslip_document_versions_version_positive",
      sql`${table.version} >= 1`
    ),
    check(
      "payslip_document_versions_source_valid",
      sql`${table.source} in ('generated', 'uploaded', 'legacy')`
    ),
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