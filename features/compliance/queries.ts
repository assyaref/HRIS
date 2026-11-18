import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { employees, workLocations } from "@/db/schema";

import { evaluateContract, type ContractStatus } from "./contract-status";

export interface ContractRow {
  id: string;
  employeeNumber: string;
  name: string;
  position: string | null;
  department: string | null;
  workLocation: string | null;
  employmentType: string | null;
  employmentStatus: string;
  contractStart: string | null;
  contractEnd: string | null;
  status: ContractStatus;
  daysRemaining: number | null;
}

/**
 * Every employee of the organization with their contract status. Org-sized
 * (one row per employee), classified in TypeScript with the same rules the
 * tests cover; callers filter / paginate in memory.
 */
export async function listContractRows(
  organizationId: string,
  today: string
): Promise<ContractRow[]> {
  const rows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      position: employees.position,
      department: employees.department,
      workLocation: workLocations.name,
      employmentType: employees.employmentType,
      employmentStatus: employees.employmentStatus,
      contractStart: sql<string | null>`to_char(${employees.contractStart}, 'YYYY-MM-DD')`,
      contractEnd: sql<string | null>`to_char(${employees.contractEnd}, 'YYYY-MM-DD')`,
    })
    .from(employees)
    .leftJoin(workLocations, eq(workLocations.id, employees.workLocationId))
    .where(eq(employees.organizationId, organizationId))
    .orderBy(asc(employees.employeeNumber));

  return rows.map((row) => {
    const { status, daysRemaining } = evaluateContract({
      employmentStatus: row.employmentStatus,
      contractEnd: row.contractEnd,
      today,
    });
    return {
      id: row.id,
      employeeNumber: row.employeeNumber,
      name: `${row.firstName} ${row.lastName}`.trim(),
      position: row.position,
      department: row.department,
      workLocation: row.workLocation,
      employmentType: row.employmentType,
      employmentStatus: row.employmentStatus,
      contractStart: row.contractStart,
      contractEnd: row.contractEnd,
      status,
      daysRemaining,
    };
  });
}

/** Status counts for stat cards. */
export function countByStatus(rows: readonly ContractRow[]) {
  const counts: Record<ContractStatus, number> = {
    expired: 0,
    expiring: 0,
    active: 0,
    no_end: 0,
    inactive: 0,
  };
  for (const row of rows) counts[row.status]++;
  return counts;
}

/** Most urgent first: expired, then soonest end date. */
export function sortByUrgency(rows: readonly ContractRow[]): ContractRow[] {
  const rank: Record<ContractStatus, number> = {
    expired: 0,
    expiring: 1,
    active: 2,
    no_end: 3,
    inactive: 4,
  };
  return [...rows].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity) ||
      a.name.localeCompare(b.name)
  );
}
