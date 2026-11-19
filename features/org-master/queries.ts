import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { qualified } from "@/lib/db/qualified";
import { departments, employees, jobGrades, jobPositions } from "@/db/schema";

import type { ValueCount } from "./rules";

export type EmployeeTextColumn = "department" | "position" | "division";

const COLUMN = {
  department: employees.department,
  position: employees.position,
  division: employees.division,
} as const;

/** Distinct raw values of an employee text column with their counts. */
export async function listEmployeeValues(organizationId: string, column: EmployeeTextColumn): Promise<ValueCount[]> {
  const col = COLUMN[column];
  const rows = await db
    .select({ value: col, count: sql<number>`COUNT(*)::int` })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), sql`${col} IS NOT NULL AND btrim(${col}) <> ''`))
    .groupBy(col);
  return rows.map((r) => ({ value: r.value ?? "", count: r.count }));
}

export async function listDepartments(organizationId: string) {
  return db
    .select({
      id: departments.id,
      name: departments.name,
      division: departments.division,
      description: departments.description,
      active: departments.active,
      positionCount: sql<number>`(SELECT COUNT(*)::int FROM ${jobPositions} WHERE ${jobPositions.departmentId} = ${qualified(departments.id)})`,
    })
    .from(departments)
    .where(eq(departments.organizationId, organizationId))
    .orderBy(desc(departments.active), asc(departments.name));
}

export async function listGrades(organizationId: string) {
  return db
    .select({
      id: jobGrades.id,
      code: jobGrades.code,
      name: jobGrades.name,
      level: jobGrades.level,
      description: jobGrades.description,
      active: jobGrades.active,
      positionCount: sql<number>`(SELECT COUNT(*)::int FROM ${jobPositions} WHERE ${jobPositions.gradeId} = ${qualified(jobGrades.id)})`,
    })
    .from(jobGrades)
    .where(eq(jobGrades.organizationId, organizationId))
    .orderBy(desc(jobGrades.active), desc(jobGrades.level), asc(jobGrades.code));
}

export async function listPositions(organizationId: string) {
  return db
    .select({
      id: jobPositions.id,
      name: jobPositions.name,
      departmentId: jobPositions.departmentId,
      departmentName: departments.name,
      gradeId: jobPositions.gradeId,
      gradeCode: jobGrades.code,
      gradeName: jobGrades.name,
      gradeLevel: jobGrades.level,
      jobDescription: jobPositions.jobDescription,
      active: jobPositions.active,
    })
    .from(jobPositions)
    .leftJoin(departments, eq(departments.id, jobPositions.departmentId))
    .leftJoin(jobGrades, eq(jobGrades.id, jobPositions.gradeId))
    .where(eq(jobPositions.organizationId, organizationId))
    .orderBy(desc(jobPositions.active), asc(jobPositions.name));
}

/** Active master names for form suggestions (empty before migration 0030). */
export async function listMasterSuggestions(organizationId: string): Promise<{ departments: string[]; positions: string[]; divisions: string[] }> {
  const [d, p] = await Promise.all([
    db
      .select({ name: departments.name, division: departments.division })
      .from(departments)
      .where(and(eq(departments.organizationId, organizationId), eq(departments.active, true)))
      .orderBy(asc(departments.name)),
    db
      .select({ name: jobPositions.name })
      .from(jobPositions)
      .where(and(eq(jobPositions.organizationId, organizationId), eq(jobPositions.active, true)))
      .orderBy(asc(jobPositions.name)),
  ]);
  const divisions = [...new Set(d.map((x) => x.division).filter((x): x is string => Boolean(x && x.trim())))].sort();
  return { departments: d.map((x) => x.name), positions: p.map((x) => x.name), divisions };
}
