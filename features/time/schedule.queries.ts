import "server-only";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  attendanceRecords,
  employees,
  holidays,
  leaveRequests,
  permissionRequests,
  shifts,
  workGroupMembers,
  workGroups,
  workLocations,
} from "@/db/schema";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";

import { parseWorkingDays } from "./rules";
import {
  daysBetween,
  evaluateEmployee,
  type AttendanceFact,
  type DayResult,
  type ScheduleSummary,
} from "./schedule";

export interface ScheduleRow {
  employeeId: string;
  employeeNumber: string;
  name: string;
  groupId: string;
  groupName: string;
  shiftName: string;
  shiftColor: string;
  shiftHours: string;
  summary: ScheduleSummary;
  days: DayResult[];
}

export interface ScheduleReport {
  days: string[];
  rows: ScheduleRow[];
  /** Active employees not in any work group (no schedule to compare with). */
  unscheduled: number;
}

const dateKey = (value: Date | string | null): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
};

/**
 * Compares every work-group member's attendance in [from, to] (≤ 62 days)
 * with the group's shift and the holiday calendar. Groups without a shift
 * are skipped. Read-only; time zone of a day = its attendance's work
 * location (fallback: the app time zone).
 */
export async function buildScheduleReport(
  organizationId: string,
  input: { from: string; to: string; today: string; graceMinutes: number; groupId?: string }
): Promise<ScheduleReport> {
  const days = daysBetween(input.from, input.to);
  if (days.length === 0) return { days, rows: [], unscheduled: 0 };
  const from = days[0];
  const to = days[days.length - 1];

  const memberWhere = [
    eq(workGroupMembers.organizationId, organizationId),
    eq(workGroups.active, true),
    eq(employees.employmentStatus, "active"),
  ];
  if (input.groupId) memberWhere.push(eq(workGroups.id, input.groupId));

  const [members, holidayRows, activeCount] = await Promise.all([
    db
      .select({
        employeeId: employees.id,
        employeeNumber: employees.employeeNumber,
        name: sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`,
        hireDate: employees.hireDate,
        terminationDate: employees.terminationDate,
        resignationDate: employees.resignationDate,
        groupId: workGroups.id,
        groupName: workGroups.name,
        shiftName: shifts.name,
        shiftColor: shifts.color,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        workingDays: shifts.workingDays,
      })
      .from(workGroupMembers)
      .innerJoin(workGroups, eq(workGroups.id, workGroupMembers.workGroupId))
      .innerJoin(shifts, eq(shifts.id, workGroups.shiftId))
      .innerJoin(employees, eq(employees.id, workGroupMembers.employeeId))
      .where(and(...memberWhere))
      .orderBy(workGroups.name, employees.firstName, employees.lastName),
    db
      .select({ day: holidays.holidayDate })
      .from(holidays)
      .where(and(eq(holidays.organizationId, organizationId), gte(holidays.holidayDate, from), lte(holidays.holidayDate, to))),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.employmentStatus, "active"))),
  ]);

  const ids = members.map((m) => m.employeeId);
  const unscheduled = Math.max(0, (activeCount[0]?.count ?? 0) - new Set(ids).size);
  if (ids.length === 0) return { days, rows: [], unscheduled };

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const [attendance, leaves, permissions] = await Promise.all([
    db
      .select({
        employeeId: attendanceRecords.employeeId,
        day: attendanceRecords.attendanceDate,
        checkInAt: attendanceRecords.checkInAt,
        checkOutAt: attendanceRecords.checkOutAt,
        timeZone: workLocations.timezone,
      })
      .from(attendanceRecords)
      .leftJoin(workLocations, eq(workLocations.id, attendanceRecords.workLocationId))
      .where(
        and(
          eq(attendanceRecords.organizationId, organizationId),
          inArray(attendanceRecords.employeeId, ids),
          gte(attendanceRecords.attendanceDate, fromDate),
          lte(attendanceRecords.attendanceDate, toDate),
          inArray(attendanceRecords.status, ["present", "completed"])
        )
      ),
    db
      .select({ employeeId: leaveRequests.employeeId, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.organizationId, organizationId),
          inArray(leaveRequests.employeeId, ids),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, toDate),
          gte(leaveRequests.endDate, fromDate)
        )
      ),
    db
      .select({
        employeeId: permissionRequests.employeeId,
        startDay: sql<string>`to_char(${permissionRequests.startAt} AT TIME ZONE ${APP_TIME_ZONE}, 'YYYY-MM-DD')`,
        endDay: sql<string>`to_char(${permissionRequests.endAt} AT TIME ZONE ${APP_TIME_ZONE}, 'YYYY-MM-DD')`,
      })
      .from(permissionRequests)
      .where(
        and(
          eq(permissionRequests.organizationId, organizationId),
          inArray(permissionRequests.employeeId, ids),
          eq(permissionRequests.status, "approved"),
          sql`${permissionRequests.startAt} < ((${to})::date + 1)::timestamp AT TIME ZONE ${APP_TIME_ZONE}`,
          sql`${permissionRequests.endAt} >= ((${from})::date)::timestamp AT TIME ZONE ${APP_TIME_ZONE}`
        )
      ),
  ]);

  const holidaySet = new Set(holidayRows.map((h) => h.day));
  const attendanceBy = new Map<string, Map<string, AttendanceFact>>();
  for (const a of attendance) {
    if (!a.employeeId) continue;
    const day = dateKey(a.day)!;
    const map = attendanceBy.get(a.employeeId) ?? new Map<string, AttendanceFact>();
    map.set(day, { day, checkInAt: a.checkInAt, checkOutAt: a.checkOutAt, timeZone: a.timeZone || APP_TIME_ZONE });
    attendanceBy.set(a.employeeId, map);
  }
  const addRange = (target: Map<string, Set<string>>, employeeId: string, start: string, end: string) => {
    const set = target.get(employeeId) ?? new Set<string>();
    for (const day of days) if (day >= start && day <= end) set.add(day);
    target.set(employeeId, set);
  };
  const leaveBy = new Map<string, Set<string>>();
  for (const l of leaves) if (l.employeeId) addRange(leaveBy, l.employeeId, dateKey(l.startDate)!, dateKey(l.endDate)!);
  const permissionBy = new Map<string, Set<string>>();
  for (const p of permissions) if (p.employeeId) addRange(permissionBy, p.employeeId, p.startDay, p.endDay);

  const rows: ScheduleRow[] = members.map((m) => {
    const endDate = [dateKey(m.terminationDate), dateKey(m.resignationDate)].filter(Boolean).sort()[0] ?? null;
    const { days: results, summary } = evaluateEmployee({
      shift: { startTime: m.startTime, endTime: m.endTime, workingDays: parseWorkingDays(m.workingDays) },
      days,
      today: input.today,
      hireDate: dateKey(m.hireDate),
      endDate,
      holidays: holidaySet,
      attendance: attendanceBy.get(m.employeeId) ?? new Map(),
      leaveDays: leaveBy.get(m.employeeId) ?? new Set(),
      permissionDays: permissionBy.get(m.employeeId) ?? new Set(),
      graceMinutes: input.graceMinutes,
    });
    return {
      employeeId: m.employeeId,
      employeeNumber: m.employeeNumber,
      name: m.name,
      groupId: m.groupId,
      groupName: m.groupName,
      shiftName: m.shiftName,
      shiftColor: m.shiftColor,
      shiftHours: `${m.startTime}–${m.endTime}`,
      summary,
      days: results,
    };
  });
  return { days, rows, unscheduled };
}
