import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { PayslipCard } from "@/components/employee/payslip-card";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { HrisIcon } from "@/components/layout/icons";

import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { PAYSLIP_STATUS_LABELS, type PayslipStatus } from "@/features/payroll/constants";
import { formatDateTime } from "@/features/payroll/format";
import { listMyPublishedPayslips } from "@/features/payroll/queries";

export const metadata: Metadata = {
  title: "Pay Slip",
};

const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function periodLabel(value: Date): string {
  return `${MONTHS_ID[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

export default async function EmployeePayslipPage() {
  const user = await requireUser();

  await requirePermission(user.id, PERMISSIONS.PAYSLIP_VIEW);

  if (!user.organizationId) {
    forbidden();
  }

  const organizationId = user.organizationId;

  const employee = await getEmployeeByUserId(user.id, organizationId);

  if (!employee || employee.employmentStatus !== "active") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#172554]">
            Pay Slip
          </h1>
          <p className="mt-1 text-sm text-[#64748b]">Slip gaji Anda</p>
        </div>

        <EmployeeEmptyState
          icon="payslip"
          title="Data karyawan tidak tersedia"
          description="Data karyawan aktif Anda tidak tersedia. Silakan hubungi HR."
        />
      </div>
    );
  }

  const payslips = await listMyPublishedPayslips(organizationId, employee.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#172554]">
          Pay Slip
        </h1>
        <p className="mt-1 text-sm text-[#64748b]">
          {employee.firstName} {employee.lastName} · {employee.employeeNumber}
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <HrisIcon name="lock" className="mt-0.5 size-4 shrink-0" />
        <span>
          PDF slip gaji terenkripsi. Untuk membukanya gunakan Nomor Induk
          Karyawan (employee number) + tanggal lahir dengan format DDMMYYYY.
          Contoh: nomor induk 03233 dan tanggal lahir 25-08-1995 menjadi
          0323325081995.
        </span>
      </p>

      {payslips.length === 0 ? (
        <EmployeeEmptyState
          icon="payslip"
          title="Belum ada slip gaji"
          description="Slip gaji Anda akan tampil di sini setelah dipublikasikan HR."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {payslips.map((payslip) => (
            <PayslipCard
              key={payslip.id}
              periodLabel={periodLabel(payslip.issuedAt)}
              payslipNumber={payslip.payslipNumber}
              status={payslip.status}
              statusLabel={
                PAYSLIP_STATUS_LABELS[payslip.status as PayslipStatus] ??
                payslip.status
              }
              issuedLabel={`Terbit ${formatDateTime(payslip.issuedAt)}`}
              href={`/payroll/payslips/${payslip.id}`}
              downloadHref={`/api/payroll/payslips/${payslip.id}/pdf`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
