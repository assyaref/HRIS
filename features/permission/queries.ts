import "server-only";

import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  employees,
  permissionRequestEvents,
  permissionRequests,
  users,
} from "@/db/schema";
import type { PermissionRequestStatus } from "./constants";
import type { PermissionManagementFilterInput } from "./schemas";

/**
 * Permission (absence) request data access (Phase 7) — server-only.
 */

export interface PermissionRequestRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  permissionType: string;
  startAt: Date;
  endAt: Date;
  reason: string;
  status: PermissionRequestStatus;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewerNote: string | null;
}

export interface PermissionEventRow {
  id: string;
  eventType: string;
  actorName: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface PermissionRequestDetail {
  request: PermissionRequestRow;
  events: PermissionEventRow[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const viewColumns = {
  id: permissionRequests.id,
  employeeId: employees.id,
  employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
  employeeNumber: employees.employeeNumber,
  permissionType: permissionRequests.permissionType,
  startAt: permissionRequests.startAt,
  endAt: permissionRequests.endAt,
  reason: permissionRequests.reason,
  status: permissionRequests.status,
  submittedAt: permissionRequests.submittedAt,
  reviewedAt: permissionRequests.reviewedAt,
  reviewerNote: permissionRequests.reviewerNote,
} as const;

interface PermissionRequestView {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  permissionType: string;
  startAt: Date;
  endAt: Date;
  reason: string;
  status: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewerNote: string | null;
}

function toRow(row: unknown): PermissionRequestRow {
  const view = row as PermissionRequestView;
  return {
    id: view.id,
    employeeId: view.employeeId,
    employeeName: view.employeeName,
    employeeNumber: view.employeeNumber,
    permissionType: view.permissionType,
    startAt: view.startAt,
    endAt: view.endAt,
    reason: view.reason,
    status: view.status as PermissionRequestStatus,
    submittedAt: view.submittedAt,
    reviewedAt: view.reviewedAt,
    reviewerNote: view.reviewerNote,
  };
}

/** Requests submitted by one employee (self-service), newest first. */
export async function listMyPermissionRequests(
  organizationId: string,
  employeeId: string
): Promise<PermissionRequestRow[]> {
  const rows = await db
    .select(viewColumns)
    .from(permissionRequests)
    .innerJoin(employees, eq(employees.id, permissionRequests.employeeId))
    .where(
      and(
        eq(permissionRequests.organizationId, organizationId),
        eq(permissionRequests.employeeId, employeeId)
      )
    )
    .orderBy(desc(permissionRequests.submittedAt))
    .limit(50);
  return rows.map(toRow);
}

/** Organization-wide requests for management with filters + pagination. */
export async function listOrganizationPermissionRequests(
  organizationId: string,
  filters: PermissionManagementFilterInput = {}
): Promise<Paginated<PermissionRequestRow>> {
  const pageSize = 20;
  const currentPage = Math.max(1, filters.page ?? 1);
  const conditions = [eq(permissionRequests.organizationId, organizationId)];

  if (filters.status) {
    conditions.push(eq(permissionRequests.status, filters.status));
  }
  if (filters.permissionType) {
    conditions.push(
      eq(permissionRequests.permissionType, filters.permissionType)
    );
  }
  const search = filters.q?.trim();
  if (search) {
    const pattern = `%${search}%`;
    const searchClause = or(
      ilike(employees.employeeNumber, pattern),
      ilike(employees.firstName, pattern),
      ilike(employees.lastName, pattern)
    );
    if (searchClause) conditions.push(searchClause);
  }

  const [rows, countRows] = await Promise.all([
    db
      .select(viewColumns)
      .from(permissionRequests)
      .innerJoin(employees, eq(employees.id, permissionRequests.employeeId))
      .where(and(...conditions))
      .orderBy(desc(permissionRequests.submittedAt))
      .limit(pageSize)
      .offset((currentPage - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(permissionRequests)
      .innerJoin(employees, eq(employees.id, permissionRequests.employeeId))
      .where(and(...conditions)),
  ]);

  const total = countRows[0]?.count ?? 0;
  return {
    items: rows.map(toRow),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** One request + immutable events (null when not in the organization). */
export async function getPermissionRequestDetail(
  organizationId: string,
  requestId: string
): Promise<PermissionRequestDetail | null> {
  const rows = await db
    .select(viewColumns)
    .from(permissionRequests)
    .innerJoin(employees, eq(employees.id, permissionRequests.employeeId))
    .where(
      and(
        eq(permissionRequests.id, requestId),
        eq(permissionRequests.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const eventRows = await db
    .select({
      id: permissionRequestEvents.id,
      eventType: permissionRequestEvents.eventType,
      reason: permissionRequestEvents.reason,
      createdAt: permissionRequestEvents.createdAt,
      actorName: users.email,
    })
    .from(permissionRequestEvents)
    .leftJoin(users, eq(users.id, permissionRequestEvents.actorUserId))
    .where(eq(permissionRequestEvents.requestId, requestId))
    .orderBy(asc(permissionRequestEvents.createdAt));

  return {
    request: toRow(row),
    events: eventRows.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      reason: event.reason,
      createdAt: event.createdAt,
      actorName: event.actorName ?? null,
    })),
  };
}
