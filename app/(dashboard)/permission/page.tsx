import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { SectionHeader } from "@/components/employee/section-header";
import { StatusBadge, type StatusTone } from "@/components/employee/status-badge";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { HrisIcon } from "@/components/layout/icons";
import { buttonVariants } from "@/components/ui/button";
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
  title: "Izin Kegiatan",
};

const PERMISSION_STATUS_TONES: Record<PermissionRequestStatus, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

/** Employee permission-request hub (self-service). */
export default async function PermissionPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PERMISSION_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const employee = await getEmployeeByUserId(user.id, organizationId);
  if (!employee) {
    return (
      <EmployeeEmptyState
        icon="profile"
        title="Profil karyawan belum tertaut"
        description="Akun Anda belum ditautkan ke data karyawan. Hubungi administrator."
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
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Izin Kegiatan
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

      <section aria-labelledby="permission-history-heading" className="space-y-3">
        <SectionHeader title="Riwayat Pengajuan" />
        <span id="permission-history-heading" className="sr-only">
          Riwayat pengajuan izin
        </span>
        {requests.length === 0 ? (
          <EmployeeEmptyState
            icon="clipboard"
            title="Belum ada pengajuan izin"
            description="Pengajuan izin Anda akan tampil di sini."
          />
        ) : (
          <div className="hris-card divide-y divide-border">
            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/permission/${request.id}`}
                className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-accent dark:hover:bg-muted/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="hris-chip-blue flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <HrisIcon name="clipboard" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {PERMISSION_TYPE_LABELS[
                        request.permissionType as keyof typeof PERMISSION_TYPE_LABELS
                      ] ?? request.permissionType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(request.startAt)} → {formatDateTime(request.endAt)}
                    </p>
                  </div>
                </div>
                <StatusBadge tone={PERMISSION_STATUS_TONES[request.status as PermissionRequestStatus] ?? "neutral"}>
                  {PERMISSION_REQUEST_STATUS_LABELS[request.status as PermissionRequestStatus] ??
                    request.status}
                </StatusBadge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
