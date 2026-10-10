import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { projects, workLocations } from "@/db/schema";
import type { WorkLocationProjectOption } from "./schemas";

export interface WorkLocationOption {
  id: string;
  name: string;
  organizationId: string;
}

/**
 * Project options for the Work Location project selector (Phase 8.2.1).
 *
 * Security contract:
 * - `organizationId` MUST come from the authenticated session (resolved by the
 *   caller via `requireUser()`). It is never accepted from the client.
 * - Only ACTIVE projects are returned, mirroring the eligibility query in
 *   `features/attendance/queries.ts`; a location bound to a non-active project
 *   would never be eligible for attendance anyway.
 * - Projects from other organizations can never appear here.
 */
export async function listWorkLocationProjectOptions(
  organizationId: string
): Promise<WorkLocationProjectOption[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      status: projects.status,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.status, "active")
      )
    )
    .orderBy(asc(projects.name));

  return rows;
}

/**
 * Resolve a project by id AND verify it belongs to `organizationId`.
 *
 * Returns `null` when the project does not exist or is owned by a different
 * organization. Used by the create/update work location actions to reject
 * cross-organization project binding with a safe, generic error.
 */
export async function getProjectInOrganization(
  projectId: string,
  organizationId: string
): Promise<{
  id: string;
  organizationId: string;
  name: string;
  code: string;
  status: string;
} | null> {
  const rows = await db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      name: projects.name,
      code: projects.code,
      status: projects.status,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * List work locations belonging to the caller's organization.
 *
 * organizationId MUST come from the authenticated session.
 */
export interface WorkLocationListItem {
  id: string;
  organizationId: string;
  projectId: string | null;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function listWorkLocations(
  organizationId: string
): Promise<WorkLocationListItem[]> {
  return db
    .select({
      id: workLocations.id,
      organizationId: workLocations.organizationId,
      projectId: workLocations.projectId,
      name: workLocations.name,
      status: workLocations.status,
      createdAt: workLocations.createdAt,
      updatedAt: workLocations.updatedAt,
    })
    .from(workLocations)
    .where(eq(workLocations.organizationId, organizationId))
    .orderBy(asc(workLocations.name));
}

/**
 * List only active work locations.
 */
export async function listActiveWorkLocations(
  organizationId: string
): Promise<WorkLocationListItem[]> {
  return db
    .select({
      id: workLocations.id,
      organizationId: workLocations.organizationId,
      projectId: workLocations.projectId,
      name: workLocations.name,
      status: workLocations.status,
      createdAt: workLocations.createdAt,
      updatedAt: workLocations.updatedAt,
    })
    .from(workLocations)
    .where(
      and(
        eq(workLocations.organizationId, organizationId),
        eq(workLocations.status, "active")
      )
    )
    .orderBy(asc(workLocations.name));
}

/**
 * Simple work location options for dropdowns (id, name only).
 */
export async function listWorkLocationOptions(
  organizationId: string
): Promise<WorkLocationOption[]> {
  return db
    .select({
      id: workLocations.id,
      name: workLocations.name,
      organizationId: workLocations.organizationId,
    })
    .from(workLocations)
    .where(
      and(
        eq(workLocations.organizationId, organizationId),
        eq(workLocations.status, "active")
      )
    )
    .orderBy(asc(workLocations.name));
}

/**
 * Work location options across ALL organizations (Super Administrator
 * surface).
 *
 * Same rationale as `listActiveProjectOptionsForSuperAdmin`: the Employee
 * Import Wizard lets a Super Administrator pick any tenant in place, so the
 * option list carries every active work location with its owning
 * `organizationId` and is narrowed client-side. `validateImportSettings`
 * still re-validates the submitted work location against the selected
 * organization before any write.
 */
export async function listActiveWorkLocationOptionsForSuperAdmin(): Promise<
  WorkLocationOption[]
> {
  return db
    .select({
      id: workLocations.id,
      name: workLocations.name,
      organizationId: workLocations.organizationId,
    })
    .from(workLocations)
    .where(eq(workLocations.status, "active"))
    .orderBy(asc(workLocations.name));
}