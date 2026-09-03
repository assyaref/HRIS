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
import {
  hasAnyPermission,
  requirePermission,
} from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { PermissionCreateDialog } from "@/features/permission/permission-create-dialog";
import {
  PERMISSION_REQUEST_STATUS_LABELS,
  PERMISSION_TYPE_LABELS,
  type PermissionRequestStatus,
} from "@/features/permission/constants";
import { formatDateTime } from "@/features/permission/format";
import { listMyPermissionRequests } from "@/features/permission/queries";

export const metadata: Metadata = {
  title: "Permission",
};

function statusBadge(status: PermissionRequestStatus) {
  const label = PERMISSION_REQUEST_STATUS_LABELS[status] ?? status;
  if (status === "approved") return <Badge variant="primary">{label}</Badge>;
  if (status === "rejected") return <Badge variant="destructive">{label}</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

/** Employee permission-request hub (self-service). */
export default async function PermissionPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PERMISSION_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const employee = await getEmployeeByUserId(user.id, organizationId);
  if (!employee) {
    return (
      <EmptyState
        title="No employee profile linked"
        description="Your account is not linked to an employee record."
      />
    );
  }

  const canReview = await hasAnyPermission(user.id, [
    PERMISSIONS.PERMISSION_APPROVE,
    PERMISSIONS.PERMISSION_MANAGE,
  ]);
  const canCreate = await hasAnyPermission(user.id, [
    PERMISSIONS.PERMISSION_CREATE,
    PERMISSIONS.PERMISSION_MANAGE,
  ]);

  const requests = await listMyPermissionRequests(
    organizationId,
    employee.id
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Permission requests
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {employee.firstName} {employee.lastName}
          </p>
        </div>
        <div className="flex gap-2">
          {canReview ? (
            <Link
              href="/permission/management"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Management
            </Link>
          ) : null}
          {canCreate ? <PermissionCreateDialog /> : null}
        </div>
      </div>

      <section aria-labelledby="permission-history-heading">
        <h2
          id="permission-history-heading"
          className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Your requests
        </h2>
        {requests.length === 0 ? (
          <EmptyState
            title="No permission requests yet"
            description="Your permission requests will appear here."
          />
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
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
