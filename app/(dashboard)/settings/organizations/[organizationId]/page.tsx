import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireUser } from "@/lib/auth/auth";
import { isSuperAdmin } from "@/lib/auth/rbac";
import { SYSTEM_ORGANIZATION_CODE } from "@/lib/auth/roles";
import { formatDateTime } from "@/features/payroll/format";

import {
  detectOrganizationDependencies,
  getOrganizationDetail,
} from "@/features/organizations/queries";
import {
  summarizeDependencies,
  type OrganizationDependencyCategory,
} from "@/features/organizations/policy";
import {
  DEPENDENCY_CATEGORY_LABELS,
} from "@/features/organizations/constants";
import { OrganizationStatusBadge } from "@/features/organizations/organization-status-badge";
import { EditOrganizationDialog } from "@/features/organizations/organization-edit-dialog";
import { DeleteOrganizationDialog } from "@/features/organizations/organization-delete-dialog";

export const metadata: Metadata = {
  title: "Organization",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Organization detail (R19). SUPERADMIN-only: the page re-verifies the
 * system-level role (not a permission code). Statistics come from two
 * aggregate queries; the dependency panel from one indexed scan per
 * referenced table — no N+1.
 */
export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  if (!UUID_PATTERN.test(organizationId)) {
    notFound();
  }

  const user = await requireUser();
  if (!(await isSuperAdmin(user.id))) {
    forbidden();
  }

  const organization = await getOrganizationDetail(organizationId);
  if (!organization) {
    notFound();
  }

  const dependencyCounts = await detectOrganizationDependencies(
    organization.id
  );
  const summary = summarizeDependencies(dependencyCounts);
  const isSystem = organization.code === SYSTEM_ORGANIZATION_CODE;

  const listItem = {
    id: organization.id,
    name: organization.name,
    code: organization.code,
    status: organization.status,
    employeeCount: organization.employeeCount,
    userCount: organization.userCount,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/settings/organizations"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            ← All organizations
          </Link>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="min-w-0 truncate">{organization.name}</span>
            <span className="font-mono text-base font-normal text-muted-foreground">
              {organization.code}
            </span>
            <OrganizationStatusBadge status={organization.status} />
            {isSystem ? (
              <span className={badgeVariants({ variant: "secondary" })}>
                Reserved
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Created {formatDateTime(organization.createdAt)} · Updated{" "}
            {formatDateTime(organization.updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <EditOrganizationDialog organization={listItem} />
          {isSystem ? null : (
            <DeleteOrganizationDialog
              organization={listItem}
              dependencyTotal={summary.total}
            />
          )}
          <Link
            href="/settings/organizations"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to list
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="users" label="Users" value={organization.userCount} />
        <StatCard
          icon="profile"
          label="Active users"
          value={organization.activeUserCount}
        />
        <StatCard
          icon="employees"
          label="Employees"
          value={organization.employeeCount}
        />
        <StatCard
          icon="check"
          label="Active employees"
          value={organization.activeEmployeeCount}
          tone="green"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dependent records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.hasAny ? (
            <>
              <p className="text-sm text-muted-foreground">
                This organization still contains{" "}
                <span className="font-medium text-foreground">
                  {summary.total}
                </span>{" "}
                record(s). Hard deletion is blocked while any protected
                record exists — deactivate instead.
              </p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {summary.categories.map(({ category, count }) => (
                  <li
                    key={category}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <span className="block text-xs text-muted-foreground">
                      {DEPENDENCY_CATEGORY_LABELS[
                        category as OrganizationDependencyCategory
                      ] ?? category}
                    </span>
                    <span className="block text-lg font-semibold tabular-nums">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              title="No dependent records"
              description={
                isSystem
                  ? "The reserved SYSTEM tenant is protected regardless of its records."
                  : "This organization is empty and safe to delete."
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
