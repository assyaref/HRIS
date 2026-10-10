"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { formatDate } from "@/features/payroll/format";

import type { ProjectWithOrganization } from "./queries";
import type { OrganizationSelectOption } from "./organization-select";
import { ProjectStatusBadge } from "./project-status-badge";
import { ProjectEditDialog } from "./project-edit-dialog";
import { ProjectDeleteDialog } from "./project-delete-dialog";

interface ProjectTableProps {
  projects: ProjectWithOrganization[];
  /** Active organizations for the edit dialog's organization selector. */
  organizations: OrganizationSelectOption[];
  /** Server-computed dependency totals per project id. */
  dependencyTotals: Record<string, number>;
}

function ensureOrganizationOptions(
  organizations: OrganizationSelectOption[],
  project: ProjectWithOrganization
): OrganizationSelectOption[] {
  const exists = organizations.some(
    (organization) => organization.id === project.organizationId
  );
  if (exists) return organizations;
  return [
    ...organizations,
    {
      id: project.organizationId,
      name: project.organizationName,
      code: project.organizationCode,
      status: project.organizationStatus,
    },
  ];
}

/**
 * Projects list for the Super Administrator surface: desktop table + mobile
 * cards (same pattern as `features/organizations/organizations-manager.tsx`).
 * Every row shows its owning organization, and the row actions mirror what
 * the server accepts — Delete only appears when the pre-computed dependency
 * total is zero (the action re-verifies; a race maps to a refusal toast).
 */
export function ProjectTable({
  projects,
  organizations,
  dependencyTotals,
}: ProjectTableProps) {
  return (
    <>
      <div className="hidden rounded-lg border border-border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => {
              const dependencyTotal = dependencyTotals[project.id] ?? 0;
              return (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">
                    <span className="font-mono text-sm">{project.code}</span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/projects/${project.id}`}
                      className="block max-w-[16rem] truncate hover:underline"
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-[14rem] truncate" title={project.organizationName}>
                      {project.organizationName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={project.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(project.startDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(project.endDate)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/projects/${project.id}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        View
                      </Link>
                      <ProjectEditDialog
                        project={project}
                        organizations={ensureOrganizationOptions(
                          organizations,
                          project
                        )}
                        canChangeOrganization={dependencyTotal === 0}
                        compact
                      />
                      {dependencyTotal === 0 ? (
                        <ProjectDeleteDialog
                          project={project}
                          dependencyTotal={dependencyTotal}
                          compact
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 sm:hidden">
        {projects.map((project) => {
          const dependencyTotal = dependencyTotals[project.id] ?? 0;
          return (
            <div
              key={project.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/projects/${project.id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {project.name}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    <span className="font-mono">{project.code}</span>
                    {" · "}
                    {project.organizationName}
                  </p>
                </div>
                <ProjectStatusBadge status={project.status} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Start</dt>
                  <dd>{formatDate(project.startDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">End</dt>
                  <dd>{formatDate(project.endDate)}</dd>
                </div>
              </dl>
              {dependencyTotal > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Referenced by {dependencyTotal} record(s) — delete protected.
                </p>
              ) : null}
              <div className="mt-3 flex justify-end gap-1">
                <ProjectEditDialog
                  project={project}
                  organizations={ensureOrganizationOptions(
                    organizations,
                    project
                  )}
                  canChangeOrganization={dependencyTotal === 0}
                  compact
                />
                {dependencyTotal === 0 ? (
                  <ProjectDeleteDialog
                    project={project}
                    dependencyTotal={dependencyTotal}
                    compact
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
