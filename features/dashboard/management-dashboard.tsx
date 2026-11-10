import Link from "next/link";

import { AttendanceTrendChart } from "@/components/dashboard/attendance-trend-chart";
import {
  MonthlyRecapCard,
  type MonthlyRecapView,
} from "@/components/dashboard/monthly-recap-card";
import {
  QuickAccessCard,
  type QuickAccessTone,
} from "@/components/dashboard/quick-access-card";
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
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";
import {
  APP_TIME_ZONE,
  indonesianGreeting,
  longDateLabel,
} from "@/lib/utils/greeting";

import { getEmployeeSelfProfile } from "@/features/employees/queries";
import { formatDate } from "@/features/payroll/format";
import { PayrollPeriodStatusBadge } from "@/features/payroll/payroll-badges";

import {
  countLeaveRequestsOnDate,
  getApprovalsOverview,
  getAttendanceOverview,
  getAttendanceTrend,
  getMonthlyRecap,
  getPayrollOverview,
  getWorkforceOverview,
  listRecentAuditActivity,
  recentMonthKeys,
} from "./queries";

interface ManagementDashboardProps {
  user: CurrentUser;
  authorization: UserAuthorization;
  organizationName: string | null;
  roleLabel: string | null;
  /** Selected recap month ("YYYY-MM", from `?bulan=`). */
  monthKey: string;
}

