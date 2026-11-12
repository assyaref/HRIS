import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { RequestDetail } from "@/components/employee/request-detail";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  hasAnyPermission,
  requirePermission,
} from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { LeaveRequestActions } from "@/features/leave/leave-request-actions";
import {
  LEAVE_REQUEST_STATUS_LABELS,
  type LeaveRequestStatus,
} from "@/features/leave/constants";
import { formatDate, formatDayCount } from "@/features/leave/format";
import { getLeaveRequestDetail } from "@/features/leave/queries";

export const metadata: Metadata = {
  title: "Detail Pengajuan Cuti",
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
    <RequestDetail
      backHref={canReview ? "/leave/management" : "/leave"}
      title="Detail Pengajuan Cuti"
      subtitle={`${request.employeeName} · ${request.employeeNumber}`}
      icon="plane"
      typeLabel={request.leaveTypeName}
      status={request.status}
      statusLabel={
        LEAVE_REQUEST_STATUS_LABELS[request.status as LeaveRequestStatus] ?? request.status
      }
      rows={[
        {
          label: "Periode",
          value: `${formatDate(request.startDate)} – ${formatDate(request.endDate)}`,
        },
        { label: "Durasi", value: formatDayCount(request.totalDays) },
        { label: "Alasan", value: request.reason || "—" },
        ...(request.reviewerNote
          ? [{ label: "Catatan peninjau", value: request.reviewerNote }]
          : []),
      ]}
      reviewedAt={request.reviewedAt}
      actions={
        statusPending ? (
          <LeaveRequestActions
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
