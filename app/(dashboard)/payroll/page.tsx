import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

function PayrollIcon({
  type,
  className = "size-5",
}: {
  type: "wallet" | "calendar" | "settings" | "arrow";
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (type) {
    case "wallet":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M15 15h3" />
        </svg>
      );

    case "calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );

    case "settings":
      return (
        <svg {...common}>
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
          <path d="M19 13.5v-3l-2-.5a7.7 7.7 0 0 0-.8-1.9l1.1-1.7-2.1-2.1-1.7 1.1a7.7 7.7 0 0 0-1.9-.8l-.5-2h-3l-.5 2a7.7 7.7 0 0 0-1.9.8L4 4.2 1.9 6.3 3 8a7.7 7.7 0 0 0-.8 1.9l-2 .5v3l2 .5a7.7 7.7 0 0 0 .8 1.9l-1.1 1.7L4 19.6l1.7-1.1a7.7 7.7 0 0 0 1.9.8l.5 2h3l.5-2a7.7 7.7 0 0 0 1.9-.8l1.7 1.1 2.1-2.1-1.1-1.7a7.7 7.7 0 0 0 .8-1.9z" />
        </svg>
      );

    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h13" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );
  }
}

function StatusDot() {
  return (
    <span
      aria-hidden="true"
      className="size-1.5 rounded-full bg-emerald-500"
    />
  );
}