function titleCase(value: string): string {
  return value
    .replace(/[_\-.]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const QUICK_ACTIONS: Array<{
  href: string;
  icon: HrisIconName;
  title: string;
  description: string;
  tone: QuickAccessTone;
  permission: Permission | null;
  superadminOnly?: boolean;
}> = [
  {
    href: "/employees",
    icon: "employees",
    title: "Karyawan",
    description: "Kelola profil karyawan",
    tone: "soft-blue",
    permission: PERMISSIONS.EMPLOYEES_VIEW,
  },
  {
    href: "/attendance/management",
    icon: "calendar-check",
    title: "Absensi",
    description: "Tinjau absensi hari ini",
    tone: "mint",
    permission: PERMISSIONS.ATTENDANCE_MANAGE,
  },
  {
    href: "/leave/management",
    icon: "leave",
    title: "Cuti",
    description: "Setujui pengajuan cuti",
    tone: "lavender",
    permission: PERMISSIONS.LEAVE_APPROVE,
  },
  {
    href: "/settings/users",
    icon: "users",
    title: "Pengguna",
    description: "Kelola akun & role",
    tone: "indigo",
    permission: PERMISSIONS.USERS_VIEW,
  },
  {
    href: "/projects",
    icon: "projects",
    title: "Proyek",
    description: "Pantau tim & lokasi",
    tone: "teal",
    permission: null,
    superadminOnly: true,
  },
  {
    href: "/announcements/management",
    icon: "megaphone",
    title: "Pengumuman",
    description: "Pengumuman organisasi",
    tone: "pink",
    permission: PERMISSIONS.ANNOUNCEMENTS_VIEW,
  },
];

/** Compact responsive SVG donut for workforce distribution. */
function DistributionDonut({
  series,
  width = 170,
  height = 150,
}: {
  series: Array<{ label: string; value: number; color: string }>;
  width?: number;
  height?: number;
}) {
  const total = series.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const outerR = Math.min(width, height) * 0.34;
  const innerR = outerR * 0.72;

  const arcs = series.reduce((acc, d) => {
    const startAngle = acc.angle;
    // A full 360° arc has identical start/end points and draws nothing.
    const sweep = Math.min((d.value / total) * 360, 359.99);
    const endAngle = startAngle + sweep;
    const radStart = (startAngle * Math.PI) / 180;
    const radEnd = (endAngle * Math.PI) / 180;
    const x1 = cx + outerR * Math.cos(radStart);
    const y1 = cy + outerR * Math.sin(radStart);
    const x2 = cx + outerR * Math.cos(radEnd);
    const y2 = cy + outerR * Math.sin(radEnd);
    const largeArc = sweep > 180 ? 1 : 0;
    const path = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${cx + innerR * Math.cos(radEnd)} ${cy + innerR * Math.sin(radEnd)}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${cx + innerR * Math.cos(radStart)} ${cy + innerR * Math.sin(radStart)}`,
      "Z",
    ].join(" ");
    return {
      arcs: [
        ...acc.arcs,
        <path key={d.label} d={path} fill={d.color} />,
      ],
      angle: endAngle,
    };
  }, { arcs: [] as React.ReactNode[], angle: -90 }).arcs;

  const legend = series.map((d) => {
    const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : "0";
    return (
      <div key={d.label} className="flex items-center gap-2 py-1">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
        <span className="text-xs text-muted-foreground">{d.label}</span>
        <span className="ml-auto text-xs font-semibold text-foreground tabular-nums">{pct}%</span>
      </div>
    );
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Distribusi karyawan</CardTitle>
        <CardDescription>Jumlah karyawan per status kerja</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block shrink-0"
          >
            {arcs}
            <circle cx={cx} cy={cy} r={innerR} fill="var(--card)" />
            <text
              x={cx}
              y={cy + 5}
              textAnchor="middle"
              style={{ fill: "var(--foreground)" }}
              fontSize="18"
              fontWeight="700"
              fontFamily="var(--font-jakarta), sans-serif"
            >
              {total}
            </text>
            <text
              x={cx}
              y={cy + 21}
              textAnchor="middle"
              style={{ fill: "var(--muted-foreground)" }}
              fontSize="10"
              fontFamily="var(--font-jakarta), sans-serif"
            >
              karyawan
            </text>
          </svg>
          <div className="min-w-0 flex-1">{legend}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Empty state for the attendance trend: chart icon over a soft wave. */
function AttendanceTrendEmpty() {
  return (
    <div className="relative flex min-h-[170px] flex-col items-center justify-center overflow-hidden rounded-2xl px-6 pt-6 pb-12 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 600 120"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-14 w-full text-surface-primary"
      >
        <path
          d="M0 80C80 40 150 60 220 70s150-50 230-40 110 40 150 30v60H0z"
          fill="currentColor"
          opacity="0.7"
        />
        <path
          d="M0 100c90-20 170-10 260 0s200-30 340-10v30H0z"
          fill="currentColor"
        />
      </svg>
      <div className="relative flex size-14 items-center justify-center rounded-2xl bg-surface-primary text-primary shadow-[0_10px_20px_-14px_rgb(30_99_238/0.8)]">
        <HrisIcon name="bar-chart" className="size-7" />
      </div>
      <h3 className="relative mt-3 text-base font-bold text-foreground">
        Belum ada data absensi
      </h3>
      <p className="relative mt-1 text-sm text-muted-foreground">
        Catatan check-in akan muncul di sini saat karyawan melakukan absensi.
      </p>
    </div>
  );
}

const linkClass =
  "inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/85";

/**
 * Organization-wide view for admins, HR, management and supervisors
 * (HRIS Lite Enterprise v2.0). Two columns on desktop: modules, workforce
 * metrics and the attendance trend on the left; the signed-in user's monthly
 * recap, items needing attention and payroll on the right.
 */
export async function ManagementDashboard({
  user,
  authorization,
  organizationName,
  roleLabel,
  monthKey,
}: ManagementDashboardProps) {
  const organizationId = user.organizationId as string;
  const granted = new Set(authorization.permissionCodes);
  const can = (code: Permission) => granted.has(code);
  const P = PERMISSIONS;

  const today = parseAttendanceDate(
    dateStringInTimeZone(new Date(), APP_TIME_ZONE)
  );

  const [
    workforce,
    attendance,
    onLeaveToday,
    approvals,
    payroll,
    trend,
    selfProfile,
  ] = await Promise.all([
    getWorkforceOverview(organizationId),
    getAttendanceOverview(organizationId, today),
    countLeaveRequestsOnDate(organizationId, today, "approved"),
    getApprovalsOverview(organizationId),
    getPayrollOverview(organizationId),
    getAttendanceTrend(organizationId),
    getEmployeeSelfProfile(user.id, organizationId),
  ]);

  const canViewAudit = can(P.AUDIT_VIEW);
  const [recentAudit, recap] = await Promise.all([
    canViewAudit ? listRecentAuditActivity(organizationId, 6) : Promise.resolve([]),
    selfProfile
      ? getMonthlyRecap(organizationId, selfProfile.id, monthKey)
      : Promise.resolve(null),
  ]);

  const trendHasData = trend.some((p) => p.present > 0 || p.completed > 0);
  const trendPoints = trend.map((p) => ({
    label: p.label,
    value: p.present + p.completed,
  }));

  const visibleActions = QUICK_ACTIONS.filter((action) =>
    action.superadminOnly
      ? authorization.isSuperAdmin
      : action.permission === null || can(action.permission)
  );

  const priorities = [
    {
      href: "/leave/management",
      label: "Pengajuan cuti menunggu persetujuan",
      count: approvals.pendingLeave,
      show: can(P.LEAVE_APPROVE) || can(P.LEAVE_MANAGE),
    },
    {
      href: "/permission/management",
      label: "Pengajuan izin menunggu persetujuan",
      count: approvals.pendingPermission,
      show: can(P.PERMISSION_APPROVE) || can(P.PERMISSION_MANAGE),
    },
    {
      href: "/payroll",
      label: "Periode payroll sedang diproses",
      count: approvals.payrollAttention,
      show: can(P.PAYROLL_VIEW),
    },
  ].filter((item) => item.show && item.count > 0);

  const recapView: MonthlyRecapView | null = recap;

  return (
    <div className="space-y-7">
      {/* Page header */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.08em] text-primary uppercase">
            {organizationName ?? "Organisasi"}
          </p>
          <h1 className="mt-1 text-2xl tracking-tight sm:text-[28px]">
            {indonesianGreeting()} — ringkasan tim
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
            <time>{longDateLabel()}</time>
            {roleLabel ? (
              <span className="inline-flex items-center rounded-full border border-primary/40 bg-surface-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                {roleLabel}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold">
          <span className="inline-flex items-center gap-2 rounded-xl bg-[#E4EEFF] px-3.5 py-2 text-primary dark:bg-surface-primary">
            <HrisIcon name="user" className="size-4" />
            {workforce.total} karyawan
          </span>
          <span className="inline-flex items-center gap-2 rounded-xl bg-[#DDF5E6] px-3.5 py-2 text-[#15803D] dark:bg-surface-success dark:text-success">
            <HrisIcon name="calendar-check" className="size-4" />
            {attendance.checkedInNow} sedang hadir
          </span>
          <span className="inline-flex items-center gap-2 rounded-xl bg-[#FFEFD2] px-3.5 py-2 text-[#B45309] dark:bg-surface-warning dark:text-warning">
            <HrisIcon name="calendar" className="size-4" />
            {onLeaveToday} cuti hari ini
          </span>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Main column */}
        <div className="min-w-0 space-y-7">
          {visibleActions.length > 0 ? (
            <section className="space-y-3.5">
              <SectionHeading
                title="Akses Cepat"
                description="Buka modul yang Anda miliki aksesnya"
              />
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 2xl:grid-cols-3">
                {visibleActions.map((action) => (
                  <QuickAccessCard
                    key={action.href}
                    href={action.href}
                    icon={action.icon}
                    title={action.title}
                    description={action.description}
                    tone={action.tone}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3.5">
            <SectionHeading
              title="Statistik Karyawan"
              description="Jumlah karyawan di organisasi Anda"
              action={
                can(P.EMPLOYEES_VIEW) ? (
                  <Link href="/employees" className={linkClass}>
                    Kelola karyawan
                    <HrisIcon name="arrow-right" className="size-4" />
                  </Link>
                ) : undefined
              }
            />
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 2xl:grid-cols-4">
              <StatCard
                icon="employees"
                label="Total karyawan"
                value={workforce.total}
                hint={`${workforce.active} aktif`}
                tone="soft-blue"
              />
              <StatCard
                icon="user"
                label="Aktif"
                value={workforce.active}
                hint={`${workforce.inactive} nonaktif`}
                tone="mint"
              />
              <StatCard
                icon="calendar"
                label="Bergabung (30 hari)"
                value={workforce.newLast30Days}
                tone="amber"
              />
              <StatCard
                icon="plane"
                label="Cuti hari ini"
                value={onLeaveToday}
                tone="lavender"
              />
            </div>
          </section>

          <section className="space-y-3.5">
            <SectionHeading
              title="Tren Kehadiran"
              description={
                trendHasData
                  ? "Check-in dan absensi selesai dalam 7 hari terakhir"
                  : "Belum ada catatan absensi. Grafik muncul saat karyawan check-in."
              }
              action={
                can(P.ATTENDANCE_MANAGE) ? (
                  <Link href="/attendance/management" className={linkClass}>
                    Buka absensi
                    <HrisIcon name="arrow-right" className="size-4" />
                  </Link>
                ) : undefined
              }
            />
            <Card>
              <CardContent className="p-3 sm:p-4">
                {trendHasData ? (
                  <AttendanceTrendChart points={trendPoints} height={210} />
                ) : (
                  <AttendanceTrendEmpty />
                )}
              </CardContent>
            </Card>
          </section>

          <AttendanceAnalytics
            checkedInNow={attendance.checkedInNow}
            present={attendance.present}
            completed={attendance.completed}
            incomplete={attendance.incomplete}
            rejected={attendance.rejected}
          />

          {canViewAudit ? (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Aktivitas terbaru</CardTitle>
                <CardDescription>Entri terbaru dari jejak audit</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {recentAudit.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aksi</TableHead>
                        <TableHead className="w-48">Pelaku</TableHead>
                        <TableHead className="w-48">Waktu</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentAudit.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-sm font-medium text-foreground">
                            {titleCase(entry.action)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                            {entry.actorEmail ? entry.actorEmail : "Sistem"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Intl.DateTimeFormat("id-ID", {
                              timeZone: APP_TIME_ZONE,
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
                    Jejak audit masih kosong.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Side column */}
        <aside className="min-w-0 space-y-5">
          {recapView ? (
            <MonthlyRecapCard
              recap={recapView}
              monthOptions={recentMonthKeys(6)}
              header="band"
            />
          ) : null}

          <section className="hris-attention rounded-[20px] p-5" aria-labelledby="perlu-perhatian">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[#FFE7C2] text-[#D97706] dark:bg-surface-warning">
                <HrisIcon name="alert-triangle" className="size-[22px]" />
              </span>
              <h2 id="perlu-perhatian" className="text-[17px] font-bold text-foreground">
                Perlu Perhatian
              </h2>
            </div>
            <ul className="mt-3.5 space-y-2.5 text-[15px] text-foreground/90">
              <li className="flex gap-2.5">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-[#F59E0B]" />
                Item yang menunggu keputusan atau sedang diproses
              </li>
              {priorities.length ? (
                priorities.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-white/70 dark:hover:bg-white/5"
                    >
                      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#F59E0B]" />
                      <span className="min-w-0 flex-1">{item.label}</span>
                      <Badge variant="warning">{item.count}</Badge>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-[#F59E0B]" />
                  Semua beres — tidak ada persetujuan yang tertunda.
                </li>
              )}
            </ul>
          </section>

          {can(P.PAYROLL_VIEW) ? (
            <Link
              href="/payroll"
              className="group flex items-center gap-4 rounded-[20px] border border-[var(--card-border)] bg-card p-5 hris-card hris-card-hover"
            >
              <span className="hris-chip-blue flex size-14 shrink-0 items-center justify-center rounded-2xl">
                <HrisIcon name="wallet" className="size-7" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-bold text-foreground">Payroll</span>
                {payroll.latestPeriod ? (
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {payroll.latestPeriod.name}
                    {payroll.latestPeriod.paymentDate
                      ? ` · bayar ${formatDate(payroll.latestPeriod.paymentDate)}`
                      : ""}
                  </span>
                ) : (
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    Periode payroll terbaru
                  </span>
                )}
                {payroll.latestPeriod ? (
                  <span className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <PayrollPeriodStatusBadge status={payroll.latestPeriod.status} />
                    {payroll.publishedPayslips} slip terbit
                  </span>
                ) : null}
              </span>
              <HrisIcon
                name="chevron-right"
                className="size-6 shrink-0 text-foreground/70 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ) : null}

          <DistributionDonut
            series={[
              // New hires are a subset of active: split them out so the
              // slices sum to the headcount instead of double counting.
              {
                label: "Aktif",
                value: Math.max(0, workforce.active - workforce.newLast30Days),
                color: "#22C55E",
              },
              { label: "Nonaktif", value: workforce.inactive, color: "#94A3B8" },
              { label: "Baru (30 hari)", value: workforce.newLast30Days, color: "#1E63EE" },
            ]}
          />
        </aside>
      </div>
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
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Absensi hari ini</CardTitle>
        <CardDescription>Check-in, selesai, dan catatan hari ini</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-5">
          <StatCard icon="check-in" label="Sedang hadir" value={checkedInNow} tone="mint" compact />
          <StatCard icon="check" label="Hadir" value={present} compact />
          <StatCard icon="clock" label="Selesai" value={completed} tone="teal" compact />
          <StatCard icon="alert" label="Belum lengkap" value={incomplete} tone="amber" compact />
          <StatCard icon="alert" label="Ditolak" value={rejected} tone="rose" compact />
        </div>
      </CardContent>
    </Card>
  );
}
