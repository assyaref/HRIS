import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, updatedAt, uuidId } from "./common";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Two-level approval (migration 0032). Opt-in per organization and request
 * type: when `manager_step` is on, a request of an employee who has a direct
 * manager (employees.manager_id with a linked account) must first be approved
 * by that manager before the existing approvers (HR) can decide. A manager's
 * rejection rejects the request.
 *
 * The request tables are unchanged; the manager decision is recorded here.
 * No employee reference (request ids only).
 */

export const APPROVAL_REQUEST_TYPES = ["leave", "permission", "overtime"] as const;

export const approvalSettings = pgTable(
  "approval_settings",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** leave | permission | overtime */
    requestType: text("request_type").notNull(),
    managerStep: boolean("manager_step").notNull().default(false),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("approval_settings_org_type_unique").on(table.organizationId, table.requestType)]
);

export const approvalSteps = pgTable(
  "approval_steps",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    requestType: text("request_type").notNull(),
    requestId: uuid("request_id").notNull(),
    /** Only "manager" for now. */
    step: text("step").notNull().default("manager"),
    approverUserId: uuid("approver_user_id").references(() => users.id, { onDelete: "set null" }),
    /** approved | rejected */
    decision: text("decision").notNull(),
    note: text("note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("approval_steps_request_step_unique").on(table.organizationId, table.requestType, table.requestId, table.step),
  ]
);
