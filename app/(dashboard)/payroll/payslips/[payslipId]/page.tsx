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
import { PayrollComponentTypeBadge, PayslipStatusBadge } from "@/features/payroll/payroll-badges";
import { formatDate, formatDateTime } from "@/features/payroll/format";
import { formatIDR } from "@/features/payroll/money";
import { getPublishedPayslipDetail } from "@/features/payroll/queries";

export const metadata: Metadata = {
  title: "Payslip",
};

export default async function PayslipDetailPage({
  params,
}: {
  params: Promise<{ payslipId: string }>;
}) {
  const { payslipId } = await params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYSLIP_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const detail = await getPublishedPayslipDetail(organizationId, payslipId);
  if (!detail) forbidden();

  const [linkedEmployee, canManagePayroll] = await Promise.all([
    getEmployeeByUserId(user.id, organizationId),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_VIEW,
      PERMISSIONS.PAYROLL_MANAGE,
      PERMISSIONS.PAYSLIP_MANAGE,
    ]),
  ]);

  const isOwner = linkedEmployee?.id === detail.employeeId;
  if (!isOwner && !canManagePayroll) forbidden();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Payslip
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {detail.employeeName} · {detail.employeeNumber}
          </p>
        </div>
        <Link
          href={canManagePayroll ? `/payroll/items/${detail.payrollItemId}` : "/payroll"}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{detail.payslipNumber}</CardTitle>
            <CardDescription>
              {detail.periodName} · {detail.periodCode}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Status</span>
              <PayslipStatusBadge status={detail.status} />
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Issued</span>
              <span className="font-medium">{formatDateTime(detail.issuedAt)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Pay period</span>
              <span className="font-medium">
                {formatDate(detail.periodStart)} → {formatDate(detail.periodEnd)}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Payment date</span>
              <span className="font-medium">{formatDate(detail.paymentDate)}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Amounts</CardTitle>
            <CardDescription>Published snapshot values.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Gross</span>
              <span className="font-medium">{formatIDR(detail.grossAmount)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Total earnings</span>
              <span className="font-medium">{formatIDR(detail.totalEarnings)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Total deductions</span>
              <span className="font-medium">{formatIDR(detail.totalDeductions)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Net amount</span>
              <span className="font-semibold">{formatIDR(detail.netAmount)}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
          <CardDescription>Immutable payroll component snapshots.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.components.map((component) => (
                  <TableRow key={component.id}>
                    <TableCell>
                      <span className="font-medium">{component.componentNameSnapshot}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {component.componentCodeSnapshot}
                      </span>
                    </TableCell>
                    <TableCell>
                      <PayrollComponentTypeBadge type={component.componentTypeSnapshot} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatIDR(component.amount)}
                    </TableCell>
                    <TableCell>{component.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}