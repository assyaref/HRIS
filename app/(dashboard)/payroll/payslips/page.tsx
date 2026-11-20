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
import {
  hasAnyPermission,
  isSuperAdmin,
  requirePermission,
} from "@/lib/auth/rbac";

import { formatDateTime } from "@/features/payroll/format";
import { PayslipStatusBadge } from "@/features/payroll/payroll-badges";
import { PayslipDeleteDialog } from "@/features/payroll/payslip-delete-dialog";
import {
  listRecentPayslips,
  RECENT_PAYSLIPS_LIMIT,
} from "@/features/payroll/queries";

export const metadata: Metadata = {
  title: "Slip gaji",
};

export default async function PayslipsOverviewPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  // Permanent delete of a revoked payslip is reserved for the system-level
  // SUPERADMIN (re-checked in deleteRevokedPayslipAction).
  const [payslips, canUpload, actorIsSuperAdmin] = await Promise.all([
    listRecentPayslips(organizationId),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYSLIP_PUBLISH,
      PERMISSIONS.PAYSLIP_MANAGE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    isSuperAdmin(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Slip Gaji Karyawan
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Slip gaji hasil perhitungan dan distribusi di semua periode.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canUpload ? (
            <Link
              href="/payroll/payslips/upload"
              className={buttonVariants({ size: "sm" })}
            >
              Unggah slip gaji distribusi
            </Link>
          ) : null}
          {canUpload ? (
            <Link
              href="/payroll/payslips/bulk-upload"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Unggah massal
            </Link>
          ) : null}
          <Link
            href="/payroll"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Kembali
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Slip gaji terbaru</CardTitle>
          <CardDescription>
            Menampilkan {RECENT_PAYSLIPS_LIMIT} slip gaji terbaru untuk organisasi Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payslips.length === 0 ? (
            <EmptyState
              title="Belum ada slip gaji"
              description="Slip gaji hasil perhitungan dan distribusi akan tampil di sini."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slip gaji</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Diterbitkan</TableHead>
                    <TableHead>Status</TableHead>
                    {actorIsSuperAdmin ? (
                      <TableHead className="text-right">Aksi</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map((payslip) => (
                    <TableRow key={payslip.id}>
                      <TableCell className="font-mono text-xs">
                        {payslip.status === "published" ? (
                          <Link
                            href={`/payroll/payslips/${payslip.id}`}
                            className="font-semibold text-primary underline underline-offset-4"
                          >
                            {payslip.payslipNumber}
                          </Link>
                        ) : (
                          payslip.payslipNumber
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {payslip.kind === "distribution"
                          ? "Distribusi"
                          : "Terhitung"}
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
                      {actorIsSuperAdmin ? (
                        <TableCell className="text-right">
                          {payslip.status === "revoked" ? (
                            <PayslipDeleteDialog
                              payslipId={payslip.id}
                              payslipNumber={payslip.payslipNumber}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ) : null}
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
