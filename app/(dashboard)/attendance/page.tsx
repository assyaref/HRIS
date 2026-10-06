import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { AttendanceStatusCard } from "@/components/employee/attendance-status-card";
import { SectionHeader } from "@/components/employee/section-header";
import { StatusBadge, statusTone } from "@/components/employee/status-badge";
import { TabNav } from "@/components/employee/tab-nav";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { HrisIcon } from "@/components/layout/icons";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";

import { AttendancePanel } from "@/features/attendance/attendance-panel";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  type AttendanceStatus,
} from "@/features/attendance/constants";
import { formatDate, formatTime } from "@/features/attendance/format";
import {
  findAttendanceForDate,
  findOpenAttendance,
  getEmployeeForUser,
  listEligibleAttendanceOptions,
  listMyAttendanceHistory,
} from "@/features/attendance/queries";
import { getMonthAttendanceSummary } from "@/features/dashboard/queries";

export const metadata: Metadata = {
  title: "Kehadiran",
};

type AttendanceTab = "presensi" | "riwayat" | "rekap";

function readParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Employee attendance self-service page.
 *
 * The employee is resolved from the authenticated user's linked employee
 * record — never from a client-supplied id. All business actions happen in
 * the server actions; this page renders current state and history.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const params = await searchParams;
  const tabParam = readParam(params.tab);
  const tab: AttendanceTab =
    tabParam === "riwayat" || tabParam === "rekap" ? tabParam : "presensi";
  const statusParam = readParam(params.status);
  const statusFilter = ATTENDANCE_STATUSES.includes(
    statusParam as AttendanceStatus
  )
    ? (statusParam as AttendanceStatus)
    : undefined;
  const monthFilter = readParam(params.month);

  const riwayatHref = (next: {
    status?: AttendanceStatus;
    month?: string;
  }): string => {
    const query = new URLSearchParams({ tab: "riwayat" });
    if (next.status) query.set("status", next.status);
    if (next.month) query.set("month", next.month);
    return `/attendance?${query.toString()}`;
  };

  const now = new Date();
  const monthOptions = [0, 1, 2].map((offset) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)
    );
    const key = `${date.getUTCFullYear()}-${String(
      date.getUTCMonth() + 1
    ).padStart(2, "0")}`;
    return {
      key,
      label: new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
    };
  });

  const employee = await getEmployeeForUser(user.id, organizationId);
  if (!employee) {
    return (
      <div className="space-y-6">
        <PageHeader name={null} number={null} />
        <EmployeeEmptyState
          icon="profile"
          title="Profil karyawan belum tertaut"
          description="Akun Anda belum ditautkan ke data karyawan, sehingga presensi tidak tersedia. Hubungi administrator."
        />
      </div>
    );
  }

  const employeeActive = employee.employmentStatus === "active";
  const [
    openAttendance,
    todayRecord,
    options,
    history,
    monthSummary,
    canCheckIn,
    canCheckOut,
  ] = await Promise.all([
    findOpenAttendance(organizationId, employee.id),
    findAttendanceForDate(
      organizationId,
      employee.id,
      parseAttendanceDate(dateStringInTimeZone(new Date(), null))
    ),
    listEligibleAttendanceOptions(organizationId, employee.id),
    listMyAttendanceHistory(organizationId, employee.id, 1, {
      status: statusFilter,
      month: monthFilter,
    }),
    getMonthAttendanceSummary(organizationId, employee.id),
    hasPermission(user.id, PERMISSIONS.ATTENDANCE_CHECK_IN),
    hasPermission(user.id, PERMISSIONS.ATTENDANCE_CHECK_OUT),
  ]);

  let state: Parameters<typeof AttendanceStatusCard>[0]["state"];
  if (!employeeActive) {
    state = "UNAVAILABLE";
  } else if (openAttendance) {
    state = "CHECKED_IN";
  } else if (todayRecord?.checkOutAt) {
    state = "CHECKED_OUT";
  } else if (todayRecord && todayRecord.status === "rejected") {
    state = "REJECTED";
  } else if (todayRecord) {
    state = "CHECKED_OUT";
  } else {
    state = "NOT_CHECKED_IN";
  }

  const activeRecord = openAttendance ?? todayRecord;
  const timeZone = activeRecord?.workLocationTimezone ?? null;
  const checkInLabel = activeRecord?.checkInAt
    ? formatTime(activeRecord.checkInAt, timeZone)
    : null;
  const checkOutLabel = todayRecord?.checkOutAt
    ? formatTime(todayRecord.checkOutAt, timeZone)
    : null;
  const locationLabel =
    activeRecord?.checkInLocationStatus === "valid"
      ? "Dalam Area Kerja"
      : activeRecord?.checkInLocationStatus === "outside_geofence"
        ? "Di Luar Area Kerja"
        : null;
  const verificationLabel =
    activeRecord?.checkInVerificationStatus === "verified"
      ? "Terverifikasi"
      : activeRecord?.checkInVerificationStatus === "failed"
        ? "Gagal Verifikasi"
        : null;

  return (
    <div className="space-y-5">
      <PageHeader
        name={`${employee.firstName} ${employee.lastName}`}
        number={employee.employeeNumber}
      />

      <TabNav
        items={[
          {
            key: "presensi",
            label: "Presensi",
            href: "/attendance",
            active: tab === "presensi",
          },
          {
            key: "riwayat",
            label: "Riwayat",
            href: "/attendance?tab=riwayat",
            active: tab === "riwayat",
          },
          {
            key: "rekap",
            label: "Rekap",
            href: "/attendance?tab=rekap",
            active: tab === "rekap",
          },
        ]}
      />

      {tab === "presensi" ? (
        <div className="space-y-5">
          <AttendanceStatusCard
            state={state}
            checkInLabel={checkInLabel}
            checkOutLabel={checkOutLabel}
            durationLabel={null}
            verificationLabel={verificationLabel}
            locationLabel={locationLabel}
            showAction={false}
          />

          {activeRecord ? (
            <section className="space-y-3">
              <SectionHeader title="Detail Presensi" />
              <div className="emp-card divide-y divide-slate-100">
                <DetailRow
                  icon="check-in"
                  label="Presensi Masuk"
                  value={checkInLabel}
                  meta={[
                    activeRecord.checkInAt
                      ? formatDate(activeRecord.checkInAt)
                      : null,
                    activeRecord.projectName,
                    activeRecord.workLocationName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  locationStatus={activeRecord.checkInLocationStatus}
                  verificationStatus={activeRecord.checkInVerificationStatus}
                />
                <DetailRow
                  icon="check-out"
                  label="Presensi Pulang"
                  value={checkOutLabel}
                  meta={[
                    todayRecord?.checkOutAt
                      ? formatDate(todayRecord.checkOutAt)
                      : null,
                    activeRecord.workLocationName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  locationStatus={activeRecord.checkOutLocationStatus}
                  verificationStatus={activeRecord.checkOutVerificationStatus}
                />
              </div>
            </section>
          ) : null}

          {state === "UNAVAILABLE" ? (
            <EmployeeEmptyState
              icon="alert"
              title="Profil tidak aktif"
              description="Profil kepegawaian Anda tidak aktif. Hubungi administrator."
            />
          ) : null}

          {state === "CHECKED_IN" && canCheckOut ? (
            <AttendancePanel mode="check_out" options={[]} />
          ) : null}

          {state === "NOT_CHECKED_IN" && canCheckIn ? (
            options.length > 0 ? (
              <AttendancePanel mode="check_in" options={options} />
            ) : (
              <EmployeeEmptyState
                icon="map-pin"
                title="Belum ada lokasi kerja"
                description="Anda belum memiliki penugasan proyek dengan lokasi kerja aktif. Hubungi administrator."
              />
            )
          ) : null}

          {state === "NOT_CHECKED_IN" && !canCheckIn ? (
            <EmployeeEmptyState
              icon="lock"
              title="Tidak ada izin presensi"
              description="Anda tidak memiliki izin untuk melakukan presensi."
            />
          ) : null}

          {state === "CHECKED_OUT" ? (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Anda sudah menyelesaikan presensi hari ini.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "riwayat" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="px-1 text-xs font-medium text-[#94a3b8]">Periode</p>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              <FilterChip
                href={riwayatHref({ status: statusFilter })}
                label="Semua periode"
                active={!monthFilter}
              />
              {monthOptions.map((option) => (
                <FilterChip
                  key={option.key}
                  href={riwayatHref({
                    status: statusFilter,
                    month: option.key,
                  })}
                  label={option.label}
                  active={monthFilter === option.key}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="px-1 text-xs font-medium text-[#94a3b8]">Status</p>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              <FilterChip
                href={riwayatHref({ month: monthFilter })}
                label="Semua"
                active={!statusFilter}
              />
              {ATTENDANCE_STATUSES.map((status) => (
                <FilterChip
                  key={status}
                  href={riwayatHref({ status, month: monthFilter })}
                  label={ATTENDANCE_STATUS_LABELS[status]}
                  active={statusFilter === status}
                />
              ))}
            </div>
          </div>

          {history.items.length === 0 ? (
            <EmployeeEmptyState
              icon="calendar"
              title="Belum ada riwayat"
              description="Riwayat kehadiran Anda akan tampil di sini."
            />
          ) : (
            <div className="emp-card divide-y divide-slate-100">
              {history.items.map((record) => (
                <Link
                  key={record.id}
                  href={`/attendance/${record.id}`}
                  className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#172554]">
                      {new Intl.DateTimeFormat("id-ID", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        timeZone: "UTC",
                      }).format(record.attendanceDate)}
                    </p>
                    <p className="text-xs text-[#64748b]">
                      {formatTime(record.checkInAt, record.workLocationTimezone)}
                      {" - "}
                      {formatTime(
                        record.checkOutAt,
                        record.workLocationTimezone
                      )}
                      {record.workLocationName
                        ? ` · ${record.workLocationName}`
                        : ""}
                    </p>
                  </div>
                  <StatusBadge tone={statusTone(record.status)}>
                    {ATTENDANCE_STATUS_LABELS[record.status]}
                  </StatusBadge>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "rekap" ? (
        <div className="space-y-4">
          <SectionHeader
            title="Rekap Bulan Ini"
            description="Ringkasan kehadiran Anda bulan berjalan"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile
              label="Hadir"
              value={monthSummary.present}
              tone="success"
            />
            <SummaryTile
              label="Selesai"
              value={monthSummary.completed}
              tone="info"
            />
            <SummaryTile
              label="Belum Lengkap"
              value={monthSummary.incomplete}
              tone="warning"
            />
            <SummaryTile
              label="Ditolak"
              value={monthSummary.rejected}
              tone="danger"
            />
          </div>
          <div className="emp-card flex items-center justify-between p-4">
            <p className="text-sm text-[#64748b]">Total catatan</p>
            <p className="text-sm font-semibold text-[#172554]">
              {monthSummary.total}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PageHeader({ name, number }: { name: string | null; number: string | null }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[#172554]">
        Kehadiran
      </h1>
      {name ? (
        <p className="mt-1 text-sm text-[#64748b]">
          {name}
          {number ? ` · ${number}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  meta,
  locationStatus,
  verificationStatus,
}: {
  icon: "check-in" | "check-out";
  label: string;
  value: string | null;
  meta: string;
  locationStatus: string | null;
  verificationStatus: string | null;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#1677e8]"
      >
        <HrisIcon name={icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[#172554]">{label}</p>
          <p className="text-sm font-semibold text-[#172554]">{value ?? "—"}</p>
        </div>
        {meta ? <p className="mt-0.5 text-xs text-[#94a3b8]">{meta}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {locationStatus ? (
            <StatusBadge
              tone={statusTone(locationStatus)}
              icon={<HrisIcon name="map-pin" className="size-3.5" />}
            >
              {locationStatus === "valid"
                ? "Dalam Area Kerja"
                : locationStatus === "outside_geofence"
                  ? "Di Luar Area Kerja"
                  : locationStatus}
            </StatusBadge>
          ) : null}
          {verificationStatus ? (
            <StatusBadge
              tone={statusTone(verificationStatus)}
              icon={<HrisIcon name="scan" className="size-3.5" />}
            >
              {verificationStatus === "verified"
                ? "Terverifikasi"
                : verificationStatus === "failed"
                  ? "Gagal Verifikasi"
                  : verificationStatus}
            </StatusBadge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-medium transition-colors",
        active
          ? "bg-[#1677e8] text-white"
          : "bg-white text-[#64748b] ring-1 ring-slate-200 hover:text-[#172554]",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "info" | "warning" | "danger";
}) {
  const toneClass = {
    success: "bg-emerald-50 text-emerald-700",
    info: "bg-blue-50 text-blue-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
  }[tone];
  return (
    <div className="emp-card p-4">
      <span
        className={[
          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
          toneClass,
        ].join(" ")}
      >
        {label}
      </span>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#172554]">
        {value}
      </p>
    </div>
  );
}
