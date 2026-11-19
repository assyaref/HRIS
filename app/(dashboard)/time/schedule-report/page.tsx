import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { HrisIcon } from "@/components/layout/icons";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTabs } from "@/components/ui/status-tabs";
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
import { hasPermission, requirePermission } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/cn";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { textParam, todayKey } from "@/features/reference-shared";
import { isTimeModuleReady, TIME_GUIDE, TIME_MIGRATION } from "@/features/time/module";
import { listWorkGroups } from "@/features/time/queries";
import { formatDuration, isoWeekday, WEEKDAYS } from "@/features/time/rules";
import { DAY_KIND_LABELS, type DayKind, type DayResult } from "@/features/time/schedule";
import { parseScheduleParams } from "@/features/time/schedule-params";
import { buildScheduleReport } from "@/features/time/schedule.queries";

export const metadata: Metadata = { title: "Kepatuhan Jadwal" };

const CELL: Record<DayKind, { label: string; className: string }> = {
  present: { label: "H", className: "bg-[#DCFCE7] text-[#15803D] dark:bg-[#14301C] dark:text-[#86EFAC]" },
  absent: { label: "A", className: "bg-[#FEE2E2] text-[#B91C1C] dark:bg-[#3A1515] dark:text-[#FCA5A5]" },
  leave: { label: "C", className: "bg-[#EDE9FE] text-[#6D28D9] dark:bg-[#251E45] dark:text-[#C4B5FD]" },
  permission: { label: "I", className: "bg-[#E0F2FE] text-[#0369A1] dark:bg-[#0F2A3A] dark:text-[#7DD3FC]" },
  holiday: { label: "L", className: "bg-[#FFE4E6] text-[#E11D48] dark:bg-[#3A1520] dark:text-[#FDA4AF]" },
  off: { label: "·", className: "bg-muted text-muted-foreground" },
  not_employed: { label: "", className: "bg-transparent" },
  upcoming: { label: "", className: "bg-muted/50" },
};

function cellTitle(day: DayResult): string {
  const parts = [`${day.day}: ${DAY_KIND_LABELS[day.kind]}`];
  if (day.lateMinutes) parts.push(`terlambat ${formatDuration(day.lateMinutes)}`);
  if (day.earlyMinutes) parts.push(`pulang cepat ${formatDuration(day.earlyMinutes)}`);
  if (day.missingCheckOut) parts.push("tanpa absen pulang");
  if (day.extra) parts.push("masuk di luar jadwal");
  return parts.join(" · ");
}

