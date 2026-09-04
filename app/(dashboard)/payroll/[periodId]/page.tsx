import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import { hasAnyPermission, requirePermission } from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import {
  PayrollItemStatusBadge,
  PayrollPeriodStatusBadge,
  PayrollRunStatusBadge,
  PayslipStatusBadge,
} from "@/features/payroll/payroll-badges";
import { formatDate, formatDateTime } from "@/features/payroll/format";
import { formatIDR } from "@/features/payroll/money";
import { PayrollRunActions } from "@/features/payroll/payroll-run-actions";
import {
  getPayrollPeriodInOrganization,
  listMyPublishedPayslips,
  listPayrollEvents,
  listPayrollItemsForRun,
  listPayslipsForRun,
} from "@/features/payroll/queries";

export const metadata: Metadata = {
  title: "Payroll period",
};

export default async function PayrollPeriodDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const period = await getPayrollPeriodInOrganization(organizationId, periodId);
  if (!period) forbidden();

  const [
    canCalculate,
    canSubmit,
    canApprove,
    canReject,
    canLock,
    canCancel,
    canGeneratePayslips,
    canPublishPayslips,
    events,
    linkedEmployee,
  ] = await Promise.all([
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_CALCULATE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_UPDATE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_APPROVE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_APPROVE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_LOCK,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_UPDATE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYSLIP_MANAGE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYSLIP_PUBLISH,
      PERMISSIONS.PAYSLIP_MANAGE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    listPayrollEvents(organizationId, periodId),
    getEmployeeByUserId(user.id, organizationId),
  ]);

  const [items, payslips] = period.run
    ? await Promise.all([
        listPayrollItemsForRun(organizationId, period.run.id),
        listPayslipsForRun(organizationId, period.run.id),
      ])
    : [[], []];

  const myPayslips = linkedEmployee
    ? await listMyPublishedPayslips(organizationId, linkedEmployee.id)
    : [];
  const myPayslipsForPeriod = period.run
    ? myPayslips.filter((payslip) =>
        payslips.some((row) => row.id === payslip.id)
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {period.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {period.code} · {period.organizationName}
          </p>
        </div>
        <Link
          href="/payroll"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back to payroll
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Period</CardTitle>
            <CardDescription>Payroll cycle metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Window</span>
              <span className="font-medium">
                {formatDate(period.periodStart)} → {formatDate(period.periodEnd)}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Payment date</span>
              <span className="font-medium">{formatDate(period.paymentDate)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Status</span>
              <PayrollPeriodStatusBadge status={period.status} />
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">{formatDateTime(period.createdAt)}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Run</CardTitle>
            <CardDescription>Server-controlled payroll workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {period.run ? (
              <>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Run status</span>
                  <PayrollRunStatusBadge status={period.run.status} />
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Calculated</span>
                  <span className="font-medium">
                    {formatDateTime(period.run.calculatedAt)}
                  </span>
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Approved</span>
                  <span className="font-medium">
                    {formatDateTime(period.run.approvedAt)}
                  </span>
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Locked</span>
                  <span className="font-medium">
                    {formatDateTime(period.run.lockedAt)}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                No run exists yet. Use Calculate run to generate payroll items.
              </p>
            )}

            <PayrollRunActions
              periodId={period.id}
              periodStatus={period.status}
              runStatus={period.run?.status ?? null}
              canCalculate={canCalculate}
              canSubmit={canSubmit}
              canApprove={canApprove}
              canReject={canReject}
              canLock={canLock}
              canCancel={canCancel}
              canGeneratePayslips={canGeneratePayslips}
              canPublishPayslips={canPublishPayslips}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll items</CardTitle>
          <CardDescription>
            Employee snapshots and calculated totals for this run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!period.run || items.length === 0 ? (
            <EmptyState
              title="No payroll items"
              description="Payroll items will appear here after the run is calculated."
            />
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span className="font-medium">{item.employeeNameSnapshot}</span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {item.employeeNumberSnapshot}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatIDR(item.grossAmount)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatIDR(item.totalDeductions)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatIDR(item.netAmount)}
                      </TableCell>
                      <TableCell>
                        <PayrollItemStatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/payroll/items/${item.id}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          View
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payslips</CardTitle>
          <CardDescription>
            Minimum payslip surface supported by the current Phase 8 schema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!period.run || payslips.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payslips have been generated for this period.
            </p>
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payslip</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map((payslip) => (
                    <TableRow key={payslip.id}>
                      <TableCell className="font-mono text-xs">
                        {payslip.status === "published" ? (
                          <Link
                            href={`/payroll/payslips/${payslip.id}`}
                            className="underline underline-offset-4"
                          >
                            {payslip.payslipNumber}
                          </Link>
                        ) : (
                          payslip.payslipNumber
                        )}
                      </TableCell>
                      <TableCell>{formatDateTime(payslip.issuedAt)}</TableCell>
                      <TableCell>
                        <PayslipStatusBadge status={payslip.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {myPayslipsForPeriod.length > 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-sm font-medium">Your published payslips in this period</p>
              <ul className="mt-2 space-y-2 text-sm">
                {myPayslipsForPeriod.map((payslip) => (
                  <li key={payslip.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/payroll/payslips/${payslip.id}`}
                      className="font-mono text-xs underline underline-offset-4"
                    >
                      {payslip.payslipNumber}
                    </Link>
                    <span className="text-muted-foreground">
                      Published on {formatDateTime(payslip.issuedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Immutable payroll events.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events.</p>
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Transition</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono text-xs">
                        {event.eventType}
                      </TableCell>
                      <TableCell>
                        {(event.fromStatus ?? "—") + " → " + (event.toStatus ?? "—")}
                      </TableCell>
                      <TableCell>{event.actorEmail ?? "—"}</TableCell>
                      <TableCell>{formatDateTime(event.eventAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}