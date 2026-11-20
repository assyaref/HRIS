import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { formatDayCount } from "@/features/leave/format";
import { listLeaveBalances } from "@/features/leave/queries";

export const metadata: Metadata = {
  title: "Saldo cuti",
};

/** Employee leave balances (self-service). */
export default async function LeaveBalancesPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.LEAVE_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const employee = await getEmployeeByUserId(user.id, organizationId);
  if (!employee) {
    return (
      <EmptyState
        title="Profil karyawan belum tertaut"
        description="Akun Anda belum tertaut ke data karyawan."
      />
    );
  }

  const balances = await listLeaveBalances(organizationId, employee.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Saldo Cuti
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {employee.firstName} {employee.lastName} · {employee.employeeNumber}
          </p>
        </div>
        <Link
          href="/leave"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Kembali ke cuti
        </Link>
      </div>

      {balances.length === 0 ? (
        <EmptyState
          title="Belum ada saldo"
          description="Saldo cuti untuk akun Anda belum dikonfigurasi."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {balances.map((balance) => (
            <div
              key={balance.id}
              className="rounded-lg border border-border bg-card p-5"
            >
              <p className="font-semibold">{balance.leaveTypeName}</p>
              <p className="text-xs text-muted-foreground">
                {balance.leaveTypeCode} · Year {balance.year}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Jatah</dt>
                  <dd>{formatDayCount(balance.entitlement)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Terpakai</dt>
                  <dd>{formatDayCount(balance.used)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Menunggu</dt>
                  <dd>{formatDayCount(balance.pending)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Penyesuaian</dt>
                  <dd>{formatDayCount(balance.adjustment)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <dt className="font-medium">Tersedia</dt>
                  <dd className="font-semibold">
                    {formatDayCount(balance.available)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
