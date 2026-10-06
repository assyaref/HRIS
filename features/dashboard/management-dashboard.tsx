import Link from "next/link";

import { SectionHeading } from "@/components/dashboard/section-heading";
import { StatCard } from "@/components/dashboard/stat-card";
import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/types";
import type { UserAuthorization } from "@/lib/auth/rbac";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";

import { formatDateTime } from "@/features/attendance/format";
import { PayrollPeriodStatusBadge } from "@/features/payroll/payroll-badges";
import { formatDate } from "@/features/payroll/format";

import {
  countLeaveRequestsOnDate,
  countRejectedCheckInsToday,
  getApprovalsOverview,
  getAttendanceOverview,
  getPayrollOverview,
  getWorkforceOverview,
  listRecentAuditActivity,
} from "./queries";

interface ManagementDashboardProps {
  user: CurrentUser;
  authorization: UserAuthorization;
  organizationName: string | null;
  roleLabel: string | null;
}

function greeting(hour: number): string {
  if (hour < 6) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 15) return "Good afternoon";
  return "Good evening";
}

const TODAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
}).format(new Date());

function titleCase(value: string): string {
  return value
    .replace(/[_\-.]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Organization-wide view for admins, HR, management and supervisors. */
export async function ManagementDashboard({
  user,
  authorization,
  organizationName,
  roleLabel,
}: ManagementDashboardProps) {
  const organizationId = user.organizationId as string;
  const granted = new Set(authorization.permissionCodes);
  const can = (code: Permission) => granted.has(code);
  const P = PERMISSIONS;

  const today = parseAttendanceDate(dateStringInTimeZone(new Date(), null));

  const [
    workforce,
    attendance,
    onLeaveToday,
    approvals,
    payroll,
    rejectedCheckIns,
    canViewAudit,
  ] = await Promise.all([
    getWorkforceOverview(organizationId),
    getAttendanceOverview(organizationId, today),
    countLeaveRequestsOnDate(organizationId, today, "approved"),
    getApprovalsOverview(organizationId),
    getPayrollOverview(organizationId),
    countRejectedCheckInsToday(organizationId),
    can(P.AUDIT_VIEW),
  ]);

  const recentAudit = canViewAudit
    ? await listRecentAuditActivity(organizationId, 8)
    : [];

  const quickActions: Array<{
    href: string;
    icon: HrisIconName;
    title: string;
    description: string;
    show: boolean;
  }> = [
    {
      href: "/employees",
      icon: "employees",
      title: "Employees",
      description: "Manage profiles",
      show: can(P.EMPLOYEES_VIEW),
    },
    {
      href: "/attendance/management",
      icon: "attendance",
      title: "Attendance",
      description: "Review today's records",
      show: can(P.ATTENDANCE_VIEW),
    },
    {
      href: "/leave/management",
      icon: "leave",
      title: "Leave",
      description: "Approve leave requests",
      show: can(P.LEAVE_VIEW),
    },
    {
      href: "/payroll",
      icon: "payroll",
      title: "Payroll",
      description: "Run and lock payroll",
      show: can(P.PAYROLL_VIEW),
    },
    {
      href: "/settings/users",
      icon: "users",
      title: "Users",
      description: "Manage accounts & roles",
      show: can(P.USERS_VIEW),
    },
    {
      href: "/projects",
      icon: "projects",
      title: "Projects",
      description: "Track teams & locations",
      show: can(P.PROJECTS_VIEW),
    },
  ];
  const visibleActions = quickActions.filter((a) => a.show);

  const priorities: Array<{ href: string; label: string; count: number; show: boolean }> = [
    {
      href: "/leave/management",
      label: "Leave requests awaiting approval",
      count: approvals.pendingLeave,
      show: can(P.LEAVE_VIEW),
    },
    {
      href: "/permission/management",
      label: "Permission requests awaiting approval",
      count: approvals.pendingPermission,
      show: can(P.PERMISSION_VIEW),
    },
    {
      href: "/payroll",
      label: "Payroll periods mid-process",
      count: approvals.payrollAttention,
      show: can(P.PAYROLL_VIEW),
    },
  ];
  const visiblePriorities = priorities.filter((p) => p.show && p.count > 0);

  const attendanceIsEmpty = attendance.total === 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-600 via-blue-500 to-sky-500 p-6 text-white shadow-lg shadow-blue-200/50 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wider text-blue-100 uppercase">
              {organizationName ?? "Organization"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting(new Date().getHours())} — team overview
            </h1>
            <p className="mt-1 text-sm text-blue-50">
              {TODAY_LABEL}
              {roleLabel ? (
                <span className="ml-2 inline-flex rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-xs font-medium">
                  {roleLabel}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1">
              <HrisIcon name="employees" className="size-3.5" />
              {workforce.total} employees
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-emerald-100">
              <HrisIcon name="check-in" className="size-3.5" />
              {attendance.checkedInNow} checked in now
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1">
              <HrisIcon name="leave" className="size-3.5" />
              {onLeaveToday} on leave
            </span>
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="space-y-4">
        <SectionHeading title="Quick access" description="Jump to a module" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-blue-200 hover:bg-secondary/60"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <HrisIcon name={action.icon} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {action.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {action.description}
                </span>
              </span>
              <HrisIcon
                name="arrow-right"
                className="mt-2.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              />
            </Link>
          ))}
        </div>
      </section>

      {/* Workforce */}
      <section className="space-y-4">
        <SectionHeading
          title="Workforce"
          description="Headcount across your organization"
          action={
            can(P.EMPLOYEES_VIEW) ? (
              <Link
                href="/employees"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/90"
              >
                Manage employees
                <HrisIcon name="arrow-right" className="size-4" />
              </Link>
            ) : undefined
          }
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon="employees"
            label="Total employees"
            value={workforce.total}
            hint={`${workforce.active} active`}
          />
          <StatCard
            icon="profile"
            label="Active"
            value={workforce.active}
            tone="green"
          />
          <StatCard
            icon="trend-up"
            label="Joined (30 days)"
            value={workforce.newLast30Days}
            tone="amber"
          />
        </div>
      </section>

      {/* Attendance today */}
      <section className="space-y-4">
        <SectionHeading
          title="Attendance — today"
          description={
            rejectedCheckIns > 0
              ? `${rejectedCheckIns} rejected check-in attempt${rejectedCheckIns === 1 ? "" : "s"} today worth reviewing`
              : "Check-ins, completes and records for the current day"
          }
          action={
            can(P.ATTENDANCE_VIEW) ? (
              <Link
                href="/attendance/management"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/90"
              >
                Open attendance
                <HrisIcon name="arrow-right" className="size-4" />
              </Link>
            ) : undefined
          }
        />
        {attendanceIsEmpty ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">
                No attendance recorded yet today. Records will appear here as
                employees check in.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard
              icon="check-in"
              label="Checked in now"
              value={attendance.checkedInNow}
              tone="green"
            />
            <StatCard
              icon="check"
              label="Present"
              value={attendance.present}
            />
            <StatCard
              icon="clock"
              label="Completed"
              value={attendance.completed}
            />
            <StatCard
              icon="alert"
              label="Incomplete"
              value={attendance.incomplete}
              tone="amber"
            />
            <StatCard
              icon="alert"
              label="Rejected"
              value={attendance.rejected}
              tone="rose"
            />
          </div>
        )}
      </section>

      {/* Priorities + payroll */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>
              Items waiting for a decision or already mid-workflow
            </CardDescription>
          </CardHeader>
          <CardContent>
            {visiblePriorities.length ? (
              <ul className="divide-y divide-border">
                {visiblePriorities.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between gap-4 py-3 transition-colors hover:text-primary"
                    >
                      <span className="text-sm font-medium text-foreground">
                        {item.label}
                      </span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                All caught up — no pending approvals right now.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Payroll</CardTitle>
            <CardDescription>Latest payroll period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {payroll.latestPeriod ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {payroll.latestPeriod.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {payroll.latestPeriod.code} · payment{" "}
                      {payroll.latestPeriod.paymentDate
                        ? formatDate(payroll.latestPeriod.paymentDate)
                        : "—"}
                    </p>
                  </div>
                  <PayrollPeriodStatusBadge status={payroll.latestPeriod.status} />
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
                    Published payslips
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {payroll.publishedPayslips}
                  </span>
                </div>
                {can(P.PAYROLL_VIEW) ? (
                  <Link
                    href="/payroll"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/90"
                  >
                    Go to payroll
                    <HrisIcon name="arrow-right" className="size-4" />
                  </Link>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No payroll period created yet.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Recent activity */}
      {canViewAudit ? (
        <section className="space-y-4">
          <SectionHeading
            title="Recent activity"
            description="Latest entries from the audit trail"
            action={
              <span className="text-xs text-muted-foreground">
                Audit trail
              </span>
            }
          />
          {recentAudit.length ? (
            <Card>
              <ul className="divide-y divide-border">
                {recentAudit.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {titleCase(entry.action)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {titleCase(entry.entityType)}
                        {entry.actorEmail ? ` · ${entry.actorEmail}` : " · System"}
                      </span>
                    </span>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">
                  The audit trail is empty so far.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      ) : null}
    </div>
  );
}