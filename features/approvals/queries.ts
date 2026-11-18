import "server-only";

import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";
import {
  employees,
  leaveRequests,
  leaveTypes,
  overtimeRequests,
  permissionRequests,
} from "@/db/schema";
import { isTimeModuleReady } from "@/features/time/module";
import { formatDuration } from "@/features/time/rules";

export type ApprovalKind = "leave" | "permission" | "overtime";

export interface ApprovalItem {
  kind: ApprovalKind;
  id: string;
  href: string;
  employeeNumber: string;
  employeeName: string;
  /** Leave type name or permission type code. */
  subject: string;
  /** Human period ("2026-11-20 → 2026-11-21"). */
  period: string;
  status: string;
  submittedAt: Date;
}

export interface ApprovalCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface ApprovalFilters {
  /** Submission window, inclusive ("YYYY-MM-DD"). */
  from: string;
  to: string;
  kinds: ApprovalKind[];
  status?: string;
}

export const APPROVAL_LIST_LIMIT = 300;

const employeeNumberSql = (snapshot: AnyPgColumn) =>
  sql<string>`COALESCE(${employees.employeeNumber}, ${snapshot}, '—')`;
const employeeNameSql = (snapshot: AnyPgColumn) =>
  sql<string>`COALESCE(NULLIF(TRIM(${employees.firstName} || ' ' || ${employees.lastName}), ''), ${snapshot}, '—')`;

/** [from 00:00, to + 1 day 00:00) in the app time zone, computed by PostgreSQL. */
export function dayWindow(column: AnyPgColumn, from: string, to: string): SQL[] {
  return [
    sql`${column} >= ((${from})::date)::timestamp AT TIME ZONE ${APP_TIME_ZONE}`,
    sql`${column} < ((${to})::date + 1)::timestamp AT TIME ZONE ${APP_TIME_ZONE}`,
  ];
}

/**
 * One inbox over the request types this organization approves today (leave
 * and permission), newest first. Each item links to its own detail page,
 * where the existing actions approve / reject with their own guards.
 */
export async function listApprovalInbox(
  organizationId: string,
  filters: ApprovalFilters
): Promise<{ items: ApprovalItem[]; counts: ApprovalCounts }> {
  const wantLeave = filters.kinds.includes("leave");
  const wantPermission = filters.kinds.includes("permission");
  // Overtime lives in migration 0024; skip it until the tables exist.
  const wantOvertime = filters.kinds.includes("overtime") && (await isTimeModuleReady());

  const [leaveRows, permissionRows, overtimeRows] = await Promise.all([
    wantLeave
      ? db
          .select({
            id: leaveRequests.id,
            employeeNumber: employeeNumberSql(leaveRequests.employeeNumberSnapshot),
            employeeName: employeeNameSql(leaveRequests.employeeNameSnapshot),
            subject: leaveTypes.name,
            startDate: sql<string>`to_char(${leaveRequests.startDate}, 'YYYY-MM-DD')`,
            endDate: sql<string>`to_char(${leaveRequests.endDate}, 'YYYY-MM-DD')`,
            status: leaveRequests.status,
            submittedAt: leaveRequests.submittedAt,
          })
          .from(leaveRequests)
          .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
          .leftJoin(employees, eq(employees.id, leaveRequests.employeeId))
          .where(
            and(
              eq(leaveRequests.organizationId, organizationId),
              ...dayWindow(leaveRequests.submittedAt, filters.from, filters.to)
            )
          )
          .orderBy(desc(leaveRequests.submittedAt))
      : Promise.resolve([]),
    wantPermission
      ? db
          .select({
            id: permissionRequests.id,
            employeeNumber: employeeNumberSql(permissionRequests.employeeNumberSnapshot),
            employeeName: employeeNameSql(permissionRequests.employeeNameSnapshot),
            subject: permissionRequests.permissionType,
            startAt: permissionRequests.startAt,
            endAt: permissionRequests.endAt,
            status: permissionRequests.status,
            submittedAt: permissionRequests.submittedAt,
          })
          .from(permissionRequests)
          .leftJoin(employees, eq(employees.id, permissionRequests.employeeId))
          .where(
            and(
              eq(permissionRequests.organizationId, organizationId),
              ...dayWindow(permissionRequests.submittedAt, filters.from, filters.to)
            )
          )
          .orderBy(desc(permissionRequests.submittedAt))
      : Promise.resolve([]),
    wantOvertime
      ? db
          .select({
            id: overtimeRequests.id,
            employeeNumber: employees.employeeNumber,
            employeeName: sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`,
            overtimeDate: overtimeRequests.overtimeDate,
            startTime: overtimeRequests.startTime,
            endTime: overtimeRequests.endTime,
            totalMinutes: overtimeRequests.totalMinutes,
            status: overtimeRequests.status,
            submittedAt: overtimeRequests.createdAt,
          })
          .from(overtimeRequests)
          .innerJoin(employees, eq(employees.id, overtimeRequests.employeeId))
          .where(
            and(
              eq(overtimeRequests.organizationId, organizationId),
              ...dayWindow(overtimeRequests.createdAt, filters.from, filters.to)
            )
          )
          .orderBy(desc(overtimeRequests.createdAt))
      : Promise.resolve([]),
  ]);

  const dateTime = new Intl.DateTimeFormat("id-ID", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const all: ApprovalItem[] = [
    ...leaveRows.map((row) => ({
      kind: "leave" as const,
      id: row.id,
      href: `/leave/${row.id}`,
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
      subject: row.subject,
      period: row.startDate === row.endDate ? row.startDate : `${row.startDate} → ${row.endDate}`,
      status: row.status,
      submittedAt: row.submittedAt,
    })),
    ...permissionRows.map((row) => ({
      kind: "permission" as const,
      id: row.id,
      href: `/permission/${row.id}`,
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
      subject: row.subject,
      period: `${dateTime.format(row.startAt)} → ${dateTime.format(row.endAt)}`,
      status: row.status,
      submittedAt: row.submittedAt,
    })),
    ...overtimeRows.map((row) => ({
      kind: "overtime" as const,
      id: row.id,
      href: `/overtime/management?from=${row.overtimeDate}&to=${row.overtimeDate}`,
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
      subject: formatDuration(row.totalMinutes),
      period: `${row.overtimeDate} · ${row.startTime}–${row.endTime}`,
      status: row.status,
      submittedAt: row.submittedAt,
    })),
  ].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

  const counts: ApprovalCounts = {
    total: all.length,
    pending: all.filter((i) => i.status === "pending").length,
    approved: all.filter((i) => i.status === "approved").length,
    rejected: all.filter((i) => i.status === "rejected").length,
  };
  const items = (filters.status ? all.filter((i) => i.status === filters.status) : all).slice(
    0,
    APPROVAL_LIST_LIMIT
  );
  return { items, counts };
}
