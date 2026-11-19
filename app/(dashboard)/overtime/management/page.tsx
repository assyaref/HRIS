import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { HrisIcon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { hasPermission, requireAnyPermission } from "@/lib/auth/rbac";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { payrollComponents } from "@/db/schema";

import { listActiveEmployeeOptions } from "@/features/compliance/records.queries";
import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { dateParam, monthRange, textParam, todayKey } from "@/features/reference-shared";
import { isTimeModuleReady, TIME_GUIDE, TIME_MIGRATION } from "@/features/time/module";
import { listOvertime, OVERTIME_LIST_LIMIT } from "@/features/time/queries";
import {
  formatDuration,
  OVERTIME_STATUS_BADGE,
  OVERTIME_STATUS_LABELS,
  summarizeOvertime,
} from "@/features/time/rules";
import { OVERTIME_COMPONENT_CODE, weightedHours } from "@/features/time/overtime-pay";
import { loadApprovedOvertime } from "@/features/time/overtime-payroll.queries";
import {
  OvertimeComponentSetupButton,
  OvertimeCreateButton,
  OvertimeReviewActions,
} from "@/features/time/time-forms";

export const metadata: Metadata = { title: "Kelola Lembur" };

const STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

/**
 * Overtime administration: every request in a date window with totals,
 * approve / reject pending ones, and record SPKL overtime for an employee.
 * attendance.approve or attendance.manage; recording needs manage.
 */
export default async function OvertimeManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requireAnyPermission(user.id, [PERMISSIONS.ATTENDANCE_APPROVE, PERMISSIONS.ATTENDANCE_MANAGE]);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isTimeModuleReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kelola Lembur" description="Persetujuan dan rekap lembur karyawan." />
        <ModuleNotReady module="Lembur" migration={TIME_MIGRATION} guide={TIME_GUIDE} />
      </div>
    );
  }

  const [canManage, canPayroll] = await Promise.all([
    hasPermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE),
    hasPermission(user.id, PERMISSIONS.PAYROLL_MANAGE),
  ]);
  const params = await searchParams;
  const today = todayKey();
  const month = monthRange(today);
  const from = dateParam(params.from, month.from);
  const to = dateParam(params.to, month.to);
  const statusParam = textParam(params.status) ?? "";
  const status = (STATUSES as readonly string[]).includes(statusParam) ? statusParam : "";
  const q = textParam(params.q)?.toLowerCase() ?? "";

  const [all, employees, approvedEntries, componentRows] = await Promise.all([
    listOvertime(organizationId, { from, to }),
    canManage ? listActiveEmployeeOptions(organizationId) : Promise.resolve([]),
    loadApprovedOvertime(db, organizationId, from, to),
    db
      .select({ active: payrollComponents.active, type: payrollComponents.type, method: payrollComponents.calculationMethod })
      .from(payrollComponents)
      .where(and(eq(payrollComponents.organizationId, organizationId), sql`upper(${payrollComponents.code}) = ${OVERTIME_COMPONENT_CODE}`))
      .limit(1),
  ]);
  // Weighted ("terhitung") hours per approved request: Kepmenaker multipliers.
  const weightedById = new Map<string, number>();
  for (const list of approvedEntries.values()) {
    for (const entry of list) if (entry.requestId) weightedById.set(entry.requestId, weightedHours(entry));
  }
  const component = componentRows[0];
  const componentReady = Boolean(component && component.active === "true" && component.type === "earning");
  const searched = q
    ? all.filter((r) => r.employeeName.toLowerCase().includes(q) || r.employeeNumber.toLowerCase().includes(q))
    : all;
  const summary = summarizeOvertime(searched);
  const rows = status ? searched.filter((r) => r.status === status) : searched;

  // Top approved overtime per employee in the window.
  const perEmployee = new Map<string, { name: string; minutes: number }>();
  for (const r of searched) {
    if (r.status !== "approved") continue;
    const entry = perEmployee.get(r.employeeId) ?? { name: r.employeeName, minutes: 0 };
    entry.minutes += r.totalMinutes;
    perEmployee.set(r.employeeId, entry);
  }
  const top = [...perEmployee.entries()].sort((a, b) => b[1].minutes - a[1].minutes).slice(0, 5);
  const topMax = top[0]?.[1].minutes ?? 1;

  const href = (next: { status?: string }) => {
    const query = new URLSearchParams({ from, to });
    if (q) query.set("q", q);
    const s = next.status ?? status;
    if (s) query.set("status", s);
    return `/overtime/management?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kelola Lembur"
        description="Tinjau pengajuan lembur (SPKL), pantau total jam lembur, dan catat lembur atas nama karyawan."
        actions={
          canManage ? (
            <OvertimeCreateButton
              employees={employees.map(({ id, employeeNumber, name }) => ({ id, employeeNumber, name }))}
              defaultDate={today}
            />
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="clipboard" label="Pengajuan" value={summary.total} hint="Dalam rentang tanggal" tone="blue" />
        <StatCard icon="clock" label="Menunggu" value={summary.pending} hint="Perlu keputusan" tone="amber" />
        <StatCard icon="check" label="Disetujui" value={summary.approved} hint="Pengajuan" tone="green" />
        <StatCard icon="trend-up" label="Total jam lembur" value={formatDuration(summary.approvedMinutes)} hint="Yang disetujui" tone="rose" />
      </div>

      <form
        action="/overtime/management"
        method="get"
        className="hris-card grid gap-3 rounded-[20px] border bg-card p-4 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end"
      >
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="space-y-2">
          <Label htmlFor="ot-from">Tanggal lembur dari</Label>
          <Input id="ot-from" type="date" name="from" defaultValue={from} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ot-to">Sampai</Label>
          <Input id="ot-to" type="date" name="to" defaultValue={to} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ot-q">Karyawan</Label>
          <Input id="ot-q" name="q" defaultValue={q} placeholder="Nama atau nomor" />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          <HrisIcon name="search" className="size-4" />
          Terapkan
        </button>
      </form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <StatusTabs
            active={status}
            buildHref={(value) => href({ status: value })}
            tabs={[
              { value: "", label: "Semua", count: summary.total },
              { value: "pending", label: "Menunggu", count: summary.pending, tone: "#F59E0B" },
              { value: "approved", label: "Disetujui", count: summary.approved, tone: "#22C55E" },
              { value: "rejected", label: "Ditolak", count: summary.rejected, tone: "#EF4444" },
              { value: "cancelled", label: "Dibatalkan", count: summary.cancelled, tone: "#94A3B8" },
            ]}
          />
          {rows.length === 0 ? (
            <EmptyState title="Tidak ada pengajuan lembur" description="Tidak ada data yang cocok dengan rentang tanggal dan filter ini." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Jam &amp; durasi</TableHead>
                  <TableHead>Terhitung</TableHead>
                  <TableHead>Uraian</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/employees/${r.employeeId}`} className="font-medium hover:text-primary">
                        {r.employeeName}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">{r.employeeNumber}</p>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{r.overtimeDate}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <span className="font-mono">
                        {r.startTime}–{r.endTime}
                      </span>
                      <p className="text-xs text-muted-foreground">{formatDuration(r.totalMinutes)}</p>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {weightedById.has(r.id) ? `${(Math.round(weightedById.get(r.id)! * 100) / 100).toLocaleString("id-ID")} j` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-sm">
                      <p className="line-clamp-2">{r.reason}</p>
                      {r.spklNumber ? <p className="text-xs text-muted-foreground">SPKL {r.spklNumber}</p> : null}
                      {r.reviewerNote && r.status !== "pending" ? (
                        <p className="text-xs text-muted-foreground">
                          {r.reviewerName ? `${r.reviewerName}: ` : ""}
                          {r.reviewerNote}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={OVERTIME_STATUS_BADGE[r.status] ?? "outline"}>
                        {OVERTIME_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.status === "pending" ? (
                        <OvertimeReviewActions id={r.id} employeeName={r.employeeName} />
                      ) : (
                        <span className="block text-right text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {all.length >= OVERTIME_LIST_LIMIT ? (
            <p className="text-sm text-muted-foreground">
              Menampilkan {OVERTIME_LIST_LIMIT} data terbaru. Persempit rentang tanggal untuk melihat lainnya.
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
        <section className="hris-card rounded-[20px] border bg-card p-5" aria-label="Integrasi payroll">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[17px] font-semibold">Integrasi payroll</h2>
            <Badge variant={componentReady ? "success" : "outline"}>{componentReady ? "Aktif" : "Belum aktif"}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {componentReady
              ? "Lembur yang disetujui otomatis dihitung ke komponen gaji LEMBUR saat periode payroll dihitung: upah/jam = 1/173 × gaji tetap, hari kerja ×1,5 lalu ×2, hari libur ×2/×3/×4."
              : component
                ? "Komponen LEMBUR ada tetapi nonaktif atau bukan pendapatan. Aktifkan di Komponen Gaji."
                : "Buat komponen gaji LEMBUR (pendapatan) agar lembur yang disetujui masuk ke payroll."}
          </p>
          {!component && canPayroll ? (
            <div className="mt-3">
              <OvertimeComponentSetupButton />
            </div>
          ) : null}
          {component && component.method !== "manual" ? (
            <p className="mt-2 text-xs text-[#B45309]">Saran: ubah metode komponen LEMBUR menjadi Manual.</p>
          ) : null}
        </section>
        <aside className="hris-card h-fit rounded-[20px] border bg-card p-5">
          <h2 className="text-[17px] font-semibold">Lembur terbanyak</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Jam lembur disetujui dalam rentang ini</p>
          {top.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada lembur yang disetujui.</p>
          ) : (
            <ol className="space-y-3">
              {top.map(([id, entry]) => (
                <li key={id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{entry.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatDuration(entry.minutes)}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.max(6, Math.round((entry.minutes / topMax) * 100))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
        </div>
      </div>
    </div>
  );
}
