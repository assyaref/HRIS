import Link from "next/link";

import type { AttendanceCardState } from "@/components/employee/attendance-status-card";
import { AnnouncementCarousel } from "@/components/employee/announcement-carousel";
import { SectionHeader } from "@/components/employee/section-header";
import { StatusBadge, statusTone } from "@/components/employee/status-badge";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { MonthlyRecapCard } from "@/components/dashboard/monthly-recap-card";
import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type { UserAuthorization } from "@/lib/auth/rbac";
import type { CurrentUser } from "@/lib/auth/types";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";
import { cn } from "@/lib/utils/cn";

import { ANNOUNCEMENT_PRIORITY_LABELS } from "@/features/announcements/constants";
import {
  countMyUnreadAnnouncements,
  listMyAnnouncements,
} from "@/features/announcements/queries";
import { formatTime } from "@/features/attendance/format";
import {
  findAttendanceForDate,
  findOpenAttendance,
  listEligibleAttendanceOptions,
} from "@/features/attendance/queries";
import { getEmployeeSelfProfile } from "@/features/employees/queries";
import {
  LEAVE_REQUEST_STATUS_LABELS,
  type LeaveRequestStatus,
} from "@/features/leave/constants";
import { listMyLeaveRequests } from "@/features/leave/queries";
import {
  PERMISSION_TYPE_LABELS,
  PERMISSION_REQUEST_STATUS_LABELS,
  type PermissionRequestStatus,
} from "@/features/permission/constants";
import { listMyPermissionRequests } from "@/features/permission/queries";

import { getMonthlyRecap, recentMonthKeys } from "./queries";

interface EmployeeDashboardProps {
  user: CurrentUser;
  authorization: UserAuthorization;
  organizationName: string | null;
  roleLabel: string | null;
  /** Selected recap month ("YYYY-MM", from `?bulan=`). */
  monthKey: string;
}

type ChipTone = "blue" | "green" | "violet" | "amber" | "rose" | "teal" | "sky";

/** Small info tile (2×2 grid): icon well, muted label, bold value. */
function InfoTile({
  label,
  icon,
  tone,
  children,
}: {
  label: string;
  icon: HrisIconName;
  tone: ChipTone;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[86px] items-center gap-2.5 rounded-[18px] border border-[var(--card-border)] bg-card px-3 py-3 hris-card sm:gap-4 sm:px-4">
      <span
        aria-hidden="true"
        className={cn(
          `hris-chip-${tone}`,
          "flex size-11 shrink-0 items-center justify-center rounded-2xl sm:size-12"
        )}
      >
        <HrisIcon name={icon} className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-base leading-snug font-bold tracking-tight text-foreground sm:text-[17px]">
          {children}
        </div>
      </div>
    </div>
  );
}

