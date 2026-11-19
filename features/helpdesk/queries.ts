import "server-only";

import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { qualified } from "@/lib/db/qualified";
import { employees, helpdeskCategories, helpdeskMessages, helpdeskTickets, users } from "@/db/schema";

export interface CategoryRow {
  id: string;
  name: string;
  active: boolean;
  ticketCount: number;
}

export async function listCategories(organizationId: string): Promise<CategoryRow[]> {
  return db
    .select({
      id: helpdeskCategories.id,
      name: helpdeskCategories.name,
      active: helpdeskCategories.active,
      ticketCount: sql<number>`(SELECT COUNT(*)::int FROM ${helpdeskTickets} WHERE ${helpdeskTickets.categoryId} = ${qualified(helpdeskCategories.id)})`,
    })
    .from(helpdeskCategories)
    .where(eq(helpdeskCategories.organizationId, organizationId))
    .orderBy(desc(helpdeskCategories.active), asc(helpdeskCategories.name));
}

export interface TicketRow {
  id: string;
  ticketNumber: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employeeUserId: string | null;
  categoryName: string | null;
  categoryId: string | null;
  subject: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  assigneeName: string | null;
  lastMessageAt: Date;
  lastMessageFromAgent: boolean;
  employeeLastReadAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  messageCount: number;
}

export const TICKET_LIST_LIMIT = 400;

function ticketSelect() {
  const assignees = alias(users, "assignees");
  return db
    .select({
      id: helpdeskTickets.id,
      ticketNumber: helpdeskTickets.ticketNumber,
      employeeId: helpdeskTickets.employeeId,
      employeeNumber: employees.employeeNumber,
      employeeName: sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`,
      employeeUserId: employees.userId,
      categoryName: helpdeskCategories.name,
      categoryId: helpdeskTickets.categoryId,
      subject: helpdeskTickets.subject,
      priority: helpdeskTickets.priority,
      status: helpdeskTickets.status,
      assignedTo: helpdeskTickets.assignedTo,
      assigneeName: sql<string | null>`COALESCE(${assignees.name}, ${assignees.email})`,
      lastMessageAt: helpdeskTickets.lastMessageAt,
      lastMessageFromAgent: helpdeskTickets.lastMessageFromAgent,
      employeeLastReadAt: helpdeskTickets.employeeLastReadAt,
      resolvedAt: helpdeskTickets.resolvedAt,
      createdAt: helpdeskTickets.createdAt,
      messageCount: sql<number>`(SELECT COUNT(*)::int FROM ${helpdeskMessages} WHERE ${helpdeskMessages.ticketId} = ${qualified(helpdeskTickets.id)} AND ${helpdeskMessages.internal} = false)`,
    })
    .from(helpdeskTickets)
    .innerJoin(employees, eq(employees.id, helpdeskTickets.employeeId))
    .leftJoin(helpdeskCategories, eq(helpdeskCategories.id, helpdeskTickets.categoryId))
    .leftJoin(assignees, eq(assignees.id, helpdeskTickets.assignedTo));
}

export async function listTickets(
  organizationId: string,
  filters: { employeeId?: string; status?: string } = {}
): Promise<TicketRow[]> {
  const where: SQL[] = [eq(helpdeskTickets.organizationId, organizationId)];
  if (filters.employeeId) where.push(eq(helpdeskTickets.employeeId, filters.employeeId));
  if (filters.status) where.push(eq(helpdeskTickets.status, filters.status));
  return ticketSelect()
    .where(and(...where))
    .orderBy(desc(helpdeskTickets.lastMessageAt))
    .limit(TICKET_LIST_LIMIT);
}

export async function getTicket(organizationId: string, ticketId: string): Promise<TicketRow | null> {
  const rows = await ticketSelect()
    .where(and(eq(helpdeskTickets.organizationId, organizationId), eq(helpdeskTickets.id, ticketId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface MessageRow {
  id: string;
  body: string;
  fromAgent: boolean;
  internal: boolean;
  authorName: string | null;
  createdAt: Date;
}

/** Thread of a ticket; internal notes only when `includeInternal`. */
export async function listMessages(
  organizationId: string,
  ticketId: string,
  includeInternal: boolean
): Promise<MessageRow[]> {
  const where: SQL[] = [
    eq(helpdeskMessages.organizationId, organizationId),
    eq(helpdeskMessages.ticketId, ticketId),
  ];
  if (!includeInternal) where.push(eq(helpdeskMessages.internal, false));
  return db
    .select({
      id: helpdeskMessages.id,
      body: helpdeskMessages.body,
      fromAgent: helpdeskMessages.fromAgent,
      internal: helpdeskMessages.internal,
      authorName: sql<string | null>`COALESCE(${users.name}, ${users.email})`,
      createdAt: helpdeskMessages.createdAt,
    })
    .from(helpdeskMessages)
    .leftJoin(users, eq(users.id, helpdeskMessages.authorUserId))
    .where(and(...where))
    .orderBy(asc(helpdeskMessages.createdAt));
}

/** Users of the organization who can be assigned tickets (HR side). */
export async function listAssignableUsers(organizationId: string): Promise<{ id: string; name: string }[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT u.id, COALESCE(u.name, u.email) AS name
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE u.organization_id = ${organizationId}
      AND u.status = 'active'
      AND p.code = 'employees.update'
    ORDER BY 2
  `);
  return (rows.rows as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name }));
}
