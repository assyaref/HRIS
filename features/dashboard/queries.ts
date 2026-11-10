import "server-only";

import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  inArray,
  isNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  attendanceEvents,
  attendanceRecords,
  auditLogs,
  employees,
  leaveRequests,
  leaveTypes,
  payrollPeriods,
  payrollRuns,
  payslips,
  permissionRequests,
  users,
} from "@/db/schema";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";
import type { PayrollPeriodStatus } from "@/features/payroll/constants";
import { isSickLeaveTypeCode } from "@/features/attendance/recap";

import {
  buildAttendanceTrend,
  computeMonthlyRecap,
  dateColumnKey,
  eachDay,
  monthBounds,
  type AttendanceTrendPoint,
  type MonthlyRecap,
} from "./monthly-recap.ts";

/**
 * Dashboard aggregates (read model) — server-only.
 *
 * Everything here is an ORGANIZATION-scoped read. Management amd employee
 * dashboards both resolve the caller's organization from the session; a page
 * that reaches this module has already passed its authorization guard.
 */

export interface WorkforceOverview {
  total: number;
  active: number;
  inactive: number;
  newLast30Days: number;
}

export interface AttendanceStatusCounts {
  /** `present` */
  present: number;
  /** `completed` */
  completed: number;
  /** `incomplete` */
  incomplete: number;
  /** `rejected` */
  rejected: number;
  total: number;
}

export interface AttendanceOverview extends AttendanceStatusCounts {
  /** Records that are checked in but not yet checked out. */
  checkedInNow: number;
}

export interface ApprovalsOverview {
  pendingLeave: number;
  pendingPermission: number;
  /** Payroll periods mid-workflow (processing / pending approval). */
  payrollAttention: number;
}

export interface PayrollOverview {
  latestPeriod: {
    id: string;
    code: string;
    name: string;
    paymentDate: Date | null;
    status: PayrollPeriodStatus;
    runStatus: string | null;
  } | null;
  publishedPayslips: number;
}

export interface AuditActivityRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  createdAt: Date;
}

/**
 * Workforce shape: headcount plus hires within the trailing 30 days.
 */
export async function getWorkforceOverview(
  organizationId: string
): Promise<WorkforceOverview> {
  const since = parseAttendanceDate(
    new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  );

  const [byStatus, newHires] = await Promise.all([
    db
      .select({
        status: employees.employmentStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(employees)
      .where(eq(employees.organizationId, organizationId))
      .groupBy(employees.employmentStatus),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, organizationId),
          gte(employees.hireDate, since)
        )
      ),
  ]);

  let active = 0;
  let inactive = 0;
  for (const row of byStatus) {
    if (row.status === "active") active = row.count;
    if (row.status === "inactive") inactive = row.count;
  }

  return {
    total: active + inactive,
    active,
    inactive,
    newLast30Days: newHires[0]?.count ?? 0,
  };
}

/**
 * Attendance for one calendar day, org-wide, grouped by status, plus the
 * number of people currently checked in (open record).
 *
 * `date` must follow the repository `date`-column convention (`parseAttendanceDate`).
 */
export async function getAttendanceOverview(
  organizationId: string,
  date: Date
): Promise<AttendanceOverview> {
  const [byStatus, checkedInNow] = await Promise.all([
    db
      .select({
        status: attendanceRecords.status,
        count: sql<number>`count(*)::int`,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.organizationId, organizationId),
          eq(attendanceRecords.attendanceDate, date)
        )
      )
      .groupBy(attendanceRecords.status),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.organizationId, organizationId),
          eq(attendanceRecords.attendanceDate, date),
          isNotNull(attendanceRecords.checkInAt),
          isNull(attendanceRecords.checkOutAt)
        )
      ),
  ]);

  let present = 0;
  let completed = 0;
  let incomplete = 0;
  let rejected = 0;
  for (const row of byStatus) {
    if (row.status === "present") present = row.count;
    if (row.status === "completed") completed = row.count;
    if (row.status === "incomplete") incomplete = row.count;
    if (row.status === "rejected") rejected = row.count;
  }
  const total = present + completed + incomplete + rejected;

  return { present, completed, incomplete, rejected, total, checkedInNow: checkedInNow[0]?.count ?? 0 };
}

/**
 * Leave requests that cover a calendar day and are in a given status.
 * Used to surface "on leave today" for approved requests.
 */
export async function countLeaveRequestsOnDate(
  organizationId: string,
  date: Date,
  status: "approved" | "pending" = "approved"
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.organizationId, organizationId),
        eq(leaveRequests.status, status),
        lte(leaveRequests.startDate, date),
        gte(leaveRequests.endDate, date)
      )
    );
  return rows[0]?.count ?? 0;
}

