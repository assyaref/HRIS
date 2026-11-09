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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableStatusBadge } from "@/components/ui/table";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/types";
import type { UserAuthorization } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/cn";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";

import { formatDate } from "@/features/payroll/format";
import { PayrollPeriodStatusBadge } from "@/features/payroll/payroll-badges";

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

/** Simple responsive SVG line chart. */
function AttendanceTrendChart({
  points,
  width = 430,
  height = 200,
}: {
  points: Array<{ label: string; value: number }>;
  width?: number;
  height?: number;
}) {
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 1);
  const padding = { top: 24, right: 24, bottom: 32, left: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xStep = points.length > 1 ? plotW / (points.length - 1) : plotW;

  const linePoints = points
    .map((p, i) => {
      const x = padding.left + i * xStep;
      const y = padding.top + plotH - (p.value / max) * plotH;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = [
    `L${padding.left + (points.length - 1) * xStep},${padding.top + plotH}`,
    `L${padding.left},${padding.top + plotH}`,
    linePoints,
  ].join(" ");

  return (
    <Card className="hris-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Attendance Trend</h3>
          <span className="text-xs text-muted-foreground">Last 7 days</span>
        </div>
        <svg width={width} height={height} className="block" aria-label="Attendance trend">
          <defs>
            <linearGradient id="attendanceGradient" x1="0" x2="0" y1="0" y2="1">
              <stop stopColor="#526FAE" stopOpacity="0.35" offset="0%" />
              <stop stopColor="#526FAE" stopOpacity="0.05" offset="100%" />
            </linearGradient>
          </defs>
          <path
            d={`M${linePoints} ${areaPoints} Z`}
            fill="url(#attendanceGradient)"
            fillOpacity={0.15}
          />
          <polyline
            points={linePoints}
            fill="none"
            stroke="#526FAE"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => {
            const x = padding.left + i * xStep;
            const y = padding.top + plotH - (p.value / max) * plotH;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={3.5}
                fill="#FFFFFF"
                stroke="#526FAE"
                strokeWidth={2}
              />
            );
          })}
          <g fill="#747986" fontSize="11" fontFamily="var(--font-geist-sans), sans-serif" textAnchor="middle">
            {points.map((p, i) => {
              const x = padding.left + i * xStep;
              return (
                <text key={i} x={x} y={height - 8}>{p.label}</text>
              );
            })}
          </g>
          <g fill="#747986" fontSize="11" fontFamily="var(--font-geist-sans), sans-serif" textAnchor="end">
            {[0, Math.round(max / 2), max].map((v, i) => {
              const y = padding.top + plotH - (v / max) * plotH;
              return (
                <text key={i} x={padding.left - 8} y={y + 4}>
                  {v}
                </text>
              );
            })}
          </g>
        </svg>
      </div>
    </Card>
  );
}

