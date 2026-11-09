import Link from "next/link";

import { SectionHeading } from "@/components/dashboard/section-heading";
import { StatCard } from "@/components/dashboard/stat-card";
import { AttendanceTrendChart } from "@/components/dashboard/attendance-trend-chart";
import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
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
    getApprovalsOverview,
  getAttendanceOverview,
  getAttendanceTrend,
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

const QUICK_ACTIONS: Array<{
  href: string;
  icon: HrisIconName;
  title: string;
  description: string;
  tone: StatTone;
  permission: Permission;
}> = [
  {
    href: "/employees",
    icon: "employees",
    title: "Employees",
    description: "Manage profiles",
    tone: "soft-blue",
    permission: PERMISSIONS.EMPLOYEES_VIEW,
  },
  {
    href: "/attendance/management",
    icon: "attendance",
    title: "Attendance",
    description: "Review today's records",
    tone: "mint",
    permission: PERMISSIONS.ATTENDANCE_VIEW,
  },
  {
    href: "/leave/management",
    icon: "leave",
    title: "Leave",
    description: "Approve leave requests",
    tone: "lavender",
    permission: PERMISSIONS.LEAVE_VIEW,
  },
  {
    href: "/payroll",
    icon: "payroll",
    title: "Payroll",
    description: "Run and lock payroll",
    tone: "peach",
    permission: PERMISSIONS.PAYROLL_VIEW,
  },
  {
    href: "/settings/users",
    icon: "users",
    title: "Users",
    description: "Manage accounts & roles",
    tone: "indigo",
    permission: PERMISSIONS.USERS_VIEW,
  },
  {
    href: "/projects",
    icon: "projects",
    title: "Projects",
    description: "Track teams & locations",
    tone: "teal",
    permission: PERMISSIONS.PROJECTS_VIEW,
  },
  {
    href: "/announcements",
    icon: "announcements",
    title: "Notifications",
    description: "Organization announcements",
    tone: "pink",
    permission: PERMISSIONS.ANNOUNCEMENTS_VIEW,
  },
];

const iconToneClasses: Record<StatTone, string> = {
  primary: "bg-surface-primary text-accent-foreground",
  "soft-blue": "bg-surface-soft-blue text-accent-foreground",
  indigo: "bg-surface-indigo text-accent-foreground",
  lavender: "bg-surface-lavender text-accent-foreground",
  pink: "bg-surface-pink text-accent-foreground",
  coral: "bg-surface-coral text-accent-foreground",
  peach: "bg-surface-peach text-accent-foreground",
  amber: "bg-surface-amber text-accent-foreground",
  mint: "bg-surface-mint text-accent-foreground",
  teal: "bg-surface-teal text-accent-foreground",
  success: "bg-surface-success text-success",
  warning: "bg-surface-warning text-warning",
  danger: "bg-surface-danger text-danger",
  info: "bg-surface-info text-info",
  slate: "bg-muted text-muted-foreground",
};