export default async function PayrollPage() {
  const user = await requireUser();

  await requirePermission(user.id, PERMISSIONS.PAYROLL_VIEW);

  if (!user.organizationId) forbidden();

  const organizationId = user.organizationId;

  const [periods, canCreate, canManageComponents, canManagePayslips] =
    await Promise.all([
      listPayrollPeriods(organizationId),

      hasAnyPermission(user.id, [
        PERMISSIONS.PAYROLL_CREATE,
        PERMISSIONS.PAYROLL_MANAGE,
      ]),

      hasAnyPermission(user.id, [
        PERMISSIONS.PAYROLL_MANAGE,
        PERMISSIONS.PAYROLL_UPDATE,
      ]),

      hasAnyPermission(user.id, [
        PERMISSIONS.PAYSLIP_PUBLISH,
        PERMISSIONS.PAYSLIP_MANAGE,
        PERMISSIONS.PAYROLL_MANAGE,
      ]),
    ]);

  const latestPeriod = periods[0] ?? null;

  return (
    <div className="space-y-6 sm:space-y-8">

      {/* ======================================================
          HEADER
          ====================================================== */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">
            Enterprise HRIS
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Payroll
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
            Manage payroll periods, processing runs and payroll components
            from one workspace.
          </p>
        </div>

        <Badge
          variant="outline"
          className="w-fit rounded-full border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700"
        >
          <StatusDot />
          <span className="ml-2">Payroll workspace</span>
        </Badge>
      </section>

      {/* ======================================================
          HERO
          ====================================================== */}
      <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-[#1687F8] via-[#238FF5] to-[#63B4FF] p-6 text-white shadow-[0_12px_40px_rgba(22,135,248,0.16)] sm:p-8">
        <div className="relative z-10">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <PayrollIcon type="wallet" className="size-6" />
          </div>

          <h2 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
            Payroll management
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
            Review payroll cycles, monitor workflow status and access
            organization payroll configuration.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {canCreate ? <PayrollPeriodCreateDialog /> : null}

            {canManageComponents ? (
              <Link
                href="/payroll/components"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <PayrollIcon type="settings" className="size-4" />
                Components
              </Link>
            ) : null}

            <Link
              href="/payroll/payslips"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <PayrollIcon type="wallet" className="size-4" />
              Payslips
            </Link>

            {canManagePayslips ? (
              <Link
                href="/payroll/payslips/upload"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <PayrollIcon type="arrow" className="size-4" />
                Upload payslip
              </Link>
            ) : null}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 size-72 rounded-full bg-white/10"
        />

        <div
          aria-hidden="true"
          className="absolute -bottom-40 right-10 size-80 rounded-full bg-white/5"
        />
      </section>

      {/* ======================================================
          OVERVIEW
          ====================================================== */}
      <section className="grid gap-4 sm:grid-cols-2">

        <Card className="rounded-2xl border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.035)]">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <PayrollIcon type="calendar" />
              </span>

              <div>
                <p className="text-xs font-medium text-slate-500">
                  Payroll periods
                </p>

                <p className="mt-0.5 text-2xl font-bold text-slate-900">
                  {periods.length}
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              Organization-scoped payroll cycles.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.035)]">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <PayrollIcon type="wallet" />
              </span>

              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">
                  Latest period
                </p>

                <p className="mt-0.5 truncate text-lg font-bold text-slate-900">
                  {latestPeriod?.name ?? "No period"}
                </p>
              </div>
            </div>

            <div className="mt-4">
              {latestPeriod ? (
                <div className="flex flex-wrap items-center gap-2">
                  <PayrollPeriodStatusBadge status={latestPeriod.status} />

                  {latestPeriod.run ? (
                    <PayrollRunStatusBadge status={latestPeriod.run.status} />
                  ) : (
                    <span className="text-xs text-slate-500">
                      Run not started
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Create a payroll period to begin.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ======================================================
          PERIODS
          ====================================================== */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            Payroll Periods
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Review payroll cycles and open their processing workspace.
          </p>
        </div>

        {periods.length === 0 ? (
          <EmptyState
            title="No payroll periods yet"
            description="Create your first payroll period to start the payroll workflow."
          />
        ) : (
          <>
            {/* ==================================================
                MOBILE CARDS
                ================================================== */}
            <div className="space-y-3 lg:hidden">
              {periods.map((period) => (
                <Card
                  key={period.id}
                  className="rounded-2xl border-slate-200/80 shadow-[0_3px_18px_rgba(15,23,42,0.035)]"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-slate-900">
                          {period.name}
                        </p>

                        <p className="mt-1 font-mono text-[11px] text-slate-500">
                          {period.code}
                        </p>
                      </div>

                      <PayrollPeriodStatusBadge status={period.status} />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                          Payroll window
                        </p>

                        <p className="mt-1 text-xs font-medium leading-5 text-slate-700">
                          {formatDate(period.periodStart)}
                          <span className="mx-1 text-slate-400">→</span>
                          {formatDate(period.periodEnd)}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                          Payment date
                        </p>

                        <p className="mt-1 text-xs font-medium text-slate-700">
                          {formatDate(period.paymentDate)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <div>
                        <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                          Run
                        </p>

                        <div className="mt-1">
                          {period.run ? (
                            <PayrollRunStatusBadge status={period.run.status} />
                          ) : (
                            <span className="text-xs text-slate-500">
                              Not started
                            </span>
                          )}
                        </div>
                      </div>

                      <Link
                        href={`/payroll/${period.id}`}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100"
                      >
                        Open
                        <PayrollIcon type="arrow" className="size-3.5" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ==================================================
                DESKTOP TABLE
                ================================================== */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_18px_rgba(15,23,42,0.035)] lg:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="h-12 pl-5">
                      Period
                    </TableHead>

                    <TableHead className="h-12">
                      Window
                    </TableHead>

                    <TableHead className="h-12">
                      Payment date
                    </TableHead>

                    <TableHead className="h-12">
                      Period status
                    </TableHead>

                    <TableHead className="h-12">
                      Run status
                    </TableHead>

                    <TableHead className="h-12 pr-5 text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {periods.map((period) => (
                    <TableRow
                      key={period.id}
                      className="transition-colors hover:bg-blue-50/40"
                    >
                      <TableCell className="py-4 pl-5">
                        <span className="font-semibold text-slate-800">
                          {period.name}
                        </span>

                        <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                          {period.code}
                        </span>
                      </TableCell>

                      <TableCell className="text-sm text-slate-600">
                        {formatDate(period.periodStart)}
                        <span className="mx-1 text-slate-400">→</span>
                        {formatDate(period.periodEnd)}
                      </TableCell>

                      <TableCell className="text-sm text-slate-600">
                        {formatDate(period.paymentDate)}
                      </TableCell>

                      <TableCell>
                        <PayrollPeriodStatusBadge status={period.status} />
                      </TableCell>

                      <TableCell>
                        {period.run ? (
                          <PayrollRunStatusBadge status={period.run.status} />
                        ) : (
                          <span className="text-sm text-slate-500">
                            Not started
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="pr-5 text-right">
                        <Link
                          href={`/payroll/${period.id}`}
                          className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                          })}
                        >
                          View
                          <PayrollIcon type="arrow" className="ml-1 size-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      {/* ======================================================
          BUSINESS RULES
          ====================================================== */}
      <Card className="rounded-2xl border-blue-100 bg-blue-50/50 shadow-none">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-blue-100">
              <PayrollIcon type="settings" className="size-[18px]" />
            </span>

            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Payroll controls
              </h3>

              <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600 sm:text-sm">
                <p>
                  Payroll periods and runs remain organization-scoped.
                </p>

                <p>
                  Workflow transitions remain server-controlled and
                  permission-validated.
                </p>

                <p>
                  Historical payroll items, components and payslips remain
                  stable through snapshots.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
