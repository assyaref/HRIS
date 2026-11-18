import "server-only";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { employees, leaveRequests, leaveTypes, workLocations } from "@/db/schema";

import type { MovementEmployee } from "./employee-movement";

/** Employee rows for the movement report (dates as "YYYY-MM-DD"). */
export async function listMovementEmployees(
  organizationId: string
): Promise<MovementEmployee[]> {
  const rows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      position: employees.position,
      department: employees.department,
      workLocation: workLocations.name,
      employmentStatus: employees.employmentStatus,
      hireDate: sql<string | null>`to_char(${employees.hireDate}, 'YYYY-MM-DD')`,
      exitDate: sql<string | null>`to_char(LEAST(${employees.terminationDate}, ${employees.resignationDate}), 'YYYY-MM-DD')`,
    })
    .from(employees)
    .leftJoin(workLocations, eq(workLocations.id, employees.workLocationId))
    .where(eq(employees.organizationId, organizationId))
    .orderBy(asc(employees.employeeNumber));
  return rows.map((row) => ({
    id: row.id,
    employeeNumber: row.employeeNumber,
    name: `${row.firstName} ${row.lastName}`.trim(),
    position: row.position,
    department: row.department,
    workLocation: row.workLocation,
    employmentStatus: row.employmentStatus,
    hireDate: row.hireDate,
    exitDate: row.exitDate,
  }));
}

export interface LeaveReportRow {
  id: string;
  employeeNumber: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  reason: string;
  submittedAt: Date;
  reviewedAt: Date | null;
}

export const LEAVE_REPORT_LIMIT = 2000;

/**
 * Leave requests overlapping [from, to], optionally by status / type. Capped
 * at LEAVE_REPORT_LIMIT rows (the page says so when the cap is hit).
 */
export async function listLeaveReport(
  organizationId: string,
  filters: { from: string; to: string; status?: string; leaveTypeId?: string }
): Promise<LeaveReportRow[]> {
  const conditions = [
    eq(leaveRequests.organizationId, organizationId),
    lte(leaveRequests.startDate, new Date(`${filters.to}T00:00:00Z`)),
    gte(leaveRequests.endDate, new Date(`${filters.from}T00:00:00Z`)),
  ];
  if (filters.status) conditions.push(eq(leaveRequests.status, filters.status));
  if (filters.leaveTypeId) conditions.push(eq(leaveRequests.leaveTypeId, filters.leaveTypeId));

  const rows = await db
    .select({
      id: leaveRequests.id,
      employeeNumber: sql<string>`COALESCE(${employees.employeeNumber}, ${leaveRequests.employeeNumberSnapshot}, '—')`,
      employeeName: sql<string>`COALESCE(NULLIF(TRIM(${employees.firstName} || ' ' || ${employees.lastName}), ''), ${leaveRequests.employeeNameSnapshot}, '—')`,
      leaveType: leaveTypes.name,
      startDate: sql<string>`to_char(${leaveRequests.startDate}, 'YYYY-MM-DD')`,
      endDate: sql<string>`to_char(${leaveRequests.endDate}, 'YYYY-MM-DD')`,
      totalDays: leaveRequests.totalDays,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      submittedAt: leaveRequests.submittedAt,
      reviewedAt: leaveRequests.reviewedAt,
    })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .leftJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .where(and(...conditions))
    .orderBy(desc(leaveRequests.startDate))
    .limit(LEAVE_REPORT_LIMIT);
  return rows.map((row) => ({ ...row, totalDays: Number(row.totalDays) }));
}
