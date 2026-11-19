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
import { cn } from "@/lib/utils/cn";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { getEmployeeByUserId } from "@/features/employees/queries";
import { todayKey } from "@/features/reference-shared";
import { isTimesheetModuleReady, TIMESHEET_GUIDE, TIMESHEET_MIGRATION } from "@/features/timesheets/module";
import { listBookableProjects, listWeekEntries } from "@/features/timesheets/queries";
import {
  hhmm,
  isEditable,
  isoWeek,
  shiftWeek,
  STATUS_LABELS,
  weekDays,
  weekLabel,
  weekParam,
  weekStartOf,
  weekStatus,
} from "@/features/timesheets/rules";
import { EntryCreateButton, EntryRowActions, SubmitWeekButton } from "@/features/timesheets/timesheet-forms";

export const metadata: Metadata = { title: "Timesheet" };

const TONES: Record<string, StatusTone> = {
  empty: "neutral",
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
};
const dayLabel = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

/** Employee timesheet: one ISO week, entries per day, submit the week. */
export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isTimesheetModuleReady())) {
    return (
      <div className="space-y-6">
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Timesheet</h1>
        </div>
        <ModuleNotReady module="Timesheet" migration={TIMESHEET_MIGRATION} guide={TIMESHEET_GUIDE} />
      </div>
    );
  }

  const [employee, canReview] = await Promise.all([
    getEmployeeByUserId(user.id, organizationId),
    hasAnyPermission(user.id, [PERMISSIONS.ATTENDANCE_APPROVE, PERMISSIONS.ATTENDANCE_MANAGE]),
  ]);
  const manageLink = canReview ? (
    <Link href="/timesheet/management" className={buttonVariants({ variant: "outline", size: "sm" })}>
      Management
    </Link>
  ) : null;
  if (!employee) {
    return (
      <div className="space-y-6">
        {manageLink}
        <EmployeeEmptyState icon="profile" title="Profil karyawan belum tertaut" description="Akun Anda belum ditautkan ke data karyawan. Hubungi administrator." />
      </div>
    );
  }

  const params = await searchParams;
  const today = todayKey();
  const week = weekParam(params.week, today);
  const [entries, projects] = await Promise.all([
    listWeekEntries(organizationId, week, employee.id),
    listBookableProjects(organizationId, employee.id),
  ]);
  const status = weekStatus(entries.map((e) => e.status));
  const editable = status === "empty" || isEditable(status);
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const { week: weekNo } = isoWeek(week);
  const rejected = entries.find((e) => e.status === "rejected" && e.reviewerNote);
  const days = weekDays(week);
  const isCurrent = week === weekStartOf(today);
  const projectChoices = projects.map(({ id, code, name }) => ({ id, code, name }));
  const draftMinutes = entries.filter((e) => isEditable(e.status)).reduce((s, e) => s + e.minutes, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Timesheet</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {employee.firstName} {employee.lastName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manageLink}
          <EntryCreateButton projects={projectChoices} defaultDate={isCurrent ? today : days[0]} maxDate={today} disabled={!editable || days[0] > today} />
        </div>
      </div>

      <div className="hris-card flex items-center justify-between gap-2 rounded-2xl p-3">
        <Link href={`/timesheet?week=${shiftWeek(week, -1)}`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label="Minggu sebelumnya">
          <HrisIcon name="chevron-left" className="size-4" />
        </Link>
        <div className="text-center">
          <p className="text-sm font-semibold">Minggu {weekNo}</p>
          <p className="text-xs text-muted-foreground">{weekLabel(week)}</p>
        </div>
        <Link
          href={`/timesheet?week=${shiftWeek(week, 1)}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), shiftWeek(week, 1) > today && "pointer-events-none opacity-40")}
          aria-label="Minggu berikutnya"
        >
          <HrisIcon name="chevron-right" className="size-4" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="hris-card rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Total minggu ini</p>
          <p className="mt-1 text-xl font-semibold">{hhmm(total)}</p>
        </div>
        <div className="hris-card rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Entri</p>
          <p className="mt-1 text-xl font-semibold">{entries.length}</p>
        </div>
        <div className="hris-card flex flex-col justify-between rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <StatusBadge tone={TONES[status]} className="mt-1 w-fit">
            {status === "empty" ? "Belum diisi" : STATUS_LABELS[status]}
          </StatusBadge>
        </div>
      </div>

      {rejected ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-semibold text-destructive">Ditolak:</span> {rejected.reviewerNote} — perbaiki entri lalu ajukan ulang.
        </p>
      ) : null}

      <section className="space-y-3">
        <SectionHeader title="Rincian per hari" />
        {entries.length === 0 ? (
          <EmployeeEmptyState icon="clock" title="Belum ada entri" description='Tekan "Catat jam kerja" untuk mengisi pekerjaan Anda di minggu ini.' />
        ) : (
          <div className="space-y-3">
            {days.map((day) => {
              const list = entries.filter((e) => e.workDate === day);
              if (list.length === 0) return null;
              const dayTotal = list.reduce((s, e) => s + e.minutes, 0);
              return (
                <div key={day} className="hris-card rounded-2xl">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <p className="text-sm font-semibold capitalize">{dayLabel.format(new Date(`${day}T00:00:00Z`))}</p>
                    <p className="text-sm font-semibold">{hhmm(dayTotal)}</p>
                  </div>
                  <ul className="divide-y divide-border">
                    {list.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium break-words">{e.task}</p>
                          <p className="text-xs text-muted-foreground">
                            {e.projectName ?? "Internal"} · {hhmm(e.minutes)} jam
                          </p>
                          {e.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{e.notes}</p> : null}
                        </div>
                        {isEditable(e.status) ? (
                          <EntryRowActions
                            entry={{ id: e.id, workDate: e.workDate, projectId: e.projectId, task: e.task, minutes: e.minutes, notes: e.notes }}
                            projects={projectChoices}
                            maxDate={today}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editable && draftMinutes > 0 ? (
        <div className="flex justify-end">
          <SubmitWeekButton weekStart={week} hours={hhmm(draftMinutes)} />
        </div>
      ) : null}
    </div>
  );
}
