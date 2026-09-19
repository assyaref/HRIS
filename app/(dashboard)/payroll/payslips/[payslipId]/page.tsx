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
import { canViewPublishedPayslip } from "@/features/payroll/payslip-document.guard";
import { PayslipDocumentView } from "@/features/payroll/payslip-document-view";

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

  if (
    !canViewPublishedPayslip({
      linkedEmployeeId: linkedEmployee?.id ?? null,
      payslipEmployeeId: detail.employeeId,
      managementAllowed: canManagePayroll,
    })
  ) {
    forbidden();
  }

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
          href={
            canManagePayroll
              ? detail.payrollItemId
                ? `/payroll/items/${detail.payrollItemId}`
                : detail.payrollPeriodId
                  ? `/payroll/${detail.payrollPeriodId}`
                  : "/payroll"
              : "/payslip"
          }
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-3 py-1 font-medium">
          {detail.kind === "distribution"
            ? "Distribution payslip"
            : "Calculated payslip"}
        </span>
        <span className="rounded-full bg-muted px-3 py-1 font-mono">
          {detail.payslipNumber}
        </span>
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
            <CardDescription>
              {detail.kind === "distribution"
                ? "This payslip was distributed without the payroll calculation engine."
                : "Published snapshot values."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {detail.kind === "distribution" ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                No calculated breakdown is available for a distribution payslip.
              </p>
            ) : (
              <>
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
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payslip PDF</CardTitle>
          <CardDescription>
            Secure PDF document. The PDF password is not displayed or stored
            by the HRIS application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            PDF payslip terenkripsi. Untuk membukanya, gunakan Nomor Induk
            Karyawan (employee number) + tanggal lahir dengan format DDMMYYYY.
            Contoh: nomor induk 03233 dan tanggal lahir 25-08-1995 menjadi
            0323325081995.
          </p>
          <PayslipDocumentView
            payslipId={detail.id}
            payslipNumber={detail.payslipNumber}
          />
        </CardContent>
      </Card>

      {detail.kind === "calculated" ? (
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
      ) : null}
    </div>
  );
}