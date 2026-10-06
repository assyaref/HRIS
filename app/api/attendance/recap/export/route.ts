import { getCurrentUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { hasPermission } from "@/lib/auth/rbac";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getOrganizationAttendanceRecapExport,
  getAttendanceRecapFilterOptions,
} from "@/features/attendance/recap.queries";
import { recapFilterSchema } from "@/features/attendance/recap.schemas";
import {
  buildAttendanceRecapWorkbook,
  type RecapExportEmployeeRow,
} from "@/features/attendance/excel/recap-export";

export const dynamic = "force-dynamic";

/**
 * Attendance recap Excel export endpoint.
 *
 * Mirrors the employee export route's security contract:
 * - The organization ALWAYS comes from the authenticated session; a
 *   client-supplied `organizationId`/`employeeId` parameter is rejected
 *   outright (400).
 * - RBAC: requires `attendance.manage` (the same capability that gates the
 *   recap page and the attendance management pages). An EMPLOYEE-role user
 *   receives 403, never a workbook.
 * - The workbook reflects the ACTIVE filters of the recap page (same
 *   parameter names, same validation schema) — period, department, work
 *   location, manager, employment type, employment status and search.
 */

const FORBIDDEN_QUERY_KEYS = ["organizationId", "employeeId"] as const;

const SECURITY_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function readParam(search: URLSearchParams, key: string): string | undefined {
  const value = search.get(key);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: SECURITY_HEADERS,
  });
}

function forbidden(): Response {
  return new Response("Forbidden", {
    status: 403,
    headers: SECURITY_HEADERS,
  });
}

function badRequest(message: string): Response {
  return new Response(message, {
    status: 400,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: SECURITY_HEADERS,
  });
}

/** Human-readable period label, e.g. "01 Oct 2026 - 31 Oct 2026". */
function formatPeriodLabel(startDate: string, endDate: string): string {
  const format = (value: string): string =>
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00.000Z`));
  return `${format(startDate)} - ${format(endDate)}`;
}

export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).searchParams;
  for (const key of FORBIDDEN_QUERY_KEYS) {
    if (search.has(key)) {
      return badRequest("Bad Request");
    }
  }

  const user = await getCurrentUser();
  if (!user) {
    return unauthorized();
  }
  if (!user.organizationId) {
    return notFound();
  }
  const organizationId = user.organizationId;

  if (!(await hasPermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE))) {
    return forbidden();
  }

  // The workbook always reflects the filters active on the recap page —
  // the same query-parameter names and the same validation schema. A
  // missing or invalid period is a client error, never a silent fallback.
  const parsed = recapFilterSchema.safeParse({
    startDate: readParam(search, "startDate"),
    endDate: readParam(search, "endDate"),
    department: readParam(search, "department"),
    workLocationId: readParam(search, "workLocationId"),
    managerId: readParam(search, "managerId"),
    employmentType: readParam(search, "employmentType"),
    employmentStatus: readParam(search, "employmentStatus"),
    q: readParam(search, "q"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return badRequest(issue?.message ?? "Invalid filters.");
  }
  const filters = parsed.data;

  const [exportData, options] = await Promise.all([
    getOrganizationAttendanceRecapExport(organizationId, {
      period: { startDate: filters.startDate, endDate: filters.endDate },
      scope: filters,
    }),
    getAttendanceRecapFilterOptions(organizationId),
  ]);

  const filterSummary: string[] = [];
  if (filters.department) filterSummary.push(`Department: ${filters.department}`);
  if (filters.workLocationId) {
    const location = options.workLocations.find(
      (option) => option.id === filters.workLocationId
    );
    if (location) filterSummary.push(`Location: ${location.name}`);
  }
  if (filters.managerId) {
    const manager = options.managers.find(
      (option) => option.id === filters.managerId
    );
    if (manager) filterSummary.push(`Manager: ${manager.name}`);
  }
  if (filters.employmentType) {
    filterSummary.push(`Employment Type: ${filters.employmentType}`);
  }
  if (filters.employmentStatus) {
    filterSummary.push(`Employee Status: ${filters.employmentStatus}`);
  }
  if (filters.q) filterSummary.push(`Search: ${filters.q}`);

  const rows: RecapExportEmployeeRow[] = exportData.rows.map((row) => ({
    employeeNumber: row.employeeNumber,
    employeeName: row.employeeName,
    department: row.department,
    workLocationName: row.workLocationName,
    managerName: row.managerName,
    workingDays: row.workingDays,
    present: row.present,
    late: row.late,
    leave: row.leave,
    sick: row.sick,
    permission: row.permission,
    absent: row.absent,
    attendanceRate: row.attendanceRate,
  }));

  const generatedAt = new Date();
  const { buffer, filename } = await buildAttendanceRecapWorkbook(
    exportData.kpi,
    rows,
    {
      organizationName: null,
      periodLabel: formatPeriodLabel(filters.startDate, filters.endDate),
      generatedAtLabel: `${generatedAt.toISOString()} (UTC)`,
      filterSummary,
    }
  );

  // Best effort only: an audit failure must never fail the download.
  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "attendance.recap.exported",
      entityType: "organization",
      entityId: organizationId,
      metadata: {
        format: "excel",
        periodStart: filters.startDate,
        periodEnd: filters.endDate,
        count: rows.length,
        filename,
      },
    });
  } catch (error) {
    console.error("[attendance] recap export audit failed", error);
  }

  const bytes = Buffer.from(buffer as unknown as ArrayBuffer);
  return new Response(new Uint8Array(bytes) as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      ...SECURITY_HEADERS,
    },
  });
}