function shiftMonth(month: string, delta: number): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const rate = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("id-ID")}%`);

/**
 * Shift-aware attendance: every work-group member's days compared with the
 * group's shift and the holiday calendar — late, early leave, absent on a
 * scheduled day, attendance on a day off. attendance.manage.
 */
export default async function ScheduleReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isTimeModuleReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kepatuhan Jadwal" description="Absensi dibandingkan dengan shift dan kalender libur." />
        <ModuleNotReady module="Kepatuhan Jadwal" migration={TIME_MIGRATION} guide={TIME_GUIDE} />
      </div>
    );
  }

  const params = await searchParams;
  const today = todayKey();
  const { from, to, graceMinutes, groupId } = parseScheduleParams(params, today);
  const view = textParam(params.view) === "matrix" ? "matrix" : "summary";
  const [report, groups, canExport] = await Promise.all([
    buildScheduleReport(organizationId, { from, to, today, graceMinutes, groupId }),
    listWorkGroups(organizationId),
    hasPermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE),
  ]);

  const totals = report.rows.reduce(
    (acc, r) => ({
      present: acc.present + r.summary.present,
      due: acc.due + r.summary.present + r.summary.absent + r.summary.leave + r.summary.permission,
      absent: acc.absent + r.summary.absent,
      late: acc.late + r.summary.late,
      lateMinutes: acc.lateMinutes + r.summary.lateMinutes,
      early: acc.early + r.summary.early,
      extra: acc.extra + r.summary.extra,
    }),
    { present: 0, due: 0, absent: 0, late: 0, lateMinutes: 0, early: 0, extra: 0 }
  );
  const overallRate = totals.due > 0 ? Math.round((totals.present / totals.due) * 1000) / 10 : null;
  const punctuality = totals.present > 0 ? Math.round(((totals.present - totals.late) / totals.present) * 1000) / 10 : null;

  const query = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ from, to, grace: String(graceMinutes) });
    if (groupId) q.set("group", groupId);
    if (view === "matrix") q.set("view", "matrix");
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "") q.delete(k);
      else q.set(k, v);
    }
    return q.toString();
  };
  const month = from.slice(0, 7);
  const monthHref = (m: string) => {
    const q = new URLSearchParams({ month: m, grace: String(graceMinutes) });
    if (groupId) q.set("group", groupId);
    if (view === "matrix") q.set("view", "matrix");
    return `/time/schedule-report?${q.toString()}`;
  };
  const sorted = [...report.rows].sort(
    (a, b) => b.summary.absent - a.summary.absent || b.summary.lateMinutes - a.summary.lateMinutes || a.name.localeCompare(b.name)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kepatuhan Jadwal"
        description={`Absensi anggota grup kerja dibandingkan dengan shift dan kalender libur. Terlambat dihitung setelah toleransi ${graceMinutes} menit.`}
        actions={
          canExport ? (
            <a href={`/api/reports/export?report=schedule&${query({})}`} className={buttonVariants({ variant: "outline" })}>
              <HrisIcon name="download" className="size-4" />
              Export Excel
            </a>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="check" label="Tingkat kehadiran" value={rate(overallRate)} hint={`${totals.present} dari ${totals.due} hari terjadwal`} tone="green" />
        <StatCard icon="clock" label="Tepat waktu" value={rate(punctuality)} hint={`${totals.late} kali terlambat · ${formatDuration(totals.lateMinutes)}`} tone="amber" />
        <StatCard icon="alert-triangle" label="Alpa" value={totals.absent} hint="Hari kerja tanpa absen / cuti / izin" tone="rose" />
        <StatCard icon="calendar" label="Masuk di luar jadwal" value={totals.extra} hint={`Hari libur / bukan hari kerja · ${totals.early} pulang cepat`} tone="blue" />
      </div>

      <form
        action="/time/schedule-report"
        method="get"
        className="hris-card grid gap-3 rounded-[20px] border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-end"
      >
        {view === "matrix" ? <input type="hidden" name="view" value="matrix" /> : null}
        <div className="space-y-2">
          <Label htmlFor="sr-from">Dari</Label>
          <Input id="sr-from" type="date" name="from" defaultValue={from} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sr-to">Sampai (maks. 62 hari)</Label>
          <Input id="sr-to" type="date" name="to" defaultValue={to} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sr-group">Grup kerja</Label>
          <NativeSelect id="sr-group" name="group" defaultValue={groupId ?? ""}>
            <option value="">Semua grup</option>
            {groups
              .filter((g) => g.active && g.shiftId)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sr-grace">Toleransi terlambat (menit)</Label>
          <Input id="sr-grace" type="number" min={0} max={120} name="grace" defaultValue={graceMinutes} />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          <HrisIcon name="search" className="size-4" />
          Terapkan
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusTabs
          label="Tampilan"
          active={view === "matrix" ? "matrix" : ""}
          buildHref={(value) => `/time/schedule-report?${query({ view: value || undefined })}`}
          tabs={[
            { value: "", label: "Ringkasan", count: report.rows.length },
            { value: "matrix", label: "Kalender harian", count: report.days.length },
          ]}
        />
        <div className="flex gap-1.5">
          <Link href={monthHref(shiftMonth(month, -1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Bulan sebelumnya">
            <HrisIcon name="chevron-left" className="size-4" />
          </Link>
          <Link href={monthHref(today.slice(0, 7))} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Bulan ini
          </Link>
          <Link href={monthHref(shiftMonth(month, 1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Bulan berikutnya">
            <HrisIcon name="chevron-right" className="size-4" />
          </Link>
        </div>
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          title="Belum ada karyawan terjadwal"
          description="Buat shift lalu masukkan karyawan ke grup kerja di menu Shift & Grup Kerja."
        />
      ) : view === "matrix" ? (
        <section className="hris-card overflow-x-auto rounded-[20px] border bg-card p-4">
          <table className="text-xs" aria-label="Kalender kehadiran per hari">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-semibold">Karyawan</th>
                {report.days.map((d) => (
                  <th key={d} className={cn("w-7 px-0.5 py-1 text-center font-medium", isoWeekday(d) >= 6 && "text-[#EF4444]")}>
                    <span className="block text-[9px] text-muted-foreground">{WEEKDAYS[isoWeekday(d) - 1]?.short}</span>
                    {Number(d.slice(8, 10))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="sticky left-0 z-10 max-w-[200px] truncate bg-card px-2 py-1 font-medium">
                    {r.name}
                    <span className="block text-[10px] font-normal text-muted-foreground">{r.groupName}</span>
                  </td>
                  {r.days.map((d) => (
                    <td key={d.day} className="p-0.5">
                      <span
                        title={cellTitle(d)}
                        className={cn(
                          "relative flex size-6 items-center justify-center rounded-md text-[11px] font-semibold",
                          CELL[d.kind].className,
                          d.extra && "ring-2 ring-[#3B82F6]"
                        )}
                      >
                        {d.kind === "present" && d.lateMinutes ? "T" : CELL[d.kind].label}
                        {d.earlyMinutes || d.missingCheckOut ? (
                          <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-[#F59E0B]" />
                        ) : null}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            H hadir · T terlambat · A alpa · C cuti · I izin · L libur · · bukan hari kerja · titik oranye: pulang cepat / tanpa absen
            pulang · bingkai biru: masuk di luar jadwal. Arahkan kursor ke kotak untuk detail.
          </p>
        </section>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead className="text-right">Terjadwal</TableHead>
              <TableHead className="text-right">Hadir</TableHead>
              <TableHead className="text-right">Alpa</TableHead>
              <TableHead className="text-right">Cuti / Izin</TableHead>
              <TableHead>Terlambat</TableHead>
              <TableHead>Pulang cepat</TableHead>
              <TableHead className="text-right">Di luar jadwal</TableHead>
              <TableHead className="text-right">Kehadiran</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell>
                  <Link href={`/attendance/recap/${r.employeeId}?startDate=${from}&endDate=${to}`} className="font-medium hover:text-primary">
                    {r.name}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{r.employeeNumber}</p>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: r.shiftColor }} />
                    {r.shiftName}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {r.groupName} · {r.shiftHours}
                  </p>
                </TableCell>
                <TableCell className="text-right text-sm">{r.summary.scheduled}</TableCell>
                <TableCell className="text-right text-sm">{r.summary.present}</TableCell>
                <TableCell className={cn("text-right text-sm", r.summary.absent > 0 && "font-semibold text-[#DC2626]")}>
                  {r.summary.absent}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {r.summary.leave} / {r.summary.permission}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {r.summary.late > 0 ? (
                    <span className="font-semibold text-[#D97706]">
                      {r.summary.late}× · {formatDuration(r.summary.lateMinutes)}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {r.summary.early > 0 ? `${r.summary.early}× · ${formatDuration(r.summary.earlyMinutes)}` : "—"}
                  {r.summary.missingCheckOut > 0 ? (
                    <p className="text-xs text-muted-foreground">{r.summary.missingCheckOut} tanpa absen pulang</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right text-sm">{r.summary.extra || "—"}</TableCell>
                <TableCell className="text-right text-sm font-semibold">{rate(r.summary.attendanceRate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {report.unscheduled > 0 ? (
        <p className="text-sm text-muted-foreground">
          {report.unscheduled} karyawan aktif belum masuk grup kerja ber-shift, sehingga tidak dinilai di sini.{" "}
          <Link href="/time/shifts?tab=groups" className="font-medium text-primary hover:underline">
            Atur grup kerja
          </Link>
        </p>
      ) : null}
    </div>
  );
}
