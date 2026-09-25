import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  attendanceRecords,
  leaveRequests,
  leaveTypes,
  payslips,
  payrollPeriods,
} from "@/db/schema";

/**
 * Read-only projections of the existing Attendance / Leave / Payroll modules
 * for the employee detail page. No business logic is duplicated here — the
 * queries are the SAME tables and the SAME org scoping the management pages
 * use, filtered to one employee, and the tabs deep-link into the existing
 * detail routes (/attendance/[id], /leave/[id], /payroll/payslips/[id]).
 */

export interface AttendanceSummaryRow {
  id: string;
  attendanceDate: Date;
  status: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
}

export async function listEmployeeAttendanceSummary(
  organizationId: string,
  employeeId: string,
  limit = 30
): Promise<AttendanceSummaryRow[]> {
  const rows = await db
    .select({
      id: attendanceRecords.id,
      attendanceDate: attendanceRecords.attendanceDate,
      status: attendanceRecords.status,
      checkInAt: attendanceRecords.checkInAt,
      checkOutAt: attendanceRecords.checkOutAt,
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.organizationId, organizationId),
        eq(attendanceRecords.employeeId, employeeId)
      )
    )
    .orderBy(desc(attendanceRecords.attendanceDate))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    attendanceDate: new Date(row.attendanceDate),
    status: row.status,
    checkInAt: row.checkInAt ?? null,
    checkOutAt: row.checkOutAt ?? null,
  }));
}

export interface LeaveSummaryRow {
  id: string;
  type: string;
  startDate: Date;
  endDate: Date;
  status: string;
}

export async function listEmployeeLeaveSummary(
  organizationId: string,
  employeeId: string,
  limit = 30
): Promise<LeaveSummaryRow[]> {
  const rows = await db
    .select({
      id: leaveRequests.id,
      name: leaveTypes.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      status: leaveRequests.status,
    })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(
      and(
        eq(leaveRequests.organizationId, organizationId),
        eq(leaveRequests.employeeId, employeeId)
      )
    )
    .orderBy(desc(leaveRequests.startDate))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    type: row.name,
    startDate: new Date(row.startDate),
    endDate: new Date(row.endDate),
    status: row.status,
  }));
}

export interface PayslipSummaryRow {
  id: string;
  payslipNumber: string;
  period: string;
  status: string;
  issuedAt: Date | null;
}

export async function listEmployeePayslipSummary(
  organizationId: string,
  employeeId: string,
  limit = 30
): Promise<PayslipSummaryRow[]> {
  const rows = await db
    .select({
      id: payslips.id,
      payslipNumber: payslips.payslipNumber,
      status: payslips.status,
      issuedAt: payslips.issuedAt,
      periodName: payrollPeriods.name,
    })
    .from(payslips)
    .innerJoin(payrollPeriods, eq(payrollPeriods.id, payslips.payrollPeriodId))
    .where(
      and(
        eq(payslips.organizationId, organizationId),
        eq(payslips.employeeId, employeeId)
      )
    )
    .orderBy(desc(payslips.issuedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    payslipNumber: row.payslipNumber,
    period: row.periodName,
    status: row.status,
    issuedAt: row.issuedAt ?? null,
  }));
}
