import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { formatRequestTimestamp, RequestDetail } from "@/components/employee/request-detail";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  hasAnyPermission,
  requirePermission,
} from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { PermissionRequestActions } from "@/features/permission/permission-request-actions";
import {
  PERMISSION_REQUEST_STATUS_LABELS,
  PERMISSION_TYPE_LABELS,
  type PermissionRequestStatus,
} from "@/features/permission/constants";
import { getPermissionRequestDetail } from "@/features/permission/queries";

export const metadata: Metadata = {
  title: "Detail Pengajuan Izin",
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
    <RequestDetail
      backHref={canReview ? "/permission/management" : "/permission"}
      title="Detail Pengajuan Izin"
      subtitle={`${request.employeeName} · ${request.employeeNumber}`}
      icon="clipboard"
      typeLabel={typeLabel}
      status={request.status}
      statusLabel={
        PERMISSION_REQUEST_STATUS_LABELS[request.status as PermissionRequestStatus] ??
        request.status
      }
      rows={[
        { label: "Mulai", value: formatRequestTimestamp(request.startAt) },
        { label: "Selesai", value: formatRequestTimestamp(request.endAt) },
        { label: "Alasan", value: request.reason || "—" },
        ...(request.reviewerNote
          ? [{ label: "Catatan peninjau", value: request.reviewerNote }]
          : []),
      ]}
      reviewedAt={request.reviewedAt}
      actions={
        statusPending ? (
          <PermissionRequestActions
            requestId={request.id}
            canCancel={isOwner}
            canReview={canReview && !isOwner}
          />
        ) : null
      }
      events={detail.events}
    />
  );
}
