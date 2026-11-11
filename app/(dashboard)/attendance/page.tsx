import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { AttendanceStatusCard } from "@/components/employee/attendance-status-card";
import { SectionHeader } from "@/components/employee/section-header";
import { StatusBadge, statusTone } from "@/components/employee/status-badge";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";
import { cn } from "@/lib/utils/cn";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";

import { AttendancePanel } from "@/features/attendance/attendance-panel";
import {
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
} from "@/features/attendance/constants";
import { formatDate, formatTime } from "@/features/attendance/format";
import {
  HistoryRangeSelect,
  type HistoryRangeOption,
} from "@/features/attendance/history-range-select";
import {
  findAttendanceForDate,
  findOpenAttendance,
  listEligibleAttendanceOptions,
  listMyAttendanceHistory,
  type AttendanceRow,
} from "@/features/attendance/queries";
import { getMonthAttendanceSummary } from "@/features/dashboard/queries";
import { getEmployeeSelfProfile } from "@/features/employees/queries";

export const metadata: Metadata = {
  title: "Absensi",
};

type AttendanceTab = "riwayat" | "rekap" | "presensi";

/** Period of the history card. `all` opens the full, filterable list. */
type HistoryRange = "7d" | "30d" | "month" | "all";

const HISTORY_RANGES: Record<HistoryRange, { label: string; description: string }> = {
  "7d": { label: "7 Hari Terakhir", description: "Riwayat kehadiran 7 hari terakhir." },
  "30d": { label: "30 Hari Terakhir", description: "Riwayat kehadiran 30 hari terakhir." },
  month: { label: "Bulan Ini", description: "Riwayat kehadiran bulan berjalan." },
  all: { label: "Semua Riwayat", description: "Seluruh riwayat kehadiran Anda." },
};

/** Employee-facing status labels (Indonesian). */
const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Hadir",
  completed: "Hadir",
  incomplete: "Belum Lengkap",
  rejected: "Ditolak",
};

const STATUS_ICONS: Record<AttendanceStatus, HrisIconName> = {
  present: "check",
  completed: "check",
  incomplete: "clock",
  rejected: "close",
};

function readParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readRange(value: string | undefined): HistoryRange {
  return value === "30d" || value === "month" || value === "all" ? value : "7d";
}

function readPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Employee attendance self-service page ("Absensi").
 *
 * Reference mobile layout: identity card overlapping the blue band, a
 * Riwayat / Rekap toggle, then the history card (period selector, one row per
 * day with Masuk / Pulang times and the status) or the monthly recap. The
 * legacy "Presensi" tab (today's status + the check-in / check-out panels)
 * stays reachable for the desktop shell, where the ABSEN sheet is not in the
 * bottom navigation.
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
    tabParam === "rekap" || tabParam === "presensi" ? tabParam : "riwayat";
  const range = readRange(readParam(params.range));
  const statusParam = readParam(params.status);
  const statusFilter = ATTENDANCE_STATUSES.includes(
    statusParam as AttendanceStatus
  )
    ? (statusParam as AttendanceStatus)
    : undefined;
  const monthFilter = readParam(params.month);
  const page = readPage(readParam(params.page));

  const riwayatHref = (next: {
    range?: HistoryRange;
    status?: AttendanceStatus;
    month?: string;
    page?: number;
  }): string => {
    const query = new URLSearchParams();
    const nextRange = next.range ?? "7d";
    if (nextRange !== "7d") query.set("range", nextRange);
    if (next.status) query.set("status", next.status);
    if (next.month) query.set("month", next.month);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    const suffix = query.toString();
    return suffix ? `/attendance?${suffix}` : "/attendance";
  };

  const rangeOptions: HistoryRangeOption[] = (
    Object.keys(HISTORY_RANGES) as HistoryRange[]
  ).map((key) => ({
    key,
    label: HISTORY_RANGES[key].label,
    href: riwayatHref({ range: key }),
  }));

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

  const employee = await getEmployeeSelfProfile(user.id, organizationId);
  if (!employee) {
    return (
      <div className="space-y-5">
        <IdentityCard
          name={user.email.split("@")[0]}
          employeeNumber={null}
          position={null}
          photoUrl={null}
        />
        <EmployeeEmptyState
          icon="profile"
          title="Profil karyawan belum tertaut"
          description="Akun Anda belum ditautkan ke data karyawan, sehingga presensi tidak tersedia. Hubungi administrator."
        />
      </div>
    );
  }

  // The history window is anchored on today's calendar day in the app time
  // zone; attendance days are stored as UTC-midnight `date` values.
  const today = parseAttendanceDate(dateStringInTimeZone(now, APP_TIME_ZONE));
  const windowStart = (days: number): Date => {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return start;
  };
  const thisMonthKey = dateStringInTimeZone(now, APP_TIME_ZONE).slice(0, 7);
  const historyFilters =
    range === "all"
      ? { status: statusFilter, month: monthFilter }
      : range === "month"
        ? { month: thisMonthKey }
        : { dateFrom: windowStart(range === "30d" ? 30 : 7), dateTo: today };
  const historyPageSize = range === "all" ? 20 : range === "7d" ? 7 : 31;

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
    listMyAttendanceHistory(
      organizationId,
      employee.id,
      range === "all" ? page : 1,
      historyFilters,
      historyPageSize
    ),
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
    <div className="space-y-4 lg:space-y-5">
      <IdentityCard
        name={`${employee.firstName} ${employee.lastName}`.trim()}
        employeeNumber={employee.employeeNumber}
        position={employee.position}
        photoUrl={employee.profilePhotoUrl}
      />

      <div
        role="tablist"
        aria-label="Bagian absensi"
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
      >
        <SegmentTab
          href="/attendance"
          icon="clipboard"
          label="Riwayat"
          active={tab === "riwayat"}
        />
        <SegmentTab
          href="/attendance?tab=rekap"
          icon="bar-chart"
          label="Rekap"
          active={tab === "rekap"}
        />
        <SegmentTab
          href="/attendance?tab=presensi"
          icon="face"
          label="Presensi"
          active={tab === "presensi"}
          className={tab === "presensi" ? undefined : "hidden lg:flex"}
        />
      </div>

      {tab === "riwayat" ? (
        <section
          aria-labelledby="riwayat-title"
          className="hris-card rounded-[26px] p-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl hris-surface-primary text-primary"
            >
              <HrisIcon name="calendar-check" className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="riwayat-title"
                className="text-[21px] leading-tight font-extrabold tracking-tight text-foreground"
              >
                Riwayat Absensi
              </h2>
              <p className="mt-1 text-[15px] text-muted-foreground">
                {HISTORY_RANGES[range].description}
              </p>
            </div>
            <div className="hidden min-[480px]:block">
              <HistoryRangeSelect value={range} options={rangeOptions} />
            </div>
          </div>
          <div className="mt-3 min-[480px]:hidden">
            <HistoryRangeSelect value={range} options={rangeOptions} className="w-full" />
          </div>

          {range === "all" ? (
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <p className="px-1 text-xs font-medium text-muted-foreground">Periode</p>
                <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
                  <FilterChip
                    href={riwayatHref({ range: "all", status: statusFilter })}
                    label="Semua periode"
                    active={!monthFilter}
                  />
                  {monthOptions.map((option) => (
                    <FilterChip
                      key={option.key}
                      href={riwayatHref({
                        range: "all",
                        status: statusFilter,
                        month: option.key,
                      })}
                      label={option.label}
                      active={monthFilter === option.key}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="px-1 text-xs font-medium text-muted-foreground">Status</p>
                <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
                  <FilterChip
                    href={riwayatHref({ range: "all", month: monthFilter })}
                    label="Semua"
                    active={!statusFilter}
                  />
                  {ATTENDANCE_STATUSES.map((status) => (
                    <FilterChip
                      key={status}
                      href={riwayatHref({ range: "all", status, month: monthFilter })}
                      label={STATUS_LABELS[status]}
                      active={statusFilter === status}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {history.items.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-muted/60 px-4 py-8 text-center">
              <HrisIcon
                name="calendar"
                className="mx-auto size-8 text-muted-foreground"
              />
              <p className="mt-2 text-sm font-semibold text-foreground">
                Belum ada riwayat
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {range === "all"
                  ? "Riwayat kehadiran Anda akan tampil di sini."
                  : `Tidak ada kehadiran pada ${HISTORY_RANGES[range].label.toLowerCase()}.`}
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {history.items.map((record) => (
                <li key={record.id}>
                  <HistoryRow record={record} />
                </li>
              ))}
            </ul>
          )}

          {range === "all" ? (
            history.totalPages > 1 ? (
              <nav
                aria-label="Halaman riwayat"
                className="mt-4 flex items-center justify-between gap-3"
              >
                <PagerLink
                  href={riwayatHref({
                    range: "all",
                    status: statusFilter,
                    month: monthFilter,
                    page: history.page - 1,
                  })}
                  disabled={history.page <= 1}
                  label="Sebelumnya"
                />
                <p className="text-xs font-medium text-muted-foreground">
                  Halaman {history.page} dari {history.totalPages}
                </p>
                <PagerLink
                  href={riwayatHref({
                    range: "all",
                    status: statusFilter,
                    month: monthFilter,
                    page: history.page + 1,
                  })}
                  disabled={history.page >= history.totalPages}
                  label="Berikutnya"
                />
              </nav>
            ) : null
          ) : (
            <Link
              href={riwayatHref({ range: "all" })}
              className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-2xl text-[17px] font-bold text-primary transition-colors hover:bg-surface-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Lihat Semua Riwayat
              <HrisIcon name="arrow-right" className="size-5" />
            </Link>
          )}
        </section>
      ) : null}

      {tab === "rekap" ? (
        <section
          aria-labelledby="rekap-title"
          className="hris-card rounded-[26px] p-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl hris-surface-primary text-primary"
            >
              <HrisIcon name="bar-chart" className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="rekap-title"
                className="text-[22px] leading-tight font-extrabold tracking-tight text-foreground"
              >
                Rekap Bulan Ini
              </h2>
              <p className="mt-1 text-[15px] text-muted-foreground">
                Ringkasan kehadiran Anda bulan berjalan.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Hadir" value={monthSummary.present} tone="success" />
            <SummaryTile label="Selesai" value={monthSummary.completed} tone="info" />
            <SummaryTile label="Belum Lengkap" value={monthSummary.incomplete} tone="warning" />
            <SummaryTile label="Ditolak" value={monthSummary.rejected} tone="danger" />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
            <p className="text-sm text-muted-foreground">Total catatan</p>
            <p className="text-sm font-bold text-foreground">{monthSummary.total}</p>
          </div>
        </section>
      ) : null}

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
              <div className="hris-card divide-y divide-border">
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
            <p className="rounded-2xl hris-surface-success px-4 py-3 text-sm text-success">
              Anda sudah menyelesaikan presensi hari ini.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Who the page is about: photo, name, "ID: <employee number>" and the job
 * title. Pulled up over the band's wave (`-mt-*`) like the reference layout.
 */
function IdentityCard({
  name,
  employeeNumber,
  position,
  photoUrl,
}: {
  name: string;
  employeeNumber: string | null;
  position: string | null;
  photoUrl: string | null;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?";
  return (
    <section
      aria-label="Identitas karyawan"
      className="hris-card relative z-10 -mt-14 flex items-center gap-3 rounded-[26px] p-4 shadow-[0_18px_40px_-20px_rgb(11_92_197/0.45)] sm:gap-4 lg:-mt-12 lg:p-5"
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          className="size-[72px] shrink-0 rounded-full object-cover ring-4 ring-primary/15 sm:size-[88px] lg:size-24"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-[72px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3B8BFF] to-[#1D5FE6] text-2xl font-bold text-white ring-4 ring-primary/15 sm:size-[88px] sm:text-3xl lg:size-24"
        >
          {initials}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="line-clamp-2 text-[20px] leading-tight font-extrabold tracking-tight text-foreground sm:text-[22px] lg:text-2xl">
          {name}
        </h2>
        {employeeNumber ? (
          <p className="mt-1.5 inline-flex max-w-full rounded-full bg-surface-primary px-3 py-1 text-[14px] font-semibold whitespace-nowrap text-accent-foreground">
            ID: {employeeNumber}
          </p>
        ) : null}
      </div>
      {position ? (
        <p className="hidden max-w-[38%] shrink-0 items-center gap-1.5 rounded-2xl border border-primary/20 bg-surface-primary/60 px-3 py-2 text-[14px] font-semibold text-accent-foreground min-[380px]:flex sm:text-[15px]">
          <HrisIcon name="briefcase" className="size-5 shrink-0 text-primary" />
          <span className="truncate">{position}</span>
        </p>
      ) : null}
    </section>
  );
}

function SegmentTab({
  href,
  icon,
  label,
  active,
  className,
}: {
  href: string;
  icon: HrisIconName;
  label: string;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        "flex min-h-[60px] items-center justify-center gap-2.5 rounded-full text-[19px] font-bold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "bg-gradient-to-r from-[#0B5CC5] to-[#0A3F8F] text-white shadow-[0_12px_24px_-12px_rgb(11_92_197/0.9)]"
          : "border border-border bg-card text-foreground/80 shadow-sm hover:bg-muted",
        className
      )}
    >
      <HrisIcon name={icon} className="size-7" />
      {label}
    </Link>
  );
}

/** One day of attendance: date chip, Masuk / Pulang times and the status. */
function HistoryRow({ record }: { record: AttendanceRow }) {
  const weekday = new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    timeZone: "UTC",
  }).format(record.attendanceDate);
  const dayMonth = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(record.attendanceDate);
  const fullDate = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(record.attendanceDate);
  const label = STATUS_LABELS[record.status];

  return (
    <Link
      href={`/attendance/${record.id}`}
      aria-label={`${fullDate}: masuk ${formatTime(record.checkInAt, record.workLocationTimezone)}, pulang ${formatTime(record.checkOutAt, record.workLocationTimezone)}, ${label}`}
      className="flex items-center gap-2 rounded-2xl border border-[var(--card-border-level2)] bg-card p-2 shadow-[0_6px_16px_-10px_rgb(30_64_175/0.35)] transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:gap-4 sm:p-3"
    >
      <span className="flex w-[62px] shrink-0 flex-col items-center justify-center rounded-xl bg-[#EEF3FB] py-2 text-center sm:w-[74px] dark:bg-muted">
        <span className="text-[15px] leading-tight font-bold text-foreground sm:text-[17px]">{weekday}</span>
        <span className="text-[13px] leading-tight font-bold text-accent-foreground sm:text-[15px]">
          {dayMonth}
        </span>
      </span>
      <span className="grid min-w-0 flex-1 grid-cols-2 items-center gap-1">
        <TimeCell
          icon="check-in"
          label="Masuk"
          value={formatTime(record.checkInAt, record.workLocationTimezone)}
          tone="in"
        />
        <TimeCell
          icon="check-out"
          label="Pulang"
          value={formatTime(record.checkOutAt, record.workLocationTimezone)}
          tone="out"
        />
      </span>
      <StatusBadge
        tone={statusTone(record.status)}
        icon={<HrisIcon name={STATUS_ICONS[record.status]} className="size-4" />}
        className="shrink-0 px-2.5 py-1 text-[13px] sm:px-3 sm:py-1.5 sm:text-[15px]"
      >
        {label}
      </StatusBadge>
    </Link>
  );
}

function TimeCell({
  icon,
  label,
  value,
  tone,
}: {
  icon: HrisIconName;
  label: string;
  value: string;
  tone: "in" | "out";
}) {
  return (
    <span className="flex min-w-0 items-center gap-1 sm:gap-1.5">
      <HrisIcon
        name={icon}
        className={cn(
          "size-6 shrink-0 sm:size-7",
          tone === "in" ? "text-[#16A34A]" : "text-[#EF4444]"
        )}
      />
      <span className="min-w-0 leading-tight">
        <span className="block text-[12px] text-muted-foreground sm:text-[13px]">{label}</span>
        <span className="block text-[15px] font-extrabold text-foreground tabular-nums sm:text-[17px]">
          {value}
        </span>
      </span>
    </span>
  );
}

function PagerLink({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground/60"
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex min-h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
    >
      {label}
    </Link>
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
        className="flex size-10 shrink-0 items-center justify-center rounded-2xl hris-surface-primary text-primary"
      >
        <HrisIcon name={icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-sm font-semibold text-foreground">{value ?? "—"}</p>
        </div>
        {meta ? <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p> : null}
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
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
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
    success: "hris-surface-success text-success",
    info: "hris-surface-info text-info",
    warning: "hris-surface-warning text-warning",
    danger: "hris-surface-danger text-danger",
  }[tone];
  return (
    <div className="rounded-2xl border border-[var(--card-border-level2)] bg-card p-4 shadow-sm">
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
          toneClass
        )}
      >
        {label}
      </span>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
    </div>
  );
}
