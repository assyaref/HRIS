import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attendanceRecords,
  employeeProjectAssignments,
  organizations,
  projects,
  workLocations,
} from "@/db/schema";
import { projectListSearchSchema } from "./schemas";
import type { ProjectDependencyCounts } from "./policy";

export type ProjectListItem = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Project row joined with its owning organization.
 *
 * Used by the Super Administrator projects surface, which — exactly like
 * `features/organizations/queries.ts` — reads ACROSS tenants: the actor is
 * structurally the system-level SUPERADMIN (pages guard with
 * `requireSuperAdmin`, actions re-check it), whose whole purpose is
 * cross-tenant visibility. The organization columns are explicit in every
 * row so tenant data never mixes silently.
 */
export type ProjectWithOrganization = ProjectListItem & {
  organizationName: string;
  organizationCode: string;
  organizationStatus: string;
};

export interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

/**
 * Get a single project inside the caller's organization.
 *
 * organizationId MUST come from the authenticated session.
 */
export async function getProjectById(
  organizationId: string,
  projectId: string
): Promise<ProjectListItem | null> {
  const [project] = await db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      )
    )
    .limit(1);

  return project ?? null;
}

/**
 * List projects belonging only to the caller's organization.
 */
export async function listOrganizationProjects(
  organizationId: string,
  input: unknown = {}
): Promise<ProjectListItem[]> {
  const parsed = projectListSearchSchema.safeParse(input);

  if (!parsed.success) {
    return [];
  }

  const { q, status } = parsed.data;

  const filters = [
    eq(projects.organizationId, organizationId),
  ];

  if (status) {
    filters.push(eq(projects.status, status));
  }

  if (q) {
    filters.push(
      or(
        ilike(projects.code, `%${q}%`),
        ilike(projects.name, `%${q}%`)
      )!
    );
  }

  return db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(...filters))
    .orderBy(asc(projects.status), asc(projects.code));
}

/**
 * List only active projects.
 *
 * Used by attendance/work-location flows.
 */
export async function listActiveOrganizationProjects(
  organizationId: string
): Promise<ProjectListItem[]> {
  return db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.status, "active")
      )
    )
    .orderBy(asc(projects.code));
}

/**
 * Simple project options for dropdowns (id, code, name only).
 */
export interface ProjectOption {
  id: string;
  code: string;
  name: string;
  organizationId: string;
}

export async function listProjectOptionsByOrganization(
  organizationId: string
): Promise<ProjectOption[]> {
  return db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      organizationId: projects.organizationId,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.status, "active")
      )
    )
    .orderBy(asc(projects.name));
}

/**
 * Project options across ALL organizations (Super Administrator surface).
 *
 * The Employee Import Wizard is a single client dialog that lets a Super
 * Administrator choose the target tenant in place (no navigation), so it
 * needs every active project together with its owning `organizationId` and
 * filters them client-side to the selected tenant. This mirrors the existing
 * cross-tenant read contract of `listProjectsWithOrganization`; only the
 * system-level SUPERADMIN reaches this list, and `validateImportSettings`
 * re-validates the submitted project against the selected organization before
 * anything is written.
 */
export async function listActiveProjectOptionsForSuperAdmin(): Promise<
  ProjectOption[]
> {
  return db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      organizationId: projects.organizationId,
    })
    .from(projects)
    .where(eq(projects.status, "active"))
    .orderBy(asc(projects.name));
}

/* ------------------------------------------------------------------ */
/* Super Administrator surface (cross-tenant reads, SUPERADMIN pages   */
/* and actions guard these — same contract as organizations, R19).     */
/* ------------------------------------------------------------------ */

export interface ProjectListFilters {
  q?: string | null;
  status?: string | null;
  organizationId?: string | null;
}

/**
 * List ALL projects across organizations with the owning organization's
 * identity (Super Administrator projects page).
 *
 * The optional `organizationId` filter narrows the list to exactly one
 * tenant — it can never mix rows from several organizations.
 */
export async function listProjectsWithOrganization(
  input: ProjectListFilters = {}
): Promise<ProjectWithOrganization[]> {
  const filters = [];

  if (input.status) {
    filters.push(eq(projects.status, input.status));
  }

  if (input.organizationId) {
    filters.push(eq(projects.organizationId, input.organizationId));
  }

  if (input.q?.trim()) {
    const pattern = `%${input.q.trim()}%`;
    filters.push(
      or(
        ilike(projects.code, pattern),
        ilike(projects.name, pattern),
        ilike(organizations.name, pattern)
      )!
    );
  }

  return db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      organizationName: organizations.name,
      organizationCode: organizations.code,
      organizationStatus: organizations.status,
    })
    .from(projects)
    .innerJoin(organizations, eq(projects.organizationId, organizations.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(projects.status), asc(projects.code));
}

