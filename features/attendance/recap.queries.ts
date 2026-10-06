import "server-only";

import { and, asc, eq, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { employees, workLocations } from "@/db/schema";
import {
  computeAttendanceRate,
  LATE_CHECK_IN_LOCAL_CUTOFF,
  SICK_LEAVE_TYPE_CODE_PATTERN,
} from "./recap";
import type {
  RecapFilterInput,
  RecapSortDirection,
  RecapSortField,
} from "./recap.schemas";

/**
 * Attendance Recap data access — server-only, READ-ONLY reporting layer.
 *
 * Security contract (mirrors features/attendance/queries.ts):
 * - Every query is scoped to ONE organization resolved from the
 *   authenticated session; a browser-supplied organization id is never
 *   accepted (the export route rejects the parameter outright).
 * - The caller (page/route) is responsible for authentication and the
 *   `attendance.manage` authorization check; this module never re-decides
 *   authorization, it only enforces scoping.
 * - No writes of any kind.
 *
 * Performance contract: buckets, per-employee aggregates and the KPI are all
 * computed by SQL aggregation over a day-expanded CTE (working days only),
 * then paginated in SQL. Raw attendance/leave rows are never transferred to
 * the application for the organization-wide table.
 *
 * Business rules live in `features/attendance/recap.ts` (pure); the SQL below
 * implements the SAME rules and imports the shared constants so the two
 * cannot drift (pinned by tests/attendance/recap.test.ts):
 * - Working day = Mon–Fri, clipped per employee by [hire_date,
 *   LEAST(termination_date, resignation_date)] (both bounds inclusive).
 * - Bucket precedence: accepted attendance (present|completed) > sick
 *   leave > leave > approved permission > absent.
 * - Late = accepted check-in after 08:00 local work-location time (the
 *   attendance engine itself has no schedule; this is a recap-layer metric).
 */

/* ------------------------------------------------------------------ */
/* Public row types                                                    */
/* ------------------------------------------------------------------ */

export interface RecapEmployeeRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  department: string | null;
  workLocationName: string | null;
  managerName: string | null;
  employmentType: string | null;
  employmentStatus: string;
  workingDays: number;
  present: number;
  late: number;
  leave: number;
  sick: number;
  permission: number;
  absent: number;
  attendanceRate: number | null;
}

export interface RecapKpi {
  totalEmployees: number;
  workingDays: number;
  attendanceRate: number | null;
  present: number;
  late: number;
  absent: number;
  leave: number;
  sick: number;
  permission: number;
}

