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
import { hasAnyPermission, requirePermission } from "@/lib/auth/rbac";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { getEmployeeByUserId } from "@/features/employees/queries";
import { monthRange, todayKey } from "@/features/reference-shared";
import { isTimeModuleReady, TIME_GUIDE, TIME_MIGRATION } from "@/features/time/module";
import { listOvertime } from "@/features/time/queries";
import { formatDuration, OVERTIME_STATUS_LABELS, summarizeOvertime } from "@/features/time/rules";
import { OvertimeCancelButton, OvertimeSubmitButton } from "@/features/time/time-forms";

export const metadata: Metadata = { title: "Lembur" };

const TONES: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};
const dayLabel = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function shiftDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Employee overtime (SPKL) self-service: submit, track and cancel. */
export default async function OvertimePage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isTimeModuleReady())) {
    return (
      <div className="space-y-6">
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Lembur</h1>
        </div>
        <ModuleNotReady module="Lembur" migration={TIME_MIGRATION} guide={TIME_GUIDE} />
      </div>
    );
  }

  const employee = await getEmployeeByUserId(user.id, organizationId);
  const canReview = await hasAnyPermission(user.id, [PERMISSIONS.ATTENDANCE_APPROVE, PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!employee) {
    return (
      <div className="space-y-6">
        {canReview ? (
          <Link href="/overtime/management" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Kelola lembur
          </Link>
        ) : null}
        <EmployeeEmptyState
          icon="profile"
          title="Profil karyawan belum tertaut"
          description="Akun Anda belum ditautkan ke data karyawan. Hubungi administrator."
        />
      </div>
    );
  }

  const today = todayKey();
  const month = monthRange(today);
  const requests = await listOvertime(organizationId, {
    employeeId: employee.id,
    from: shiftDays(today, -365),
    to: shiftDays(today, 60),
  });
  const thisMonth = summarizeOvertime(requests.filter((r) => r.overtimeDate >= month.from && r.overtimeDate <= month.to));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Lembur</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {employee.firstName} {employee.lastName}
          </p>
        </div>
        <div className="flex gap-2">
          {canReview ? (
            <Link href="/overtime/management" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Manajemen
            </Link>
          ) : null}
          <OvertimeSubmitButton defaultDate={today} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="hris-card rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Disetujui bulan ini</p>
          <p className="mt-1 text-xl font-semibold">{formatDuration(thisMonth.approvedMinutes)}</p>
        </div>
        <div className="hris-card rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Menunggu</p>
          <p className="mt-1 text-xl font-semibold">{thisMonth.pending}</p>
        </div>
        <div className="hris-card rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Pengajuan bulan ini</p>
          <p className="mt-1 text-xl font-semibold">{thisMonth.total}</p>
        </div>
      </div>

      <section className="space-y-3">
        <SectionHeader title="Riwayat Lembur" />
        {requests.length === 0 ? (
          <EmployeeEmptyState
            icon="clock"
            title="Belum ada pengajuan lembur"
            description='Tekan "Ajukan lembur" setelah mendapat perintah kerja lembur.'
          />
        ) : (
          <ul className="hris-card divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="hris-chip-blue flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <HrisIcon name="clock" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {dayLabel.format(new Date(`${r.overtimeDate}T00:00:00Z`))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.startTime}–{r.endTime} · {formatDuration(r.totalMinutes)}
                      {r.spklNumber ? ` · SPKL ${r.spklNumber}` : ""}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{r.reason}</p>
                    {r.reviewerNote && r.status !== "pending" ? (
                      <p className="mt-1 text-xs text-muted-foreground">Catatan: {r.reviewerNote}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge tone={TONES[r.status] ?? "neutral"}>{OVERTIME_STATUS_LABELS[r.status] ?? r.status}</StatusBadge>
                  {r.status === "pending" ? <OvertimeCancelButton id={r.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
