import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { LeaveRequestActions } from "@/features/leave/leave-request-actions";
import { formatDate, formatDayCount } from "@/features/leave/format";
import { getLeaveRequestDetail } from "@/features/leave/queries";

export const metadata: Metadata = {
  title: "Leave request",
};

export default async function LeaveRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.LEAVE_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const detail = await getLeaveRequestDetail(organizationId, requestId);
  if (!detail) forbidden();

  const employee = await getEmployeeByUserId(user.id, organizationId);
  const isOwner = employee?.id === detail.request.employeeId;
  const canReview = await hasAnyPermission(user.id, [
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.LEAVE_MANAGE,
  ]);

  if (!isOwner && !canReview) {
    // Employees must not view another employee's request.
    forbidden();
  }

  const request = detail.request;
  const statusPending = request.status === "pending";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Leave request
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {request.employeeName} · {request.employeeNumber}
          </p>
        </div>
        <Link
          href={canReview ? "/leave/management" : "/leave"}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {request.leaveTypeName} · {formatDayCount(request.totalDays)}
          </CardTitle>
          <CardDescription>
            {formatDate(request.startDate)} → {formatDate(request.endDate)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="text-muted-foreground">Reason: </span>
            {request.reason}
          </p>
          <p>
            <span className="text-muted-foreground">Status: </span>
            <span className="capitalize">{request.status}</span>
          </p>
          {request.reviewerNote ? (
            <p>
              <span className="text-muted-foreground">Reviewer note: </span>
              {request.reviewerNote}
            </p>
          ) : null}
          {request.reviewedAt ? (
            <p className="text-xs text-muted-foreground">
              Reviewed at {request.reviewedAt.toISOString()}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {statusPending ? (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveRequestActions
              requestId={request.id}
              canCancel={isOwner}
              canReview={canReview && !isOwner}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Immutable request events.</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events.</p>
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono text-xs">
                        {event.eventType}
                      </TableCell>
                      <TableCell>{event.actorName ?? "—"}</TableCell>
                      <TableCell>{event.createdAt.toISOString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
