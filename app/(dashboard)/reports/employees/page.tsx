import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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

import {
  buildEmployeeMovementReport,
  type MovementEmployee,
  type MovementGroup,
} from "@/features/reports/employee-movement";
import { listMovementEmployees } from "@/features/reports/queries";
import { ReportFilter } from "@/features/reports/report-filter";
import { dateParam, monthRange, todayKey } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Laporan Karyawan" };

function PeopleTable({
  rows,
  dateLabel,
  date,
  empty,
}: {
  rows: MovementEmployee[];
  dateLabel: string;
  date: "hireDate" | "exitDate";
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Karyawan</TableHead>
          <TableHead>Jabatan</TableHead>
          <TableHead>Lokasi</TableHead>
          <TableHead>{dateLabel}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/employees/${row.id}`} className="font-medium hover:text-primary">
                {row.name}
              </Link>
              <p className="font-mono text-xs text-muted-foreground">{row.employeeNumber}</p>
            </TableCell>
            <TableCell className="text-sm">{row.position ?? "—"}</TableCell>
            <TableCell className="text-sm">{row.workLocation ?? "—"}</TableCell>
            <TableCell className="text-sm whitespace-nowrap">{row[date] ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function GroupTable({ title, groups }: { title: string; groups: MovementGroup[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[17px]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada data.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead className="text-right">Masuk</TableHead>
                <TableHead className="text-right">Keluar</TableHead>
                <TableHead className="text-right">Jumlah karyawan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.key}>
                  <TableCell className="text-sm font-medium">{g.key}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.joined}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.left}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.headcountEnd}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Employee report: joiners, leavers, headcount and turnover for a date range,
 * broken down by department and work location, with Excel export.
 */
export default async function EmployeeReportPage({
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
  const report = buildEmployeeMovementReport(
    await listMovementEmployees(user.organizationId),
    from,
    to
  );
  const exportHref = `/api/reports/export?${new URLSearchParams({
    report: "employees",
    from: report.from,
    to: report.to,
  }).toString()}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Karyawan"
        description="Karyawan masuk dan keluar, headcount serta turnover dalam periode yang dipilih."
      />
      <ReportFilter action="/reports/employees" from={report.from} to={report.to} exportHref={exportHref} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="employees" label="Headcount akhir" value={report.headcountEnd} hint={`Awal periode: ${report.headcountStart}`} tone="blue" />
        <StatCard icon="user-plus" label="Karyawan masuk" value={report.joined.length} hint="Tanggal masuk dalam periode" tone="green" />
        <StatCard icon="logout" label="Karyawan keluar" value={report.left.length} hint="Resign / terminasi" tone="rose" />
        <StatCard icon="trend-up" label="Turnover" value={report.turnoverRate === null ? "—" : `${report.turnoverRate}%`} hint="Keluar ÷ rata-rata headcount" tone="violet" />
      </div>

      {report.headcountEnd === 0 && report.joined.length === 0 && report.left.length === 0 ? (
        <EmptyState title="Belum ada data karyawan" description="Tambahkan karyawan terlebih dahulu untuk melihat laporan." />
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[17px]">Karyawan masuk</CardTitle>
                <CardDescription>{report.joined.length} orang</CardDescription>
              </CardHeader>
              <CardContent>
                <PeopleTable rows={report.joined} date="hireDate" dateLabel="Tanggal masuk" empty="Tidak ada karyawan masuk pada periode ini." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[17px]">Karyawan keluar</CardTitle>
                <CardDescription>{report.left.length} orang</CardDescription>
              </CardHeader>
              <CardContent>
                <PeopleTable rows={report.left} date="exitDate" dateLabel="Tanggal keluar" empty="Tidak ada karyawan keluar pada periode ini." />
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <GroupTable title="Per departemen" groups={report.byDepartment} />
            <GroupTable title="Per lokasi kerja" groups={report.byWorkLocation} />
          </div>
        </>
      )}
    </div>
  );
}
