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
  LEAVE_REQUEST_STATUS_LABELS,
  type LeaveRequestStatus,
} from "@/features/leave/constants";
import { formatDate, formatDayCount } from "@/features/leave/format";
import {
  listActiveLeaveTypes,
  listOrganizationLeaveRequests,
} from "@/features/leave/queries";
import { leaveManagementFilterSchema } from "@/features/leave/schemas";

export const metadata: Metadata = {
  title: "Leave management",
};

function readParam(
  value: string | string[] | undefined
): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function statusBadge(status: LeaveRequestStatus) {
  const label = LEAVE_REQUEST_STATUS_LABELS[status] ?? status;
  if (status === "approved") return <Badge variant="primary">{label}</Badge>;
  if (status === "rejected") return <Badge variant="destructive">{label}</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

export default async function LeaveManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = leaveManagementFilterSchema.safeParse({
    q: readParam(params.q),
    status: readParam(params.status),
    leaveTypeId: readParam(params.leaveTypeId),
    page: readParam(params.page),
  });
  const filters = parsed.success ? parsed.data : {};

  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.LEAVE_MANAGE,
  ]);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const [result, leaveTypes] = await Promise.all([
    listOrganizationLeaveRequests(organizationId, filters),
    listActiveLeaveTypes(organizationId),
  ]);
  const { items, total, page, totalPages } = result;

  const buildQuery = (nextPage: number) => {
    const query = new URLSearchParams();
    if (filters.q) query.set("q", filters.q);
    if (filters.status) query.set("status", filters.status);
    if (filters.leaveTypeId) query.set("leaveTypeId", filters.leaveTypeId);
    query.set("page", String(nextPage));
    return `/leave/management?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Leave management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {total} {total === 1 ? "request" : "requests"}.
        </p>
      </div>

      <form
        action="/leave/management"
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-end"
      >
        <div className="space-y-2">
          <label htmlFor="leave-mgmt-q" className="text-sm font-medium">
            Search
          </label>
          <input
            id="leave-mgmt-q"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Name or employee number"
            className="flex h-10 w-full min-w-44 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="leave-mgmt-type" className="text-sm font-medium">
            Leave type
          </label>
          <select
            id="leave-mgmt-type"
            name="leaveTypeId"
            defaultValue={filters.leaveTypeId ?? ""}
            className="flex h-10 w-full min-w-40 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All types</option>
            {leaveTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="leave-mgmt-status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="leave-mgmt-status"
            name="status"
            defaultValue={filters.status ?? ""}
            className="flex h-10 w-full min-w-36 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All statuses</option>
            {Object.entries(LEAVE_REQUEST_STATUS_LABELS).map(
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
        {filters.q || filters.status || filters.leaveTypeId ? (
          <Link
            href="/leave/management"
            className={buttonVariants({ variant: "ghost" })}
          >
            Clear
          </Link>
        ) : null}
      </form>
      {items.length === 0 ? (
        <EmptyState
          title="No leave requests"
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
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
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
                    <TableCell>{request.leaveTypeName}</TableCell>
                    <TableCell>
                      {formatDate(request.startDate)} →{" "}
                      {formatDate(request.endDate)}
                    </TableCell>
                    <TableCell>{formatDayCount(request.totalDays)}</TableCell>
                    <TableCell>{statusBadge(request.status)}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/leave/${request.id}`}
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
