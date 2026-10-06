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
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/rbac";

import { DistributionPayslipUpload } from "@/features/payroll/distribution-payslip-upload";
import {
  listPayrollDistributionEmployees,
  listPayrollPeriods,
} from "@/features/payroll/queries";

export const metadata: Metadata = {
  title: "Upload distribution payslip",
};

const CLOSED_PERIOD_STATUSES = new Set(["cancelled", "locked"]);

export default async function UploadDistributionPayslipPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>;
}) {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYSLIP_PUBLISH,
    PERMISSIONS.PAYSLIP_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const { periodId } = await searchParams;

  const [periods, employees] = await Promise.all([
    listPayrollPeriods(organizationId),
    listPayrollDistributionEmployees(organizationId),
  ]);

  const eligiblePeriods = periods
    .filter((period) => !CLOSED_PERIOD_STATUSES.has(period.status))
    .map((period) => ({
      id: period.id,
      code: period.code,
      name: period.name,
    }));

  const defaultPeriodId =
    periodId && eligiblePeriods.some((period) => period.id === periodId)
      ? periodId
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Upload distribution payslip
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Publish a payslip PDF without running the payroll calculation
            engine.
          </p>
        </div>
        <Link
          href="/payroll"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payslip PDF</CardTitle>
          <CardDescription>
            One payslip per employee per period. The PDF password is derived
            from the employee number and birth date and is never stored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eligiblePeriods.length === 0 ? (
            <EmptyState
              title="No open payroll periods"
              description="Create a payroll period that is not locked or cancelled before uploading a distribution payslip."
            />
          ) : (
            <DistributionPayslipUpload
              periods={eligiblePeriods}
              employees={employees.map((employee) => ({
                id: employee.id,
                employeeNumber: employee.employeeNumber,
                firstName: employee.firstName,
                lastName: employee.lastName,
                hasBirthDate: Boolean(employee.birthDate),
              }))}
              defaultPeriodId={defaultPeriodId}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
