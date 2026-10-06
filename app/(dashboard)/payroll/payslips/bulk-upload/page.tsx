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

import { BulkDistributionPayslipUpload } from "@/features/payroll/bulk-distribution-payslip-upload";
import { listPayrollPeriods } from "@/features/payroll/queries";
import {
  extractEmployeeNumberFromFilename,
  PAYSLIP_BULK_MAX_FILES,
} from "@/features/payroll/payslip-bulk.guard";

export const metadata: Metadata = {
  title: "Bulk upload payslips",
};

const CLOSED_PERIOD_STATUSES = new Set(["cancelled", "locked"]);

const EXAMPLES = ["03233.pdf", "03233_august.pdf", "03233-august.pdf"];

export default async function BulkUploadPayslipsPage({
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

  const { periodId } = await searchParams;

  const periods = await listPayrollPeriods(user.organizationId);

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
            Bulk upload payslips
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Distribute many payslip PDFs for one payroll period at once.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/payroll/payslips/upload"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Single upload
          </Link>
          <Link
            href="/payroll/payslips"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payslip PDFs</CardTitle>
          <CardDescription>
            Each file is matched to an employee by the leading employee number
            in its filename. Every file is reported individually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eligiblePeriods.length === 0 ? (
            <EmptyState
              title="No open payroll periods"
              description="Create a payroll period that is not locked or cancelled before uploading distribution payslips."
            />
          ) : (
            <BulkDistributionPayslipUpload
              periods={eligiblePeriods}
              defaultPeriodId={defaultPeriodId}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filename contract</CardTitle>
          <CardDescription>
            Up to {PAYSLIP_BULK_MAX_FILES} files per batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Each PDF must be named with the employee number first, followed by
            an optional separator and label. Rows that cannot be matched
            (unknown employee, duplicate, missing birth date, or an invalid
            filename) are reported individually and never silently skipped.
          </p>

          <ul className="space-y-1 rounded-md bg-muted px-4 py-3 font-mono text-xs">
            {EXAMPLES.map((example) => (
              <li key={example}>
                {example} → {extractEmployeeNumberFromFilename(example)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
