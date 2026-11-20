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
  title: "Item payroll",
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
            Rincian Payroll
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {item.employeeNameSnapshot} · {item.employeeNumberSnapshot}
          </p>
        </div>
        <Link
          href={`/payroll/${owningPeriod.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Kembali ke periode
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Snapshot karyawan</CardTitle>
            <CardDescription>Data historis tetap disimpan untuk payroll.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Karyawan</span>
              <span className="font-medium">{item.employeeNameSnapshot}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Nomor karyawan</span>
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
            <CardTitle>Total payroll</CardTitle>
            <CardDescription>Calculated server-side using integer IDR.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Periode payroll</span>
              <span className="font-medium">{owningPeriod.name}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">ID Proses</span>
              <span className="font-mono text-xs">{item.payrollRunId}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Pendapatan bruto</span>
              <span className="font-medium">{formatIDR(item.grossAmount)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Total pendapatan</span>
              <span className="font-medium">{formatIDR(item.totalEarnings)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Total potongan</span>
              <span className="font-medium">{formatIDR(item.totalDeductions)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Jumlah neto</span>
              <span className="font-semibold">{formatIDR(item.netAmount)}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Komponen payroll</CardTitle>
          <CardDescription>
            Snapshot nilai komponen yang dipakai dalam perhitungan item ini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Komponen</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Catatan</TableHead>
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
          <CardTitle>Sistem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="flex justify-between gap-4">
            <span className="text-muted-foreground">ID Item</span>
            <span className="font-mono text-xs">{item.id}</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="text-muted-foreground">Periode dibuat</span>
            <span className="font-medium">{formatDateTime(owningPeriod.createdAt)}</span>
          </p>
          {myPayslip ? (
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Slip gaji terbit</span>
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