export interface PaginatedRecap {
  kpi: RecapKpi;
  rows: RecapEmployeeRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Filter set applied inside SQL (period bounds always present). */
export type RecapScopeFilters = Pick<
  RecapFilterInput,
  | "department"
  | "employmentStatus"
  | "employmentType"
  | "managerId"
  | "q"
  | "workLocationId"
>;

export interface RecapPeriod {
  startDate: string;
  endDate: string;
}

export interface RecapFilterOptions {
  departments: string[];
  employmentTypes: string[];
  workLocations: { id: string; name: string }[];
  managers: { id: string; name: string }[];
  /** Representative org timezone used to derive the default period. */
  timeZone: string | null;
}

/* ------------------------------------------------------------------ */
/* Raw SQL row shapes (type aliases: db.execute requires
   Record<string, unknown> constraints, which interfaces do not satisfy) */
/* ------------------------------------------------------------------ */

type RecapEmployeeRowRaw = {
  employee_id: string;
  employee_number: string;
  employee_name: string;
  department: string | null;
  work_location_name: string | null;
  manager_name: string | null;
  employment_type: string | null;
  employment_status: string;
  working_days: number;
  present: number;
  late: number;
  leave_days: number;
  sick_days: number;
  permission_days: number;
  absent: number;
  attendance_rate: string | null;
  total_employees: number;
};

type RecapKpiRaw = {
  total_employees: number;
  working_days: number;
  present: number;
  late: number;
  leave_days: number;
  sick_days: number;
  permission_days: number;
  absent: number;
};

type RecapDetailDayRaw = {
  day: string;
  bucket: string;
  is_late: boolean | null;
  attendance_id: string | null;
  record_status: string | null;
  check_in_at: Date | null;
  check_out_at: Date | null;
  work_location_name: string | null;
  work_location_timezone: string | null;
  check_in_location_status: string | null;
  check_in_verification_status: string | null;
  check_in_distance_meters: string | number | null;
};

/* ------------------------------------------------------------------ */
/* SQL construction                                                    */
/* ------------------------------------------------------------------ */

/**
 * Whitelisted sort columns — user input only ever picks a key from this
 * map, so the ORDER BY clause can never be injected.
 */
const SORT_COLUMNS: Record<RecapSortField, SQL> = {
  employeeNumber: sql`s.employee_number`,
  employeeName: sql`(s.first_name || ' ' || s.last_name)`,
  department: sql`s.department`,
  workLocation: sql`wl.name`,
  manager: sql`(m.first_name || ' ' || m.last_name)`,
  workingDays: sql`COALESCE(a.working_days, 0)`,
  present: sql`COALESCE(a.present, 0)`,
  late: sql`COALESCE(a.late, 0)`,
  leave: sql`COALESCE(a.leave_days, 0)`,
  sick: sql`COALESCE(a.sick_days, 0)`,
  permission: sql`COALESCE(a.permission_days, 0)`,
  absent: sql`COALESCE(a.absent, 0)`,
  attendanceRate: sql`CASE WHEN COALESCE(a.working_days, 0) > 0
      THEN COALESCE(a.present, 0)::numeric / a.working_days
      ELSE NULL END`,
};

function scopedEmployeesConditions(
  organizationId: string,
  period: RecapPeriod,
  filters: RecapScopeFilters,
  employeeId?: string
): SQL[] {
  const conditions: SQL[] = [
    sql`e.organization_id = ${organizationId}::uuid`,
    // Employees whose employment window cannot overlap the period have no
    // expected working days and never enter the recap scope.
    sql`(e.hire_date IS NULL OR e.hire_date <= ${period.endDate}::date)`,
    sql`(LEAST(e.termination_date, e.resignation_date) IS NULL
       OR LEAST(e.termination_date, e.resignation_date) >= ${period.startDate}::date)`,
  ];
  if (employeeId) {
    conditions.push(sql`e.id = ${employeeId}::uuid`);
  }
  if (filters.department) {
    conditions.push(sql`e.department = ${filters.department}`);
  }
  if (filters.workLocationId) {
    conditions.push(sql`e.work_location_id = ${filters.workLocationId}::uuid`);
  }
  if (filters.managerId) {
    conditions.push(sql`e.manager_id = ${filters.managerId}::uuid`);
  }
  if (filters.employmentType) {
    conditions.push(sql`e.employment_type = ${filters.employmentType}`);
  }
  if (filters.employmentStatus) {
    conditions.push(sql`e.employment_status = ${filters.employmentStatus}`);
  }
  const search = filters.q?.trim();
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(sql`(e.employee_number ILIKE ${pattern}
      OR e.first_name ILIKE ${pattern}
      OR e.last_name ILIKE ${pattern}
      OR e.email ILIKE ${pattern})`);
  }
  return conditions;
}

/**
 * The shared recap CTE chain. One statement-level WITH clause containing:
 *   scoped → calendar → leave_days → day_facts → bucketed → agg
 * The classification lives ONLY here (SQL) and in recap.ts (pure tests) —
 * there is no third implementation.
 */
