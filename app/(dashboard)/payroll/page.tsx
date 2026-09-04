import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

import { PayrollPeriodCreateDialog } from "@/features/payroll/payroll-period-create-dialog";
import {
  PayrollPeriodStatusBadge,
  PayrollRunStatusBadge,
} from "@/features/payroll/payroll-badges";
import { formatDate } from "@/features/payroll/format";
import { listPayrollPeriods } from "@/features/payroll/queries";

export const metadata: Metadata = {
  title: "Payroll",
};

export default async function PayrollPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const [periods, canCreate, canManageComponents] = await Promise.all([
    listPayrollPeriods(organizationId),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_CREATE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_MANAGE,
      PERMISSIONS.PAYROLL_UPDATE,
    ]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Payroll
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {periods.length} {periods.length === 1 ? "period" : "periods"} in your organization.
          </p>
        </div>
        <div className="flex gap-2">
          {canManageComponents ? (
            <Link
              href="/payroll/components"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Components
            </Link>
          ) : null}
          {canCreate ? <PayrollPeriodCreateDialog /> : null}
        </div>
      </div>

      {periods.length === 0 ? (
        <EmptyState
          title="No payroll periods yet"
          description="Create your first payroll period to start the payroll workflow."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Payment date</TableHead>
                <TableHead>Period status</TableHead>
                <TableHead>Run status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((period) => (
                <TableRow key={period.id}>
                  <TableCell>
                    <span className="font-medium">{period.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {period.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    {formatDate(period.periodStart)} → {formatDate(period.periodEnd)}
                  </TableCell>
                  <TableCell>{formatDate(period.paymentDate)}</TableCell>
                  <TableCell>
                    <PayrollPeriodStatusBadge status={period.status} />
                  </TableCell>
                  <TableCell>
                    {period.run ? (
                      <PayrollRunStatusBadge status={period.run.status} />
                    ) : (
                      <span className="text-sm text-muted-foreground">Not started</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/payroll/${period.id}`}
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

      <Card>
        <CardHeader>
          <CardTitle>Business rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Payroll periods and runs are always organization-scoped.</p>
          <p>All workflow transitions are server-controlled and re-validated in server actions.</p>
          <p>Historical payroll items, components, and payslips remain stable through snapshots.</p>
        </CardContent>
      </Card>
    </div>
  );
}