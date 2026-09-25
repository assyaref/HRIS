import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { employees, workLocations } from "@/db/schema";

/**
 * Detail-page lookups (Employee Master Data 2.0) — organization scoped.
 * Used by the Employment tab selects; actions never trust these lists and
 * always re-validate the submitted ids against the caller's organization.
 */

export interface WorkLocationOption {
  id: string;
  name: string;
}

export async function listWorkLocationOptions(
  organizationId: string
): Promise<WorkLocationOption[]> {
  return db
    .select({ id: workLocations.id, name: workLocations.name })
    .from(workLocations)
    .where(eq(workLocations.organizationId, organizationId))
    .orderBy(asc(workLocations.name));
}

export interface ManagerOption {
  id: string;
  employeeNumber: string;
  name: string;
}

/**
 * Potential managers: every active employee in the organization except the
 * edited employee itself (an employee cannot manage themselves).
 */
export async function listManagerOptions(
  organizationId: string,
  selfEmployeeId: string
): Promise<ManagerOption[]> {
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
        eq(employees.employmentStatus, "active"),
        ne(employees.id, selfEmployeeId)
      )
    )
    .orderBy(asc(employees.employeeNumber))
    .limit(1000);
  return rows.map((row) => ({
    id: row.id,
    employeeNumber: row.employeeNumber,
    name: `${row.firstName} ${row.lastName}`.trim(),
  }));
}
