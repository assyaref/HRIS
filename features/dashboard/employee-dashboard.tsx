import Link from "next/link";

import { AnnouncementCarousel } from "@/components/employee/announcement-carousel";
import { SectionHeader } from "@/components/employee/section-header";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { MonthlyRecapCard } from "@/components/dashboard/monthly-recap-card";
import { HeroWidgets } from "@/components/layout/hero-widgets";
import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type { UserAuthorization } from "@/lib/auth/rbac";
import type { CurrentUser } from "@/lib/auth/types";

import { ANNOUNCEMENT_PRIORITY_LABELS } from "@/features/announcements/constants";
import {
  countMyUnreadAnnouncements,
  listMyAnnouncements,
} from "@/features/announcements/queries";
import { formatTime } from "@/features/attendance/format";
import {
  findAttendanceForDate,
  findOpenAttendance,
} from "@/features/attendance/queries";
import { getEmployeeSelfProfile } from "@/features/employees/queries";
import { listMyLeaveRequests } from "@/features/leave/queries";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";

import {
  AbsenNowCard,
  HomeMenuMoreTile,
  HomeMenuTile,
  type HomeMenuTone,
} from "./home-actions";
import { getMonthlyRecap, recentMonthKeys } from "./queries";

interface EmployeeDashboardProps {
  user: CurrentUser;
  authorization: UserAuthorization;
  organizationName: string | null;
  roleLabel: string | null;
  /** Selected recap month ("YYYY-MM", from `?bulan=`). */
  monthKey: string;
}

/**
 * The employee's self-service home (reference mobile layout).
 *
 * The greeting lives in the shell's blue band; this page renders, in order:
 * the 3×2 colour menu grid overlapping the band's wave, the clock / weather
 * cards with the prayer schedule, "Ringkasan Kehadiran Saya", and the
 * announcement feed. Attendance itself is the centre face button of the
 * bottom navigation. Menu tiles are filtered by the employee's permissions
 * (the server route guards stay the authority); "Lainnya" fills the grid
 * with the full navigation drawer.
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

  // The announcement feed is self-service: any signed-in employee may read
  // it (see app/(dashboard)/announcements/page.tsx), so no permission gate.
  const today = parseAttendanceDate(
    dateStringInTimeZone(new Date(), APP_TIME_ZONE)
  );
  const [
    recap,
    latestAnnouncements,
    unreadAnnouncements,
    openAttendance,
    todayRecord,
    myLeave,
  ] = await Promise.all([
    getMonthlyRecap(organizationId, employee.id, monthKey),
    listMyAnnouncements({ organizationId, employeeId: employee.id, limit: 5 }),
    countMyUnreadAnnouncements({ organizationId, employeeId: employee.id }),
    findOpenAttendance(organizationId, employee.id),
    findAttendanceForDate(organizationId, employee.id, today),
    listMyLeaveRequests(organizationId, employee.id),
  ]);

  // Today's attendance state drives the "Absen Sekarang" card: it opens the
  // face-attendance sheet only when a check-in or check-out is due.
  const onLeaveToday = myLeave.some(
    (request) =>
      request.status === "approved" &&
      request.startDate.getTime() <= today.getTime() &&
      request.endDate.getTime() >= today.getTime()
  );
  const isWeekend = today.getUTCDay() === 0 || today.getUTCDay() === 6;
  const state = employee.employmentStatus !== "active"
    ? "UNAVAILABLE"
    : openAttendance
      ? "CHECKED_IN"
      : todayRecord?.checkOutAt
        ? "CHECKED_OUT"
        : todayRecord && todayRecord.status === "rejected"
          ? "REJECTED"
          : onLeaveToday
            ? "ON_LEAVE"
            : isWeekend
              ? "WEEKEND"
              : "NOT_CHECKED_IN";
  const activeRecord = openAttendance ?? todayRecord;
  const checkInLabel = activeRecord?.checkInAt
    ? formatTime(activeRecord.checkInAt, activeRecord.workLocationTimezone ?? null)
    : null;
  const canAttendance = can(P.ATTENDANCE_VIEW);
  const absenEnabled =
    canAttendance &&
    ((state === "NOT_CHECKED_IN" && can(P.ATTENDANCE_CHECK_IN)) ||
      (state === "CHECKED_IN" && can(P.ATTENDANCE_CHECK_OUT)));
  const absenSubtitle = {
    CHECKED_IN: `Masuk ${checkInLabel ?? "—"} · Lakukan absensi pulang`,
    CHECKED_OUT: "Absensi hari ini sudah selesai",
    ON_LEAVE: "Anda sedang cuti hari ini",
    WEEKEND: "Hari ini akhir pekan",
    REJECTED: "Absensi hari ini ditolak — hubungi HR",
    UNAVAILABLE: "Absensi tidak tersedia untuk profil Anda",
    NOT_CHECKED_IN: "Lakukan absensi masuk atau pulang",
  }[state];

  const menu: Array<{
    href: string;
    icon: HrisIconName;
    label: string;
    tone: HomeMenuTone;
    dot?: boolean;
    show: boolean;
  }> = [
    { href: "/attendance", icon: "calendar-check", label: "Absensi Saya", tone: "blue", show: canAttendance },
    { href: "/leave", icon: "calendar", label: "Pengajuan Cuti", tone: "violet", show: can(P.LEAVE_VIEW) },
    { href: "/permission", icon: "clipboard", label: "Izin Kegiatan", tone: "teal", show: can(P.PERMISSION_VIEW) },
    { href: "/payslip", icon: "wallet", label: "Slip Gaji", tone: "green", show: can(P.PAYSLIP_VIEW) },
    {
      href: "/announcements",
      icon: "megaphone",
      label: "Pengumuman",
      tone: "purple",
      dot: unreadAnnouncements > 0,
      show: true,
    },
  ];
  const visibleMenu = menu.filter((item) => item.show);

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

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Beranda</h1>

      {/* Menu grid — overlaps the band's wave */}
      <nav
        aria-label="Menu karyawan"
        className="relative z-10 -mt-12 grid grid-cols-3 gap-3"
      >
        {visibleMenu.map((item) => (
          <HomeMenuTile
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            tone={item.tone}
            dot={item.dot}
            dotLabel={item.dot ? `${unreadAnnouncements} belum dibaca` : undefined}
          />
        ))}
        <HomeMenuMoreTile />
      </nav>

      {/* Primary attendance action — opens the face-attendance sheet */}
      {canAttendance ? (
        <AbsenNowCard enabled={absenEnabled} subtitle={absenSubtitle} />
      ) : null}

      {/* Clock · weather · prayer schedule (device time and position) */}
      <HeroWidgets />

      <MonthlyRecapCard recap={recap} monthOptions={recentMonthKeys(6)} />

      {carouselItems.length > 0 ? (
        <section className="space-y-3 pt-1">
          <SectionHeader
            title="Pengumuman"
            action={
              <Link
                href="/announcements"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/85"
              >
                Lihat semua
                <HrisIcon name="chevron-right" className="size-4" />
              </Link>
            }
          />
          <AnnouncementCarousel items={carouselItems} />
        </section>
      ) : null}
    </div>
  );
}
