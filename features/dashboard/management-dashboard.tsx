import Link from "next/link";

import {
  MonthlyRecapCard,
  type MonthlyRecapView,
} from "@/components/dashboard/monthly-recap-card";
import {
  QuickAccessCard,
  type QuickAccessTone,
} from "@/components/dashboard/quick-access-card";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { RingLegend, SegmentRing } from "@/components/dashboard/segment-ring";
import { StackedBarChart } from "@/components/dashboard/stacked-bar-chart";
import { EXPIRING_WINDOW_DAYS } from "@/features/compliance/contract-status";
import { countByStatus, listContractRows } from "@/features/compliance/queries";
import {
  ageDistribution,
  genderSplit,
  profileCompleteness,
} from "@/features/insights/workforce";
import { listInsightEmployees } from "@/features/insights/queries";
import { isComplianceModuleReady } from "@/features/compliance/module";
import {
  latestPerEmployee,
  listMcuRecords,
  listTrainingRecords,
} from "@/features/compliance/records.queries";
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
  // Workforce insights: completeness needs the employee list; demographics
  // aggregate personal data; contract warnings read Employment data.
  const canInsights = can(P.EMPLOYEES_VIEW);
  const canDemographics = canInsights && can(P.EMPLOYEES_PERSONAL_VIEW);
  const canContracts = canInsights && can(P.EMPLOYEES_EMPLOYMENT_VIEW);
  const todayDateKey = dateStringInTimeZone(new Date(), APP_TIME_ZONE);
  // Compliance alerts only once migration 0023 is applied.
  const complianceReady = canInsights ? await isComplianceModuleReady() : false;
  const [recentAudit, recap, insightRows, contractRows, mcuRows, trainingRows] = await Promise.all([
    canViewAudit ? listRecentAuditActivity(organizationId, 6) : Promise.resolve([]),
    selfProfile
      ? getMonthlyRecap(organizationId, selfProfile.id, monthKey)
      : Promise.resolve(null),
    canInsights ? listInsightEmployees(organizationId) : Promise.resolve([]),
    canContracts ? listContractRows(organizationId, todayDateKey) : Promise.resolve([]),
    complianceReady && canDemographics
      ? listMcuRecords(organizationId, todayDateKey).then(latestPerEmployee)
      : Promise.resolve([]),
    complianceReady && canContracts
      ? listTrainingRecords(organizationId, todayDateKey)
      : Promise.resolve([]),
  ]);
  const countStatus = (rows: readonly { status: string }[], status: string) =>
    rows.filter((row) => row.status === status).length;
  const completeness = profileCompleteness(insightRows);
  const gender = genderSplit(insightRows);
  const ages = ageDistribution(insightRows, todayDateKey);
  const contractCounts = countByStatus(contractRows);

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
    {
      href: "/monitoring/contracts?status=expired",
      label: "Kontrak karyawan sudah kedaluwarsa",
      count: contractCounts.expired,
      show: canContracts,
    },
    {
      href: "/monitoring/contracts?status=expiring",
      label: `Kontrak berakhir dalam ${EXPIRING_WINDOW_DAYS} hari`,
      count: contractCounts.expiring,
      show: canContracts,
    },
    {
      href: "/compliance/mcu?status=expired",
      label: "MCU karyawan sudah kedaluwarsa",
      count: countStatus(mcuRows, "expired"),
      show: complianceReady && canDemographics,
    },
    {
      href: "/compliance/mcu?status=expiring",
      label: "MCU berakhir dalam 30 hari",
      count: countStatus(mcuRows, "expiring"),
      show: complianceReady && canDemographics,
    },
    {
      href: "/compliance/trainings?status=expired",
      label: "Sertifikat training kedaluwarsa",
      count: countStatus(trainingRows, "expired"),
      show: complianceReady && canContracts,
    },
    {
      href: "/compliance/trainings?status=expiring",
      label: "Sertifikat training berakhir dalam 30 hari",
      count: countStatus(trainingRows, "expiring"),
      show: complianceReady && canContracts,
    },
  ].filter((item) => item.show && item.count > 0);

  const recapView: MonthlyRecapView | null = recap;
  const pendingApprovals =
    (can(P.LEAVE_APPROVE) || can(P.LEAVE_MANAGE) ? approvals.pendingLeave : 0) +
    (can(P.PERMISSION_APPROVE) || can(P.PERMISSION_MANAGE)
      ? approvals.pendingPermission
      : 0);

  const overviewTiles: Array<{
    value: number;
    sub: string;
    label: string;
    href?: string;
  }> = [
    {
      value: workforce.total,
      sub: `${workforce.active} aktif`,
      label: "Total Karyawan",
      href: can(P.EMPLOYEES_VIEW) ? "/employees" : undefined,
    },
    {
      value: attendance.checkedInNow,
      sub: `${attendance.present + attendance.completed} hadir`,
      label: "Sedang Hadir",
      href: can(P.ATTENDANCE_MANAGE) ? "/attendance/management" : undefined,
    },
    {
      value: onLeaveToday,
      sub: "hari ini",
      label: "Sedang Cuti",
      href: can(P.LEAVE_APPROVE) || can(P.LEAVE_MANAGE) ? "/leave/management" : undefined,
    },
    {
      value: workforce.newLast30Days,
      sub: "30 hari",
      label: "Karyawan Baru",
    },
    {
      value: pendingApprovals,
      sub: "tertunda",
      label: "Persetujuan",
      href: pendingApprovals > 0 ? "/approvals?status=pending" : undefined,
    },
  ];

  const distribution = [
    {
      label: "Aktif",
      value: Math.max(0, workforce.active - workforce.newLast30Days),
      color: "#22C55E",
    },
    { label: "Baru (30 hari)", value: workforce.newLast30Days, color: "#3B82F6" },
    { label: "Nonaktif", value: workforce.inactive, color: "#F97316" },
  ];

  const todaySlices = [
    { label: "Sedang hadir", value: attendance.present, color: "#8B5CF6" },
    { label: "Selesai", value: attendance.completed, color: "#22C55E" },
    { label: "Belum lengkap", value: attendance.incomplete, color: "#F97316" },
    { label: "Ditolak", value: attendance.rejected, color: "#EF4444" },
  ];
  const todayTotal = todaySlices.reduce((sum, s) => sum + s.value, 0);

  const trendTotals = trend.reduce(
    (acc, p) => ({
      all: acc.all + p.present + p.completed + p.incomplete + p.rejected,
      done: acc.done + p.completed,
      open: acc.open + p.incomplete + p.rejected,
    }),
    { all: 0, done: 0, open: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Quick overview */}
      <section
        className="hris-overview p-5 sm:p-6"
        aria-labelledby="ringkasan-cepat"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="ringkasan-cepat" className="text-xl sm:text-[22px]">
              Ringkasan Cepat
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground/70">
              <span>{organizationName ?? "Organisasi"}</span>
              <span aria-hidden="true">·</span>
              <time>{longDateLabel()}</time>
              {roleLabel ? (
                <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-primary dark:bg-white/10">
                  {roleLabel}
                </span>
              ) : null}
            </p>
          </div>
          <p className="hidden text-sm font-medium text-foreground/70 sm:block">
            {indonesianGreeting()}
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {overviewTiles.map((tile) => {
            const body = (
              <>
                <p className="flex items-baseline gap-1.5">
                  <span className="text-[26px] leading-none font-bold tracking-tight text-foreground tabular-nums">
                    {tile.value}
                  </span>
                  <span className="truncate text-[12px] text-foreground/60">
                    ({tile.sub})
                  </span>
                </p>
                <p className="mt-2 truncate text-[15px] font-medium text-foreground/85">
                  {tile.label}
                </p>
              </>
            );
            return tile.href ? (
              <Link
                key={tile.label}
                href={tile.href}
                className="hris-glass block px-4 py-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-5"
              >
                {body}
              </Link>
            ) : (
              <div key={tile.label} className="hris-glass px-4 py-4 sm:px-5">
                {body}
              </div>
            );
          })}
        </div>
      </section>

      {/* Distribution + today's attendance numbers */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-[17px]">Distribusi Karyawan</CardTitle>
              <CardDescription>Komposisi berdasarkan status kerja</CardDescription>
            </div>
            {can(P.EMPLOYEES_VIEW) ? (
              <Link href="/employees" className={linkClass}>
                Kelola
                <HrisIcon name="arrow-right" className="size-4" />
              </Link>
            ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 pt-2 sm:flex-row sm:gap-8">
            <SegmentRing
              slices={distribution}
              variant="solid"
              size={190}
              centerValue={workforce.total}
              centerLabel="karyawan"
            />
            <div className="w-full min-w-0 flex-1">
              <RingLegend slices={distribution} />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            icon="check-in"
            label="Hadir Hari Ini"
            value={attendance.present + attendance.completed}
            hint={`${attendance.checkedInNow} sedang di lokasi`}
            tone="mint"
          />
          <StatCard
            icon="clock"
            label="Absensi Selesai"
            value={attendance.completed}
            hint="Check-in & check-out lengkap"
            tone="teal"
          />
          <StatCard
            icon="alert"
            label="Belum Lengkap"
            value={attendance.incomplete}
            hint="Tanpa check-out"
            tone="amber"
          />
          <StatCard
            icon="alert-triangle"
            label="Ditolak"
            value={attendance.rejected}
            hint="Verifikasi gagal"
            tone="rose"
          />
        </div>
      </div>

      {/* Workforce insights: data completeness + demographics */}
      {canInsights && insightRows.length > 0 ? (
        <div className={canDemographics ? "grid gap-5 xl:grid-cols-2" : "grid gap-5"}>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-[17px]">Kelengkapan Data Karyawan</CardTitle>
                  <CardDescription>
                    Karyawan aktif dengan data lengkap per kategori
                  </CardDescription>
                </div>
                <span className="shrink-0 rounded-full bg-surface-primary px-3 py-1 text-sm font-bold text-primary tabular-nums">
                  {completeness.overall}%
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-2">
              {completeness.categories.map((category) => (
                <div key={category.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">{category.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {category.complete}/{category.total}
                      <span className="ml-2 font-semibold text-foreground">{category.percent}%</span>
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={category.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={category.percent}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${category.percent}%`,
                        background:
                          category.percent >= 80
                            ? "#22C55E"
                            : category.percent >= 50
                              ? "#3B82F6"
                              : "#F97316",
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {canDemographics ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[17px]">Demografi</CardTitle>
                <CardDescription>Jenis kelamin dan usia karyawan aktif</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-2">
                <div className="flex flex-col items-center gap-6 sm:flex-row">
                  <SegmentRing
                    variant="solid"
                    size={150}
                    slices={[
                      { label: "Laki-laki", value: gender.male, color: "#3B82F6" },
                      { label: "Perempuan", value: gender.female, color: "#EC4899" },
                      { label: "Belum diisi", value: gender.unknown, color: "#CBD5E1" },
                    ]}
                    centerValue={insightRows.length}
                    centerLabel="aktif"
                  />
                  <div className="w-full min-w-0 flex-1">
                    <RingLegend
                      slices={[
                        { label: "Laki-laki", value: gender.male, color: "#3B82F6" },
                        { label: "Perempuan", value: gender.female, color: "#EC4899" },
                        { label: "Belum diisi", value: gender.unknown, color: "#CBD5E1" },
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">Sebaran usia</p>
                  <ul className="space-y-2">
                    {ages.buckets.map((bucket) => {
                      const max = Math.max(1, ...ages.buckets.map((b) => b.value));
                      return (
                        <li key={bucket.label} className="flex items-center gap-3 text-sm">
                          <span className="w-14 shrink-0 text-muted-foreground">{bucket.label}</span>
                          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6]"
                              style={{ width: `${(bucket.value / max) * 100}%` }}
                            />
                          </span>
                          <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{bucket.value}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {ages.unknown > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {ages.unknown} karyawan belum mengisi tanggal lahir.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* Trend + today's status ring */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-[17px]">Tren Kehadiran</CardTitle>
              <CardDescription>Catatan absensi 7 hari terakhir</CardDescription>
            </div>
            {can(P.ATTENDANCE_MANAGE) ? (
              <Link href="/attendance/management" className={linkClass}>
                Buka absensi
                <HrisIcon name="arrow-right" className="size-4" />
              </Link>
            ) : null}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {trendTotals.all > 0 ? (
              <StackedBarChart
                height={260}
                series={[
                  { key: "completed", label: "Selesai", color: "#22C55E" },
                  { key: "present", label: "Hadir", color: "#8B5CF6" },
                  { key: "incomplete", label: "Belum lengkap", color: "#F97316" },
                  { key: "rejected", label: "Ditolak", color: "#EF4444" },
                ]}
                points={trend.map((p) => ({
                  label: p.label,
                  values: {
                    completed: p.completed,
                    present: p.present,
                    incomplete: p.incomplete,
                    rejected: p.rejected,
                  },
                }))}
              />
            ) : (
              <AttendanceTrendEmpty />
            )}
            <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
              <TrendSummary icon="bar-chart" tone="hris-tile-green" value={trendTotals.all} label="Total catatan" />
              <TrendSummary icon="check" tone="hris-tile-violet" value={trendTotals.done} label="Selesai" />
              <TrendSummary icon="alert" tone="hris-tile-orange" value={trendTotals.open} label="Perlu ditinjau" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[17px]">Status Absensi Hari Ini</CardTitle>
            <CardDescription>Sebaran catatan absensi hari ini</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 pt-3">
            <SegmentRing
              slices={todaySlices}
              size={210}
              centerValue={todayTotal}
              centerLabel="Total catatan"
            />
            <div className="w-full min-w-0">
              <RingLegend slices={todaySlices} columns={2} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
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

          {canViewAudit ? (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-[17px]">Aktivitas Terbaru</CardTitle>
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
              <h2 id="perlu-perhatian" className="text-[17px] font-semibold text-foreground">
                Perlu Perhatian
              </h2>
            </div>
            <ul className="mt-3.5 space-y-2.5 text-[15px] text-foreground/90">
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
              <span className="hris-tile hris-tile-blue flex size-12 shrink-0 items-center justify-center rounded-2xl">
                <HrisIcon name="wallet" className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold text-foreground">Payroll</span>
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
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70 transition-transform group-hover:translate-x-0.5">
                <HrisIcon name="chevron-right" className="size-4" />
              </span>
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function TrendSummary({
  icon,
  tone,
  value,
  label,
}: {
  icon: HrisIconName;
  tone: string;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`hris-tile ${tone} flex size-9 shrink-0 items-center justify-center rounded-full`}
      >
        <HrisIcon name={icon} className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[17px] leading-tight font-bold text-foreground tabular-nums">
          {value}
        </span>
        <span className="block truncate text-[13px] text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}
