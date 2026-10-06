"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { formatDate } from "@/features/payroll/format";
import { DeleteOrganizationDialog } from "./organization-delete-dialog";
import { EditOrganizationDialog } from "./organization-edit-dialog";
import { OrganizationStatusBadge } from "./organization-status-badge";
import type { OrganizationListItem } from "./queries";

interface OrganizationsManagerProps {
  organizations: OrganizationListItem[];
  /** System organization code is immutable + non-deletable (server re-checks). */
  reservedSystemCode: string;
}

/**
 * Organization list (R19). Desktop table + mobile cards (same pattern as
 * `features/users/users-manager.tsx`). Delete affordances reflect what the
 * server will accept: the reserved SYSTEM tenant never shows Delete, and
 * tenants with dependent records show the count instead (the action still
 * re-verifies everything).
 */
export function OrganizationsManager({
  organizations,
  reservedSystemCode,
}: OrganizationsManagerProps) {
  if (organizations.length === 0) {
    return (
      <EmptyState
        title="No organizations found"
        description="Adjust the search or status filter, or add the first organization."
      />
    );
  }

  return (
    <>
      <div className="hidden rounded-lg border border-border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Employees</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((organization) => {
              const isSystem = organization.code === reservedSystemCode;
              const dependencies =
                organization.employeeCount + organization.userCount;
              return (
                <TableRow key={organization.id}>
                  <TableCell className="max-w-[18rem] font-medium">
                    <Link
                      href={`/settings/organizations/${organization.id}`}
                      className="block truncate hover:underline"
                    >
                      {organization.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">
                      {organization.code}
                    </span>
                    {isSystem ? (
                      <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                        Reserved
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <OrganizationStatusBadge status={organization.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {organization.employeeCount}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {organization.userCount}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(organization.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(organization.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/settings/organizations/${organization.id}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        View
                      </Link>
                      <EditOrganizationDialog
                        organization={organization}
                      />
                      {isSystem || dependencies > 0 ? null : (
                        <DeleteOrganizationDialog
                          organization={organization}
                          dependencyTotal={dependencies}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 sm:hidden">
        {organizations.map((organization) => {
          const isSystem = organization.code === reservedSystemCode;
          const dependencies =
            organization.employeeCount + organization.userCount;
          return (
            <div
              key={organization.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {organization.name}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    <span className="font-mono">{organization.code}</span>
                  </p>
                </div>
                <OrganizationStatusBadge status={organization.status} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Employees</dt>
                  <dd className="tabular-nums">
                    {organization.employeeCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Users</dt>
                  <dd className="tabular-nums">{organization.userCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Created</dt>
                  <dd>{formatDate(organization.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Updated</dt>
                  <dd>{formatDate(organization.updatedAt)}</dd>
                </div>
              </dl>
              {isSystem ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Reserved system organization — protected.
                </p>
              ) : null}
              <div className="mt-3 flex justify-end gap-1">
                <Link
                  href={`/settings/organizations/${organization.id}`}
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                  })}
                >
                  View
                </Link>
                <EditOrganizationDialog organization={organization} />
                {isSystem || dependencies > 0 ? null : (
                  <DeleteOrganizationDialog
                    organization={organization}
                    dependencyTotal={dependencies}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
