import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { projects } from "@/db/schema";
import type { WorkLocationProjectOption } from "./schemas";

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
): Promise<{ id: string; name: string; code: string } | null> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
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