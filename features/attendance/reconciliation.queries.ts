import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  employeeProjectAssignments,
  employees,
  projects,
  workLocations,
} from "@/db/schema";
import {
  reconcileDataset,
  type ReconciliationEmployee,
  type ReconciliationProject,
  type ReconciliationRow,
  type ReconciliationWorkLocation,
} from "./reconciliation";

/**
 * Attendance readiness data access (PHASE 9.6) — server-only, READ-ONLY.
 *
 * Security contract:
 * - Every query is scoped to ONE organization resolved from the authenticated
 *   session. An `organizationId` supplied by the browser is never accepted.
 * - Cross-organization employees, assignments, projects and work locations can
 *   never appear here.
 * - No GPS, no camera, no Face Recognition, no attendance submission, and no
 *   writes of any kind: this service only reads configuration and derives the
 *   readiness dataset through the pure reconciliation engine.
 */

export interface ReconciliationEmployeeOption {
  id: string;
  name: string;
}

export interface ReconciliationOption {
  id: string;
  name: string;
}

export interface OrganizationReadinessData {
  rows: ReconciliationRow[];
  employees: ReconciliationEmployeeOption[];
  projects: ReconciliationOption[];
  workLocations: ReconciliationOption[];
}

function employeeOptionName(employee: {
  firstName: string;
  lastName: string;
}): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

/** Org-scoped employees (all statuses — inactive employees are diagnosed). */
async function listReconciliationEmployees(
  organizationId: string
): Promise<ReconciliationEmployee[]> {
  return db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employmentStatus: employees.employmentStatus,
    })
    .from(employees)
    .where(eq(employees.organizationId, organizationId))
    .orderBy(asc(employees.firstName), asc(employees.lastName));
}

/** Org-scoped ACTIVE employee ↔ project assignments only. */
async function listReconciliationActiveAssignments(
  organizationId: string
): Promise<{ employeeId: string; projectId: string }[]> {
  return db
    .select({
      employeeId: employeeProjectAssignments.employeeId,
      projectId: employeeProjectAssignments.projectId,
    })
    .from(employeeProjectAssignments)
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.active, true)
      )
    );
}

/** Org-scoped projects (all statuses). */
async function listReconciliationProjects(
  organizationId: string
): Promise<ReconciliationProject[]> {
  return db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      status: projects.status,
    })
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .orderBy(asc(projects.name));
}

/** Org-scoped work locations (all statuses and configurations). */
async function listReconciliationWorkLocations(
  organizationId: string
): Promise<ReconciliationWorkLocation[]> {
  return db
    .select({
      id: workLocations.id,
      projectId: workLocations.projectId,
      name: workLocations.name,
      status: workLocations.status,
      latitude: workLocations.latitude,
      longitude: workLocations.longitude,
      radiusMeters: workLocations.radiusMeters,
    })
    .from(workLocations)
    .where(eq(workLocations.organizationId, organizationId))
    .orderBy(asc(workLocations.name));
}

/**
 * Load the organization's reconciliation dataset and evaluate it.
 *
 * The caller (page/route) is responsible for authentication +
 * `ATTENDANCE_MANAGE`; the `organizationId` must come from the session.
 */
export async function getOrganizationAttendanceReadiness(
  organizationId: string
): Promise<OrganizationReadinessData> {
  const [orgEmployees, orgAssignments, orgProjects, orgWorkLocations] =
    await Promise.all([
      listReconciliationEmployees(organizationId),
      listReconciliationActiveAssignments(organizationId),
      listReconciliationProjects(organizationId),
      listReconciliationWorkLocations(organizationId),
    ]);

  const rows = reconcileDataset({
    employees: orgEmployees,
    assignments: orgAssignments,
    projects: orgProjects,
    workLocations: orgWorkLocations,
  });

  return {
    rows,
    employees: orgEmployees.map((employee) => ({
      id: employee.id,
      name: employeeOptionName(employee),
    })),
    projects: orgProjects.map((project) => ({
      id: project.id,
      name: project.name,
    })),
    workLocations: orgWorkLocations.map((location) => ({
      id: location.id,
      name: location.name,
    })),
  };
}
