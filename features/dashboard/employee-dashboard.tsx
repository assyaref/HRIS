import Link from "next/link";

import { AnnouncementCarousel } from "@/components/employee/announcement-carousel";
import { AttendanceStatusCard } from "@/components/employee/attendance-status-card";
import { EmployeeHeader } from "@/components/employee/employee-header";
import { QuickServiceGrid } from "@/components/employee/quick-service-grid";
import type { QuickServiceItem } from "@/components/employee/quick-service-card";
import { SectionHeader } from "@/components/employee/section-header";
import { StatusBadge, statusTone } from "@/components/employee/status-badge";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { HrisIcon } from "@/components/layout/icons";
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
  ATTENDANCE_VERIFICATION_STATUS_LABELS,
  type AttendanceStatus,
  type AttendanceVerificationStatus,
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

function durationLabel(from: Date, to: Date): string {
  const minutes = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} Jam ${rest} Menit`;
}

/** The employee's self-service dashboard — mobile-first HRIS home. */
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
        <h1 className="text-2xl font-semibold tracking-tight text-[#172554]">
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

  let state: Parameters<typeof AttendanceStatusCard>[0]["state"];
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
  const workedDuration =
    todayRecord?.checkInAt && todayRecord.checkOutAt
      ? durationLabel(todayRecord.checkInAt, todayRecord.checkOutAt)
      : openAttendance?.checkInAt
        ? durationLabel(openAttendance.checkInAt, new Date())
        : null;

  const verificationLabel =
    activeRecord?.checkInVerificationStatus === "verified"
      ? ATTENDANCE_VERIFICATION_STATUS_LABELS[
          activeRecord.checkInVerificationStatus as AttendanceVerificationStatus
        ] ?? "Terverifikasi"
      : null;
  const locationLabel =
    activeRecord?.checkInLocationStatus === "valid"
      ? "Dalam Area Kerja"
      : activeRecord?.checkInLocationStatus === "outside_geofence"
        ? "Di Luar Area Kerja"
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
      label: "Kehadiran",
      tone: "blue",
    },
    canLeave && { href: "/leave", icon: "leave", label: "Cuti", tone: "amber" },
    canPermission && {
      href: "/permission",
      icon: "permission",
      label: "Izin",
      tone: "cyan",
    },
    canPayslip && {
      href: "/payslip",
      icon: "payslip",
      label: "Pay Slip",
      tone: "violet",
    },
    canAttendance && {
      href: "/attendance",
      icon: "history",
      label: "Riwayat",
      tone: "green",
    },
    {
      href: "/announcements",
      icon: "document",
      label: "Dokumen",
      tone: "slate",
    },
    { href: "/face-id", icon: "scan", label: "Face ID", tone: "rose" },
    {
      href: "/settings/account",
      icon: "profile",
      label: "Profil Saya",
      tone: "blue",
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

  const monthlyTiles = [
    {
      label: "Hadir bulan ini",
      value: String(monthSummary.present + monthSummary.completed),
      tone: "green" as const,
      icon: "calendar-check" as const,
    },
    {
      label: "Saldo cuti",
      value: `${availableLeave} hari`,
      tone: "amber" as const,
      icon: "leave" as const,
    },
    {
      label: "Menunggu",
      value: String(pendingLeave + pendingPermission),
      tone: "blue" as const,
      icon: "clock" as const,
    },
    {
      label: "Pay slip",
      value: myPayslips.length ? String(myPayslips.length) : "—",
      tone: "violet" as const,
      icon: "payslip" as const,
    },
  ];

  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="space-y-6">
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

      {carouselItems.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            title="Pengumuman"
            action={
              <Link
                href="/announcements"
                className="inline-flex items-center gap-1 text-sm font-medium text-[#1677e8]"
              >
                {unreadAnnouncements > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#1677e8] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {unreadAnnouncements}
                  </span>
                ) : null}
                Lihat semua
                <HrisIcon name="chevron-right" className="size-4" />
              </Link>
            }
          />
          <AnnouncementCarousel items={carouselItems} />
        </section>
      ) : null}

      <AttendanceStatusCard
        state={state}
        checkInLabel={checkInLabel}
        checkOutLabel={checkOutLabel}
        durationLabel={workedDuration}
        verificationLabel={verificationLabel}
        locationLabel={locationLabel}
        showAction={state === "NOT_CHECKED_IN" && canCheckIn}
      />

      <section className="space-y-3">
        <SectionHeader
          title="Layanan Aplikasi"
          description="Akses cepat modul HRIS Anda"
        />
        <QuickServiceGrid items={services} />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Ringkasan Bulan Ini" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {monthlyTiles.map((tile) => (
            <div key={tile.label} className="emp-card flex items-center gap-3 p-4">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-2xl",
                  tile.tone === "green" && "bg-emerald-50 text-emerald-600",
                  tile.tone === "amber" && "bg-amber-50 text-amber-600",
                  tile.tone === "blue" && "bg-blue-50 text-blue-600",
                  tile.tone === "violet" && "bg-violet-50 text-violet-600"
                )}
              >
                <HrisIcon name={tile.icon} className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs text-[#64748b]">{tile.label}</p>
                <p className="text-lg font-semibold tracking-tight text-[#172554]">
                  {tile.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Aktivitas Terbaru"
          description="Pengajuan cuti dan izin Anda"
          action={
            <Link
              href="/leave"
              className="inline-flex items-center gap-1 text-sm font-medium text-[#1677e8]"
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
          <div className="emp-card divide-y divide-slate-100">
            {recentRequests.map((request) => (
              <Link
                key={`${request.kind}-${request.id}`}
                href={
                  request.kind === "leave"
                    ? `/leave/${request.id}`
                    : `/permission/${request.id}`
                }
                className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#172554]">
                    {request.title}
                  </p>
                  <p className="text-xs text-[#94a3b8]">
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
          </div>
        )}
      </section>

      {canAttendance ? (
        <section className="space-y-3">
          <SectionHeader title="Status Presensi" description="Ringkasan hari ini" />
          <div className="emp-card grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-4 sm:divide-x">
            <div className="p-4">
              <p className="text-xs text-[#64748b]">Status</p>
              <p className="mt-0.5 text-sm font-semibold text-[#172554]">
                {todayRecord
                  ? ATTENDANCE_STATUS_LABELS[
                      todayRecord.status as AttendanceStatus
                    ] ?? todayRecord.status
                  : "Belum ada"}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-[#64748b]">Jam masuk</p>
              <p className="mt-0.5 text-sm font-semibold text-[#172554]">
                {checkInLabel ?? "—"}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-[#64748b]">Jam pulang</p>
              <p className="mt-0.5 text-sm font-semibold text-[#172554]">
                {checkOutLabel ?? "—"}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-[#64748b]">Lokasi</p>
              <p className="mt-0.5 text-sm font-semibold text-[#172554]">
                {activeRecord?.workLocationName ?? "—"}
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
