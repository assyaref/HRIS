import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  hasAnyPermission,
  requirePermission,
} from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { LeaveCreateDialog } from "@/features/leave/leave-create-dialog";
import {
  LEAVE_REQUEST_STATUS_LABELS,
  type LeaveRequestStatus,
} from "@/features/leave/constants";
import { formatDate, formatDayCount } from "@/features/leave/format";
import {
  listActiveLeaveTypes,
  listLeaveBalances,
  listMyLeaveRequests,
} from "@/features/leave/queries";

export const metadata: Metadata = {
  title: "Leave",
};

function statusBadge(status: LeaveRequestStatus) {
  const label = LEAVE_REQUEST_STATUS_LABELS[status] ?? status;
  if (status === "approved") return <Badge variant="primary">{label}</Badge>;
  if (status === "rejected") return <Badge variant="destructive">{label}</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

/** Employee leave hub: own balances, own requests, create + history. */
export default async function LeavePage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.LEAVE_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const employee = await getEmployeeByUserId(user.id, organizationId);
  if (!employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Leave
        </h1>
        <EmptyState
          title="No employee profile linked"
          description="Your account is not linked to an employee record, so leave is unavailable."
        />
      </div>
    );
  }

  const canReview = await hasAnyPermission(user.id, [
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.LEAVE_MANAGE,
  ]);
  const canCreate = await hasAnyPermission(user.id, [
    PERMISSIONS.LEAVE_CREATE,
    PERMISSIONS.LEAVE_MANAGE,
  ]);

  const [balances, requests, leaveTypes] = await Promise.all([
    listLeaveBalances(organizationId, employee.id),
    listMyLeaveRequests(organizationId, employee.id),
    listActiveLeaveTypes(organizationId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Leave
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {employee.firstName} {employee.lastName}
          </p>
        </div>
        <div className="flex gap-2">
          {canReview ? (
            <Link
              href="/leave/management"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Management
            </Link>
          ) : null}
          {canCreate ? <LeaveCreateDialog leaveTypes={leaveTypes} /> : null}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Balances</CardTitle>
            <CardDescription>This year&apos;s leave balances.</CardDescription>
          </div>
          <Link
            href="/leave/balances"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No leave balances are configured yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {balances.map((balance) => (
                <div
                  key={balance.id}
                  className="rounded-lg border border-border p-4"
                >
                  <p className="text-sm font-semibold">
                    {balance.leaveTypeName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {balance.leaveTypeCode} · {balance.year}
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {formatDayCount(balance.available)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      available
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Used {formatDayCount(balance.used)} · Pending{" "}
                    {formatDayCount(balance.pending)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="leave-history-heading">
        <h2
          id="leave-history-heading"
          className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Leave requests
        </h2>
        {requests.length === 0 ? (
          <EmptyState
            title="No leave requests yet"
            description="Your leave requests will appear here."
          />
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
                      {request.leaveTypeName}
                    </TableCell>
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
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