function recapCte(
  organizationId: string,
  period: RecapPeriod,
  scope: RecapScopeFilters,
  employeeId?: string
): SQL {
  const scopedWhere = sql.join(
    scopedEmployeesConditions(organizationId, period, scope, employeeId),
    sql` AND `
  );
  return sql`
    WITH scoped AS (
      SELECT
        e.id AS employee_id,
        e.employee_number,
        e.first_name,
        e.last_name,
        e.department,
        e.work_location_id,
        e.manager_id,
        e.employment_type,
        e.employment_status,
        e.hire_date,
        LEAST(e.termination_date, e.resignation_date) AS employment_end_date
      FROM employees e
      WHERE ${scopedWhere}
    ),
    calendar AS (
      -- One row per EXPECTED working day (Mon-Fri, inside the employment
      -- window, both bounds inclusive).
      SELECT s.employee_id, d::date AS day
      FROM scoped s
      CROSS JOIN generate_series(
        ${period.startDate}::date,
        ${period.endDate}::date,
        interval '1 day'
      ) AS d
      WHERE EXTRACT(ISODOW FROM d) < 6
        AND (s.hire_date IS NULL OR d::date >= s.hire_date)
        AND (s.employment_end_date IS NULL OR d::date <= s.employment_end_date)
    ),
    leave_days AS (
      -- Approved leave expanded onto working days (one row per
      -- employee/day; a day covered by several approved leaves counts once
      -- and classifies as sick when ANY covering type is a sick type).
      SELECT lr.employee_id, d::date AS day,
        bool_or(COALESCE(lt.code, '') ~* ${SICK_LEAVE_TYPE_CODE_PATTERN}) AS is_sick
      FROM leave_requests lr
      INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
      CROSS JOIN generate_series(
        GREATEST(lr.start_date, ${period.startDate}::date),
        LEAST(lr.end_date, ${period.endDate}::date),
        interval '1 day'
      ) AS d
      WHERE lr.organization_id = ${organizationId}::uuid
        AND lr.status = 'approved'
        AND lr.start_date <= ${period.endDate}::date
        AND lr.end_date >= ${period.startDate}::date
        AND EXTRACT(ISODOW FROM d) < 6
      GROUP BY lr.employee_id, d
    ),
    day_facts AS (
      SELECT
        c.employee_id,
        c.day,
        ar.id AS attendance_id,
        ar.check_in_at,
        ar.check_out_at,
        ar.status AS record_status,
        ar.check_in_location_status,
        ar.check_in_verification_status,
        ar.check_in_distance_meters,
        COALESCE(wl.timezone, 'UTC') AS check_in_timezone,
        wl.name AS work_location_name,
        (ld.day IS NOT NULL) AS has_leave,
        COALESCE(ld.is_sick, false) AS is_sick_leave,
        EXISTS (
          SELECT 1 FROM permission_requests pr
          WHERE pr.employee_id = c.employee_id
            AND pr.status = 'approved'
            AND (pr.start_at AT TIME ZONE 'UTC')::date <= c.day
            AND (pr.end_at AT TIME ZONE 'UTC')::date >= c.day
        ) AS has_permission
      FROM calendar c
      LEFT JOIN attendance_records ar
        ON ar.employee_id = c.employee_id
       AND ar.attendance_date = c.day
       AND ar.status IN ('present', 'completed')
      LEFT JOIN leave_days ld
        ON ld.employee_id = c.employee_id
       AND ld.day = c.day
      LEFT JOIN work_locations wl ON wl.id = ar.work_location_id
    ),
    bucketed AS (
      SELECT df.*,
        CASE
          WHEN df.attendance_id IS NOT NULL THEN 'present'
          WHEN df.has_leave AND df.is_sick_leave THEN 'sick'
          WHEN df.has_leave THEN 'leave'
          WHEN df.has_permission THEN 'permission'
          ELSE 'absent'
        END AS bucket,
        (df.attendance_id IS NOT NULL
          AND df.check_in_at IS NOT NULL
          AND (df.check_in_at AT TIME ZONE df.check_in_timezone)::time
              > ${LATE_CHECK_IN_LOCAL_CUTOFF}::time) AS is_late
      FROM day_facts df
    ),
    agg AS (
      SELECT b.employee_id,
        count(*)::int AS working_days,
        (count(*) FILTER (WHERE b.bucket = 'present'))::int AS present,
        (count(*) FILTER (WHERE b.bucket = 'present' AND b.is_late))::int AS late,
        (count(*) FILTER (WHERE b.bucket = 'leave'))::int AS leave_days,
        (count(*) FILTER (WHERE b.bucket = 'sick'))::int AS sick_days,
        (count(*) FILTER (WHERE b.bucket = 'permission'))::int AS permission_days,
        (count(*) FILTER (WHERE b.bucket = 'absent'))::int AS absent
      FROM bucketed b
      GROUP BY b.employee_id
    )
  `;
}