/**
 * One project + its organization, by project id (Super Administrator detail).
 *
 * NOT org-scoped: the caller must be the system-level SUPERADMIN (enforced
 * by the page and re-checked by the actions).
 */
export async function getProjectWithOrganization(
  projectId: string
): Promise<ProjectWithOrganization | null> {
  const [project] = await db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      organizationName: organizations.name,
      organizationCode: organizations.code,
      organizationStatus: organizations.status,
    })
    .from(projects)
    .innerJoin(organizations, eq(projects.organizationId, organizations.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  return project ?? null;
}

/**
 * Dependency scan for the project delete guard and the organization-change
 * guard.
 *
 * Covers EVERY table that references `projects.id`:
 * - `employee_project_assignments` (NOT NULL, ON DELETE CASCADE — history is
 *   protected: ended assignments block deletion too),
 * - `attendance_records` (ON DELETE SET NULL — the historical attendance
 *   would silently lose its project),
 * - `work_locations` (ON DELETE SET NULL — the geofence anchor would
 *   silently lose its project).
 * A project with ANY dependent row is refused for deletion and for
 * organization change; deactivation is the sanctioned alternative.
 */
export async function detectProjectDependencies(
  projectId: string
): Promise<ProjectDependencyCounts> {
  const [assignmentsRow, attendanceRow, workLocationsRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(employeeProjectAssignments)
      .where(eq(employeeProjectAssignments.projectId, projectId)),
    db
      .select({ value: count() })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.projectId, projectId)),
    db
      .select({ value: count() })
      .from(workLocations)
      .where(eq(workLocations.projectId, projectId)),
  ]);

  return {
    assignments: assignmentsRow[0]?.value ?? 0,
    attendance: attendanceRow[0]?.value ?? 0,
    work_locations: workLocationsRow[0]?.value ?? 0,
  };
}

/**
 * Batched dependency totals for a list of projects (projects page).
 *
 * Exactly three grouped queries regardless of row count — never per-row.
 */
export async function getProjectDependencyTotals(
  projectIds: string[]
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (projectIds.length === 0) return totals;

  const addTo = (
    rows: Array<{ projectId: string | null; value: number }>
  ) => {
    for (const row of rows) {
      if (!row.projectId) continue;
      totals.set(row.projectId, (totals.get(row.projectId) ?? 0) + row.value);
    }
  };

  const [assignmentsRows, attendanceRows, workLocationRows] = await Promise.all(
    [
      db
        .select({ projectId: employeeProjectAssignments.projectId, value: count() })
        .from(employeeProjectAssignments)
        .where(inArray(employeeProjectAssignments.projectId, projectIds))
        .groupBy(employeeProjectAssignments.projectId),
      db
        .select({ projectId: attendanceRecords.projectId, value: count() })
        .from(attendanceRecords)
        .where(inArray(attendanceRecords.projectId, projectIds))
        .groupBy(attendanceRecords.projectId),
      db
        .select({ projectId: workLocations.projectId, value: count() })
        .from(workLocations)
        .where(inArray(workLocations.projectId, projectIds))
        .groupBy(workLocations.projectId),
    ]
  );

  addTo(assignmentsRows);
  addTo(attendanceRows);
  addTo(workLocationRows);

  return totals;
}

/** True when another project in `organizationId` already uses `code`. */
export async function isProjectCodeTaken(
  organizationId: string,
  code: string,
  excludeProjectId?: string
): Promise<boolean> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.code, code),
        excludeProjectId
          ? sql`${projects.id} <> ${excludeProjectId}::uuid`
          : undefined
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Resolve an organization the Super Administrator selected, enforcing the
 * selector's contract: the row must exist AND be active (inactive tenants do
 * not accept new project data).
 *
 * Returns `null` for unknown, malformed or inactive organizations — callers
 * translate that into a safe validation error.
 */
export async function getActiveOrganization(
  organizationId: string
): Promise<{ id: string; name: string; code: string } | null> {
  const [organization] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      code: organizations.code,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.status, "active")
      )
    )
    .limit(1);

  return organization ?? null;
}
