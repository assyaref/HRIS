import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { LeaveBalanceCard } from "@/components/employee/leave-balance-card";
import { SectionHeader } from "@/components/employee/section-header";
import { StatusBadge, statusTone } from "@/components/employee/status-badge";
import { TabNav } from "@/components/employee/tab-nav";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { HrisIcon } from "@/components/layout/icons";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasAnyPermission, requirePermission } from "@/lib/auth/rbac";

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
  title: "Cuti",
};

type LeaveTab = "ajukan" | "riwayat" | "saldo";

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Employee leave hub: own balances, own requests, create + history. */
export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.LEAVE_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const params = await searchParams;
  const tabParam = readParam(params.tab);
  const tab: LeaveTab =
    tabParam === "riwayat" || tabParam === "saldo" ? tabParam : "ajukan";

  const employee = await getEmployeeByUserId(user.id, organizationId);
  if (!employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[#172554]">
          Cuti
        </h1>
        <EmployeeEmptyState
          icon="profile"
          title="Profil karyawan belum tertaut"
          description="Akun Anda belum ditautkan ke data karyawan, sehingga pengajuan cuti tidak tersedia."
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

  const currentYear = String(new Date().getFullYear());
  const annualBalances = balances.filter((b) => b.year === currentYear);
  const availableTotal = annualBalances.reduce(
    (sum, b) => sum + b.available,
    0
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#172554]">
            Cuti
          </h1>
          <p className="mt-1 text-sm text-[#64748b]">
            {employee.firstName} {employee.lastName} · {availableTotal} hari
            tersedia
          </p>
        </div>
        {canReview ? (
          <Link
            href="/leave/management"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Management
          </Link>
        ) : null}
      </div>

      <TabNav
        items={[
          {
            key: "ajukan",
            label: "Ajukan Cuti",
            href: "/leave",
            active: tab === "ajukan",
          },
          {
            key: "riwayat",
            label: "Riwayat",
            href: "/leave?tab=riwayat",
            active: tab === "riwayat",
          },
          {
            key: "saldo",
            label: "Saldo Cuti",
            href: "/leave?tab=saldo",
            active: tab === "saldo",
          },
        ]}
      />

      {tab === "ajukan" ? (
        <div className="space-y-4">
          {annualBalances.length > 0 ? (
            <SectionHeader title="Saldo Cuti Tahunan" />
          ) : null}
          {annualBalances.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {annualBalances.map((balance) => (
                <LeaveBalanceCard
                  key={balance.id}
                  leaveTypeName={balance.leaveTypeName}
                  leaveTypeCode={balance.leaveTypeCode}
                  year={balance.year}
                  available={balance.available}
                  used={balance.used}
                  pending={balance.pending}
                  entitlement={balance.entitlement}
                />
              ))}
            </div>
          ) : null}

          <div className="emp-card flex flex-col items-center gap-3 p-6 text-center">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"
            >
              <HrisIcon name="leave" className="size-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#172554]">
                Ajukan cuti baru
              </p>
              <p className="mt-0.5 text-sm text-[#64748b]">
                Pilih jenis cuti, tanggal, dan alasan pengajuan Anda.
              </p>
            </div>
            {canCreate ? (
              <LeaveCreateDialog leaveTypes={leaveTypes} />
            ) : (
              <p className="text-sm text-[#94a3b8]">
                Anda tidak memiliki izin untuk mengajukan cuti.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {tab === "riwayat" ? (
        <div className="space-y-4">
          <SectionHeader title="Riwayat Pengajuan" />
          {requests.length === 0 ? (
            <EmployeeEmptyState
              icon="calendar"
              title="Belum ada pengajuan"
              description="Pengajuan cuti Anda akan tampil di sini."
            />
          ) : (
            <div className="emp-card divide-y divide-slate-100">
              {requests.map((request) => (
                <Link
                  key={request.id}
                  href={`/leave/${request.id}`}
                  className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#172554]">
                      {request.leaveTypeName}
                    </p>
                    <p className="text-xs text-[#64748b]">
                      {formatDate(request.startDate)} →{" "}
                      {formatDate(request.endDate)} ·{" "}
                      {formatDayCount(request.totalDays)}
                    </p>
                  </div>
                  <StatusBadge
                    tone={statusTone(request.status)}
                  >
                    {LEAVE_REQUEST_STATUS_LABELS[
                      request.status as LeaveRequestStatus
                    ] ?? request.status}
                  </StatusBadge>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "saldo" ? (
        <div className="space-y-4">
          <SectionHeader
            title="Saldo Cuti"
            description={`Tahun ${currentYear}`}
          />
          {balances.length === 0 ? (
            <EmployeeEmptyState
              icon="leave"
              title="Belum ada saldo cuti"
              description="Saldo cuti Anda akan tampil di sini setelah dikonfigurasi HR."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {balances.map((balance) => (
                <LeaveBalanceCard
                  key={balance.id}
                  leaveTypeName={balance.leaveTypeName}
                  leaveTypeCode={balance.leaveTypeCode}
                  year={balance.year}
                  available={balance.available}
                  used={balance.used}
                  pending={balance.pending}
                  entitlement={balance.entitlement}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