/** Simple responsive SVG line chart (client component, real data). */
function DistributionDonut({
  series,
  width = 250,
  height = 210,
}: {
  series: Array<{ label: string; value: number; color: string }>;
  width?: number;
  height?: number;
}) {
  const total = series.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const outerR = Math.min(width, height) * 0.36;
  const innerR = outerR * 0.6;

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

      const legend = series.map((d) => {
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
    <Card className="p-5">
      <CardHeader className="pb-0">
        <CardTitle>Employee distribution</CardTitle>
        <CardDescription>
          Headcount by employment status
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-5">
          <svg width={width} height={height} viewBox="0 0 250 210" className="block">
            {arcs}
            <circle cx={cx} cy={cy} r={innerR} fill="var(--card)" />
            <text
              x={cx}
              y={cy + 6}
              textAnchor="middle"
              fill="#191C24"
              fontSize="17"
              fontWeight="700"
              fontFamily="var(--font-geist-sans), sans-serif"
            >
              {total}
            </text>
            <text
              x={cx}
              y={cy + 23}
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
      </CardContent>
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
    trend,
    canViewAudit,
  ] = await Promise.all([
    getWorkforceOverview(organizationId),
    getAttendanceOverview(organizationId, today),
    countLeaveRequestsOnDate(organizationId, today, "approved"),
    getApprovalsOverview(organizationId),
    getPayrollOverview(organizationId),
    getAttendanceTrend(organizationId),
    can(P.AUDIT_VIEW),
  ]);

  const recentAudit = canViewAudit
    ? await listRecentAuditActivity(organizationId, 8)
    : [];

  const trendHasData = trend.some(
    (p) => p.present > 0 || p.completed > 0
  );
  const trendPoints = trend.map((p) => ({
    label: p.label,
    value: p.present + p.completed,
  }));

  const visibleActions = QUICK_ACTIONS.filter((a) => can(a.permission));

  const priorities: Array<{
    href: string;
    label: string;
    count: number;
    show: boolean;
  }> = [
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

  return (
    <div className="space-y-7">
      {/* Page header */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-primary uppercase">
              {organizationName ?? "Organization"}
            </p>
            <h1 className="mt-1 text-page-title tracking-tight">
              {greeting(new Date().getHours())} — team overview
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <time>{TODAY_LABEL}</time>
              {roleLabel ? (
                <span className="ml-2 inline-flex items-center rounded-[10px] border border-primary/20 bg-surface-primary px-2.5 py-1 text-[11px] font-medium text-primary dark:border-primary/30 dark:bg-surface-primary dark:text-primary">
                  {roleLabel}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-primary/20 bg-surface-primary px-3 py-1.5 text-primary dark:border-primary/30 dark:bg-surface-primary dark:text-primary">
              <HrisIcon name="employees" className="size-3.5" />
              {workforce.total} employees
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-success/20 bg-surface-success px-3 py-1.5 text-success dark:border-success/30 dark:bg-surface-success dark:text-success">
              <HrisIcon name="check-in" className="size-3.5" />
              {attendance.checkedInNow} checked in now
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-warning/20 bg-surface-warning px-3 py-1.5 text-warning dark:border-warning/30 dark:bg-surface-warning dark:text-warning">
              <HrisIcon name="leave" className="size-3.5" />
              {onLeaveToday} on leave
            </span>
          </div>
        </div>
      </section>

      {/* Quick access */}
      <section className="space-y-3">
        <SectionHeading
          title="Quick access"
          description="Jump to an authorized module"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-start gap-3 rounded-[20px] border border-border bg-card p-4 hris-card-hover"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-[12px]",
                  iconToneClasses[action.tone]
                )}
              >
                <HrisIcon name={action.icon} className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {action.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {action.description}
                </span>
              </div>
              <HrisIcon
                name="arrow-right"
                className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
              />
            </Link>
          ))}
        </div>
      </section>

      {/* Workforce statistics */}
      <section className="space-y-3">
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <StatCard
            icon="leave"
            label="On leave today"
            value={onLeaveToday}
            tone="peach"
          />
        </div>
      </section>

      {/* Main dashboard content — asymmetric 65/35 desktop layout */}
      <section className="grid gap-4 lg:grid-cols-12">
        {/* Main content ~65% */}
        <div className="lg:col-span-8 space-y-4">
          <SectionHeading
            title="Attendance trend"
            description={
              trendHasData
                ? "Check-ins and completions over the trailing 7 days"
                : "No attendance records yet. The chart will appear as employees check in."
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
          {trendHasData ? (
            <Card className="p-5">
              <AttendanceTrendChart points={trendPoints} height={250} />
            </Card>
          ) : (
            <Card className="p-5">
              <CardContent className="p-8 text-center">
                <HrisIcon name="trend-up" className="mx-auto size-12 mb-3 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">No attendance data yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Check-in records will appear here as employees record their
                  attendance. The trend updates automatically.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <AttendanceAnalytics
              checkedInNow={attendance.checkedInNow}
              present={attendance.present}
              completed={attendance.completed}
              incomplete={attendance.incomplete}
              rejected={attendance.rejected}
            />
            <DistributionDonut
              series={[
                { label: "Active", value: workforce.active, color: "#386B50" },
                {
                  label: "Inactive",
                  value: workforce.inactive,
                  color: "#625B71",
                },
                {
                  label: "New (30d)",
                  value: workforce.newLast30Days,
                  color: "#526FAE",
                },
              ]}
            />
          </div>
        </div>

        {/* Supporting content ~35% */}
        <div className="lg:col-span-4 space-y-4">
          {/* Needs attention + pending approvals */}
          <Card className="p-5">
            <CardHeader className="pb-0">
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>
                Items waiting for a decision or already mid-workflow
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {visiblePriorities.length ? (
                <ul className="divide-y divide-border">
                  {visiblePriorities.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-accent/50 dark:hover:bg-muted/40"
                      >
                        <span className="text-sm font-medium text-foreground truncate">
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

          {/* Payroll overview */}
          <Card className="p-5">
            <CardHeader className="pb-0">
              <CardTitle>Payroll</CardTitle>
              <CardDescription>Latest payroll period</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
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
                    <PayrollPeriodStatusBadge
                      status={payroll.latestPeriod.status}
                    />
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

          {/* Recent activity */}
          {canViewAudit ? (
            <Card className="p-5">
              <CardHeader className="pb-0">
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>
                  Latest entries from the audit trail
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {recentAudit.length ? (
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
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The audit trail is empty so far.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AttendanceAnalytics({
  checkedInNow,
  present,
  completed,
  incomplete,
  rejected,
}: {
  checkedInNow: number;
  present: number;
  completed: number;
  incomplete: number;
  rejected: number;
}) {
  return (
    <Card className="p-5">
      <CardHeader className="pb-0">
        <CardTitle>Attendance today</CardTitle>
        <CardDescription>
          Check-ins, completes and records for the current day
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-3">
          <StatCard
            icon="check-in"
            label="Checked in now"
            value={checkedInNow}
            tone="mint"
          />
          <StatCard
            icon="check"
            label="Present"
            value={present}
          />
          <StatCard
            icon="clock"
            label="Completed"
            value={completed}
          />
          <StatCard
            icon="alert"
            label="Incomplete"
            value={incomplete}
            tone="amber"
          />
          <StatCard
            icon="alert"
            label="Rejected"
            value={rejected}
            tone="peach"
          />
        </div>
      </CardContent>
    </Card>
  );
}