/**
 * Pending items requiring management attention: leave, permissions and
 * payroll periods waiting on approval/processing.
 */
export async function getApprovalsOverview(
  organizationId: string
): Promise<ApprovalsOverview> {
  const [leave, permission, payroll] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.organizationId, organizationId),
          eq(leaveRequests.status, "pending")
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(permissionRequests)
      .where(
        and(
          eq(permissionRequests.organizationId, organizationId),
          eq(permissionRequests.status, "pending")
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(payrollPeriods)
      .where(
        and(
          eq(payrollPeriods.organizationId, organizationId),
          sql`${payrollPeriods.status} in ('processing', 'pending_approval')`
        )
      ),
  ]);

  return {
    pendingLeave: leave[0]?.count ?? 0,
    pendingPermission: permission[0]?.count ?? 0,
    payrollAttention: payroll[0]?.count ?? 0,
  };
}

/**
 * Most recent payroll period (newest by period end), joined with its run
 * status, plus the number of published payslips in the organization.
 */
export async function getPayrollOverview(
  organizationId: string
): Promise<PayrollOverview> {
  const [periods, published] = await Promise.all([
    db
      .select({
        id: payrollPeriods.id,
        code: payrollPeriods.code,
        name: payrollPeriods.name,
        paymentDate: payrollPeriods.paymentDate,
        status: payrollPeriods.status,
        runStatus: payrollRuns.status,
      })
      .from(payrollPeriods)
      .leftJoin(payrollRuns, eq(payrollRuns.payrollPeriodId, payrollPeriods.id))
      .where(eq(payrollPeriods.organizationId, organizationId))
      .orderBy(desc(payrollPeriods.periodEnd))
      .limit(1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(payslips)
      .where(
        and(
          eq(payslips.organizationId, organizationId),
          eq(payslips.status, "published")
        )
      ),
  ]);

  const period = periods[0];
  return {
    latestPeriod: period
      ? {
          id: period.id,
          code: period.code,
          name: period.name,
          paymentDate: period.paymentDate,
          status: period.status as PayrollPeriodStatus,
          runStatus: period.runStatus,
        }
      : null,
    publishedPayslips: published[0]?.count ?? 0,
  };
}

/** Check-in attempts rejected today (anomalies worth attention). */
/**
 * Attendance trend for the trailing 7 days (real aggregates, org-scoped).
 * Used by the dashboard trend chart. Nothing is fabricated — days without
 * records resolve to zero.
 */
export type { AttendanceTrendPoint } from "./monthly-recap.ts";

export async function getAttendanceTrend(
  organizationId: string
): Promise<AttendanceTrendPoint[]> {
  const todayKey = dateStringInTimeZone(new Date(), APP_TIME_ZONE);
  const today = parseAttendanceDate(todayKey);
  const start = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      date: attendanceRecords.attendanceDate,
      status: attendanceRecords.status,
      count: sql<number>`count(*)::int`,
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.organizationId, organizationId),
        gte(attendanceRecords.attendanceDate, start),
        lte(attendanceRecords.attendanceDate, today)
      )
    )
    .groupBy(
      attendanceRecords.attendanceDate,
      attendanceRecords.status
    );

  return buildAttendanceTrend(todayKey, rows);
}

export async function countRejectedCheckInsToday(
  organizationId: string
): Promise<number> {
  const today = parseAttendanceDate(dateStringInTimeZone(new Date(), null));
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.organizationId, organizationId),
        eq(attendanceEvents.eventType, "check_in_rejected"),
        gte(attendanceEvents.eventAt, today),
        lt(attendanceEvents.eventAt, tomorrow)
      )
    );
  return rows[0]?.count ?? 0;
}

/** Recent audit trail entries (append-only activity feed). */
export async function listRecentAuditActivity(
  organizationId: string,
  limit = 8
): Promise<AuditActivityRow[]> {
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorEmail: users.email,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(eq(auditLogs.organizationId, organizationId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorEmail: row.actorEmail,
    createdAt: row.createdAt,
  }));
}

/**
 * The employee's attendance counts for the current calendar month,
 * grouped by status. Used by the employee dashboard's activity strip.
 */
export async function getMonthAttendanceSummary(
  organizationId: string,
  employeeId: string
): Promise<AttendanceStatusCounts> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const rows = await db
    .select({
      status: attendanceRecords.status,
      count: sql<number>`count(*)::int`,
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.organizationId, organizationId),
        eq(attendanceRecords.employeeId, employeeId),
        gte(attendanceRecords.attendanceDate, start),
        lt(attendanceRecords.attendanceDate, end)
      )
    )
    .groupBy(attendanceRecords.status);

  let present = 0;
  let completed = 0;
  let incomplete = 0;
  let rejected = 0;
  for (const row of rows) {
    if (row.status === "present") present = row.count;
    if (row.status === "completed") completed = row.count;
    if (row.status === "incomplete") incomplete = row.count;
    if (row.status === "rejected") rejected = row.count;
  }
  const total = present + completed + incomplete + rejected;
  return { present, completed, incomplete, rejected, total };
}
// ---------------------------------------------------------------------------
// Monthly recap — "Ringkasan Bulan Ini" (HRIS Lite v2 dashboards)
// ---------------------------------------------------------------------------

