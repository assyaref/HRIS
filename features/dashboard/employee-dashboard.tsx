import Link from "next/link";

import {
  type AttendanceCardState,
} from "@/components/employee/attendance-status-card";
import { SectionHeader } from "@/components/employee/section-header";
import { EmployeeHeader } from "@/components/employee/employee-header";
import { QuickServiceGrid } from "@/components/employee/quick-service-grid";
import type { QuickServiceItem } from "@/components/employee/quick-service-card";
import { StatusBadge, statusTone } from "@/components/employee/status-badge";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { AnnouncementCarousel } from "@/components/employee/announcement-carousel";
import { HrisIcon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type { UserAuthorization } from "@/lib/auth/rbac";
import type { CurrentUser } from "@/lib/auth/types";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";
import { cn } from "@/lib/utils/cn";

import { ANNOUNCEMENT_PRIORITY_LABELS } from "@/features/announcements/constants";
import {
  countMyUnreadAnnouncements,
  listMyAnnouncements,
} from "@/features/announcements/queries";
import {
  ATTENDANCE_STATUS_LABELS,
  type AttendanceStatus,
} from "@/features/attendance/constants";
import { formatTime } from "@/features/attendance/format";
import {
  findAttendanceForDate,
  findOpenAttendance,
} from "@/features/attendance/queries";
import { getEmployeeSelfProfile } from "@/features/employees/queries";
import {
  LEAVE_REQUEST_STATUS_LABELS,
  type LeaveRequestStatus,
} from "@/features/leave/constants";
import {
  listLeaveBalances,
  listMyLeaveRequests,
} from "@/features/leave/queries";
import { PERMISSION_TYPE_LABELS, PERMISSION_REQUEST_STATUS_LABELS, type PermissionRequestStatus } from "@/features/permission/constants";
import { listMyPermissionRequests } from "@/features/permission/queries";
import { listMyPublishedPayslips } from "@/features/payroll/queries";

import { getMonthAttendanceSummary } from "./queries";

interface EmployeeDashboardProps {
  user: CurrentUser;
  authorization: UserAuthorization;
  organizationName: string | null;
  roleLabel: string | null;
}

function greeting(hour: number): string {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

/** Circular progress visualization (inline SVG). */
function CircularProgress({
  percentage,
  size = 88,
  stroke = 8,
}: {
  percentage: number;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className="transform -rotate-90"
      aria-label="Kehadiran bulan ini"
      role="img"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#E7EAF0"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#155EEF"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-700 ease-out"
      />
      <text
        x={size / 2}
        y={size / 2 + size * 0.06}
        textAnchor="middle"
        fontSize={size * 0.32}
        fontWeight="700"
        fill="#172B4D"
        letterSpacing="-0.02em"
      >
        {percentage}%
      </text>
    </svg>
  );
}

/** A single stat tile inside the monthly summary. */
function SummaryStat({ label, value, tone }: { label: string; value: string | number; tone: "success" | "info" | "warning" | "danger" }) {
  const toneClass = {
    success: "text-success hris-surface-success",
    info: "text-info hris-surface-info",
    warning: "text-warning hris-surface-warning",
    danger: "text-danger hris-surface-danger",
  }[tone];
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border bg-card">
      <span className={cn("inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-semibold", toneClass)}>
        {label}
      </span>
      <p className="text-lg font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

/** A single attendance info card (2-column grid). */
function InfoCard({
  label,
  value,
  sub,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: Parameters<typeof HrisIcon>[0]["name"];
  tone?: "primary" | "success" | "info" | "warning" | "danger";
}) {
  const toneClass = {
    primary: "hris-surface-primary text-primary",
    success: "hris-surface-success text-success",
    info: "hris-surface-info text-info",
    warning: "hris-surface-warning text-warning",
    danger: "hris-surface-danger text-danger",
  }[tone];
  return (
    <div className="hris-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground truncate">
            {value}
          </p>
          {sub ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {sub}
            </p>
          ) : null}
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-2xl",
            toneClass
          )}
        >
          <HrisIcon name={icon} className="size-5" />
        </span>
      </div>
    </div>
  );
}

