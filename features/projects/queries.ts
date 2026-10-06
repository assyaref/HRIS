import { and, asc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { projectListSearchSchema } from "./schemas";

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
