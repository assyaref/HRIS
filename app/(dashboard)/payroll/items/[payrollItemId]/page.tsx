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
import { requirePermission } from "@/lib/auth/rbac";

import {
  PayrollComponentTypeBadge,
  PayrollItemStatusBadge,
} from "@/features/payroll/payroll-badges";
import { formatDateTime } from "@/features/payroll/format";
import { formatIDR } from "@/features/payroll/money";
import {
  getPayrollItemInOrganization,
  listMyPublishedPayslips,
  listPayrollItemComponents,
  listPayrollPeriods,
} from "@/features/payroll/queries";
import { getEmployeeByUserId } from "@/features/employees/queries";

export const metadata: Metadata = {
  title: "Payroll item",
};

export default async function PayrollItemDetailPage({
  params,
}: {
  params: Promise<{ payrollItemId: string }>;
}) {
  const { payrollItemId } = await params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const item = await getPayrollItemInOrganization(organizationId, payrollItemId);
  if (!item) forbidden();

  const [components, periods, linkedEmployee] = await Promise.all([
    listPayrollItemComponents(organizationId, payrollItemId),
    listPayrollPeriods(organizationId),
    getEmployeeByUserId(user.id, organizationId),
  ]);

  const owningPeriod = periods.find((period) => period.run?.id === item.payrollRunId);
  if (!owningPeriod) forbidden();

  const myPayslips = linkedEmployee
    ? await listMyPublishedPayslips(organizationId, linkedEmployee.id)
    : [];
  const myPayslip = myPayslips.find((payslip) => payslip.payrollItemId === item.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Payroll item
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {item.employeeNameSnapshot} · {item.employeeNumberSnapshot}
          </p>
        </div>
        <Link
          href={`/payroll/${owningPeriod.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back to period
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Employee snapshot</CardTitle>
            <CardDescription>Historical data preserved for payroll.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Employee</span>
              <span className="font-medium">{item.employeeNameSnapshot}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Employee number</span>
              <span className="font-mono text-xs">{item.employeeNumberSnapshot}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Status</span>
              <PayrollItemStatusBadge status={item.status} />
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payroll totals</CardTitle>
            <CardDescription>Calculated server-side using integer IDR.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Payroll period</span>
              <span className="font-medium">{owningPeriod.name}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Run ID</span>
              <span className="font-mono text-xs">{item.payrollRunId}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Gross earnings</span>
              <span className="font-medium">{formatIDR(item.grossAmount)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Total earnings</span>
              <span className="font-medium">{formatIDR(item.totalEarnings)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Total deductions</span>
              <span className="font-medium">{formatIDR(item.totalDeductions)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Net amount</span>
              <span className="font-semibold">{formatIDR(item.netAmount)}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll components</CardTitle>
          <CardDescription>
            Snapshotted component amounts used in this item calculation.
          </CardDescription>
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
                {components.map((component) => (
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

      <Card>
        <CardHeader>
          <CardTitle>System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="flex justify-between gap-4">
            <span className="text-muted-foreground">Item ID</span>
            <span className="font-mono text-xs">{item.id}</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="text-muted-foreground">Period created</span>
            <span className="font-medium">{formatDateTime(owningPeriod.createdAt)}</span>
          </p>
          {myPayslip ? (
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Published payslip</span>
              <Link
                href={`/payroll/payslips/${myPayslip.id}`}
                className="font-mono text-xs underline underline-offset-4"
              >
                {myPayslip.payslipNumber}
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}