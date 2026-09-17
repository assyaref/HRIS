import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  employeePayrollComponents,
  employees,
  payrollComponents,
} from "@/db/schema";
import type {
  PayrollComponentMethod,
  PayrollComponentType,
} from "./constants";

/**
 * PM-03.2 — Employee payroll component data access — server-only.
 *
 * Security contract:
 * - Every function is scoped to one organization. Callers pass the
 *   organization from the authenticated session (never from the client).
 * - An employee/component/assignment from another organization can never be
 *   listed or loaded here; callers respond with `forbidden()` or a generic
 *   "not found" so cross-organization existence is never revealed.
 * - `hasActiveEmployeePayrollComponent` pre-checks the partial unique index
 *   (org, employee, component) WHERE `active = true` so the server action can
 *   return a deterministic error instead of a raw unique violation.
 */

export interface EmployeePayrollComponentRow {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  componentId: string;
  componentCode: string;
  componentName: string;
  componentType: PayrollComponentType;
  calculationMethod: PayrollComponentMethod;
  amount: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface EmployeePayrollComponentDbRow {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  componentId: string;
  componentCode: string;
  componentName: string;
  componentType: string;
  calculationMethod: string;
  amount: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toEmployeePayrollComponentRow(
  row: EmployeePayrollComponentDbRow
): EmployeePayrollComponentRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    employeeNumber: row.employeeNumber,
    employeeName: `${row.firstName} ${row.lastName}`.trim(),
    componentId: row.componentId,
    componentCode: row.componentCode,
    componentName: row.componentName,
    componentType: row.componentType as PayrollComponentType,
    calculationMethod: row.calculationMethod as PayrollComponentMethod,
    amount: row.amount,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    active: row.active,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface EmployeePayrollComponentEmployee {
  id: string;
  organizationId: string;
  employeeNumber: string;
  employmentStatus: string;
}

/** Org-scoped employee lookup for assignment eligibility checks. */
export async function getEmployeeForPayrollComponent(
  organizationId: string,
  employeeId: string
): Promise<EmployeePayrollComponentEmployee | null> {
  const rows = await db
    .select({
      id: employees.id,
      organizationId: employees.organizationId,
      employeeNumber: employees.employeeNumber,
      employmentStatus: employees.employmentStatus,
    })
    .from(employees)
    .where(
      and(
        eq(employees.id, employeeId),
        eq(employees.organizationId, organizationId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface EmployeePayrollComponentMaster {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: PayrollComponentType;
  calculationMethod: PayrollComponentMethod;
  /** "true" | "false" — the master table stores active as text. */
  active: string;
}

/** Org-scoped master component lookup for assignment eligibility checks. */
export async function getPayrollComponentForEmployee(
  organizationId: string,
  componentId: string
): Promise<EmployeePayrollComponentMaster | null> {
  const rows = await db
    .select({
      id: payrollComponents.id,
      organizationId: payrollComponents.organizationId,
      code: payrollComponents.code,
      name: payrollComponents.name,
      type: payrollComponents.type,
      calculationMethod: payrollComponents.calculationMethod,
      active: payrollComponents.active,
    })
    .from(payrollComponents)
    .where(
      and(
        eq(payrollComponents.id, componentId),
        eq(payrollComponents.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    type: row.type as PayrollComponentType,
    calculationMethod: row.calculationMethod as PayrollComponentMethod,
    active: row.active,
  };
}

/**
 * Whether (employee, component) already has an ACTIVE assignment. Pre-checks
 * the partial unique index so the action returns a deterministic error.
 */
export async function hasActiveEmployeePayrollComponent(
  organizationId: string,
  employeeId: string,
  componentId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: employeePayrollComponents.id })
    .from(employeePayrollComponents)
    .where(
      and(
        eq(employeePayrollComponents.organizationId, organizationId),
        eq(employeePayrollComponents.employeeId, employeeId),
        eq(employeePayrollComponents.componentId, componentId),
        eq(employeePayrollComponents.active, true)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** Org-scoped assignment history for one employee (active rows first). */
export async function listEmployeePayrollComponents(
  organizationId: string,
  employeeId: string
): Promise<EmployeePayrollComponentRow[]> {
  const rows = await db
    .select({
      id: employeePayrollComponents.id,
      organizationId: employeePayrollComponents.organizationId,
      employeeId: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      componentId: payrollComponents.id,
      componentCode: payrollComponents.code,
      componentName: payrollComponents.name,
      componentType: payrollComponents.type,
      calculationMethod: payrollComponents.calculationMethod,
      amount: employeePayrollComponents.amount,
      effectiveFrom: employeePayrollComponents.effectiveFrom,
      effectiveTo: employeePayrollComponents.effectiveTo,
      active: employeePayrollComponents.active,
      notes: employeePayrollComponents.notes,
      createdAt: employeePayrollComponents.createdAt,
      updatedAt: employeePayrollComponents.updatedAt,
    })
    .from(employeePayrollComponents)
    .innerJoin(employees, eq(employees.id, employeePayrollComponents.employeeId))
    .innerJoin(
      payrollComponents,
      eq(payrollComponents.id, employeePayrollComponents.componentId)
    )
    .where(
      and(
        eq(employeePayrollComponents.organizationId, organizationId),
        eq(employeePayrollComponents.employeeId, employeeId),
        eq(employees.organizationId, organizationId),
        eq(payrollComponents.organizationId, organizationId)
      )
    )
    .orderBy(
      desc(employeePayrollComponents.active),
      desc(employeePayrollComponents.effectiveFrom)
    );

  return rows.map(toEmployeePayrollComponentRow);
}

/**
 * One org-scoped assignment joined with employee + component context (for the
 * update/end actions and their audit entries). Returns null for foreign rows.
 */
export async function getEmployeePayrollComponentInOrganization(
  organizationId: string,
  assignmentId: string
): Promise<EmployeePayrollComponentRow | null> {
  const rows = await db
    .select({
      id: employeePayrollComponents.id,
      organizationId: employeePayrollComponents.organizationId,
      employeeId: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      componentId: payrollComponents.id,
      componentCode: payrollComponents.code,
      componentName: payrollComponents.name,
      componentType: payrollComponents.type,
      calculationMethod: payrollComponents.calculationMethod,
      amount: employeePayrollComponents.amount,
      effectiveFrom: employeePayrollComponents.effectiveFrom,
      effectiveTo: employeePayrollComponents.effectiveTo,
      active: employeePayrollComponents.active,
      notes: employeePayrollComponents.notes,
      createdAt: employeePayrollComponents.createdAt,
      updatedAt: employeePayrollComponents.updatedAt,
    })
    .from(employeePayrollComponents)
    .innerJoin(employees, eq(employees.id, employeePayrollComponents.employeeId))
    .innerJoin(
      payrollComponents,
      eq(payrollComponents.id, employeePayrollComponents.componentId)
    )
    .where(
      and(
        eq(employeePayrollComponents.id, assignmentId),
        eq(employeePayrollComponents.organizationId, organizationId),
        eq(employees.organizationId, organizationId),
        eq(payrollComponents.organizationId, organizationId)
      )
    )
    .limit(1);

  const row = rows[0];
  return row ? toEmployeePayrollComponentRow(row) : null;
}