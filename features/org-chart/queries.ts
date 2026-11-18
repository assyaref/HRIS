import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { employees } from "@/db/schema";

import type { OrgChartPerson } from "./build-tree";

/** Active employees of the organization with their manager link. */
export async function listOrgChartPeople(organizationId: string): Promise<OrgChartPerson[]> {
  const rows = await db
    .select({
      id: employees.id,
      managerId: employees.managerId,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employeeNumber: employees.employeeNumber,
      position: employees.position,
      department: employees.department,
    })
    .from(employees)
    .where(
      and(eq(employees.organizationId, organizationId), eq(employees.employmentStatus, "active"))
    );
  return rows.map((row) => ({
    id: row.id,
    managerId: row.managerId,
    name: `${row.firstName} ${row.lastName}`.trim(),
    employeeNumber: row.employeeNumber,
    position: row.position,
    department: row.department,
  }));
}
