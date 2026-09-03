import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

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
import { requirePermission } from "@/lib/auth/rbac";

import {
  AttendanceStatusBadge,
  LocationStatusBadge,
} from "@/features/attendance/attendance-badges";
import { formatDate, formatTime } from "@/features/attendance/format";
import {
  listOrganizationAttendance,
  listOrganizationProjects,
} from "@/features/attendance/queries";
import { attendanceFilterSchema } from "@/features/attendance/schemas";

export const metadata: Metadata = {
  title: "Attendance management",
};

function readParam(
  value: string | string[] | undefined
): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Organization attendance view for management. Strictly org-scoped and
 * requires `attendance.manage` — EMPLOYEE users are denied server-side.
 */
export default async function AttendanceManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = attendanceFilterSchema.safeParse({
    date: readParam(params.date),
    projectId: readParam(params.projectId),
    status: readParam(params.status),
    q: readParam(params.q),
    page: readParam(params.page),
  });
  const filters = parsed.success ? parsed.data : {};

  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const [result, projects] = await Promise.all([
    listOrganizationAttendance(organizationId, filters),
    listOrganizationProjects(organizationId),
  ]);
  const { items, total, page, totalPages } = result;

  const buildQuery = (nextPage: number) => {
    const query = new URLSearchParams();
    if (filters.date) query.set("date", filters.date);
    if (filters.projectId) query.set("projectId", filters.projectId);
    if (filters.status) query.set("status", filters.status);
    if (filters.q) query.set("q", filters.q);
    query.set("page", String(nextPage));
    return `/attendance/management?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Attendance management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {total} {total === 1 ? "record" : "records"} in your organization.
        </p>
      </div>

      <form
        action="/attendance/management"
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-end"
      >
        <div className="space-y-2">
          <label htmlFor="attendance-search" className="text-sm font-medium">
            Search
          </label>
          <input
            id="attendance-search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Name or employee number"
            className="flex h-10 w-full min-w-44 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="attendance-date" className="text-sm font-medium">
            Date
          </label>
          <input
            id="attendance-date"
            name="date"
            type="date"
            defaultValue={filters.date ?? ""}
            className="flex h-10 w-full min-w-40 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="attendance-project" className="text-sm font-medium">
            Project
          </label>
          <select
            id="attendance-project"
            name="projectId"
            defaultValue={filters.projectId ?? ""}
            className="flex h-10 w-full min-w-40 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="attendance-status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="attendance-status"
            name="status"
            defaultValue={filters.status ?? ""}
            className="flex h-10 w-full min-w-36 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All statuses</option>
            <option value="present">Present</option>
            <option value="completed">Completed</option>
            <option value="incomplete">Incomplete</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          Filter
        </button>
        {filters.q || filters.date || filters.projectId || filters.status ? (
          <Link
            href="/attendance/management"
            className={buttonVariants({ variant: "ghost" })}
          >
            Clear
          </Link>
        ) : null}
      </form>
      {items.length === 0 ? (
        <EmptyState
          title="No attendance records"
          description="No records match the current filters."
        />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Check in</TableHead>
                  <TableHead>Check out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <span className="font-medium">{record.employeeName}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {record.employeeNumber}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(record.attendanceDate)}</TableCell>
                    <TableCell>
                      {formatTime(
                        record.checkInAt,
                        record.workLocationTimezone
                      )}
                    </TableCell>
                    <TableCell>
                      {formatTime(
                        record.checkOutAt,
                        record.workLocationTimezone
                      )}
                    </TableCell>
                    <TableCell>
                      <AttendanceStatusBadge status={record.status} />
                    </TableCell>
                    <TableCell>
                      <LocationStatusBadge
                        status={record.checkInLocationStatus}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/attendance/${record.id}`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        Details
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 ? (
            <nav
              aria-label="Attendance pagination"
              className="flex items-center justify-between gap-3"
            >
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
