import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { HrisIcon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTabs } from "@/components/ui/status-tabs";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requireAnyPermission } from "@/lib/auth/rbac";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { textParam, todayKey } from "@/features/reference-shared";
import { isTimesheetModuleReady, TIMESHEET_GUIDE, TIMESHEET_MIGRATION } from "@/features/timesheets/module";
import { listWeekEntries } from "@/features/timesheets/queries";
import {
  hhmm,
  isoWeek,
  shiftWeek,
  STATUS_BADGE,
  STATUS_LABELS,
  weekLabel,
  weekParam,
  weekStatus,
} from "@/features/timesheets/rules";
import { ReviewWeekActions } from "@/features/timesheets/timesheet-forms";

export const metadata: Metadata = { title: "Kelola Timesheet" };

const dayShort = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Timesheets of one ISO week grouped per employee: totals, hours per
 * project, entries, and approve / reject for submitted weeks.
 * attendance.approve or attendance.manage.
 */
export default async function TimesheetManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requireAnyPermission(user.id, [PERMISSIONS.ATTENDANCE_APPROVE, PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isTimesheetModuleReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kelola Timesheet" description="Persetujuan dan rekap jam kerja per proyek." />
        <ModuleNotReady module="Timesheet" migration={TIMESHEET_MIGRATION} guide={TIMESHEET_GUIDE} />
      </div>
    );
  }

  const params = await searchParams;
  const today = todayKey();
  const week = weekParam(params.week, today);
  const statusParam = textParam(params.status) ?? "";
  const canExport = await hasPermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE);
  const entries = await listWeekEntries(organizationId, week);

  const groups = new Map<string, { employeeId: string; name: string; number: string; entries: typeof entries }>();
  for (const e of entries) {
    const g = groups.get(e.employeeId) ?? { employeeId: e.employeeId, name: e.employeeName, number: e.employeeNumber, entries: [] };
    g.entries.push(e);
    groups.set(e.employeeId, g);
  }
  const sheets = [...groups.values()].map((g) => {
    const byProject = new Map<string, number>();
    for (const e of g.entries) byProject.set(e.projectName ?? "Internal", (byProject.get(e.projectName ?? "Internal") ?? 0) + e.minutes);
    return {
      ...g,
      status: weekStatus(g.entries.map((e) => e.status)),
      minutes: g.entries.reduce((s, e) => s + e.minutes, 0),
      byProject: [...byProject.entries()].sort((a, b) => b[1] - a[1]),
      reviewerNote: g.entries.find((e) => e.reviewerNote)?.reviewerNote ?? null,
    };
  });
  const order: Record<string, number> = { submitted: 0, rejected: 1, draft: 2, approved: 3, empty: 4 };
  sheets.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const count = (s: string) => sheets.filter((x) => x.status === s).length;
  const shown = statusParam ? sheets.filter((s) => s.status === statusParam) : sheets;
  const totalMinutes = sheets.reduce((s, x) => s + x.minutes, 0);
  const projectTotals = new Map<string, number>();
  for (const s of sheets) for (const [p, m] of s.byProject) projectTotals.set(p, (projectTotals.get(p) ?? 0) + m);
  const topProjects = [...projectTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topMax = topProjects[0]?.[1] ?? 1;

  const href = (next: { week?: string; status?: string }) => {
    const q = new URLSearchParams({ week: next.week ?? week });
    const s = next.status ?? statusParam;
    if (s) q.set("status", s);
    return `/timesheet/management?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kelola Timesheet"
        description="Jam kerja karyawan per proyek, diajukan per minggu. Tinjau dan setujui timesheet yang diajukan."
        actions={
          canExport ? (
            <a href={`/api/reports/export?report=timesheet&week=${week}`} className={buttonVariants({ variant: "outline" })}>
              <HrisIcon name="download" className="size-4" />
              Export Excel
            </a>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href({ week: shiftWeek(week, -1) })} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Minggu sebelumnya">
            <HrisIcon name="chevron-left" className="size-4" />
          </Link>
          <div className="min-w-[180px] text-center">
            <p className="text-sm font-semibold">Minggu {isoWeek(week).week}</p>
            <p className="text-xs text-muted-foreground">{weekLabel(week)}</p>
          </div>
          <Link href={href({ week: shiftWeek(week, 1) })} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Minggu berikutnya">
            <HrisIcon name="chevron-right" className="size-4" />
          </Link>
          <Link href="/timesheet/management" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Minggu ini
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="clock" label="Menunggu persetujuan" value={count("submitted")} hint="Timesheet diajukan" tone="amber" />
        <StatCard icon="check" label="Disetujui" value={count("approved")} hint="Minggu ini" tone="green" />
        <StatCard icon="user" label="Karyawan mengisi" value={sheets.length} hint={`${count("draft")} masih draf`} tone="blue" />
        <StatCard icon="trend-up" label="Total jam" value={hhmm(totalMinutes)} hint="Semua entri minggu ini" tone="rose" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <StatusTabs
            active={statusParam}
            buildHref={(value) => href({ status: value })}
            tabs={[
              { value: "", label: "Semua", count: sheets.length },
              { value: "submitted", label: "Diajukan", count: count("submitted"), tone: "#F59E0B" },
              { value: "approved", label: "Disetujui", count: count("approved"), tone: "#22C55E" },
              { value: "rejected", label: "Ditolak", count: count("rejected"), tone: "#EF4444" },
              { value: "draft", label: "Draf", count: count("draft"), tone: "#94A3B8" },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyState title="Tidak ada timesheet" description="Belum ada entri timesheet yang cocok untuk minggu ini." />
          ) : (
            shown.map((s) => (
              <section key={s.employeeId} className="hris-card rounded-[20px] border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/employees/${s.employeeId}`} className="font-semibold hover:text-primary">
                      {s.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{s.number}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold">{hhmm(s.minutes)} jam</span>
                    <Badge variant={STATUS_BADGE[s.status] ?? "outline"}>{STATUS_LABELS[s.status] ?? s.status}</Badge>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.byProject.map(([p, m]) => (
                    <span key={p} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                      {p}: <span className="font-semibold">{hhmm(m)}</span>
                    </span>
                  ))}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-primary">{s.entries.length} entri</summary>
                  <ul className="mt-2 divide-y divide-border rounded-xl border border-[var(--card-border)]">
                    {s.entries.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium">{e.task}</span>
                          <span className="block text-xs text-muted-foreground capitalize">
                            {dayShort.format(new Date(`${e.workDate}T00:00:00Z`))} · {e.projectName ?? "Internal"}
                            {e.notes ? ` · ${e.notes}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono">{hhmm(e.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                {s.reviewerNote && s.status === "rejected" ? <p className="mt-2 text-sm text-destructive">Ditolak: {s.reviewerNote}</p> : null}
                {s.status === "submitted" ? (
                  <div className="mt-3 border-t border-[var(--card-border)] pt-3">
                    <ReviewWeekActions employeeId={s.employeeId} weekStart={week} employeeName={s.name} />
                  </div>
                ) : null}
              </section>
            ))
          )}
        </div>
        <aside className="hris-card h-fit rounded-[20px] border bg-card p-5">
          <h2 className="text-[17px] font-semibold">Jam per proyek</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Semua entri minggu ini</p>
          {topProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada data.</p>
          ) : (
            <ol className="space-y-3">
              {topProjects.map(([p, m]) => (
                <li key={p}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{p}</span>
                    <span className="shrink-0 text-muted-foreground">{hhmm(m)}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(6, Math.round((m / topMax) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
