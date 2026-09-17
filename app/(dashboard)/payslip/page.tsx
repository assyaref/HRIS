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
import { EmptyState } from "@/components/ui/empty-state";

import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { formatDateTime } from "@/features/payroll/format";
import { listMyPublishedPayslips } from "@/features/payroll/queries";
import { PayslipStatusBadge } from "@/features/payroll/payroll-badges";

export const metadata: Metadata = {
  title: "Payslip",
};

export default async function EmployeePayslipPage() {
  const user = await requireUser();

  await requirePermission(user.id, PERMISSIONS.PAYSLIP_VIEW);

  if (!user.organizationId) {
    forbidden();
  }

  const organizationId = user.organizationId;

  const employee = await getEmployeeByUserId(
    user.id,
    organizationId
  );

  if (!employee || employee.employmentStatus !== "active") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Payslip
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Your published payslips
          </p>
        </div>

        <EmptyState
          title="Employee data unavailable"
          description="Your active employee record is not available. Please contact HR."
        />
      </div>
    );
  }

  const payslips = await listMyPublishedPayslips(
    organizationId,
    employee.id
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Payslip
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Your published payslips
        </p>
        <p className="mt-3 max-w-2xl rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          PDF payslip terenkripsi. Untuk membukanya, gunakan NIK + tanggal
          lahir dengan format DDMMYYYY.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{employee.firstName} {employee.lastName}</CardTitle>
          <CardDescription>
            Employee No. {employee.employeeNumber}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {payslips.length === 0 ? (
            <EmptyState
              title="No published payslips"
              description="Your payslip will appear here after HR publishes it."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payslip Number</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {payslips.map((payslip) => (
                    <TableRow key={payslip.id}>
                      <TableCell className="font-medium">
                        {payslip.payslipNumber}
                      </TableCell>

                      <TableCell>
                        {formatDateTime(payslip.issuedAt)}
                      </TableCell>

                      <TableCell>
                        <PayslipStatusBadge
                          status={payslip.status}
                        />
                      </TableCell>

                      <TableCell className="text-right">
                        <Link
                          href={`/payroll/payslips/${payslip.id}`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
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
        </CardContent>
      </Card>
    </div>
  );
}
