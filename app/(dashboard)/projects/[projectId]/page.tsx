import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import type { Metadata } from "next";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/auth";
import { isSuperAdmin } from "@/lib/auth/rbac";

import { listOrganizationOptions } from "@/features/organizations/queries";
import {
  detectProjectDependencies,
  getProjectWithOrganization,
} from "@/features/projects/queries";
import { summarizeProjectDependencies } from "@/features/projects/policy";
import { ProjectStatusBadge } from "@/features/projects/project-status-badge";
import { ProjectEditDialog } from "@/features/projects/project-edit-dialog";
import { ProjectStatusDialog } from "@/features/projects/project-status-dialog";
import { ProjectDeleteDialog } from "@/features/projects/project-delete-dialog";

export const metadata: Metadata = {
  title: "Project detail",
};

function formatDate(date: Date | null) {
  if (!date) return "-";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Project detail — SUPERADMIN ONLY (same gate as the projects list and every
 * project server action; non-superadmin users get 403).
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!UUID_PATTERN.test(projectId)) {
    notFound();
  }

  const user = await requireUser();
  if (!(await isSuperAdmin(user.id))) {
    forbidden();
  }

  const project = await getProjectWithOrganization(projectId);

  if (!project) {
    notFound();
  }

  const [dependencyCounts, activeOrganizations] = await Promise.all([
    detectProjectDependencies(projectId),
    listOrganizationOptions({ activeOnly: true }),
  ]);

  const dependencySummary = summarizeProjectDependencies(dependencyCounts);

  const organizationOptions = activeOrganizations.some(
    (organization) => organization.id === project.organizationId
  )
    ? activeOrganizations
    : [
        ...activeOrganizations,
        {
          id: project.organizationId,
          name: project.organizationName,
          code: project.organizationCode,
          status: project.organizationStatus,
        },
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back
          </Link>

          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="text-muted-foreground font-mono text-sm">
              {project.code}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ProjectEditDialog
            project={project}
            organizations={organizationOptions}
            canChangeOrganization={!dependencySummary.hasAny}
          />
          <ProjectStatusDialog project={project} />
          {!dependencySummary.hasAny ? (
            <ProjectDeleteDialog
              project={project}
              dependencyTotal={dependencySummary.total}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-5">
          <p className="text-muted-foreground text-sm">Organization</p>
          <p className="mt-1 font-medium">{project.organizationName}</p>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {project.organizationCode}
          </p>
        </div>

        <div className="rounded-lg border p-5">
          <p className="text-muted-foreground text-sm">Status</p>
          <div className="mt-2">
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>

        <div className="rounded-lg border p-5">
          <p className="text-muted-foreground text-sm">Start Date</p>
          <p className="mt-1 font-medium">{formatDate(project.startDate)}</p>
        </div>

        <div className="rounded-lg border p-5">
          <p className="text-muted-foreground text-sm">End Date</p>
          <p className="mt-1 font-medium">{formatDate(project.endDate)}</p>
        </div>
      </div>

      <div className="rounded-lg border p-5">
        <p className="text-muted-foreground text-sm">Linked records</p>
        {dependencySummary.hasAny ? (
          <ul className="mt-2 space-y-1 text-sm">
            {dependencySummary.categories.map(
              ({ category, count }) => (
                <li key={category} className="flex items-center gap-2">
                  <Badge variant="secondary">{count}</Badge>
                  <span>
                    {category === "assignments"
                      ? "Employee assignments"
                      : category === "attendance"
                        ? "Attendance records"
                        : "Work locations"}
                  </span>
                </li>
              )
            )}
          </ul>
        ) : (
          <p className="mt-1 text-sm">
            None — this project is not referenced by assignments, attendance
            or work locations.
          </p>
        )}
        {dependencySummary.hasAny ? (
          <p className="text-muted-foreground mt-2 text-xs">
            Projects with linked records cannot be deleted or moved to
            another organization. Set the project to Inactive instead.
          </p>
        ) : null}
      </div>
    </div>
  );
}
