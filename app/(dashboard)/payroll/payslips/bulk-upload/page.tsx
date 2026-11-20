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
  title: "Unggah massal slip gaji",
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
            Unggah Massal Slip Gaji
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Distribusikan banyak PDF slip gaji untuk satu periode payroll sekaligus.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/payroll/payslips/upload"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Unggah satuan
          </Link>
          <Link
            href="/payroll/payslips"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Kembali
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>PDF slip gaji</CardTitle>
          <CardDescription>
            Setiap berkas dicocokkan ke karyawan berdasarkan nomor karyawan di awal nama berkasnya. Setiap berkas dilaporkan satu per satu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eligiblePeriods.length === 0 ? (
            <EmptyState
              title="Tidak ada periode payroll terbuka"
              description="Buat periode payroll yang tidak terkunci atau dibatalkan sebelum mengunggah slip gaji distribusi."
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
          <CardTitle>Aturan nama berkas</CardTitle>
          <CardDescription>
            Maksimal {PAYSLIP_BULK_MAX_FILES} berkas per batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Setiap PDF harus diberi nama dengan nomor karyawan di depan, diikuti pemisah dan label opsional. Baris yang tidak dapat dicocokkan (karyawan tidak dikenal, ganda, tanggal lahir kosong, atau nama berkas tidak valid) dilaporkan satu per satu dan tidak pernah dilewati diam-diam.
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
