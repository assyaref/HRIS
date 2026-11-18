import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { RingLegend, SegmentRing } from "@/components/dashboard/segment-ring";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
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
import { requirePermission } from "@/lib/auth/rbac";

import { LEAVE_REPORT_LIMIT, listLeaveReport } from "@/features/reports/queries";
import { ReportFilter } from "@/features/reports/report-filter";
import { dateParam, monthRange, textParam, todayKey } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Laporan Cuti" };

const STATUS: Record<string, { label: string; badge: "warning" | "success" | "danger" | "outline"; color: string }> = {
  pending: { label: "Menunggu", badge: "warning", color: "#F59E0B" },
  approved: { label: "Disetujui", badge: "success", color: "#22C55E" },
  rejected: { label: "Ditolak", badge: "danger", color: "#EF4444" },
  cancelled: { label: "Dibatalkan", badge: "outline", color: "#94A3B8" },
};
const TYPE_COLORS = ["#3B82F6", "#8B5CF6", "#14B8A6", "#F97316", "#EC4899", "#64748B"];

/** Leave report for a date range: totals per status and type, Excel export. */
export default async function LeaveReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.REPORTS_VIEW);
  if (!user.organizationId) forbidden();

  const params = await searchParams;
  const month = monthRange(todayKey());
  const from = dateParam(params.from, month.from);
  const to = dateParam(params.to, month.to);
  const statusParam = textParam(params.status);
  const status = statusParam && STATUS[statusParam] ? statusParam : "";

  const rows = await listLeaveReport(user.organizationId, { from, to, status: status || undefined });
  const approvedDays = rows
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + r.totalDays, 0);
  const byType = new Map<string, number>();
  for (const row of rows) byType.set(row.leaveType, (byType.get(row.leaveType) ?? 0) + 1);
  const typeSlices = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({ label, value, color: TYPE_COLORS[index % TYPE_COLORS.length] }));
  const statusSlices = Object.entries(STATUS).map(([key, s]) => ({
    label: s.label,
    value: rows.filter((r) => r.status === key).length,
    color: s.color,
  }));

  const exportQuery = new URLSearchParams({ report: "leave", from, to });
  if (status) exportQuery.set("status", status);

  return (
    <div className="space-y-6">
      <PageHeader title="Laporan Cuti" description="Pengajuan cuti yang beririsan dengan periode yang dipilih." />
      <ReportFilter action="/reports/leave" from={from} to={to} exportHref={`/api/reports/export?${exportQuery.toString()}`}>
        <div className="space-y-2">
          <Label htmlFor="lr-status">Status</Label>
          <NativeSelect id="lr-status" name="status" defaultValue={status} className="min-w-40">
            <option value="">Semua status</option>
            {Object.entries(STATUS).map(([value, s]) => (
              <option key={value} value={value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </ReportFilter>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="plane" label="Total pengajuan" value={rows.length} hint="Dalam periode" tone="blue" />
        <StatCard icon="check" label="Disetujui" value={statusSlices[1].value} hint={`${approvedDays} hari cuti`} tone="green" />
        <StatCard icon="clock" label="Menunggu" value={statusSlices[0].value} hint="Belum diputuskan" tone="amber" />
        <StatCard icon="alert" label="Ditolak" value={statusSlices[2].value} hint="Dalam periode" tone="rose" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Tidak ada pengajuan cuti" description="Tidak ada pengajuan cuti pada periode dan status ini." />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-[17px]">Per jenis cuti</CardTitle></CardHeader>
              <CardContent className="flex flex-col items-center gap-6 sm:flex-row">
                <SegmentRing slices={typeSlices} variant="solid" size={170} centerValue={rows.length} centerLabel="pengajuan" />
                <div className="w-full min-w-0 flex-1"><RingLegend slices={typeSlices} /></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-[17px]">Per status</CardTitle></CardHeader>
              <CardContent className="flex flex-col items-center gap-6 sm:flex-row">
                <SegmentRing slices={statusSlices} size={170} centerValue={rows.length} centerLabel="pengajuan" />
                <div className="w-full min-w-0 flex-1"><RingLegend slices={statusSlices} /></div>
              </CardContent>
            </Card>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Karyawan</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead className="text-right">Hari</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.employeeName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{row.employeeNumber}</p>
                  </TableCell>
                  <TableCell className="text-sm">{row.leaveType}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {row.startDate === row.endDate ? row.startDate : `${row.startDate} → ${row.endDate}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.totalDays}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS[row.status]?.badge ?? "outline"}>{STATUS[row.status]?.label ?? row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length >= LEAVE_REPORT_LIMIT ? (
            <p className="text-sm text-muted-foreground">
              Menampilkan {LEAVE_REPORT_LIMIT} baris pertama. Persempit periode untuk melihat semuanya.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
