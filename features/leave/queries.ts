import "server-only";

import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  employees,
  leaveBalances,
  leaveRequestEvents,
  leaveRequests,
  leaveTypes,
  users,
} from "@/db/schema";
import type { LeaveRequestStatus } from "./constants";
import type { LeaveManagementFilterInput } from "./schemas";

/**
 * Leave data access (Phase 7) — server-only.
 *
 * Employee self-service queries are pinned to the authenticated user's linked
 * employee. Management queries scope by organization.
 */

export interface LeaveTypeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  defaultAllowanceDays: number | null;
}

export interface LeaveBalanceRow {
  id: string;
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  year: string;
  entitlement: number;
  used: number;
  pending: number;
  adjustment: number;
  available: number;
}

export interface LeaveRequestRow {
  id: string;
  /**
   * NULL once the employee row was permanently deleted: the request is
   * retained (detached, migration 0022) and described by its snapshots.
   */
  employeeId: string | null;
  employeeName: string;
  employeeNumber: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string;
  status: LeaveRequestStatus;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewerNote: string | null;
}

export interface LeaveEventRow {
  id: string;
  eventType: string;
  actorName: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface LeaveRequestDetail {
  request: LeaveRequestRow;
  events: LeaveEventRow[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Active leave types available to request (org-scoped). */
export async function listActiveLeaveTypes(
  organizationId: string
): Promise<LeaveTypeRow[]> {
  const rows = await db
    .select({
      id: leaveTypes.id,
      code: leaveTypes.code,
      name: leaveTypes.name,
      description: leaveTypes.description,
      defaultAllowanceDays: leaveTypes.defaultAllowanceDays,
    })
    .from(leaveTypes)
    .where(
      and(
        eq(leaveTypes.organizationId, organizationId),
        eq(leaveTypes.active, true)
      )
    )
    .orderBy(asc(leaveTypes.code));
  return rows;
}

/** One leave type, org-scoped (or null). */
export async function getLeaveTypeInOrganization(
  organizationId: string,
  leaveTypeId: string
): Promise<LeaveTypeRow | null> {
  const rows = await db
    .select({
      id: leaveTypes.id,
      code: leaveTypes.code,
      name: leaveTypes.name,
      description: leaveTypes.description,
      defaultAllowanceDays: leaveTypes.defaultAllowanceDays,
    })
    .from(leaveTypes)
    .where(
      and(
        eq(leaveTypes.id, leaveTypeId),
        eq(leaveTypes.organizationId, organizationId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** One balance row for an employee/type/year, org-scoped. */
export async function getLeaveBalance(
  organizationId: string,
  employeeId: string,
  leaveTypeId: string,
  year: string
) {
  const rows = await db
    .select({
      id: leaveBalances.id,
      entitlement: leaveBalances.entitlement,
      used: leaveBalances.used,
      pending: leaveBalances.pending,
      adjustment: leaveBalances.adjustment,
    })
    .from(leaveBalances)
    .where(
      and(
        eq(leaveBalances.organizationId, organizationId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year)
      )
    )
    .limit(1);
  const row = rows[0];
  return row ?? null;
}

/** Leave balances for one employee (self-service). */
export async function listLeaveBalances(
  organizationId: string,
  employeeId: string
): Promise<LeaveBalanceRow[]> {
  const rows = await db
    .select({
      id: leaveBalances.id,
      leaveTypeId: leaveTypes.id,
      leaveTypeCode: leaveTypes.code,
      leaveTypeName: leaveTypes.name,
      year: leaveBalances.year,
      entitlement: leaveBalances.entitlement,
      used: leaveBalances.used,
      pending: leaveBalances.pending,
      adjustment: leaveBalances.adjustment,
    })
    .from(leaveBalances)
    .innerJoin(
      leaveTypes,
      and(
        eq(leaveTypes.id, leaveBalances.leaveTypeId),
        eq(leaveTypes.organizationId, organizationId)
      )
    )
    .where(
      and(
        eq(leaveBalances.organizationId, organizationId),
        eq(leaveBalances.employeeId, employeeId)
      )
    )
    .orderBy(asc(leaveTypes.code));

  return rows.map((row) => ({
    id: row.id,
    leaveTypeId: row.leaveTypeId,
    leaveTypeCode: row.leaveTypeCode,
    leaveTypeName: row.leaveTypeName,
    year: row.year,
    entitlement: row.entitlement,
    used: row.used,
    pending: row.pending,
    adjustment: row.adjustment,
    available:
      row.entitlement + row.adjustment - row.used - row.pending,
  }));
}

/**
 * Shared select columns for joined leave request rows.
 *
 * Snapshot-first identity (migration 0022): a request whose employee row was
 * permanently deleted is retained, detached (`employee_id` NULL) and
 * resolves its display identity from the immutable snapshots. The live
 * employee row is the fallback, never the requirement.
 */
const requestViewColumns = {
  id: leaveRequests.id,
  employeeId: leaveRequests.employeeId,
  employeeName: sql<string>`coalesce(
    ${employees.firstName} || ' ' || ${employees.lastName},
    ${leaveRequests.employeeNameSnapshot}
  )`,
  employeeNumber: sql<string>`coalesce(
    ${employees.employeeNumber},
    ${leaveRequests.employeeNumberSnapshot}
  )`,
  leaveTypeId: leaveTypes.id,
  leaveTypeName: leaveTypes.name,
  leaveTypeCode: leaveTypes.code,
  startDate: leaveRequests.startDate,
  endDate: leaveRequests.endDate,
  totalDays: leaveRequests.totalDays,
  reason: leaveRequests.reason,
  status: leaveRequests.status,
  submittedAt: leaveRequests.submittedAt,
  reviewedAt: leaveRequests.reviewedAt,
  reviewerNote: leaveRequests.reviewerNote,
} as const;

/** Joined leave request row shape produced by `requestViewColumns`. */
interface LeaveRequestView {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  employeeNumber: string | null;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string;
  status: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewerNote: string | null;
}

function toLeaveRequestRow(row: unknown): LeaveRequestRow {
  const view = row as LeaveRequestView;
  return {
    id: view.id,
    // A retained row always carries identity (retained-identity CHECK), so
    // the snapshots cover the detached case; the fallback keeps the type
    // honest for legacy rows that predate the snapshot columns.
    employeeName: view.employeeName ?? "(retained record)",
    employeeNumber: view.employeeNumber ?? "—",
    employeeId: view.employeeId,
    leaveTypeId: view.leaveTypeId,
    leaveTypeName: view.leaveTypeName,
    leaveTypeCode: view.leaveTypeCode,
    startDate: view.startDate,
    endDate: view.endDate,
    totalDays: view.totalDays,
    reason: view.reason,
    status: view.status as LeaveRequestStatus,
    submittedAt: view.submittedAt,
    reviewedAt: view.reviewedAt,
    reviewerNote: view.reviewerNote,
  };
}

/** Leave requests submitted by one employee (self-service), newest first. */
export async function listMyLeaveRequests(
  organizationId: string,
  employeeId: string
): Promise<LeaveRequestRow[]> {
  const rows = await db
    .select(requestViewColumns)
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(
      and(
        eq(leaveRequests.organizationId, organizationId),
        eq(leaveRequests.employeeId, employeeId)
      )
    )
    .orderBy(desc(leaveRequests.submittedAt))
    .limit(50);
  return rows.map(toLeaveRequestRow);
}

/** Organization leave requests for management with filters + pagination. */
export async function listOrganizationLeaveRequests(
  organizationId: string,
  filters: LeaveManagementFilterInput = {}
): Promise<Paginated<LeaveRequestRow>> {
  const pageSize = 20;
  const currentPage = Math.max(1, filters.page ?? 1);
  const conditions = [eq(leaveRequests.organizationId, organizationId)];

  if (filters.status) {
    conditions.push(eq(leaveRequests.status, filters.status));
  }
  if (filters.leaveTypeId) {
    conditions.push(eq(leaveRequests.leaveTypeId, filters.leaveTypeId));
  }
  const search = filters.q?.trim();
  if (search) {
    const pattern = `%${search}%`;
    // Search covers retained (detached) rows too: the snapshots are the only
    // identity a permanently deleted employee's history still carries.
    const searchClause = or(
      ilike(employees.employeeNumber, pattern),
      ilike(employees.firstName, pattern),
      ilike(employees.lastName, pattern),
      ilike(leaveRequests.employeeNumberSnapshot, pattern),
      ilike(leaveRequests.employeeNameSnapshot, pattern)
    );
    if (searchClause) conditions.push(searchClause);
  }

  const [rows, countRows] = await Promise.all([
    db
      .select(requestViewColumns)
      .from(leaveRequests)
      .leftJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(and(...conditions))
      .orderBy(desc(leaveRequests.submittedAt))
      .limit(pageSize)
      .offset((currentPage - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .leftJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .where(and(...conditions)),
  ]);

  const total = countRows[0]?.count ?? 0;
  return {
    items: rows.map(toLeaveRequestRow),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * One leave request + immutable events. Returns null when the id is not in
 * the organization (callers respond with forbidden so existence never leaks).
 */
export async function getLeaveRequestDetail(
  organizationId: string,
  requestId: string
): Promise<LeaveRequestDetail | null> {
  const rows = await db
    .select(requestViewColumns)
    .from(leaveRequests)
    .leftJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(
      and(
        eq(leaveRequests.id, requestId),
        eq(leaveRequests.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const eventRows = await db
    .select({
      id: leaveRequestEvents.id,
      eventType: leaveRequestEvents.eventType,
      reason: leaveRequestEvents.reason,
      createdAt: leaveRequestEvents.createdAt,
      actorName: users.email,
    })
    .from(leaveRequestEvents)
    .leftJoin(users, eq(users.id, leaveRequestEvents.actorUserId))
    .where(eq(leaveRequestEvents.requestId, requestId))
    .orderBy(asc(leaveRequestEvents.createdAt));

  return {
    request: toLeaveRequestRow(row),
    events: eventRows.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      reason: event.reason,
      createdAt: event.createdAt,
      actorName: event.actorName ?? null,
    })),
  };
}
