import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { employees } from "@/db/schema";

import type { InsightEmployee } from "./workforce";

/** Active employees with the fields the dashboard insights need. */
export async function listInsightEmployees(
  organizationId: string
): Promise<InsightEmployee[]> {
  const rows = await db
    .select({
      gender: employees.gender,
      birthDate: sql<string | null>`to_char(${employees.birthDate}, 'YYYY-MM-DD')`,
      nik: employees.nik,
      birthPlace: employees.birthPlace,
      religion: employees.religion,
      maritalStatus: employees.maritalStatus,
      email: employees.email,
      phone: employees.phone,
      personalEmail: employees.personalEmail,
      position: employees.position,
      department: employees.department,
      workLocationId: employees.workLocationId,
      employmentType: employees.employmentType,
      hireDate: sql<string | null>`to_char(${employees.hireDate}, 'YYYY-MM-DD')`,
      addressCount: sql<number>`(SELECT count(*)::int FROM employee_addresses a WHERE a.employee_id = ${employees.id})`,
      bankCount: sql<number>`(SELECT count(*)::int FROM employee_bank_accounts b WHERE b.employee_id = ${employees.id})`,
      hasInsurance: sql<boolean>`EXISTS (SELECT 1 FROM employee_insurances i WHERE i.employee_id = ${employees.id})`,
    })
    .from(employees)
    .where(
      and(eq(employees.organizationId, organizationId), eq(employees.employmentStatus, "active"))
    );
  return rows.map((row) => ({
    ...row,
    addressCount: Number(row.addressCount),
    bankCount: Number(row.bankCount),
    hasInsurance: Boolean(row.hasInsurance),
  }));
}
