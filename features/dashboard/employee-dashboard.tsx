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
  listEligibleAttendanceOptions,
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
  QuickMenuMoreTile,
  QuickMenuSeeAll,
  QuickMenuTile,
  TODAY_STATUS,
  TodayTile,
  type TodayState,
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
 * the compact clock / weather cards overlapping the band's wave, the prayer
 * schedule, four "today" tiles (Hadir Hari Ini, Jam Pulang, Lokasi, Status),
 * the "Absen Sekarang" card, the one-row "Menu Cepat", "Ringkasan Kehadiran
 * Saya" and the announcement feed. The column is an `@container`: sizes
 * scale with its width instead of switching at viewport breakpoints, so the
 * layout stays fixed on every phone. Menu tiles are filtered by the
 * employee's permissions (the server route guards stay the authority);
 * "Lainnya" / "Lihat Semua" open the full navigation drawer.
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
    attendanceOptions,
  ] = await Promise.all([
    getMonthlyRecap(organizationId, employee.id, monthKey),
    listMyAnnouncements({ organizationId, employeeId: employee.id, limit: 5 }),
    countMyUnreadAnnouncements({ organizationId, employeeId: employee.id }),
    findOpenAttendance(organizationId, employee.id),
    findAttendanceForDate(organizationId, employee.id, today),
    listMyLeaveRequests(organizationId, employee.id),
    listEligibleAttendanceOptions(organizationId, employee.id),
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
  const state: TodayState = employee.employmentStatus !== "active"
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
  const checkOutLabel =
    todayRecord?.checkOutAt && !openAttendance
      ? formatTime(todayRecord.checkOutAt, todayRecord.workLocationTimezone ?? null)
      : null;
  const locationName =
    activeRecord?.workLocationName ?? attendanceOptions[0]?.workLocationName ?? null;
  const status = TODAY_STATUS[state];
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
    dot?: boolean;
    show: boolean;
  }> = [
    { href: "/attendance", icon: "calendar-check", label: "Absensi", show: canAttendance },
    { href: "/leave", icon: "plane", label: "Cuti", show: can(P.LEAVE_VIEW) },
    { href: "/permission", icon: "users", label: "Pengajuan", show: can(P.PERMISSION_VIEW) },
    { href: "/attendance?range=all", icon: "document", label: "Riwayat", show: canAttendance },
    { href: "/payslip", icon: "wallet", label: "Slip Gaji", show: can(P.PAYSLIP_VIEW) },
    {
      href: "/announcements",
      icon: "megaphone",
      label: "Pengumuman",
      dot: unreadAnnouncements > 0,
      show: true,
    },
  ];
  const visibleMenu = menu.filter((item) => item.show).slice(0, 4);

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
    <div className="@container space-y-3">
      <h1 className="sr-only">Beranda</h1>

      {/* Clock · weather · prayer schedule — the first row overlaps the wave */}
      <HeroWidgets compact className="relative z-10 -mt-9" />

      {/* Today at a glance */}
      {canAttendance ? (
        <section aria-label="Kehadiran hari ini" className="grid grid-cols-2 gap-2.5">
          <TodayTile
            icon="calendar-check"
            chip="bg-[#E3F6E8] text-[#16A34A] dark:bg-[#16301C] dark:text-[#86EFAC]"
            label="Hadir Hari Ini"
          >
            <p className="text-[18px] leading-tight font-extrabold tracking-wide text-foreground tabular-nums">
              {checkInLabel ?? "--:--"}
            </p>
          </TodayTile>
          <TodayTile
            icon="clock"
            chip="bg-[#EEE8FF] text-[#7C3AED] dark:bg-[#251E45] dark:text-[#C4B5FD]"
            label="Jam Pulang"
          >
            <p className="text-[18px] leading-tight font-extrabold tracking-wide text-foreground tabular-nums">
              {checkOutLabel ?? "--:--"}
            </p>
          </TodayTile>
          <TodayTile
            icon="map-pin"
            chip="bg-[#E0EEFF] text-[#1D6FE0] dark:bg-[#16264A] dark:text-[#93C5FD]"
            label="Lokasi"
          >
            <p className="flex min-w-0 items-center gap-1.5 text-[15px] leading-tight font-extrabold text-foreground">
              <span
                aria-hidden="true"
                className={
                  locationName
                    ? "size-2 shrink-0 rounded-full bg-[#22C55E]"
                    : "size-2 shrink-0 rounded-full bg-muted-foreground/50"
                }
              />
              <span className="min-w-0 truncate" title={locationName ?? undefined}>
                {locationName ?? "Belum diatur"}
              </span>
            </p>
          </TodayTile>
          <TodayTile
            icon="target"
            chip="bg-[#DDF5EE] text-[#0D9488] dark:bg-[#112E28] dark:text-[#5EEAD4]"
            label="Status"
          >
            <span
              className={`inline-flex max-w-full rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${status.pill}`}
            >
              <span className="truncate">{status.label}</span>
            </span>
          </TodayTile>
        </section>
      ) : null}

      {/* Primary attendance action — opens the face-attendance sheet */}
      {canAttendance ? (
        <AbsenNowCard enabled={absenEnabled} subtitle={absenSubtitle} />
      ) : null}

      {/* Menu Cepat — one row: up to four modules + "Lainnya" */}
      <section aria-labelledby="menu-cepat" className="space-y-2 pt-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id="menu-cepat" className="text-[17px] font-bold tracking-tight text-foreground">
            Menu Cepat
          </h2>
          <QuickMenuSeeAll />
        </div>
        <nav aria-label="Menu cepat" className="grid grid-cols-5 gap-2">
          {visibleMenu.map((item) => (
            <QuickMenuTile
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              dot={item.dot}
              dotLabel={item.dot ? `${unreadAnnouncements} belum dibaca` : undefined}
            />
          ))}
          <QuickMenuMoreTile />
        </nav>
      </section>

      <MonthlyRecapCard compact recap={recap} monthOptions={recentMonthKeys(6)} />

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
