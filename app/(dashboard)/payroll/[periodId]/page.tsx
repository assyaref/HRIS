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

import { getEmployeeByUserId } from "@/features/employees/queries";
import {
  PayrollItemStatusBadge,
  PayrollPeriodStatusBadge,
  PayrollRunStatusBadge,
  PayslipStatusBadge,
} from "@/features/payroll/payroll-badges";
import { formatDate, formatDateTime } from "@/features/payroll/format";
import { formatIDR } from "@/features/payroll/money";
import { PayrollRunActions } from "@/features/payroll/payroll-run-actions";
import { PayslipDocumentUpload } from "@/features/payroll/payslip-document-upload";
import { PayslipPublishButton } from "@/features/payroll/payslip-publish-button";
import { PayslipRevocationDialog } from "@/features/payroll/payslip-revocation-dialog";
import {
  getPayrollPeriodInOrganization,
  listMyPublishedPayslips,
  listPayrollEvents,
  listPayrollItemsForRun,
  listPayslipDocumentSummariesForPeriod,
  listPayslipsForPeriod,
} from "@/features/payroll/queries";

export const metadata: Metadata = {
  title: "Payroll period",
};

function SectionIcon({
  type,
}: {
  type: "calendar" | "workflow" | "money" | "document" | "history";
}) {
  const common = {
    className: "size-5",
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.8,
  };

  if (type === "calendar") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    );
  }

  if (type === "workflow") {
    return (
      <svg {...common}>
        <path d="M6 3v18M18 3v18M6 7h12M6 17h12" />
        <circle cx="6" cy="7" r="1.5" />
        <circle cx="18" cy="17" r="1.5" />
      </svg>
    );
  }

  if (type === "money") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <circle cx="12" cy="12" r="3" />
        <path d="M7 9h.01M17 15h.01" />
      </svg>
    );
  }

  if (type === "document") {
    return (
      <svg {...common}>
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h5M10 12h5M10 16h5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 8v5l3 2" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50/80 px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900">
        {children}
      </span>
    </div>
  );
}