export type { MonthlyRecap } from "./monthly-recap.ts";

/** Month keys "YYYY-MM" for the current month and the `count - 1` before it. */
export function recentMonthKeys(count = 6, now: Date = new Date()): string[] {
  const today = dateStringInTimeZone(now, APP_TIME_ZONE);
  const [year, month] = today.split("-").map((part) => Number.parseInt(part, 10));
  const keys: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    keys.push(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
    );
  }
  return keys;
}

/** Validates a "YYYY-MM" search param against the selectable months. */
export function normalizeMonthKey(value: string | null | undefined): string {
  const keys = recentMonthKeys(12);
  return value && keys.includes(value) ? value : keys[0];
}

/**
 * One employee's attendance recap for a calendar month, computed with the
 * Attendance Recap module's rules (see `./monthly-recap.ts`). Every query is
 * scoped to the caller's organization and to one employee.
 */
export async function getMonthlyRecap(
  organizationId: string,
  employeeId: string,
  monthKey: string
): Promise<MonthlyRecap> {
  const { first, last } = monthBounds(monthKey);
  const start = parseAttendanceDate(first);
  const end = parseAttendanceDate(last);

  const [employeeRows, attendanceRows, leaveRows, permissionRows] = await Promise.all([
    db
      .select({
        hireDate: employees.hireDate,
        terminationDate: employees.terminationDate,
        resignationDate: employees.resignationDate,
      })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId)))
      .limit(1),
    db
      .select({ date: attendanceRecords.attendanceDate })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.organizationId, organizationId),
          eq(attendanceRecords.employeeId, employeeId),
          inArray(attendanceRecords.status, ["present", "completed"]),
          gte(attendanceRecords.attendanceDate, start),
          lte(attendanceRecords.attendanceDate, end)
        )
      ),
    db
      .select({
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        code: leaveTypes.code,
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(
        and(
          eq(leaveRequests.organizationId, organizationId),
          eq(leaveRequests.employeeId, employeeId),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, end),
          gte(leaveRequests.endDate, start)
        )
      ),
    db
      .select({ startAt: permissionRequests.startAt, endAt: permissionRequests.endAt })
      .from(permissionRequests)
      .where(
        and(
          eq(permissionRequests.organizationId, organizationId),
          eq(permissionRequests.employeeId, employeeId),
          eq(permissionRequests.status, "approved"),
          lt(permissionRequests.startAt, new Date(end.getTime() + 24 * 60 * 60 * 1000)),
          gte(permissionRequests.endAt, start)
        )
      ),
  ]);

  const employee = employeeRows[0];
  const toKey = (value: Date | null | undefined) => (value ? dateColumnKey(value) : null);

  const acceptedAttendanceDays = new Set(attendanceRows.map((row) => dateColumnKey(row.date)));

  // Same rule as the recap SQL: a day counts as sick when ANY covering
  // approved leave has a sick type.
  const leaveDays = new Map<string, string | null>();
  for (const row of leaveRows) {
    const from = dateColumnKey(row.startDate) < first ? first : dateColumnKey(row.startDate);
    const to = dateColumnKey(row.endDate) > last ? last : dateColumnKey(row.endDate);
    for (const day of from <= to ? eachDay(from, to) : []) {
      const previous = leaveDays.get(day);
      if (previous === undefined || !isSickLeaveTypeCode(previous)) leaveDays.set(day, row.code);
    }
  }

  // Same rule as the recap SQL: permission dates are UTC calendar dates.
  const permissionDays = new Set<string>();
  for (const row of permissionRows) {
    const from = row.startAt.toISOString().slice(0, 10);
    const to = row.endAt.toISOString().slice(0, 10);
    for (const day of eachDay(from < first ? first : from, to > last ? last : to)) {
      permissionDays.add(day);
    }
  }

  return computeMonthlyRecap({
    monthKey,
    todayKey: dateStringInTimeZone(new Date(), APP_TIME_ZONE),
    hireDate: toKey(employee?.hireDate),
    terminationDate: toKey(employee?.terminationDate),
    resignationDate: toKey(employee?.resignationDate),
    acceptedAttendanceDays,
    leaveDays,
    permissionDays,
  });
}
