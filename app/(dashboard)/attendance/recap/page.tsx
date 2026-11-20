import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import { AttendanceRateBadge } from "@/features/attendance/recap-badges";
import { monthPeriodOf } from "@/features/attendance/recap";
import {
  getAttendanceRecapFilterOptions,
  getOrganizationAttendanceRecap,
  type RecapPeriod,
} from "@/features/attendance/recap.queries";
import {
  DEFAULT_RECAP_SORT,
  recapFilterSchema,
  RECAP_PAGE_SIZE,
  type RecapFilterInput,
  type RecapSortDirection,
  type RecapSortField,
} from "@/features/attendance/recap.schemas";

export const metadata: Metadata = {
  title: "Rekap absensi",
};

function readParam(
  value: string | string[] | undefined
): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

interface ResolvedRecapQuery {
  filters: RecapFilterInput;
  period: RecapPeriod;
  sort: RecapSortField;
  dir: RecapSortDirection;
  page: number;
  /** Validation message to surface when URL params were rejected. */
  error: string | null;
}

/**
 * Resolve the recap query from URL params. Missing period falls back to the
 * current month in the organization's representative timezone; invalid
 * params (bad dates, inverted period) fall back to the default period AND
 * surface an inline error so the user knows why.
 */
function resolveRecapQuery(
  params: Record<string, string | string[] | undefined>,
  timeZone: string | null
): ResolvedRecapQuery {
  const defaultPeriod = monthPeriodOf(new Date(), timeZone);
  const rawStartDate = readParam(params.startDate);
  const rawEndDate = readParam(params.endDate);
  const rawPage = readParam(params.page);
  const hasPeriod = Boolean(rawStartDate || rawEndDate);

  const parsed = recapFilterSchema.safeParse({
    startDate: rawStartDate ?? defaultPeriod.startDate,
    endDate: rawEndDate ?? defaultPeriod.endDate,
    department: readParam(params.department),
    workLocationId: readParam(params.workLocationId),
    managerId: readParam(params.managerId),
    employmentType: readParam(params.employmentType),
    employmentStatus: readParam(params.employmentStatus),
    q: readParam(params.q),
    sort: readParam(params.sort),
    dir: readParam(params.dir),
    page: rawPage,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      filters: {
        startDate: defaultPeriod.startDate,
        endDate: defaultPeriod.endDate,
      },
      period: defaultPeriod,
      sort: DEFAULT_RECAP_SORT.sort,
      dir: DEFAULT_RECAP_SORT.dir,
      page: 1,
      error:
        hasPeriod || issue?.path[0] === "startDate" || issue?.path[0] === "endDate"
          ? (issue?.message ?? "Filter tidak valid.")
          : null,
    };
  }

  return {
    filters: parsed.data,
    period: {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    },
    sort: parsed.data.sort ?? DEFAULT_RECAP_SORT.sort,
    dir: parsed.data.dir ?? DEFAULT_RECAP_SORT.dir,
    page: parsed.data.page ?? 1,
    error: null,
  };
}

/**
 * Attendance recap — one management page for the whole organization's
 * attendance performance in a period.
 *
 * Strictly org-scoped and requires `attendance.manage` (the capability that
 * already gates the attendance management/readiness pages) — EMPLOYEE users
 * are denied server-side.
 */