/** One "Menu Cepat" tile: tinted tile, round coloured icon, bold label. */
function QuickMenuTile({
  href,
  icon,
  label,
  tone,
  badge,
}: {
  href: string;
  icon: HrisIconName;
  label: string;
  tone: ChipTone;
  badge?: number | null;
}) {
  return (
    <Link
      href={href}
      className={cn(
        `hris-tint-${tone}`,
        "group flex min-h-[112px] flex-col items-center justify-center gap-2.5 rounded-[18px] px-2 py-4 text-center transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          `hris-chip-${tone}`,
          "relative flex size-12 items-center justify-center rounded-full"
        )}
      >
        <HrisIcon name={icon} className="size-6" />
        {badge ? (
          <span className="absolute -top-1.5 -right-2 flex min-w-6 items-center justify-center rounded-full bg-[#EF4444] px-1.5 py-0.5 text-[11px] font-bold text-white ring-2 ring-card">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span className="text-[15px] leading-tight font-semibold text-foreground">
        {label}
      </span>
    </Link>
  );
}

const STATE_PILL: Record<
  AttendanceCardState,
  { label: string; className: string }
> = {
  CHECKED_IN: { label: "Bekerja", className: "bg-[#D9F5E3] text-[#15803D]" },
  CHECKED_OUT: { label: "Selesai", className: "bg-surface-primary text-primary" },
  NOT_CHECKED_IN: { label: "Belum Absen", className: "bg-[#FFEFD2] text-[#B45309]" },
  ON_LEAVE: { label: "Cuti", className: "bg-[#EFE7FF] text-[#6D28D9]" },
  WEEKEND: { label: "Libur", className: "bg-muted text-muted-foreground" },
  HOLIDAY: { label: "Libur", className: "bg-muted text-muted-foreground" },
  REJECTED: { label: "Ditolak", className: "bg-surface-danger text-danger" },
  UNAVAILABLE: { label: "Nonaktif", className: "bg-muted text-muted-foreground" },
};

/**
 * The employee's self-service home (HRIS Lite Enterprise v2.0).
 *
 * The greeting hero lives in the shell's blue band; this page renders the
 * day at a glance (check-in, check-out, location, status), the big
 * "Absensi Sekarang" action, the monthly recap, quick menu, announcements
 * and recent requests. All values are resolved server-side for the
 * signed-in employee — nothing is hard-coded.
 */
export async function EmployeeDashboard({
  user,
  authorization,
  monthKey,
}: EmployeeDashboardProps) {
  const organizationId = user.organizationId as string;
  const granted = new Set(authorization.permissionCodes);
  const can = (code: Permission) => granted.has(code);
  const P = PERMISSIONS;

  const employee = await getEmployeeSelfProfile(user.id, organizationId);
  if (!employee) {
    return (
      <div className="space-y-6 pt-2">
        <h1 className="text-xl tracking-tight">Beranda</h1>
        <EmployeeEmptyState
          icon="profile"
          title="Profil karyawan belum tertaut"
          description="Akun Anda belum ditautkan ke data karyawan. Hubungi administrator."
        />
      </div>
    );
  }

  const today = parseAttendanceDate(
    dateStringInTimeZone(new Date(), APP_TIME_ZONE)
  );
  const [
    openAttendance,
    todayRecord,
    recap,
    myLeave,
    myPermissions,
    latestAnnouncements,
    unreadAnnouncements,
    attendanceOptions,
  ] = await Promise.all([
    findOpenAttendance(organizationId, employee.id),
    findAttendanceForDate(organizationId, employee.id, today),
    getMonthlyRecap(organizationId, employee.id, monthKey),
    listMyLeaveRequests(organizationId, employee.id),
    listMyPermissionRequests(organizationId, employee.id),
    listMyAnnouncements({ organizationId, employeeId: employee.id, limit: 5 }),
    countMyUnreadAnnouncements({
      organizationId,
      employeeId: employee.id,
    }),
    listEligibleAttendanceOptions(organizationId, employee.id),
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
  // "Hadir Hari Ini" only reflects today's record; an open session from an
  // earlier day still drives the check-out action card, not this tile.
  const todayCheckInLabel = todayRecord?.checkInAt
    ? formatTime(todayRecord.checkInAt, todayRecord.workLocationTimezone ?? null)
    : null;
  const checkOutLabel = todayRecord?.checkOutAt
    ? formatTime(todayRecord.checkOutAt, timeZone)
    : null;

  const canCheckIn = can(P.ATTENDANCE_CHECK_IN);
  const canCheckOut = can(P.ATTENDANCE_CHECK_OUT);
  const canAttendance = can(P.ATTENDANCE_VIEW);
  const canLeave = can(P.LEAVE_VIEW);
  const canPermission = can(P.PERMISSION_VIEW);
  const canPayslip = can(P.PAYSLIP_VIEW);

  // Location resolution order: where the employee is checked in right now,
  // then the fixed work location on the profile, then the work location(s)
  // of their ACTIVE project assignments (the sites they may attend).
  const assignedLocationNames = [
    ...new Set(attendanceOptions.map((option) => option.workLocationName)),
  ];
  const assignedLocationName =
    assignedLocationNames.length === 0
      ? null
      : assignedLocationNames.length === 1
        ? assignedLocationNames[0]
        : `${assignedLocationNames[0]} +${assignedLocationNames.length - 1} lokasi lain`;
  const locationName =
    activeRecord?.workLocationName ??
    employee.workLocationName ??
    assignedLocationName;
  const locationProjectName =
    !activeRecord?.workLocationName &&
    !employee.workLocationName &&
    attendanceOptions.length > 0
      ? [...new Set(attendanceOptions.map((option) => option.projectName))].join(", ")
      : null;

  const ctaEnabled =
    canAttendance &&
    ((state === "NOT_CHECKED_IN" && canCheckIn) ||
      (state === "CHECKED_IN" && canCheckOut));
  const ctaSubtitle =
    state === "CHECKED_IN"
      ? `Masuk ${checkInLabel ?? "—"} · Check-out`
      : state === "CHECKED_OUT"
        ? "Absensi hari ini sudah selesai"
        : state === "ON_LEAVE"
          ? "Anda sedang cuti hari ini"
          : state === "WEEKEND"
            ? "Hari ini akhir pekan"
            : state === "REJECTED"
              ? "Absensi hari ini ditolak — hubungi HR"
              : state === "UNAVAILABLE"
                ? "Absensi tidak tersedia untuk profil Anda"
                : "Check-in / Check-out";

  const services: Array<{
    href: string;
    icon: HrisIconName;
    label: string;
    tone: ChipTone;
    badge?: number | null;
    show: boolean;
  }> = [
    { href: "/attendance", icon: "calendar-check", label: "Absensi", tone: "blue", show: canAttendance },
    { href: "/leave", icon: "plane", label: "Pengajuan Cuti", tone: "violet", show: canLeave },
    { href: "/permission", icon: "clipboard", label: "Izin Kegiatan", tone: "amber", show: canPermission },
    { href: "/payslip", icon: "wallet", label: "Payslip", tone: "green", show: canPayslip },
    { href: "/settings/account", icon: "user", label: "Profil Saya", tone: "sky", show: true },
    {
      href: "/notifications",
      icon: "bell",
      label: "Notifikasi",
      tone: "rose",
      badge: unreadAnnouncements > 0 ? unreadAnnouncements : null,
      show: true,
    },
  ];

  const carouselItems = latestAnnouncements.map((item) => ({
    id: item.id,
    title: item.title,
    excerpt: item.content,
    href: `/announcements/${item.id}`,
    imageUrl: item.coverAttachmentId
      ? `/api/announcements/${item.coverAttachmentId}/download?inline=1`
      : null,
    dateLabel: item.publishedAt
      ? new Intl.DateTimeFormat("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(item.publishedAt)
      : null,
    badgeLabel: ANNOUNCEMENT_PRIORITY_LABELS[item.priority] ?? "Pengumuman",
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
        LEAVE_REQUEST_STATUS_LABELS[r.status as LeaveRequestStatus] ?? r.status,
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
        PERMISSION_REQUEST_STATUS_LABELS[r.status as PermissionRequestStatus] ??
        r.status,
      on: r.submittedAt,
    })),
  ]
    .sort((a, b) => b.on.getTime() - a.on.getTime())
    .slice(0, 4);

  const pill = STATE_PILL[state];

  return (
    <div className="grid gap-5 pt-1 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
      <h1 className="sr-only">Beranda</h1>
      <div className="min-w-0 space-y-5">
        {/* Day at a glance */}
        <section aria-label="Ringkasan hari ini" className="grid grid-cols-2 gap-3 sm:gap-4">
          <InfoTile label="Hadir Hari Ini" icon="calendar-check" tone="green">
            {todayCheckInLabel ?? "--:--"}
          </InfoTile>
          <InfoTile label="Jam Pulang" icon="clock" tone="violet">
            {checkOutLabel ?? "--:--"}
          </InfoTile>
          <InfoTile label="Lokasi" icon="map-pin" tone="sky">
            <span className="flex min-w-0 items-start gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-[0.45em] size-2 shrink-0 rounded-full",
                  locationName ? "bg-[#22C55E]" : "bg-muted-foreground/50"
                )}
              />
              <span className="min-w-0">
                <span className="line-clamp-2">{locationName ?? "Belum diatur"}</span>
                {locationProjectName ? (
                  <span className="line-clamp-1 text-xs font-normal text-muted-foreground">
                    {locationProjectName}
                  </span>
                ) : null}
              </span>
            </span>
          </InfoTile>
          <InfoTile label="Status" icon="target" tone="teal">
            <span
              className={cn(
                "mt-0.5 inline-flex rounded-full px-3 py-0.5 text-sm font-bold",
                pill.className
              )}
            >
              {pill.label}
            </span>
          </InfoTile>
        </section>

        {/* Primary attendance action */}
        {canAttendance ? (
          ctaEnabled ? (
            <Link
              href="/attendance"
              className="hris-band group flex items-center gap-4 rounded-[20px] px-5 py-4 shadow-[0_18px_34px_-18px_rgb(30_94_235/0.9)] transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                <HrisIcon name="fingerprint" className="size-8" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">Absensi Sekarang</span>
                <span className="block truncate text-sm text-white/85">{ctaSubtitle}</span>
              </span>
              <HrisIcon
                name="chevron-right"
                className="size-7 shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ) : (
            <div className="flex items-center gap-4 rounded-[20px] border border-[var(--card-border)] bg-card px-5 py-4 hris-card">
              <span className="hris-chip-blue flex size-14 shrink-0 items-center justify-center rounded-full">
                <HrisIcon name="fingerprint" className="size-8" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold text-foreground">Absensi</span>
                <span className="block text-sm text-muted-foreground">{ctaSubtitle}</span>
              </span>
              <Link
                href="/attendance"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Riwayat
              </Link>
            </div>
          )
        ) : null}

        {/* Monthly recap — mobile position */}
        <MonthlyRecapCard
          recap={recap}
          monthOptions={recentMonthKeys(6)}
          className="lg:hidden"
        />

        {/* Quick menu */}
        <section className="rounded-[20px] border border-[var(--card-border)] bg-card p-4 hris-card sm:p-5">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
            Menu Cepat
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {services
              .filter((service) => service.show)
              .map((service) => (
                <QuickMenuTile
                  key={service.href}
                  href={service.href}
                  icon={service.icon}
                  label={service.label}
                  tone={service.tone}
                  badge={service.badge}
                />
              ))}
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
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/85"
                >
                  {unreadAnnouncements > 0 ? (
                    <Badge variant="destructive" className="mr-1 min-w-[1.5rem] justify-center text-[11px]">
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
      </div>

      <aside className="min-w-0 space-y-5">
        {/* Monthly recap — desktop position */}
        <MonthlyRecapCard
          recap={recap}
          monthOptions={recentMonthKeys(6)}
          header="band"
          className="hidden lg:block"
        />

        {/* Recent requests */}
        <section className="space-y-3">
          <SectionHeader
            title="Aktivitas Terbaru"
            description="Pengajuan cuti dan izin Anda"
            action={
              canLeave ? (
                <Link
                  href="/leave"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/85"
                >
                  Semua
                  <HrisIcon name="chevron-right" className="size-4" />
                </Link>
              ) : undefined
            }
          />
          {recentRequests.length === 0 ? (
            <EmployeeEmptyState
              icon="calendar"
              title="Belum ada pengajuan"
              description="Pengajuan cuti dan izin Anda akan tampil di sini."
            />
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {recentRequests.map((request) => (
                <Link
                  key={`${request.kind}-${request.id}`}
                  href={
                    request.kind === "leave"
                      ? `/leave/${request.id}`
                      : `/permission/${request.id}`
                  }
                  className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-primary/50"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      request.kind === "leave" ? "hris-chip-violet" : "hris-chip-amber",
                      "flex size-10 shrink-0 items-center justify-center rounded-xl"
                    )}
                  >
                    <HrisIcon
                      name={request.kind === "leave" ? "plane" : "clipboard"}
                      className="size-5"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
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
      </aside>
    </div>
  );
}
