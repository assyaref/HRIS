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

import { formatDateTime } from "@/features/payroll/format";
import { PayslipStatusBadge } from "@/features/payroll/payroll-badges";
import {
  listRecentPayslips,
  RECENT_PAYSLIPS_LIMIT,
} from "@/features/payroll/queries";

export const metadata: Metadata = {
  title: "Payslips",
};

export default async function PayslipsOverviewPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const [payslips, canUpload] = await Promise.all([
    listRecentPayslips(organizationId),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYSLIP_PUBLISH,
      PERMISSIONS.PAYSLIP_MANAGE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Payslips
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Calculated and distribution payslips across all periods.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canUpload ? (
            <Link
              href="/payroll/payslips/upload"
              className={buttonVariants({ size: "sm" })}
            >
              Upload distribution payslip
            </Link>
          ) : null}
          {canUpload ? (
            <Link
              href="/payroll/payslips/bulk-upload"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Bulk upload
            </Link>
          ) : null}
          <Link
            href="/payroll"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent payslips</CardTitle>
          <CardDescription>
            Showing the latest {RECENT_PAYSLIPS_LIMIT} payslips for your
            organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payslips.length === 0 ? (
            <EmptyState
              title="No payslips yet"
              description="Calculated and distribution payslips will appear here."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payslip</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
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
                            className="font-semibold text-[#0F6FD1] underline underline-offset-4"
                          >
                            {payslip.payslipNumber}
                          </Link>
                        ) : (
                          payslip.payslipNumber
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {payslip.kind === "distribution"
                          ? "Distribution"
                          : "Calculated"}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {payslip.employeeName}
                        </span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {payslip.employeeNumber}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {payslip.periodCode ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateTime(payslip.issuedAt)}
                      </TableCell>
                      <TableCell>
                        <PayslipStatusBadge status={payslip.status} />
                      </TableCell>
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
