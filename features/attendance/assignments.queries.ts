import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  employeeProjectAssignments,
  employees,
  projects,
} from "@/db/schema";

/**
 * Employee ↔ project assignment data access (Phase 9.2) — server-only.
 *
 * Security contract:
 * - Every function is scoped to one organization. Callers pass the
 *   organization from the authenticated session (never from the client).
 * - An employee/project/assignment from another organization can never be
 *   listed or loaded here.
 * - Eligible project options reuse the existing org-scoped
 *   `listOrganizationProjects` (features/attendance/queries.ts), which
 *   already filters to ACTIVE projects.
 */

export interface EmployeeAssignment {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  active: boolean;
  assignedAt: Date;
  endedAt: Date | null;
}

/** Org-scoped assignment history for one employee (active rows first). */
export async function listEmployeeProjectAssignments(
  organizationId: string,
  employeeId: string
): Promise<EmployeeAssignment[]> {
  return db
    .select({
      id: employeeProjectAssignments.id,
      projectId: projects.id,
      projectCode: projects.code,
      projectName: projects.name,
      active: employeeProjectAssignments.active,
      assignedAt: employeeProjectAssignments.assignedAt,
      endedAt: employeeProjectAssignments.endedAt,
    })
    .from(employeeProjectAssignments)
    .innerJoin(projects, eq(projects.id, employeeProjectAssignments.projectId))
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        eq(projects.organizationId, organizationId)
      )
    )
    .orderBy(
      desc(employeeProjectAssignments.active),
      desc(employeeProjectAssignments.assignedAt)
    );
}

export interface AssignmentEmployee {
  id: string;
  organizationId: string;
  employeeNumber: string;
  employmentStatus: string;
}

/** Org-scoped employee lookup for assignment eligibility checks. */
export async function getEmployeeForAssignment(
  organizationId: string,
  employeeId: string
): Promise<AssignmentEmployee | null> {
  const rows = await db
    .select({
      id: employees.id,
      organizationId: employees.organizationId,
      employeeNumber: employees.employeeNumber,
      employmentStatus: employees.employmentStatus,
    })
    .from(employees)
    .where(
      and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId))
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface AssignmentProject {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  status: string;
}

/** Org-scoped project lookup for assignment eligibility checks. */
export async function getProjectForAssignment(
  organizationId: string,
  projectId: string
): Promise<AssignmentProject | null> {
  const rows = await db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      code: projects.code,
      name: projects.name,
      status: projects.status,
    })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Whether (employee, project) already has an ACTIVE assignment. Pre-checks the
 * partial unique index so the action can return a deterministic error.
 */
export async function hasActiveAssignment(
  organizationId: string,
  employeeId: string,
  projectId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: employeeProjectAssignments.id })
    .from(employeeProjectAssignments)
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        eq(employeeProjectAssignments.projectId, projectId),
        eq(employeeProjectAssignments.active, true)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export interface AssignmentWithContext {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeNumber: string;
  projectId: string;
  projectName: string;
  active: boolean;
}

/** Org-scoped assignment joined with employee number + project name (for the end action + audit). */
export async function getAssignmentWithContextInOrganization(
  organizationId: string,
  assignmentId: string
): Promise<AssignmentWithContext | null> {
  const rows = await db
    .select({
      id: employeeProjectAssignments.id,
      organizationId: employeeProjectAssignments.organizationId,
      employeeId: employees.id,
      employeeNumber: employees.employeeNumber,
      projectId: projects.id,
      projectName: projects.name,
      active: employeeProjectAssignments.active,
    })
    .from(employeeProjectAssignments)
    .innerJoin(employees, eq(employees.id, employeeProjectAssignments.employeeId))
    .innerJoin(projects, eq(projects.id, employeeProjectAssignments.projectId))
    .where(
      and(
        eq(employeeProjectAssignments.id, assignmentId),
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employees.organizationId, organizationId),
        eq(projects.organizationId, organizationId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
