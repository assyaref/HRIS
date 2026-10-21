import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { createdAt, updatedAt, uuidId } from "./common";
import { employees } from "./employees";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Employee permanent-deletion CONTROL PLANE (additive).
 *
 * These tables gate the Super Administrator permanent-deletion policy
 * (`features/employees/deletion-control-policy.ts`). They are deliberately
 * separate from `employees`: a legal hold or a pending deletion request must
 * outlive, and must be able to block, the destructive operation itself.
 *
 * Referential integrity:
 * - Every `employee_id` / `request_id` reference is `RESTRICT`, matching the
 *   reconciliation in migration 0017. A legal hold therefore physically blocks
 *   ANY employee `DELETE` — including the existing
 *   `permanentlyDeleteEmployeeAction` — at the database level, not only in
 *   application code. A hold can only be removed by an explicit release.
 * - `placed_by_user_id` / `approver_user_id` are `SET NULL`, so deleting an
 *   operator account never destroys the control record (and never unblocks a
 *   hold): the identity is additionally snapshotted as text columns.
 *
 * STATUS/ DECISION VALUES (application-level contracts):
 * - `employee_deletion_requests.status`: pending | approved | rejected |
 *   cancelled | executed.
 * - `employee_deletion_requests.tier`: direct | special_approval.
 * - `employee_deletion_approvals.decision`: approved | rejected.
 *
 * IMPORTANT: these tables are created by the hand-written migration
 * `db/migrations/0021_employee_deletion_controls.sql`, which is NOT applied and
 * NOT journaled. Nothing here enables execution: the executor server action is
 * hard-disabled pending the retention-policy sign-off documented in
 * `docs/employee-permanent-delete-policy.md`.
 */

export const employeeLegalHolds = pgTable(
  "employee_legal_holds",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** Why the hold exists (required). */
    reason: text("reason").notNull(),
    /** Requesting authority / case owner (e.g. Legal, regulator). */
    authority: text("authority"),
    /** External case/ticket reference. */
    reference: text("reference"),
    placedByUserId: uuid("placed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    placedByEmail: text("placed_by_email"),
    placedAt: timestamp("placed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    releasedByUserId: uuid("released_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    releasedByEmail: text("released_by_email"),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
    releaseReason: text("release_reason"),
    /** Only an active hold blocks deletion; releases are retained as history. */
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("employee_legal_holds_employee_idx").on(
      table.organizationId,
      table.employeeId,
      table.active
    ),
    /**
     * At most ONE active hold per employee per organization. A second hold can
     * only be placed after the first is released. Partial (WHERE active) so
     * the released history remains unlimited. The database — not application
     * code — enforces the single-active-hold invariant, closing the race
     * between two concurrent placements.
     */
    uniqueIndex("employee_legal_holds_active_hold_unique")
      .on(table.organizationId, table.employeeId)
      .where(sql`active`),
  ]
);

export const employeeDeletionRequests = pgTable(
  "employee_deletion_requests",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** Snapshot of the employee identity at request time. */
    employeeNumber: text("employee_number").notNull(),
    employeeName: text("employee_name").notNull(),
    requesterUserId: uuid("requester_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    requesterEmail: text("requester_email"),
    /** Operator justification (required, validated server-side). */
    reason: text("reason").notNull(),
    /** Policy tier resolved when the request was raised. */
    tier: text("tier").notNull(),
    /** pending | approved | rejected | cancelled | executed. */
    status: text("status").notNull().default("pending"),
    /** Distinct approvals required (1 direct, 2 special_approval). */
    requiredApprovals: integer("required_approvals").notNull().default(1),
    requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
    decisionReason: text("decision_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("employee_deletion_requests_org_employee_idx").on(
      table.organizationId,
      table.employeeId
    ),
    index("employee_deletion_requests_status_idx").on(
      table.organizationId,
      table.status
    ),
  ]
);

export const employeeDeletionApprovals = pgTable(
  "employee_deletion_approvals",
  {
    id: uuidId(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => employeeDeletionRequests.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    approverUserId: uuid("approver_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approverEmail: text("approver_email"),
    /** approved | rejected. */
    decision: text("decision").notNull(),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (table) => [
    // One decision per approver per request (nulls allowed for deleted users).
    uniqueIndex("employee_deletion_approvals_request_approver_unique").on(
      table.requestId,
      table.approverUserId
    ),
    index("employee_deletion_approvals_request_idx").on(table.requestId),
  ]
);
