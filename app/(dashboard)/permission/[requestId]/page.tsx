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
import { PermissionRequestActions } from "@/features/permission/permission-request-actions";
import {
  PERMISSION_TYPE_LABELS,
} from "@/features/permission/constants";
import { formatDateTime } from "@/features/permission/format";
import { getPermissionRequestDetail } from "@/features/permission/queries";

export const metadata: Metadata = {
  title: "Permission request",
};

export default async function PermissionRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PERMISSION_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const detail = await getPermissionRequestDetail(organizationId, requestId);
  if (!detail) forbidden();

  const employee = await getEmployeeByUserId(user.id, organizationId);
  const isOwner = employee?.id === detail.request.employeeId;
  const canReview = await hasAnyPermission(user.id, [
    PERMISSIONS.PERMISSION_APPROVE,
    PERMISSIONS.PERMISSION_MANAGE,
  ]);
  if (!isOwner && !canReview) forbidden();

  const request = detail.request;
  const statusPending = request.status === "pending";
  const typeLabel =
    PERMISSION_TYPE_LABELS[
      request.permissionType as keyof typeof PERMISSION_TYPE_LABELS
    ] ?? request.permissionType;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Permission request
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {request.employeeName} · {request.employeeNumber}
          </p>
        </div>
        <Link
          href={canReview ? "/permission/management" : "/permission"}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{typeLabel}</CardTitle>
          <CardDescription>
            {formatDateTime(request.startAt)} → {formatDateTime(request.endAt)}
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
            <PermissionRequestActions
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