function toRecapEmployeeRow(raw: RecapEmployeeRowRaw): RecapEmployeeRow {
  return {
    employeeId: raw.employee_id,
    employeeNumber: raw.employee_number,
    employeeName: raw.employee_name,
    department: raw.department,
    workLocationName: raw.work_location_name,
    managerName: raw.manager_name,
    employmentType: raw.employment_type,
    employmentStatus: raw.employment_status,
    workingDays: raw.working_days,
    present: raw.present,
    late: raw.late,
    leave: raw.leave_days,
    sick: raw.sick_days,
    permission: raw.permission_days,
    absent: raw.absent,
    attendanceRate:
      raw.attendance_rate === null ? null : Number(raw.attendance_rate),
  };
}

function toRecapKpi(raw: RecapKpiRaw): RecapKpi {
  return {
    totalEmployees: raw.total_employees,
    workingDays: raw.working_days,
    attendanceRate: computeAttendanceRate(raw.present, raw.working_days),
    present: raw.present,
    late: raw.late,
    absent: raw.absent,
    leave: raw.leave_days,
    sick: raw.sick_days,
    permission: raw.permission_days,
  };
}

const RECAP_ROW_SELECT = sql`
  SELECT
    s.employee_id,
    s.employee_number,
    (s.first_name || ' ' || s.last_name) AS employee_name,
    s.department,
    s.employment_type,
    s.employment_status,
    wl.name AS work_location_name,
    (m.first_name || ' ' || m.last_name) AS manager_name,
    COALESCE(a.working_days, 0)::int AS working_days,
    COALESCE(a.present, 0)::int AS present,
    COALESCE(a.late, 0)::int AS late,
    COALESCE(a.leave_days, 0)::int AS leave_days,
    COALESCE(a.sick_days, 0)::int AS sick_days,
    COALESCE(a.permission_days, 0)::int AS permission_days,
    COALESCE(a.absent, 0)::int AS absent,
    CASE WHEN COALESCE(a.working_days, 0) > 0
      THEN round(COALESCE(a.present, 0)::numeric * 100 / a.working_days, 2)
      ELSE NULL END AS attendance_rate,
    (count(*) OVER ())::int AS total_employees
  FROM scoped s
  LEFT JOIN agg a ON a.employee_id = s.employee_id
  LEFT JOIN work_locations wl ON wl.id = s.work_location_id
  LEFT JOIN employees m ON m.id = s.manager_id
`;

/* ------------------------------------------------------------------ */
/* Organization recap (page + export)                                  */
/* ------------------------------------------------------------------ */

export interface RecapQuery {
  period: RecapPeriod;
  scope: RecapScopeFilters;
  sort?: RecapSortField;
  dir?: RecapSortDirection;
  page?: number;
  pageSize?: number;
}

/**
 * Organization-wide attendance recap: KPI + paginated employee rows.
 * Filtering, aggregation, sorting and pagination all happen in SQL.
 */
