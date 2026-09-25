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
        <CardTitle>Attendance</CardTitle>
        <CardDescription>
          Latest 30 records. Full management lives in the Attendance module.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attendance records.</p>
        ) : (
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Date</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Check in</th>
                  <th className="p-2">Check out</th>
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
                        Open
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
            Attendance management
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
        <CardTitle>Leave</CardTitle>
        <CardDescription>
          Latest 30 requests. Approval flows live in the Leave module.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leave requests.</p>
        ) : (
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Type</th>
                  <th className="p-2">From</th>
                  <th className="p-2">To</th>
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
                        Open
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
            Leave management
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
          Published payslips for this employee. Runs are managed in the
          Payroll module.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payslips yet.</p>
        ) : (
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Payslip</th>
                  <th className="p-2">Period</th>
                  <th className="p-2">Issued</th>
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
                        Open
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
            {canManage ? "Payroll management" : "My payslips"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export type { AttendanceSummaryRow, LeaveSummaryRow, PayslipSummaryRow };