/** A single quick menu item (3-column grid). */
function QuickMenuItem({
  href,
  icon,
  label,
  badge,
  tone = "blue",
}: {
  href: string;
  icon: Parameters<typeof HrisIcon>[0]["name"];
  label: string;
  badge?: string | number | null;
  tone?: "blue" | "cyan" | "green" | "amber" | "violet" | "rose" | "slate";
}) {
  const toneClasses: Record<string, string> = {
    blue: "hris-surface-primary text-primary",
    cyan: "hris-surface-info text-info",
    green: "hris-surface-success text-success",
    amber: "hris-surface-warning text-warning",
    violet: "hris-surface-info text-info",
    rose: "hris-surface-danger text-danger",
    slate: "bg-muted text-muted-foreground",
  };
  return (
    <Link
      href={href}
      className={cn(
        "hris-card emp-card-tap group flex min-h-[5.5rem] flex-col items-center justify-center gap-2 px-2 py-3 text-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        badge ? "group-hover:border-primary/50" : "border-transparent"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative flex size-11 items-center justify-center rounded-2xl mb-1",
          toneClasses[tone]
        )}
      >
        <HrisIcon name={icon} className="size-5.5" />
        {badge ? (
          <span className="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="text-xs leading-tight font-medium text-foreground truncate">
        {label}
      </span>
    </Link>
  );
}

/**
 * The employee's self-service dashboard — mobile-first HRIS home, rebuilt on
 * the BCS Enterprise v4.3 design system. All values are dynamic and resolved
 * server-side for the signed-in employee — nothing is hard-coded.
 */
export async function EmployeeDashboard({
  user,
  authorization,
  organizationName,
  roleLabel,
}: EmployeeDashboardProps) {
  const organizationId = user.organizationId as string;
  const granted = new Set(authorization.permissionCodes);
  const can = (code: Permission) => granted.has(code);
  const P = PERMISSIONS;

  const employee = await getEmployeeSelfProfile(user.id, organizationId);
  if (!employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Beranda
        </h1>
        <EmployeeEmptyState
          icon="profile"
          title="Profil karyawan belum tertaut"
          description="Akun Anda belum ditautkan ke data karyawan. Hubungi administrator."
        />
      </div>
    );
  }

  const today = parseAttendanceDate(dateStringInTimeZone(new Date(), null));
  const [
    openAttendance,
    todayRecord,
    monthSummary,
    leaveBalances,
    myLeave,
    myPermissions,
    myPayslips,
    latestAnnouncements,
    unreadAnnouncements,
  ] = await Promise.all([
    findOpenAttendance(organizationId, employee.id),
    findAttendanceForDate(organizationId, employee.id, today),
    getMonthAttendanceSummary(organizationId, employee.id),
    listLeaveBalances(organizationId, employee.id),
    listMyLeaveRequests(organizationId, employee.id),
    listMyPermissionRequests(organizationId, employee.id),
    listMyPublishedPayslips(organizationId, employee.id),
    listMyAnnouncements({ organizationId, employeeId: employee.id, limit: 5 }),
    countMyUnreadAnnouncements({
      organizationId,
      employeeId: employee.id,
    }),
  ]);

  const employeeActive = employee.employmentStatus === "active";
  const activeRecord = openAttendance ?? todayRecord;

  const onLeaveToday = myLeave.some(
    (request) =>
      request.status === "approved" &&
      request.startDate.getTime() <= today.getTime() &&
      request.endDate.getTime() >= today.getTime()
  );
  const isWeekend = today.getUTCDay() === 0 || today.getUTCDay() === 6;

  let state: AttendanceCardState;
  if (!employeeActive) {
    state = "UNAVAILABLE";
  } else if (openAttendance) {
    state = "CHECKED_IN";
  } else if (todayRecord?.checkOutAt) {
    state = "CHECKED_OUT";
  } else if (todayRecord && todayRecord.status === "rejected") {
    state = "REJECTED";
  } else if (onLeaveToday) {
    state = "ON_LEAVE";
  } else if (isWeekend) {
    state = "WEEKEND";
  } else {
    state = "NOT_CHECKED_IN";
  }

  const timeZone = activeRecord?.workLocationTimezone ?? null;
  const checkInLabel = activeRecord?.checkInAt
    ? formatTime(activeRecord.checkInAt, timeZone)
    : null;
  const checkOutLabel = todayRecord?.checkOutAt
    ? formatTime(todayRecord.checkOutAt, timeZone)
    : null;

  const canCheckIn = can(P.ATTENDANCE_CHECK_IN);
  const canAttendance = can(P.ATTENDANCE_VIEW);
  const canLeave = can(P.LEAVE_VIEW);
  const canPermission = can(P.PERMISSION_VIEW);
  const canPayslip = can(P.PAYSLIP_VIEW);

  const currentYear = String(new Date().getFullYear());
  const annualBalances = leaveBalances.filter((b) => b.year === currentYear);
  const availableLeave = annualBalances.reduce((sum, b) => sum + b.available, 0);

  const pendingLeave = myLeave.filter((r) => r.status === "pending").length;
  const pendingPermission = myPermissions.filter(
    (r) => r.status === "pending"
  ).length;

  const serviceCandidates: Array<QuickServiceItem | false> = [
    canAttendance && {
      href: "/attendance",
      icon: "attendance",
      label: "Absensi",
      tone: "blue",
    },
    canLeave && { href: "/leave", icon: "leave", label: "Pengajuan Cuti", tone: "amber" },
    canPermission && {
      href: "/permission",
      icon: "permission",
      label: "Izin Kegiatan",
      tone: "cyan",
    },
    canPayslip && {
      href: "/payslip",
      icon: "payslip",
      label: "Payslip",
      tone: "violet",
    },
    {
      href: "/settings/account",
      icon: "profile",
      label: "Profil Saya",
      tone: "blue",
    },
    {
      href: "/notifications",
      icon: "bell",
      label: "Notifikasi",
      tone: "rose",
      badge: unreadAnnouncements > 0 ? unreadAnnouncements : null,
    },
  ];
  const services = serviceCandidates.filter(
    (service): service is QuickServiceItem => Boolean(service)
  );

  const carouselItems = latestAnnouncements.map((item) => ({
    id: item.id,
    title: item.title,
    excerpt: item.content,
    href: `/announcements/${item.id}`,
    imageUrl: item.coverAttachmentId
      ? `/api/announcements/${item.coverAttachmentId}/download`
      : null,
    dateLabel: item.publishedAt
      ? new Intl.DateTimeFormat("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(item.publishedAt)
      : null,
    badgeLabel:
      ANNOUNCEMENT_PRIORITY_LABELS[item.priority] ?? "Pengumuman",
    badgeTone:
      item.priority === "urgent"
        ? ("danger" as const)
        : item.priority === "important"
          ? ("warning" as const)
          : ("info" as const),
    unread: !item.isRead,
  }));

  const recentRequests = [
    ...myLeave.slice(0, 5).map((r) => ({
      kind: "leave" as const,
      id: r.id,
      title: `Cuti ${r.leaveTypeName}`,
      status: r.status as string,
      statusLabel:
        LEAVE_REQUEST_STATUS_LABELS[r.status as LeaveRequestStatus] ??
        r.status,
      on: r.submittedAt,
    })),
    ...myPermissions.slice(0, 5).map((r) => ({
      kind: "permission" as const,
      id: r.id,
      title: `Izin ${
        PERMISSION_TYPE_LABELS[
          r.permissionType as keyof typeof PERMISSION_TYPE_LABELS
        ] ?? r.permissionType
      }`,
      status: r.status as string,
      statusLabel:
        PERMISSION_REQUEST_STATUS_LABELS[
          r.status as PermissionRequestStatus
        ] ?? r.status,
      on: r.submittedAt,
    })),
  ]
    .sort((a, b) => b.on.getTime() - a.on.getTime())
    .slice(0, 4);

  const totalDays = monthSummary.present + monthSummary.completed + monthSummary.incomplete + monthSummary.rejected;
  const attendancePct = totalDays > 0 ? Math.round(((monthSummary.present + monthSummary.completed) / totalDays) * 100) : 0;

  const monthLabel = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="space-y-4">
      {/* Welcome Section */}
      <EmployeeHeader
        profile={{
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeNumber: employee.employeeNumber,
          position: employee.position,
          department: employee.department,
          division: employee.division,
          workLocationName: employee.workLocationName,
          profilePhotoUrl: employee.profilePhotoUrl,
        }}
        greeting={greeting(new Date().getHours())}
        organizationName={organizationName}
        roleLabel={roleLabel}
        todayLabel={todayLabel}
        statusLabel={
          employee.employmentStatus === "active" ? "Aktif" : "Tidak Aktif"
        }
      />

      {/* Attendance Info Cards (2-column) */}
      {canAttendance ? (
        <section className="grid grid-cols-2 gap-3">
          <InfoCard
            label="Hadir Hari Ini"
            value={String(monthSummary.present)}
            sub={new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long" })}
            icon="calendar-check"
            tone="success"
          />
          <InfoCard
            label="Jadwal Kerja"
            value={activeRecord?.projectName ?? "—"}
            sub={activeRecord?.workLocationName ?? "Belum ditetapkan"}
            icon="briefcase"
            tone="info"
          />
          <InfoCard
            label="Lokasi Kerja"
            value={activeRecord?.workLocationName ?? "—"}
            sub={activeRecord?.projectName ?? "—"}
            icon="map-pin"
            tone="primary"
          />
          <InfoCard
            label="Status Kehadiran"
            value={
              todayRecord
                ? ATTENDANCE_STATUS_LABELS[
                    todayRecord.status as AttendanceStatus
                  ] ?? todayRecord.status
                : "Belum absensi"
            }
            sub={checkInLabel ? `Masuk ${checkInLabel}` : "Belum check-in"}
            icon="clock"
            tone={
              todayRecord?.status === "present" || todayRecord?.status === "completed"
                ? "success"
                : todayRecord?.status === "rejected"
                  ? "danger"
                  : "info"
            }
          />
        </section>
      ) : null}

      {/* Primary Attendance Action */}
      <section className="hris-card rounded-2xl overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="relative p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-14 shrink-0 items-center justify-center rounded-2xl hris-surface-primary text-primary shadow-lg"
              >
                <HrisIcon name="scan" className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Absensi Sekarang
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Check-in / Check-out
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge
                tone={
                  state === "CHECKED_IN" || state === "CHECKED_OUT"
                    ? "success"
                    : state === "NOT_CHECKED_IN"
                      ? "warning"
                      : "neutral"
                }
              >
                {state === "CHECKED_IN"
                  ? "Sudah Masuk"
                  : state === "CHECKED_OUT"
                    ? "Selesai"
                    : state === "NOT_CHECKED_IN"
                      ? "Belum Absen"
                      : state}
              </StatusBadge>
            </div>
          </div>

          {state === "NOT_CHECKED_IN" && canCheckIn ? (
            <Link
              href="/attendance"
              className="mt-5 block min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <HrisIcon name="scan" className="size-5" />
              Check-in Sekarang
            </Link>
          ) : null}

          {state === "CHECKED_IN" && can(P.ATTENDANCE_CHECK_OUT) ? (
            <Link
              href="/attendance"
              className="mt-5 block min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <HrisIcon name="scan" className="size-5" />
              Check-out Sekarang
            </Link>
          ) : null}

          {(state === "CHECKED_OUT" || state === "ON_LEAVE" || state === "WEEKEND" || state === "UNAVAILABLE") && (
            <p className="mt-5 rounded-xl hris-surface-success px-4 py-3 text-sm text-success">
              {state === "CHECKED_OUT"
                ? "Anda sudah menyelesaikan absensi hari ini."
                : state === "ON_LEAVE"
                  ? "Anda sedang cuti. Tidak perlu absensi."
                  : state === "WEEKEND"
                    ? "Hari ini akhir pekan."
                    : "Absensi tidak tersedia untuk profil Anda."}
            </p>
          )}
        </div>
      </section>

      {/* Monthly Attendance Summary */}
      <section className="hris-card rounded-2xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Rekap Kehadiran Bulan Ini
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {monthLabel} · {totalDays} catatan
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-6">
          <CircularProgress percentage={attendancePct} size={96} stroke={9} />
          <div className="min-w-0 flex-1">
            <p className="text-3xl font-bold tracking-tight text-foreground">
              {attendancePct}%
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Tingkat kehadiran bulan ini
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryStat label="Hadir" value={monthSummary.present + monthSummary.completed} tone="success" />
          <SummaryStat label="Izin" value={monthSummary.incomplete} tone="warning" />
          <SummaryStat label="Cuti" value={availableLeave} tone="info" />
          <SummaryStat label="Alpa" value={monthSummary.rejected} tone="danger" />
        </div>
      </section>

      {/* Announcements */}
      {carouselItems.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            title="Pengumuman"
            action={
              <Link
                href="/announcements"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/90 dark:text-primary/90"
              >
                {unreadAnnouncements > 0 ? (
                  <Badge variant="destructive" className="ml-2 min-w-[1.5rem] text-[11px]">
                    {unreadAnnouncements}
                  </Badge>
                ) : null}
                Lihat semua
                <HrisIcon name="chevron-right" className="size-4" />
              </Link>
            }
          />
          <AnnouncementCarousel items={carouselItems} />
        </section>
      ) : null}

      {/* Quick Menu (3-column grid) */}
      <section className="space-y-3">
        <SectionHeader
          title="Menu Cepat"
          description="Akses langsung ke modul HRIS Anda"
        />
        <QuickServiceGrid items={services} />
      </section>

      {/* Recent Requests */}
      <section className="space-y-3">
        <SectionHeader
          title="Aktivitas Terbaru"
          description="Pengajuan cuti dan izin Anda"
          action={
            <Link
              href="/leave"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/90 dark:text-primary/90"
            >
              Semua
              <HrisIcon name="chevron-right" className="size-4" />
            </Link>
          }
        />
        {recentRequests.length === 0 ? (
          <EmployeeEmptyState
            icon="calendar"
            title="Belum ada pengajuan"
            description="Pengajuan cuti dan izin Anda akan tampil di sini."
          />
        ) : (
          <Card className="hris-card divide-y divide-border">
            {recentRequests.map((request) => (
              <Link
                key={`${request.kind}-${request.id}`}
                href={
                  request.kind === "leave"
                    ? `/leave/${request.id}`
                    : `/permission/${request.id}`
                }
                className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-accent dark:hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {request.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(request.on)}
                  </p>
                </div>
                <StatusBadge tone={statusTone(request.status)}>
                  {request.statusLabel}
                </StatusBadge>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
