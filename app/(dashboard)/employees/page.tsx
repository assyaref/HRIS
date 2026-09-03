import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";

import { CreateEmployeeDialog } from "@/features/employees/employee-create-dialog";
import { EmployeeFilters } from "@/features/employees/employee-filters";
import { EmployeeTable } from "@/features/employees/employee-table";
import {
  listEmployeesByOrganization,
  listLinkableUsers,
} from "@/features/employees/queries";
import { employeeListSearchSchema } from "@/features/employees/schemas";

export const metadata: Metadata = {
  title: "Employees",
};

function readParam(
  value: string | string[] | undefined
): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Organization-scoped employee directory.
 *
 * Search + status filter + pagination all run in the database against the
 * authenticated user's organization. Page state is carried in URL query
 * parameters so it can be shared and bookmarked.
 */
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = employeeListSearchSchema.safeParse({
    q: readParam(params.q),
    status: readParam(params.status),
    page: readParam(params.page),
  });
  const filters = parsed.success ? parsed.data : {};

  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  if (!user.organizationId) {
    // Org-less users can never have employees.view in practice (RBAC is
    // org-scoped), but guard defensively.
    forbidden();
  }
  const organizationId = user.organizationId;

  const canCreate = await hasPermission(
    user.id,
    PERMISSIONS.EMPLOYEES_CREATE
  );
  const [result, linkableUsers] = await Promise.all([
    listEmployeesByOrganization(organizationId, filters),
    canCreate ? listLinkableUsers(organizationId) : Promise.resolve([]),
  ]);

  const { items, total, page, totalPages } = result;
  const hasActiveFilters = Boolean(filters.q || filters.status);
  const search = filters.q ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Employees
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {total} {total === 1 ? "employee" : "employees"}
            {hasActiveFilters ? " match your filters" : ""} in your
            organization.
          </p>
        </div>
        {canCreate ? (
          <CreateEmployeeDialog linkableUsers={linkableUsers} />
        ) : null}
      </div>

      <EmployeeFilters search={search} status={filters.status ?? ""} />

      {items.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matching employees" : "No employees yet"}
          description={
            hasActiveFilters
              ? "Try adjusting your search or filters."
              : "Create your first employee record to get started."
          }
        />
      ) : (
        <>
          <EmployeeTable employees={items} />

          {totalPages > 1 ? (
            <nav
              aria-label="Employee list pagination"
              className="flex items-center justify-between gap-3"
            >
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={`/employees?${new URLSearchParams({
                      ...(filters.q ? { q: filters.q } : {}),
                      ...(filters.status ? { status: filters.status } : {}),
                      page: String(page - 1),
                    })}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    href={`/employees?${new URLSearchParams({
                      ...(filters.q ? { q: filters.q } : {}),
                      ...(filters.status ? { status: filters.status } : {}),
                      page: String(page + 1),
                    })}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