export async function getOrganizationAttendanceRecap(
  organizationId: string,
  query: RecapQuery
): Promise<PaginatedRecap> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.max(1, query.pageSize ?? 20);
  const sortColumn = SORT_COLUMNS[query.sort ?? "attendanceRate"];
  const direction = (query.dir ?? "asc") === "desc" ? sql`DESC` : sql`ASC`;

  const cte = recapCte(organizationId, query.period, query.scope);
  const rowsStatement = sql`${cte}
    ${RECAP_ROW_SELECT}
    ORDER BY ${sortColumn} ${direction} NULLS LAST,
      (s.first_name || ' ' || s.last_name) ASC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;
  const kpiStatement = sql`${cte}
    SELECT
      (SELECT count(*)::int FROM scoped) AS total_employees,
      COALESCE(sum(a.working_days), 0)::int AS working_days,
      COALESCE(sum(a.present), 0)::int AS present,
      COALESCE(sum(a.late), 0)::int AS late,
      COALESCE(sum(a.leave_days), 0)::int AS leave_days,
      COALESCE(sum(a.sick_days), 0)::int AS sick_days,
      COALESCE(sum(a.permission_days), 0)::int AS permission_days,
      COALESCE(sum(a.absent), 0)::int AS absent
    FROM agg a
  `;

  const [rowsResult, kpiResult] = await Promise.all([
    db.execute<RecapEmployeeRowRaw>(rowsStatement),
    db.execute<RecapKpiRaw>(kpiStatement),
  ]);

  const total = rowsResult.rows[0]?.total_employees ?? 0;
  const kpiRaw =
    kpiResult.rows[0] ??
    ({
      total_employees: 0,
      working_days: 0,
      present: 0,
      late: 0,
      leave_days: 0,
      sick_days: 0,
      permission_days: 0,
      absent: 0,
    } satisfies RecapKpiRaw);

  return {
    kpi: toRecapKpi(kpiRaw),
    rows: rowsResult.rows.map(toRecapEmployeeRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Every recap row + the KPI for the active filters (Excel export). Same SQL
 * as the page, without pagination — the row count is organization headcount.
 */
export async function getOrganizationAttendanceRecapExport(
  organizationId: string,
  query: Pick<RecapQuery, "period" | "scope">
): Promise<{ kpi: RecapKpi; rows: RecapEmployeeRow[] }> {
  const cte = recapCte(organizationId, query.period, query.scope);
  const rowsStatement = sql`${cte}
    ${RECAP_ROW_SELECT}
    ORDER BY (s.first_name || ' ' || s.last_name) ASC
  `;
  const kpiStatement = sql`${cte}
    SELECT
      (SELECT count(*)::int FROM scoped) AS total_employees,
      COALESCE(sum(a.working_days), 0)::int AS working_days,
      COALESCE(sum(a.present), 0)::int AS present,
      COALESCE(sum(a.late), 0)::int AS late,
      COALESCE(sum(a.leave_days), 0)::int AS leave_days,
      COALESCE(sum(a.sick_days), 0)::int AS sick_days,
      COALESCE(sum(a.permission_days), 0)::int AS permission_days,
      COALESCE(sum(a.absent), 0)::int AS absent
    FROM agg a
  `;

  const [rowsResult, kpiResult] = await Promise.all([
    db.execute<RecapEmployeeRowRaw>(rowsStatement),
    db.execute<RecapKpiRaw>(kpiStatement),
  ]);

  const kpiRaw =
    kpiResult.rows[0] ??
    ({
      total_employees: 0,
      working_days: 0,
      present: 0,
      late: 0,
      leave_days: 0,
      sick_days: 0,
      permission_days: 0,
      absent: 0,
    } satisfies RecapKpiRaw);

  return {
    kpi: toRecapKpi(kpiRaw),
    rows: rowsResult.rows.map(toRecapEmployeeRow),
  };
}

/* ------------------------------------------------------------------ */
/* Filter options + representative timezone                            */
/* ------------------------------------------------------------------ */

const managerEmployee = alias(employees, "manager_employee");

/** Dropdown options for the recap filter bar (all org-scoped). */
export async function getAttendanceRecapFilterOptions(
  organizationId: string
): Promise<RecapFilterOptions> {
  const [departments, employmentTypes, locations, managers, timeZoneRows] =
    await Promise.all([
      db
        .selectDistinct({ department: employees.department })
        .from(employees)
        .where(
          and(
            eq(employees.organizationId, organizationId),
            isNotNull(employees.department),
            ne(employees.department, "")
          )
        )
        .orderBy(asc(employees.department)),
      db
        .selectDistinct({ employmentType: employees.employmentType })
        .from(employees)
        .where(
          and(
            eq(employees.organizationId, organizationId),
            isNotNull(employees.employmentType),
            ne(employees.employmentType, "")
          )
        )
        .orderBy(asc(employees.employmentType)),
      db
        .select({ id: workLocations.id, name: workLocations.name })
        .from(workLocations)
        .where(eq(workLocations.organizationId, organizationId))
        .orderBy(asc(workLocations.name)),
      db
        .selectDistinct({
          id: managerEmployee.id,
          name: sql<string>`${managerEmployee.firstName} || ' ' || ${managerEmployee.lastName}`,
        })
        .from(employees)
        .innerJoin(
          managerEmployee,
          eq(managerEmployee.id, employees.managerId)
        )
        .where(eq(employees.organizationId, organizationId))
        .orderBy(asc(sql`${managerEmployee.firstName} || ' ' || ${managerEmployee.lastName}`)),
      db
        .select({ timezone: workLocations.timezone })
        .from(workLocations)
        .where(
          and(
            eq(workLocations.organizationId, organizationId),
            eq(workLocations.status, "active"),
            isNotNull(workLocations.timezone),
            ne(workLocations.timezone, "")
          )
        )
        .orderBy(asc(workLocations.name))
        .limit(1),
    ]);

  return {
    departments: departments
      .map((row) => row.department)
      .filter((value): value is string => Boolean(value)),
    employmentTypes: employmentTypes
      .map((row) => row.employmentType)
      .filter((value): value is string => Boolean(value)),
    workLocations: locations,
    managers,
    timeZone: timeZoneRows[0]?.timezone ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Employee period detail (drill-down)                                 */
/* ------------------------------------------------------------------ */

export interface RecapEmployeeInfo {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  employmentType: string | null;
  employmentStatus: string;
  workLocationName: string | null;
  managerName: string | null;
  hireDate: string | null;
  employmentEndDate: string | null;
}

export interface RecapDetailDay {
  day: string;
  bucket: "present" | "sick" | "leave" | "permission" | "absent" | "extra";
  late: boolean;
  attendanceId: string | null;
  recordStatus: string | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workLocationName: string | null;
  workLocationTimezone: string | null;
  checkInLocationStatus: string | null;
  checkInVerificationStatus: string | null;
  checkInDistanceMeters: number | null;
}

export interface RecapEmployeeDetail {
  employee: RecapEmployeeInfo;
  summary: {
    workingDays: number;
    present: number;
    late: number;
    leave: number;
    sick: number;
    permission: number;
    absent: number;
    attendanceRate: number | null;
  };
  days: RecapDetailDay[];
}

const RECAP_DETAIL_EMPLOYEE_COLUMNS = {
  employeeId: employees.id,
  employeeNumber: employees.employeeNumber,
  firstName: employees.firstName,
  lastName: employees.lastName,
  department: employees.department,
  position: employees.position,
  employmentType: employees.employmentType,
  employmentStatus: employees.employmentStatus,
  workLocationName: workLocations.name,
  hireDate: sql<string | null>`to_char(${employees.hireDate}, 'YYYY-MM-DD')`,
  employmentEndDate: sql<string | null>`to_char(LEAST(${employees.terminationDate}, ${employees.resignationDate}), 'YYYY-MM-DD')`,
} as const;

const detailManager = alias(employees, "detail_manager");

function toRecapDetailDay(raw: RecapDetailDayRaw): RecapDetailDay {
  const bucket = (
    raw.bucket === "present" ||
    raw.bucket === "sick" ||
    raw.bucket === "leave" ||
    raw.bucket === "permission" ||
    raw.bucket === "absent"
      ? raw.bucket
      : "extra"
  ) as RecapDetailDay["bucket"];
  const distance =
    raw.check_in_distance_meters === null
      ? null
      : Number(raw.check_in_distance_meters);
  return {
    day: raw.day,
    bucket,
    late: raw.is_late === true,
    attendanceId: raw.attendance_id,
    recordStatus: raw.record_status,
    checkInAt: raw.check_in_at,
    checkOutAt: raw.check_out_at,
    workLocationName: raw.work_location_name,
    workLocationTimezone: raw.work_location_timezone,
    checkInLocationStatus: raw.check_in_location_status,
    checkInVerificationStatus: raw.check_in_verification_status,
    checkInDistanceMeters: distance,
  };
}

/**
 * One employee's recap for a period: identity, the SAME summary the table
 * shows, and the classified daily rows (including accepted attendance that
 * falls outside expected working days). Returns `null` when the employee id
 * does not belong to `organizationId` (callers render forbidden so
 * cross-org existence is never revealed — mirrors getAttendanceDetail).
 */
export async function getEmployeeAttendanceRecapDetail(
  organizationId: string,
  employeeId: string,
  period: RecapPeriod
): Promise<RecapEmployeeDetail | null> {
  const employeeRows = await db
    .select({
      ...RECAP_DETAIL_EMPLOYEE_COLUMNS,
      managerName: sql<
        string | null
      >`(${detailManager.firstName} || ' ' || ${detailManager.lastName})`,
    })
    .from(employees)
    .leftJoin(workLocations, eq(workLocations.id, employees.workLocationId))
    .leftJoin(detailManager, eq(detailManager.id, employees.managerId))
    .where(
      and(
        eq(employees.id, employeeId),
        eq(employees.organizationId, organizationId)
      )
    )
    .limit(1);

  const employeeRow = employeeRows[0];
  if (!employeeRow) return null;

  const cte = recapCte(organizationId, period, {}, employeeId);
  const daysStatement = sql`${cte}
    SELECT
      to_char(b.day, 'YYYY-MM-DD') AS day,
      b.bucket,
      b.is_late,
      b.attendance_id,
      b.record_status,
      b.check_in_at,
      b.check_out_at,
      b.work_location_name,
      b.check_in_timezone AS work_location_timezone,
      b.check_in_location_status,
      b.check_in_verification_status,
      b.check_in_distance_meters
    FROM bucketed b
    ORDER BY b.day ASC
  `;
  const extraDaysStatement = sql`${cte}
    SELECT
      to_char(ar.attendance_date, 'YYYY-MM-DD') AS day,
      'extra' AS bucket,
      (ar.check_in_at AT TIME ZONE COALESCE(wl.timezone, 'UTC'))::time
        > ${LATE_CHECK_IN_LOCAL_CUTOFF}::time AS is_late,
      ar.id AS attendance_id,
      ar.status AS record_status,
      ar.check_in_at,
      ar.check_out_at,
      wl.name AS work_location_name,
      COALESCE(wl.timezone, 'UTC') AS work_location_timezone,
      ar.check_in_location_status,
      ar.check_in_verification_status,
      ar.check_in_distance_meters
    FROM attendance_records ar
    LEFT JOIN work_locations wl ON wl.id = ar.work_location_id
    WHERE ar.organization_id = ${organizationId}::uuid
      AND ar.employee_id = ${employeeId}::uuid
      AND ar.attendance_date >= ${period.startDate}::date
      AND ar.attendance_date <= ${period.endDate}::date
      AND ar.status IN ('present', 'completed')
      AND NOT EXISTS (
        SELECT 1 FROM calendar c
        WHERE c.employee_id = ar.employee_id AND c.day = ar.attendance_date
      )
    ORDER BY ar.attendance_date ASC
  `;
  const summaryStatement = sql`${cte}
    SELECT
      COALESCE(a.working_days, 0)::int AS working_days,
      COALESCE(a.present, 0)::int AS present,
      COALESCE(a.late, 0)::int AS late,
      COALESCE(a.leave_days, 0)::int AS leave_days,
      COALESCE(a.sick_days, 0)::int AS sick_days,
      COALESCE(a.permission_days, 0)::int AS permission_days,
      COALESCE(a.absent, 0)::int AS absent
    FROM scoped s
    LEFT JOIN agg a ON a.employee_id = s.employee_id
  `;

  const [daysResult, extraResult, summaryResult] = await Promise.all([
    db.execute<RecapDetailDayRaw>(daysStatement),
    db.execute<RecapDetailDayRaw>(extraDaysStatement),
    db.execute<{
      working_days: number;
      present: number;
      late: number;
      leave_days: number;
      sick_days: number;
      permission_days: number;
      absent: number;
    }>(summaryStatement),
  ]);

  const summaryRaw = summaryResult.rows[0];
  const days = [...daysResult.rows, ...extraResult.rows]
    .map(toRecapDetailDay)
    .sort((left, right) => left.day.localeCompare(right.day));

  const workingDays = summaryRaw?.working_days ?? 0;
  const present = summaryRaw?.present ?? 0;

  return {
    employee: {
      employeeId: employeeRow.employeeId,
      employeeNumber: employeeRow.employeeNumber,
      employeeName: `${employeeRow.firstName} ${employeeRow.lastName}`.trim(),
      department: employeeRow.department,
      position: employeeRow.position,
      employmentType: employeeRow.employmentType,
      employmentStatus: employeeRow.employmentStatus,
      workLocationName: employeeRow.workLocationName,
      managerName: employeeRow.managerName,
      hireDate: employeeRow.hireDate,
      employmentEndDate: employeeRow.employmentEndDate,
    },
    summary: {
      workingDays,
      present,
      late: summaryRaw?.late ?? 0,
      leave: summaryRaw?.leave_days ?? 0,
      sick: summaryRaw?.sick_days ?? 0,
      permission: summaryRaw?.permission_days ?? 0,
      absent: summaryRaw?.absent ?? 0,
      attendanceRate: computeAttendanceRate(present, workingDays),
    },
    days,
  };
}