export default async function AttendanceRecapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const params = await searchParams;
  const options = await getAttendanceRecapFilterOptions(organizationId);
  const query = resolveRecapQuery(params, options.timeZone);
  const { filters, period, sort, dir, page } = query;

  const result = await getOrganizationAttendanceRecap(organizationId, {
    period,
    scope: filters,
    sort,
    dir,
    page,
    pageSize: RECAP_PAGE_SIZE,
  });
  const { kpi, rows, total, totalPages } = result;

  const filterSearchParams = (): URLSearchParams => {
    const search = new URLSearchParams();
    search.set("startDate", period.startDate);
    search.set("endDate", period.endDate);
    if (filters.department) search.set("department", filters.department);
    if (filters.workLocationId)
      search.set("workLocationId", filters.workLocationId);
    if (filters.managerId) search.set("managerId", filters.managerId);
    if (filters.employmentType)
      search.set("employmentType", filters.employmentType);
    if (filters.employmentStatus)
      search.set("employmentStatus", filters.employmentStatus);
    if (filters.q) search.set("q", filters.q);
    return search;
  };

  const buildQuery = (nextPage: number): string => {
    const search = filterSearchParams();
    search.set("sort", sort);
    search.set("dir", dir);
    search.set("page", String(nextPage));
    return `/attendance/recap?${search.toString()}`;
  };

  const sortHref = (field: RecapSortField): string => {
    const search = filterSearchParams();
    search.set("sort", field);
    search.set("dir", field === sort && dir === "asc" ? "desc" : "asc");
    search.set("page", "1");
    return `/attendance/recap?${search.toString()}`;
  };

  const exportQuery = filterSearchParams();

  const sortIndicator = (field: RecapSortField): string => {
    if (field !== sort) return "";
    return dir === "asc" ? " ↑" : " ↓";
  };

  const renderSortableHead = ({
    field,
    label,
    align,
  }: {
    field: RecapSortField;
    label: string;
    align?: "right";
  }) => (
    <TableHead key={field} className={align === "right" ? "text-right" : undefined}>
      <Link
        href={sortHref(field)}
        className="inline-flex items-center gap-1 hover:text-foreground"
        title={`Sort by ${label}`}
      >
        {label}
        <span aria-hidden="true">{sortIndicator(field)}</span>
      </Link>
    </TableHead>
  );

  const hasFilters = Boolean(
    filters.department ||
      filters.workLocationId ||
      filters.managerId ||
      filters.employmentType ||
      filters.employmentStatus ||
      filters.q
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Rekap Absensi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {total} karyawan · hari kerja adalah Senin–Jumat dalam masa kerja
            masing-masing karyawan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/attendance/management"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Kelola absensi
          </Link>
          <Link
            href={`/api/attendance/recap/export?${exportQuery.toString()}`}
            prefetch={false}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Export Excel
          </Link>
        </div>
      </div>

      {query.error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
        >
          {query.error}
        </div>
      ) : null}

      <form
        action="/attendance/recap"
        method="get"
        className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
      >
        <div className="space-y-2">
          <label htmlFor="recap-start-date" className="text-sm font-medium">
            Tanggal mulai
          </label>
          <input
            id="recap-start-date"
            name="startDate"
            type="date"
            defaultValue={period.startDate}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="recap-end-date" className="text-sm font-medium">
            Tanggal selesai
          </label>
          <input
            id="recap-end-date"
            name="endDate"
            type="date"
            defaultValue={period.endDate}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="recap-department" className="text-sm font-medium">
            Departemen
          </label>
          <select
            id="recap-department"
            name="department"
            defaultValue={filters.department ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">Semua departemen</option>
            {options.departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="recap-location" className="text-sm font-medium">
            Lokasi kerja
          </label>
          <select
            id="recap-location"
            name="workLocationId"
            defaultValue={filters.workLocationId ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">Semua lokasi</option>
            {options.workLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="recap-manager" className="text-sm font-medium">
            Atasan
          </label>
          <select
            id="recap-manager"
            name="managerId"
            defaultValue={filters.managerId ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">Semua atasan</option>
            {options.managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="recap-employment-type" className="text-sm font-medium">
            Jenis kepegawaian
          </label>
          <select
            id="recap-employment-type"
            name="employmentType"
            defaultValue={filters.employmentType ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">Semua jenis</option>
            {options.employmentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="recap-status" className="text-sm font-medium">
            Status karyawan
          </label>
          <select
            id="recap-status"
            name="employmentStatus"
            defaultValue={filters.employmentStatus ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="recap-search" className="text-sm font-medium">
            Cari
          </label>
          <input
            id="recap-search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Nama atau nomor karyawan"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-8">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Terapkan filter
          </button>
          {hasFilters || query.error ? (
            <Link
              href={`/attendance/recap?startDate=${period.startDate}&endDate=${period.endDate}`}
              className={buttonVariants({ variant: "ghost" })}
            >
              Bersihkan
            </Link>
          ) : null}
        </div>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="employees"
          tone="blue"
          label="Total Karyawan"
          value={kpi.totalEmployees}
        />
        <StatCard
          icon="trend-up"
          tone="primary"
          label="Tingkat Kehadiran"
          value={
            kpi.attendanceRate === null
              ? "—"
              : `${kpi.attendanceRate.toFixed(2)}%`
          }
          hint={`${kpi.present} / ${kpi.workingDays} days`}
        />
        <StatCard
          icon="check-in"
          tone="green"
          label="Hadir"
          value={kpi.present}
        />
        <StatCard icon="alert" tone="rose" label="Tidak hadir" value={kpi.absent} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="clock" tone="amber" label="Terlambat" value={kpi.late} />
        <StatCard icon="leave" tone="blue" label="Cuti" value={kpi.leave} />
        <StatCard icon="permission" tone="slate" label="Sakit" value={kpi.sick} />
        <StatCard
          icon="permission"
          tone="slate"
          label="Hak akses"
          value={kpi.permission}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Kinerja kehadiran
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Diurutkan dari tingkat kehadiran terendah — karyawan yang perlu perhatian tampil lebih dulu. Klik karyawan untuk melihat rincian harian.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Tidak ada data absensi"
          description="Tidak ada data absensi untuk periode yang dipilih."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  {renderSortableHead({ field: "employeeNumber", label: "No. Karyawan" })} 
                  {renderSortableHead({ field: "employeeName", label: "Nama Karyawan" })} 
                  {renderSortableHead({ field: "department", label: "Departemen" })} 
                  {renderSortableHead({ field: "workLocation", label: "Lokasi Kerja" })} 
                  {renderSortableHead({ field: "manager", label: "Atasan" })} 
                  {renderSortableHead({ field: "workingDays", label: "Hari Kerja", align: "right" })} 
                  {renderSortableHead({ field: "present", label: "Hadir", align: "right" })} 
                  {renderSortableHead({ field: "late", label: "Terlambat", align: "right" })} 
                  {renderSortableHead({ field: "leave", label: "Cuti", align: "right" })} 
                  {renderSortableHead({ field: "sick", label: "Sakit", align: "right" })} 
                  {renderSortableHead({ field: "permission", label: "Hak akses", align: "right" })} 
                  {renderSortableHead({ field: "absent", label: "Tidak hadir", align: "right" })} 
                  {renderSortableHead({ field: "attendanceRate", label: "Tingkat Kehadiran", align: "right" })} 
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.employeeId}>
                    <TableCell className="font-mono text-xs">
                      {row.employeeNumber}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.employeeName}
                    </TableCell>
                    <TableCell>{row.department ?? "—"}</TableCell>
                    <TableCell>{row.workLocationName ?? "—"}</TableCell>
                    <TableCell>{row.managerName ?? "—"}</TableCell>
                    <TableCell className="text-right">{row.workingDays}</TableCell>
                    <TableCell className="text-right">{row.present}</TableCell>
                    <TableCell className="text-right">{row.late}</TableCell>
                    <TableCell className="text-right">{row.leave}</TableCell>
                    <TableCell className="text-right">{row.sick}</TableCell>
                    <TableCell className="text-right">{row.permission}</TableCell>
                    <TableCell className="text-right">{row.absent}</TableCell>
                    <TableCell className="text-right">
                      <AttendanceRateBadge rate={row.attendanceRate} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/attendance/recap/${row.employeeId}?startDate=${period.startDate}&endDate=${period.endDate}`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        Lihat
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 ? (
            <nav
              aria-label="Halaman rekap absensi"
              className="flex items-center justify-between gap-3"
            >
              <p className="text-sm text-muted-foreground">
                Halaman {page} dari {totalPages} · {total} karyawan
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={buildQuery(page - 1)}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Sebelumnya
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    href={buildQuery(page + 1)}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Berikutnya
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
