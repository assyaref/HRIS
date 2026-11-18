import "server-only";

import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  employees,
  holidays,
  overtimeRequests,
  shifts,
  users,
  workGroupMembers,
  workGroups,
} from "@/db/schema";

import { parseWorkingDays } from "./rules";

const employeeName = sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`;

/* Holidays ---------------------------------------------------------- */

export interface HolidayRow {
  id: string;
  holidayDate: string;
  name: string;
  holidayType: string;
}

export async function listHolidays(
  organizationId: string,
  from: string,
  to: string
): Promise<HolidayRow[]> {
  return db
    .select({
      id: holidays.id,
      holidayDate: holidays.holidayDate,
      name: holidays.name,
      holidayType: holidays.holidayType,
    })
    .from(holidays)
    .where(
      and(
        eq(holidays.organizationId, organizationId),
        gte(holidays.holidayDate, from),
        lte(holidays.holidayDate, to)
      )
    )
    .orderBy(asc(holidays.holidayDate), asc(holidays.name));
}

/* Shifts & work groups ---------------------------------------------- */

export interface ShiftRow {
  id: string;
  name: string;
  color: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workingDays: number[];
  active: boolean;
  groupCount: number;
}

export async function listShifts(organizationId: string): Promise<ShiftRow[]> {
  const rows = await db
    .select({
      id: shifts.id,
      name: shifts.name,
      color: shifts.color,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      breakMinutes: shifts.breakMinutes,
      workingDays: shifts.workingDays,
      active: shifts.active,
      groupCount: sql<number>`(SELECT COUNT(*)::int FROM ${workGroups} WHERE ${workGroups.shiftId} = ${shifts.id})`,
    })
    .from(shifts)
    .where(eq(shifts.organizationId, organizationId))
    .orderBy(desc(shifts.active), asc(shifts.name));
  return rows.map((row) => ({ ...row, workingDays: parseWorkingDays(row.workingDays) }));
}

export interface WorkGroupMember {
  employeeId: string;
  employeeNumber: string;
  name: string;
}

export interface WorkGroupRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  shiftId: string | null;
  shiftName: string | null;
  shiftColor: string | null;
  shiftHours: string | null;
  members: WorkGroupMember[];
}

export async function listWorkGroups(organizationId: string): Promise<WorkGroupRow[]> {
  const [groups, members] = await Promise.all([
    db
      .select({
        id: workGroups.id,
        name: workGroups.name,
        description: workGroups.description,
        active: workGroups.active,
        shiftId: workGroups.shiftId,
        shiftName: shifts.name,
        shiftColor: shifts.color,
        shiftStart: shifts.startTime,
        shiftEnd: shifts.endTime,
      })
      .from(workGroups)
      .leftJoin(shifts, eq(shifts.id, workGroups.shiftId))
      .where(eq(workGroups.organizationId, organizationId))
      .orderBy(desc(workGroups.active), asc(workGroups.name)),
    db
      .select({
        workGroupId: workGroupMembers.workGroupId,
        employeeId: employees.id,
        employeeNumber: employees.employeeNumber,
        name: employeeName,
      })
      .from(workGroupMembers)
      .innerJoin(employees, eq(employees.id, workGroupMembers.employeeId))
      .where(eq(workGroupMembers.organizationId, organizationId))
      .orderBy(asc(employees.firstName), asc(employees.lastName)),
  ]);
  const byGroup = new Map<string, WorkGroupMember[]>();
  for (const m of members) {
    const list = byGroup.get(m.workGroupId) ?? [];
    list.push({ employeeId: m.employeeId, employeeNumber: m.employeeNumber, name: m.name });
    byGroup.set(m.workGroupId, list);
  }
  return groups.map(({ shiftStart, shiftEnd, ...g }) => ({
    ...g,
    shiftHours: shiftStart && shiftEnd ? `${shiftStart}–${shiftEnd}` : null,
    members: byGroup.get(g.id) ?? [],
  }));
}

/* Overtime ---------------------------------------------------------- */

export interface OvertimeRow {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  overtimeDate: string;
  startTime: string;
  endTime: string;
  totalMinutes: number;
  spklNumber: string | null;
  reason: string;
  status: string;
  reviewerName: string | null;
  reviewerNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface OvertimeFilters {
  from: string;
  to: string;
  employeeId?: string;
  status?: string;
}

export const OVERTIME_LIST_LIMIT = 500;

export async function listOvertime(
  organizationId: string,
  filters: OvertimeFilters
): Promise<OvertimeRow[]> {
  const reviewers = alias(users, "reviewers");
  const where: SQL[] = [
    eq(overtimeRequests.organizationId, organizationId),
    gte(overtimeRequests.overtimeDate, filters.from),
    lte(overtimeRequests.overtimeDate, filters.to),
  ];
  if (filters.employeeId) where.push(eq(overtimeRequests.employeeId, filters.employeeId));
  if (filters.status) where.push(eq(overtimeRequests.status, filters.status));
  return db
    .select({
      id: overtimeRequests.id,
      employeeId: overtimeRequests.employeeId,
      employeeNumber: employees.employeeNumber,
      employeeName: employeeName,
      overtimeDate: overtimeRequests.overtimeDate,
      startTime: overtimeRequests.startTime,
      endTime: overtimeRequests.endTime,
      totalMinutes: overtimeRequests.totalMinutes,
      spklNumber: overtimeRequests.spklNumber,
      reason: overtimeRequests.reason,
      status: overtimeRequests.status,
      reviewerName: reviewers.name,
      reviewerNote: overtimeRequests.reviewerNote,
      reviewedAt: overtimeRequests.reviewedAt,
      createdAt: overtimeRequests.createdAt,
    })
    .from(overtimeRequests)
    .innerJoin(employees, eq(employees.id, overtimeRequests.employeeId))
    .leftJoin(reviewers, eq(reviewers.id, overtimeRequests.reviewedBy))
    .where(and(...where))
    .orderBy(desc(overtimeRequests.overtimeDate), desc(overtimeRequests.createdAt))
    .limit(OVERTIME_LIST_LIMIT);
}

/** Pending overtime requests of the organization (dashboard / badges). */
export async function countPendingOvertime(organizationId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(overtimeRequests)
    .where(and(eq(overtimeRequests.organizationId, organizationId), eq(overtimeRequests.status, "pending")));
  return rows[0]?.count ?? 0;
}
