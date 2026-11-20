import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type {
  AttendanceSummaryRow,
  LeaveSummaryRow,
  PayslipSummaryRow,
} from "./cross-module";

/**
 * Read-only Attendance / Leave / Payroll tabs on the employee detail page.
 *
 * These tabs deliberately reuse the existing modules: they render compact
 * summaries from the same tables and deep-link to the canonical detail
 * routes (/attendance/[id], /leave/[id], /payroll/payslips/[id]). No
 * attendance/leave/payroll logic is duplicated here.
 */

function iso(value: Date | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

function time(value: Date | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(11, 16);
}

export function AttendanceTab({ rows }: { rows: AttendanceSummaryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Absensi</CardTitle>
        <CardDescription>
          30 data terbaru. Pengelolaan lengkap ada di modul Absensi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada data absensi.</p>
        ) : (
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Tanggal</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Absen masuk</th>
                  <th className="p-2">Absen pulang</th>
                  <th className="p-2 text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="p-2 font-mono text-xs">{iso(row.attendanceDate)}</td>
                    <td className="p-2 capitalize">{row.status}</td>
                    <td className="p-2">{time(row.checkInAt)}</td>
                    <td className="p-2">{time(row.checkOutAt)}</td>
                    <td className="p-2 text-right">
                      <Link
                        href={`/attendance/${row.id}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Buka
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Link
            href="/attendance/management"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Kelola absensi
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function LeaveTab({ rows }: { rows: LeaveSummaryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuti</CardTitle>
        <CardDescription>
          30 pengajuan terbaru. Alur persetujuan ada di modul Cuti.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada pengajuan cuti.</p>
        ) : (
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Jenis</th>
                  <th className="p-2">Dari</th>
                  <th className="p-2">Sampai</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="p-2 font-medium">{row.type}</td>
                    <td className="p-2 font-mono text-xs">{iso(row.startDate)}</td>
                    <td className="p-2 font-mono text-xs">{iso(row.endDate)}</td>
                    <td className="p-2 capitalize">{row.status}</td>
                    <td className="p-2 text-right">
                      <Link
                        href={`/leave/${row.id}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Buka
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Link
            href="/leave/management"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Manajemen cuti
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function PayrollTab({
  rows,
  canManage,
}: {
  rows: PayslipSummaryRow[];
  canManage: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payroll</CardTitle>
        <CardDescription>
          Slip gaji terbit untuk karyawan ini. Proses payroll dikelola di modul Payroll.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada slip gaji.</p>
        ) : (
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Slip gaji</th>
                  <th className="p-2">Periode</th>
                  <th className="p-2">Diterbitkan</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="p-2 font-mono text-xs">{row.payslipNumber}</td>
                    <td className="p-2">{row.period}</td>
                    <td className="p-2 font-mono text-xs">{iso(row.issuedAt)}</td>
                    <td className="p-2 capitalize">{row.status}</td>
                    <td className="p-2 text-right">
                      <Link
                        href={
                          canManage
                            ? `/payroll/payslips/${row.id}`
                            : `/payslip`
                        }
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Buka
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Link
            href={canManage ? "/payroll" : "/payslip"}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {canManage ? "Payroll management" : "Slip gaji saya"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export type { AttendanceSummaryRow, LeaveSummaryRow, PayslipSummaryRow };