export default async function PayrollPeriodDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PAYROLL_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const period = await getPayrollPeriodInOrganization(organizationId, periodId);
  if (!period) forbidden();

  const [
    canCalculate,
    canSubmit,
    canApprove,
    canReject,
    canLock,
    canCancel,
    canGeneratePayslips,
    canPublishPayslips,
    canRevokePayslips,
    events,
    linkedEmployee,
  ] = await Promise.all([
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_CALCULATE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_UPDATE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_APPROVE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_APPROVE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_LOCK,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYROLL_UPDATE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYSLIP_MANAGE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYSLIP_PUBLISH,
      PERMISSIONS.PAYSLIP_MANAGE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    hasAnyPermission(user.id, [
      PERMISSIONS.PAYSLIP_MANAGE,
      PERMISSIONS.PAYROLL_MANAGE,
    ]),
    listPayrollEvents(organizationId, periodId),
    getEmployeeByUserId(user.id, organizationId),
  ]);

  const items = period.run
    ? await listPayrollItemsForRun(organizationId, period.run.id)
    : [];

  const [payslips, documentSummaries] = await Promise.all([
    listPayslipsForPeriod(organizationId, period.id),
    listPayslipDocumentSummariesForPeriod(organizationId, period.id),
  ]);

  const myPayslips = linkedEmployee
    ? await listMyPublishedPayslips(organizationId, linkedEmployee.id)
    : [];

  const myPayslipsForPeriod = myPayslips.filter((payslip) =>
    payslips.some((row) => row.id === payslip.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1687F8] via-[#1687F8] to-[#0F6FD1] px-5 py-6 text-white shadow-[0_12px_35px_rgba(22,135,248,0.18)] sm:px-7 sm:py-7">
        <div className="absolute -right-20 -top-24 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-28 right-24 size-52 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                Payroll period
              </span>
              <PayrollPeriodStatusBadge status={period.status} />
            </div>

            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {period.name}
            </h1>

            <p className="mt-2 text-sm text-blue-50 sm:text-base">
              {period.code} · {period.organizationName}
            </p>
          </div>

          <Link
            href="/payroll"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className:
                "w-full border-white/40 bg-white text-blue-700 shadow-sm hover:bg-blue-50 hover:text-blue-800 sm:w-auto",
            })}
          >
            ← Back to payroll
          </Link>
        </div>
      </section>

      {/* Overview */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200/80 shadow-[0_3px_18px_rgba(15,23,42,0.035)]">
          <CardContent className="p-5">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-[#EAF5FF] text-[#1687F8]">
              <SectionIcon type="calendar" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Payroll window
            </p>
            <p className="mt-2 text-sm font-bold text-slate-900">
              {formatDate(period.periodStart)}
            </p>
            <p className="text-xs text-slate-500">
              to {formatDate(period.periodEnd)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-[0_3px_18px_rgba(15,23,42,0.035)]">
          <CardContent className="p-5">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <SectionIcon type="money" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Payment date
            </p>
            <p className="mt-2 text-sm font-bold text-slate-900">
              {formatDate(period.paymentDate)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-[0_3px_18px_rgba(15,23,42,0.035)]">
          <CardContent className="p-5">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <SectionIcon type="workflow" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Run status
            </p>
            <div className="mt-2">
              {period.run ? (
                <PayrollRunStatusBadge status={period.run.status} />
              ) : (
                <span className="text-sm font-semibold text-slate-500">
                  Not calculated
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-[0_3px_18px_rgba(15,23,42,0.035)]">
          <CardContent className="p-5">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <SectionIcon type="history" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Created
            </p>
            <p className="mt-2 text-sm font-bold text-slate-900">
              {formatDateTime(period.createdAt)}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Period + Workflow */}
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="border-slate-200/80 shadow-[0_3px_18px_rgba(15,23,42,0.035)]">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF5FF] text-[#1687F8]">
                <SectionIcon type="calendar" />
              </div>
              <div>
                <CardTitle>Period details</CardTitle>
                <CardDescription>
                  Payroll cycle metadata and schedule.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-2 p-5">
            <InfoRow label="Window">
              {formatDate(period.periodStart)} → {formatDate(period.periodEnd)}
            </InfoRow>
            <InfoRow label="Payment date">
              {formatDate(period.paymentDate)}
            </InfoRow>
            <InfoRow label="Status">
              <PayrollPeriodStatusBadge status={period.status} />
            </InfoRow>
            <InfoRow label="Created">
              {formatDateTime(period.createdAt)}
            </InfoRow>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-[0_3px_18px_rgba(15,23,42,0.035)]">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF5FF] text-[#1687F8]">
                <SectionIcon type="workflow" />
              </div>
              <div>
                <CardTitle>Payroll workflow</CardTitle>
                <CardDescription>
                  Server-controlled payroll workflow.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-5">
            {period.run ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <InfoRow label="Run">
                  <PayrollRunStatusBadge status={period.run.status} />
                </InfoRow>
                <InfoRow label="Calculated">
                  {formatDateTime(period.run.calculatedAt)}
                </InfoRow>
                <InfoRow label="Approved">
                  {formatDateTime(period.run.approvedAt)}
                </InfoRow>
                <div className="sm:col-span-3">
                  <InfoRow label="Locked">
                    {formatDateTime(period.run.lockedAt)}
                  </InfoRow>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-[#EAF5FF]/70 p-4">
                <p className="text-sm font-semibold text-[#0F6FD1]">
                  No payroll run yet
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Use Calculate run to generate payroll items.
                </p>
              </div>
            )}

            <PayrollRunActions
              periodId={period.id}
              periodStatus={period.status}
              runStatus={period.run?.status ?? null}
              canCalculate={canCalculate}
              canSubmit={canSubmit}
              canApprove={canApprove}
              canReject={canReject}
              canLock={canLock}
              canCancel={canCancel}
              canGeneratePayslips={canGeneratePayslips}
              canPublishPayslips={canPublishPayslips}
            />
          </CardContent>
        </Card>
      </div>

      {/* Payroll Items */}
      <Card className="overflow-hidden border-slate-200/80 shadow-[0_3px_18px_rgba(15,23,42,0.035)]">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF5FF] text-[#1687F8]">
              <SectionIcon type="money" />
            </div>
            <div>
              <CardTitle>Payroll items</CardTitle>
              <CardDescription>
                Employee snapshots and calculated totals for this run.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {!period.run || items.length === 0 ? (
            <EmptyState
              title="No payroll items"
              description="Payroll items will appear here after the run is calculated."
            />
          ) : (
            <>
              {/* Mobile */}
              <div className="space-y-3 lg:hidden">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {item.employeeNameSnapshot}
                        </p>
                        <p className="mt-1 font-mono text-xs text-slate-500">
                          {item.employeeNumberSnapshot}
                        </p>
                      </div>
                      <PayrollItemStatusBadge status={item.status} />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Gross
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-900">
                          {formatIDR(item.grossAmount)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Deduction
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-900">
                          {formatIDR(item.totalDeductions)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-[#EAF5FF] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0F6FD1]">
                          Net
                        </p>
                        <p className="mt-1 text-xs font-bold text-[#0F6FD1]">
                          {formatIDR(item.netAmount)}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/payroll/items/${item.id}`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className:
                          "mt-4 w-full border-blue-200 text-[#0F6FD1] hover:bg-[#EAF5FF]",
                      })}
                    >
                      View payroll item
                    </Link>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className="hover:bg-blue-50/30">
                        <TableCell>
                          <span className="font-semibold text-slate-900">
                            {item.employeeNameSnapshot}
                          </span>
                          <span className="block font-mono text-xs text-slate-500">
                            {item.employeeNumberSnapshot}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatIDR(item.grossAmount)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatIDR(item.totalDeductions)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-[#0F6FD1]">
                          {formatIDR(item.netAmount)}
                        </TableCell>
                        <TableCell>
                          <PayrollItemStatusBadge status={item.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/payroll/items/${item.id}`}
                            className={buttonVariants({
                              variant: "ghost",
                              size: "sm",
                              className:
                                "text-[#0F6FD1] hover:bg-[#EAF5FF] hover:text-[#0F6FD1]",
                            })}
                          >
                            View →
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Payslips */}
      <Card className="overflow-hidden border-slate-200/80 shadow-[0_3px_18px_rgba(15,23,42,0.035)]">
        <CardHeader className="border-b border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <SectionIcon type="document" />
              </div>
              <div>
                <CardTitle>Payslips</CardTitle>
                <CardDescription>
                  Payslip generation, documents, and publication status.
                </CardDescription>
              </div>
            </div>

            {canPublishPayslips &&
            period.status !== "cancelled" &&
            period.status !== "locked" ? (
              <Link
                href={`/payroll/payslips/upload?periodId=${period.id}`}
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className:
                    "border-violet-200 text-violet-700 hover:bg-violet-50",
                })}
              >
                Upload distribution payslip
              </Link>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4 sm:p-6">
          {payslips.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">
                No payslips generated
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Payslips will appear here after they are generated for this
                period.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile */}
              <div className="space-y-3 lg:hidden">
                {payslips.map((payslip) => (
                  <div
                    key={payslip.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      {payslip.status === "published" ? (
                        <Link
                          href={`/payroll/payslips/${payslip.id}`}
                          className="font-mono text-xs font-bold text-[#0F6FD1] underline underline-offset-4"
                        >
                          {payslip.payslipNumber}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs font-bold text-slate-700">
                          {payslip.payslipNumber}
                        </span>
                      )}
                      <PayslipStatusBadge status={payslip.status} />
                    </div>

                    <p className="mt-3 text-xs text-slate-500">
                      Issued {formatDateTime(payslip.issuedAt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {payslip.kind === "distribution"
                        ? "Distribution payslip"
                        : "Calculated payslip"}
                    </p>

                    {payslip.status === "generated" ? (
                      <div className="mt-4">
                        <PayslipDocumentUpload
                          payslipId={payslip.id}
                          payslipNumber={payslip.payslipNumber}
                          document={
                            documentSummaries.get(payslip.id) ?? null
                          }
                        />
                      </div>
                    ) : null}

                    {canPublishPayslips &&
                    payslip.status === "generated" &&
                    documentSummaries.get(payslip.id) ? (
                      <div className="mt-4">
                        <PayslipPublishButton
                          payslipId={payslip.id}
                          payslipNumber={payslip.payslipNumber}
                          className="w-full"
                        />
                      </div>
                    ) : null}

                    {canRevokePayslips && payslip.status === "published" ? (
                      <div className="mt-4">
                        <PayslipRevocationDialog
                          payslipId={payslip.id}
                          payslipNumber={payslip.payslipNumber}
                          triggerClassName="w-full"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead>Payslip</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">PDF</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payslips.map((payslip) => (
                      <TableRow key={payslip.id} className="hover:bg-blue-50/30">
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
                        <TableCell className="text-xs text-slate-500">
                          {payslip.kind === "distribution"
                            ? "Distribution"
                            : "Calculated"}
                        </TableCell>
                        <TableCell>{formatDateTime(payslip.issuedAt)}</TableCell>
                        <TableCell>
                          <PayslipStatusBadge status={payslip.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {payslip.status === "generated" ? (
                            <PayslipDocumentUpload
                              payslipId={payslip.id}
                              payslipNumber={payslip.payslipNumber}
                              document={
                                documentSummaries.get(payslip.id) ?? null
                              }
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {canPublishPayslips &&
                          payslip.status === "generated" &&
                          documentSummaries.get(payslip.id) ? (
                            <PayslipPublishButton
                              payslipId={payslip.id}
                              payslipNumber={payslip.payslipNumber}
                            />
                          ) : canRevokePayslips &&
                            payslip.status === "published" ? (
                            <PayslipRevocationDialog
                              payslipId={payslip.id}
                              payslipNumber={payslip.payslipNumber}
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {myPayslipsForPeriod.length > 0 ? (
            <div className="rounded-2xl border border-blue-100 bg-[#EAF5FF]/60 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#1687F8] shadow-sm">
                  <SectionIcon type="document" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    Your published payslips
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Published payslips available to your employee account.
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-2">
                {myPayslipsForPeriod.map((payslip) => (
                  <li
                    key={payslip.id}
                    className="flex flex-col gap-2 rounded-xl bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <Link
                      href={`/payroll/payslips/${payslip.id}`}
                      className="font-mono text-xs font-bold text-[#0F6FD1] underline underline-offset-4"
                    >
                      {payslip.payslipNumber}
                    </Link>
                    <span className="text-xs text-slate-500">
                      Published on {formatDateTime(payslip.issuedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* History */}
      <Card className="overflow-hidden border-slate-200/80 shadow-[0_3px_18px_rgba(15,23,42,0.035)]">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <SectionIcon type="history" />
            </div>
            <div>
              <CardTitle>History</CardTitle>
              <CardDescription>
                Immutable payroll events and workflow transitions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {events.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
              No events.
            </p>
          ) : (
            <>
              <div className="space-y-3 lg:hidden">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-xs font-bold text-[#0F6FD1]">
                        {event.eventType}
                      </span>
                      <span className="text-right text-xs text-slate-500">
                        {formatDateTime(event.eventAt)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-700">
                      {(event.fromStatus ?? "—") +
                        " → " +
                        (event.toStatus ?? "—")}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Actor: {event.actorEmail ?? "—"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead>Event</TableHead>
                      <TableHead>Transition</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id} className="hover:bg-blue-50/30">
                        <TableCell className="font-mono text-xs font-semibold text-[#0F6FD1]">
                          {event.eventType}
                        </TableCell>
                        <TableCell>
                          {(event.fromStatus ?? "—") +
                            " → " +
                            (event.toStatus ?? "—")}
                        </TableCell>
                        <TableCell>{event.actorEmail ?? "—"}</TableCell>
                        <TableCell>{formatDateTime(event.eventAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
