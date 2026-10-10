import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/auth";
import { isSuperAdmin } from "@/lib/auth/rbac";

import {
  listOrganizationOptions,
} from "@/features/organizations/queries";
import {
  getProjectDependencyTotals,
  listProjectsWithOrganization,
} from "@/features/projects/queries";
import {
  PROJECT_STATUSES,
  type ProjectStatus,
} from "@/features/projects/schemas";
import {
  isProjectStatus,
  projectStatusLabel,
} from "@/features/projects/project-status-badge";
import { ProjectCreateDialog } from "@/features/projects/project-create-dialog";
import { ProjectTable } from "@/features/projects/project-table";

export const metadata: Metadata = {
  title: "Projects",
};

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filterHref(
  search: string | null,
  status: ProjectStatus | null,
  organizationId: string | null
): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (status) params.set("status", status);
  if (organizationId) params.set("organizationId", organizationId);
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

/**
 * Projects administration — SUPERADMIN ONLY.
 *
 * The page gate is `isSuperAdmin` — the system-level role resolved from
 * PostgreSQL against the reserved SYSTEM organization — NOT a permission
 * code: the requirement is "project CRUD is Super Administrator only", and
 * that guarantee must not be dilutable by granting a code to a tenant role
 * (same contract as `/settings/organizations`, R19). Non-superadmin users
 * (including tenant ADMINs) get 403 even when the URL is typed manually.
 * Every mutation repeats the same check in the server actions, so direct
 * action calls are structurally blocked too.
 *
 * Reads here span organizations: the organization column and the
 * organization filter keep tenant data explicitly separated — a filtered
 * view shows exactly one tenant's projects, never a mix.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!(await isSuperAdmin(user.id))) {
    forbidden();
  }

  const params = await searchParams;
  const search = readParam(params.q) ?? null;
  const statusParam = readParam(params.status);
  const status =
    statusParam && isProjectStatus(statusParam) ? statusParam : null;
  const organizationIdParam = readParam(params.organizationId);
  const organizationId =
    organizationIdParam && UUID_PATTERN.test(organizationIdParam)
      ? organizationIdParam
      : null;

  const [projects, allOrganizations, activeOrganizations] = await Promise.all([
    listProjectsWithOrganization({
      q: search,
      status,
      organizationId,
    }),
    listOrganizationOptions(),
    listOrganizationOptions({ activeOnly: true }),
  ]);

  const dependencyTotals = await getProjectDependencyTotals(
    projects.map((project) => project.id)
  );

  const serializedTotals: Record<string, number> = {};
  for (const [projectId, total] of dependencyTotals) {
    serializedTotals[projectId] = total;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Projects
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Manage organizational projects across tenants. Reserved for Super
            Administrators.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="flex items-center gap-2"
            action="/projects"
          >
            {status ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            {organizationId ? (
              <input
                type="hidden"
                name="organizationId"
                value={organizationId}
              />
            ) : null}
            <input
              type="search"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Search code, name or organization"
              className="border-input bg-background h-9 w-44 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-56"
            />
            {search ? (
              <button
                type="submit"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Search
              </button>
            ) : null}
          </form>
          <ProjectCreateDialog organizations={activeOrganizations} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={filterHref(search, null, organizationId)}
          className={buttonVariants({
            variant: status === null ? "primary" : "outline",
            size: "sm",
          })}
        >
          All
        </Link>
        {PROJECT_STATUSES.map((value) => (
          <Link
            key={value}
            href={filterHref(search, value, organizationId)}
            className={buttonVariants({
              variant: status === value ? "primary" : "outline",
              size: "sm",
            })}
          >
            {projectStatusLabel(value)}
          </Link>
        ))}
        <form action="/projects" className="ml-auto flex items-center gap-2">
          {search ? (
            <input type="hidden" name="q" value={search} />
          ) : null}
          {status ? (
            <input type="hidden" name="status" value={status} />
          ) : null}
          <select
            name="organizationId"
            defaultValue={organizationId ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            aria-label="Filter by organization"
          >
            <option value="">All organizations</option>
            {allOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Filter
          </button>
        </form>
      </div>

      <Card>
        <CardContent className="pt-6">
          {projects.length === 0 ? (
            <EmptyState
              title="No projects found"
              description="Adjust the search or filters, or create the first project inside an organization."
            />
          ) : (
            <ProjectTable
              projects={projects}
              organizations={activeOrganizations}
              dependencyTotals={serializedTotals}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
