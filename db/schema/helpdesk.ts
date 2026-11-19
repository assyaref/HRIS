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
 * Helpdesk "Tanya Admin" (migration 0026): employees open tickets, HR
 * answers in a thread, assigns and resolves them.
 *
 * `helpdesk_tickets.employee_id` is `ON DELETE RESTRICT` like every other
 * employee-scoped table; permanent deletion / the test-data purge remove the
 * tickets explicitly and their messages go with them (`ticket_id` CASCADE —
 * messages carry no employee reference of their own).
 */

export const HELPDESK_PRIORITIES = ["low", "normal", "high"] as const;
export const HELPDESK_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export const helpdeskCategories = pgTable(
  "helpdesk_categories",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("helpdesk_categories_org_name_unique").on(table.organizationId, table.name)]
);

export const helpdeskTickets = pgTable(
  "helpdesk_tickets",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** Human reference, e.g. "TKT-2611-0007" (unique per organization). */
    ticketNumber: text("ticket_number").notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => helpdeskCategories.id, {
      onDelete: "set null",
    }),
    subject: text("subject").notNull(),
    /** low | normal | high */
    priority: text("priority").notNull().default("normal"),
    /** open | in_progress | resolved | closed */
    status: text("status").notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /** Last message time, for sorting and "new reply" badges. */
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    /** Whether the last message came from HR (true) or the employee (false). */
    lastMessageFromAgent: boolean("last_message_from_agent").notNull().default(false),
    employeeLastReadAt: timestamp("employee_last_read_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("helpdesk_tickets_org_number_unique").on(table.organizationId, table.ticketNumber),
    index("helpdesk_tickets_org_status_idx").on(table.organizationId, table.status),
    index("helpdesk_tickets_org_employee_idx").on(table.organizationId, table.employeeId),
  ]
);

export const helpdeskMessages = pgTable(
  "helpdesk_messages",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => helpdeskTickets.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Written by HR (true) or by the employee (false). */
    fromAgent: boolean("from_agent").notNull().default(false),
    /** HR-only note, never shown to the employee. */
    internal: boolean("internal").notNull().default(false),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("helpdesk_messages_ticket_idx").on(table.ticketId, table.createdAt)]
);
