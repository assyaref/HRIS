import "server-only";

import { and, asc, count, eq, ilike, isNotNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { employees, leaveBalances, leaveRequests, leaveTypes } from "@/db/schema";

/**
 * Leave master data queries (leave types + balances), organization-scoped.
 * Every function takes the organization explicitly; callers pass the session
 * organization (the acting organization for a Super Administrator).
 */

export interface LeaveTypeAdminRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  defaultAllowanceDays: number | null;
  active: boolean;
  requestCount: number;
  balanceCount: number;
}

export async function listLeaveTypesForAdmin(
  organizationId: string
): Promise<LeaveTypeAdminRow[]> {
  const [types, requestCounts, balanceCounts] = await Promise.all([
    db
      .select({
        id: leaveTypes.id,
        code: leaveTypes.code,
        name: leaveTypes.name,
        description: leaveTypes.description,
        defaultAllowanceDays: leaveTypes.defaultAllowanceDays,
        active: leaveTypes.active,
      })
      .from(leaveTypes)
      .where(eq(leaveTypes.organizationId, organizationId))
      .orderBy(asc(leaveTypes.code)),
    db
      .select({ leaveTypeId: leaveRequests.leaveTypeId, total: count() })
      .from(leaveRequests)
      .where(eq(leaveRequests.organizationId, organizationId))
      .groupBy(leaveRequests.leaveTypeId),
    db
      .select({ leaveTypeId: leaveBalances.leaveTypeId, total: count() })
      .from(leaveBalances)
      .where(eq(leaveBalances.organizationId, organizationId))
      .groupBy(leaveBalances.leaveTypeId),
  ]);
  const requests = new Map(requestCounts.map((row) => [row.leaveTypeId, row.total]));
  const balances = new Map(balanceCounts.map((row) => [row.leaveTypeId, row.total]));
  return types.map((type) => ({
    ...type,
    requestCount: Number(requests.get(type.id) ?? 0),
    balanceCount: Number(balances.get(type.id) ?? 0),
  }));
}

export async function getLeaveTypeForAdmin(
  organizationId: string,
  leaveTypeId: string
) {
  const rows = await db
    .select({
      id: leaveTypes.id,
      code: leaveTypes.code,
      name: leaveTypes.name,
      active: leaveTypes.active,
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

export async function isLeaveTypeCodeTaken(
  organizationId: string,
  code: string,
  exceptId?: string
): Promise<boolean> {
  const rows = await db
    .select({ id: leaveTypes.id })
    .from(leaveTypes)
    .where(
      and(
        eq(leaveTypes.organizationId, organizationId),
        sql`upper(${leaveTypes.code}) = ${code.toUpperCase()}`
      )
    )
    .limit(2);
  return rows.some((row) => row.id !== exceptId);
}

export interface LeaveBalanceAdminRow {
  id: string;
  employeeId: string | null;
  employeeNumber: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  year: string;
  entitlement: number;
  adjustment: number;
  used: number;
  pending: number;
  available: number;
}

export async function listLeaveBalancesForAdmin(
  organizationId: string,
  filters: { year: string; leaveTypeId?: string; q?: string }
): Promise<LeaveBalanceAdminRow[]> {
  const conditions = [
    eq(leaveBalances.organizationId, organizationId),
    eq(leaveBalances.year, filters.year),
    isNotNull(leaveBalances.employeeId),
  ];
  if (filters.leaveTypeId) {
    conditions.push(eq(leaveBalances.leaveTypeId, filters.leaveTypeId));
  }
  if (filters.q) {
    const term = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const match = or(
      ilike(employees.employeeNumber, term),
      ilike(employees.firstName, term),
      ilike(employees.lastName, term),
      sql`(${employees.firstName} || ' ' || ${employees.lastName}) ilike ${term}`
    );
    if (match) conditions.push(match);
  }

  const rows = await db
    .select({
      id: leaveBalances.id,
      employeeId: leaveBalances.employeeId,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      leaveTypeId: leaveTypes.id,
      leaveTypeCode: leaveTypes.code,
      leaveTypeName: leaveTypes.name,
      year: leaveBalances.year,
      entitlement: leaveBalances.entitlement,
      adjustment: leaveBalances.adjustment,
      used: leaveBalances.used,
      pending: leaveBalances.pending,
    })
    .from(leaveBalances)
    .innerJoin(
      employees,
      and(
        eq(employees.id, leaveBalances.employeeId),
        eq(employees.organizationId, organizationId)
      )
    )
    .innerJoin(
      leaveTypes,
      and(
        eq(leaveTypes.id, leaveBalances.leaveTypeId),
        eq(leaveTypes.organizationId, organizationId)
      )
    )
    .where(and(...conditions))
    .orderBy(asc(employees.firstName), asc(employees.lastName), asc(leaveTypes.code))
    .limit(1000);

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    employeeNumber: row.employeeNumber,
    employeeName: `${row.firstName} ${row.lastName}`.trim(),
    leaveTypeId: row.leaveTypeId,
    leaveTypeCode: row.leaveTypeCode,
    leaveTypeName: row.leaveTypeName,
    year: row.year,
    entitlement: row.entitlement,
    adjustment: row.adjustment,
    used: row.used,
    pending: row.pending,
    available: row.entitlement + row.adjustment - row.used - row.pending,
  }));
}

export interface LeaveEmployeeOption {
  id: string;
  employeeNumber: string;
  name: string;
}

/** Active employees of the organization, for the balance editor. */
export async function listLeaveEmployeeOptions(
  organizationId: string
): Promise<LeaveEmployeeOption[]> {
  const rows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        eq(employees.employmentStatus, "active")
      )
    )
    .orderBy(asc(employees.firstName), asc(employees.lastName));
  return rows.map((row) => ({
    id: row.id,
    employeeNumber: row.employeeNumber,
    name: `${row.firstName} ${row.lastName}`.trim(),
  }));
}