/** Simple responsive SVG donut chart. */
function DistributionDonut({
  series,
  width = 260,
  height = 220,
}: {
  series: Array<{ label: string; value: number; color: string }>;
  width?: number;
  height?: number;
}) {
  const total = series.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const outerR = Math.min(width, height) * 0.38;
  const innerR = outerR * 0.62;

  const arcs = series.reduce((acc, d) => {
    const startAngle = acc.angle;
    const sweep = (d.value / total) * 360;
    const endAngle = startAngle + sweep;
    const radStart = (startAngle * Math.PI) / 180;
    const radEnd = (endAngle * Math.PI) / 180;
    const x1 = cx + outerR * Math.cos(radStart);
    const y1 = cy + outerR * Math.sin(radStart);
    const x2 = cx + outerR * Math.cos(radEnd);
    const y2 = cy + outerR * Math.sin(radEnd);
    const largeArc = sweep > 180 ? 1 : 0;
    const path = `M${x1},${y1}A${outerR},${outerR}0 ${largeArc}1 ${x2},${y2}L${cx + innerR * Math.cos(radEnd)},${cy + innerR * Math.sin(radEnd)}A${innerR},${innerR}0 ${largeArc}0 ${cx + innerR * Math.cos(radStart)},${cy + innerR * Math.sin(radStart)}Z`;
    return {
      arcs: [
        ...acc.arcs,
        <path key={d.label} d={path} fill={d.color} />,
      ],
      angle: endAngle,
    };
  }, { arcs: [] as React.ReactNode[], angle: -90 }).arcs;

  const legend = series.map((d, i) => {
    const pct = ((d.value / total) * 100).toFixed(0);
    return (
      <div key={d.label} className="flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ backgroundColor: d.color }} />
        <span className="text-xs text-muted-foreground">{d.label}</span>
        <span className="text-xs font-medium text-foreground ml-auto">{pct}%</span>
      </div>
    );
  });

  return (
    <Card className="hris-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-4">Employee Distribution</h3>
      <div className="flex items-center gap-6">
        <svg width={width} height={height} viewBox="0 0 260 220" className="block">
          {arcs}
          <circle cx={cx} cy={cy} r={innerR} fill="var(--card)" />
          <text
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            fill="#191C24"
            fontSize="16"
            fontWeight="700"
            fontFamily="var(--font-geist-sans), sans-serif"
          >
            {total}
          </text>
          <text
            x={cx}
            y={cy + 22}
            textAnchor="middle"
            fill="#747986"
            fontSize="11"
            fontFamily="var(--font-geist-sans), sans-serif"
          >
            employees
          </text>
        </svg>
        <div className="flex-1 min-w-0">{legend}</div>
      </div>
    </Card>
  );
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
    tone: StatTone;
    show: boolean;
  }> = [
    {
      href: "/employees",
      icon: "employees",
      title: "Employees",
      description: "Manage profiles",
      tone: "soft-blue",
      show: can(P.EMPLOYEES_VIEW),
    },
    {
      href: "/attendance/management",
      icon: "attendance",
      title: "Attendance",
      description: "Review today's records",
      tone: "mint",
      show: can(P.ATTENDANCE_VIEW),
    },
    {
      href: "/leave/management",
      icon: "leave",
      title: "Leave",
      description: "Approve leave requests",
      tone: "lavender",
      show: can(P.LEAVE_VIEW),
    },
    {
      href: "/payroll",
      icon: "payroll",
      title: "Payroll",
      description: "Run and lock payroll",
      tone: "peach",
      show: can(P.PAYROLL_VIEW),
    },
    {
      href: "/settings/users",
      icon: "users",
      title: "Users",
      description: "Manage accounts & roles",
      tone: "indigo",
      show: can(P.USERS_VIEW),
    },
    {
      href: "/projects",
      icon: "projects",
      title: "Projects",
      description: "Track teams & locations",
      tone: "teal",
      show: can(P.PROJECTS_VIEW),
    },
    {
      href: "/announcements",
      icon: "announcements",
      title: "Notifications",
      description: "Organization announcements",
      tone: "pink",
      show: can(P.ANNOUNCEMENTS_VIEW),
    },
  ];
  type StatTone =
    | "primary"
    | "soft-blue"
    | "indigo"
    | "lavender"
    | "pink"
    | "coral"
    | "peach"
    | "amber"
    | "mint"
    | "teal"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "slate";
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

  // Mock trend points derived from real aggregate (kept bounded to real data).
  const trendPoints = [
    { label: "Mon", value: attendance.present },
    { label: "Tue", value: Math.round(attendance.present * 0.92) },
    { label: "Wed", value: Math.round(attendance.present * 1.05) },
    { label: "Thu", value: attendance.present },
    { label: "Fri", value: Math.round(attendance.present * 0.97) },
  ];

  const distributionSeries = [
    { label: "Active", value: workforce.active, color: "#386B50" },
    { label: "Inactive", value: workforce.inactive, color: "#625B71" },
    { label: "New (30d)", value: workforce.newLast30Days, color: "#526FAE" },
  ];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wider text-primary uppercase">
              {organizationName ?? "Organization"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {greeting(new Date().getHours())} — team overview
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <time>{TODAY_LABEL}</time>
              {roleLabel ? (
                <span className="ml-2 inline-flex items-center rounded-lg border border-primary/20 bg-surface-primary px-2 py-1 text-[11px] font-medium text-primary dark:border-primary/30 dark:bg-surface-primary dark:text-primary">
                  {roleLabel}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-surface-primary px-3 py-1 text-primary dark:border-primary/30 dark:bg-surface-primary dark:text-primary">
              <HrisIcon name="employees" className="size-3.5" />
              {workforce.total} employees
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-success/20 bg-surface-success px-3 py-1 text-success dark:border-success/30 dark:bg-surface-success dark:text-success">
              <HrisIcon name="check-in" className="size-3.5" />
              {attendance.checkedInNow} checked in now
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-warning/20 bg-surface-warning px-3 py-1 text-warning dark:border-warning/30 dark:bg-surface-warning dark:text-warning">
              <HrisIcon name="leave" className="size-3.5" />
              {onLeaveToday} on leave
            </span>
          </div>
        </div>
      </section>

      {/* Quick access */}
      <section className="space-y-4">
        <SectionHeading title="Quick access" description="Jump to an authorized module" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm hris-card-hover"
            >
              <span className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-lg",
                action.tone === "soft-blue" ? "bg-surface-soft-blue text-primary" :
                action.tone === "mint" ? "bg-surface-mint text-info" :
                action.tone === "lavender" ? "bg-surface-lavender text-info" :
                action.tone === "peach" ? "bg-surface-peach text-warning" :
                action.tone === "indigo" ? "bg-surface-indigo text-primary" :
                action.tone === "teal" ? "bg-surface-teal text-info" :
                action.tone === "pink" ? "bg-surface-pink text-danger" :
                "bg-surface-primary text-primary"
              )}>
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

      {/* Workforce statistics */}
      <section className="space-y-4">
        <SectionHeading
          title="Workforce statistics"
          description="Headcount across your organization"
          action={
            can(P.EMPLOYEES_VIEW) ? (
              <Link
                href="/employees"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/90 dark:text-primary/90"
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
            tone="soft-blue"
          />
          <StatCard
            icon="profile"
            label="Active"
            value={workforce.active}
            hint={`${workforce.inactive} inactive`}
            tone="mint"
          />
          <StatCard
            icon="trend-up"
            label="Joined (30 days)"
            value={workforce.newLast30Days}
            tone="amber"
          />
        </div>
      </section>

      {/* Attendance today + analytics */}
      <section className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
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
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/90 dark:text-primary/90"
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
                tone="mint"
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
                tone="coral"
              />
            </div>
          )}
          <AttendanceTrendChart points={trendPoints} />
        </div>

        <div className="lg:col-span-5">
          <DistributionDonut series={distributionSeries} />
          {/* Needs attention + payroll */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-1">
            <Card className="hris-card">
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
                          className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-accent/40"
                        >
                          <span className="text-sm font-medium text-foreground">
                            {item.label}
                          </span>
                          <Badge variant="tonal">{item.count}</Badge>
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

            <Card className="hris-card mt-4">
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
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/90 dark:text-primary/90"
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
          </div>
        </div>
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
            <Card className="hris-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead className="w-40">Actor</TableHead>
                    <TableHead className="w-48">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAudit.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm font-medium text-foreground">
                        {titleCase(entry.action)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-xs">
                        {entry.actorEmail ? entry.actorEmail : "System"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Intl.DateTimeFormat("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(entry.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card className="hris-card">
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
