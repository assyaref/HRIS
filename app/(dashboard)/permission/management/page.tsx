import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { Badge } from "@/components/ui/badge";
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
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/rbac";

import {
  PERMISSION_REQUEST_STATUS_LABELS,
  PERMISSION_TYPE_LABELS,
  PERMISSION_TYPES,
  type PermissionRequestStatus,
} from "@/features/permission/constants";
import { formatDateTime } from "@/features/permission/format";
import { listOrganizationPermissionRequests } from "@/features/permission/queries";
import { permissionManagementFilterSchema } from "@/features/permission/schemas";

export const metadata: Metadata = {
  title: "Permission management",
};

function readParam(
  value: string | string[] | undefined
): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function statusBadge(status: PermissionRequestStatus) {
  const label = PERMISSION_REQUEST_STATUS_LABELS[status] ?? status;
  if (status === "approved") return <Badge variant="primary">{label}</Badge>;
  if (status === "rejected") return <Badge variant="destructive">{label}</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

export default async function PermissionManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = permissionManagementFilterSchema.safeParse({
    q: readParam(params.q),
    status: readParam(params.status),
    permissionType: readParam(params.permissionType),
    page: readParam(params.page),
  });
  const filters = parsed.success ? parsed.data : {};

  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PERMISSION_APPROVE,
    PERMISSIONS.PERMISSION_MANAGE,
  ]);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const result = await listOrganizationPermissionRequests(
    organizationId,
    filters
  );
  const { items, total, page, totalPages } = result;

  const buildQuery = (nextPage: number) => {
    const query = new URLSearchParams();
    if (filters.q) query.set("q", filters.q);
    if (filters.status) query.set("status", filters.status);
    if (filters.permissionType)
      query.set("permissionType", filters.permissionType);
    query.set("page", String(nextPage));
    return `/permission/management?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Permission management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {total} {total === 1 ? "request" : "requests"}.
        </p>
      </div>

      <form
        action="/permission/management"
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-end"
      >
        <div className="space-y-2">
          <label htmlFor="perm-mgmt-q" className="text-sm font-medium">
            Search
          </label>
          <input
            id="perm-mgmt-q"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Name or employee number"
            className="flex h-10 w-full min-w-44 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="perm-mgmt-type" className="text-sm font-medium">
            Type
          </label>
          <select
            id="perm-mgmt-type"
            name="permissionType"
            defaultValue={filters.permissionType ?? ""}
            className="flex h-10 w-full min-w-40 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All types</option>
            {PERMISSION_TYPES.map((type) => (
              <option key={type} value={type}>
                {PERMISSION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="perm-mgmt-status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="perm-mgmt-status"
            name="status"
            defaultValue={filters.status ?? ""}
            className="flex h-10 w-full min-w-36 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All statuses</option>
            {Object.entries(PERMISSION_REQUEST_STATUS_LABELS).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              )
            )}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          Filter
        </button>
        {filters.q || filters.status || filters.permissionType ? (
          <Link
            href="/permission/management"
            className={buttonVariants({ variant: "ghost" })}
          >
            Clear
          </Link>
        ) : null}
      </form>
      {items.length === 0 ? (
        <EmptyState
          title="No permission requests"
          description="No requests match the current filters."
        />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <span className="font-medium">
                        {request.employeeName}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {request.employeeNumber}
                      </span>
                    </TableCell>
                    <TableCell>
                      {PERMISSION_TYPE_LABELS[
                        request.permissionType as keyof typeof PERMISSION_TYPE_LABELS
                      ] ?? request.permissionType}
                    </TableCell>
                    <TableCell>
                      {formatDateTime(request.startAt)} →{" "}
                      {formatDateTime(request.endAt)}
                    </TableCell>
                    <TableCell>{statusBadge(request.status)}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/permission/${request.id}`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        Review
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 ? (
            <nav className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={buildQuery(page - 1)}
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
                    href={buildQuery(page + 1)}
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
