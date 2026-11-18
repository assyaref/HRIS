import { getCurrentUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import {
  CONTRACT_STATUS_LABELS,
  isContractStatus,
  remainingLabel,
} from "@/features/compliance/contract-status";
import { listContractRows, sortByUrgency } from "@/features/compliance/queries";
import { buildEmployeeMovementReport } from "@/features/reports/employee-movement";
import { listLeaveReport, listMovementEmployees } from "@/features/reports/queries";
import { buildReportWorkbook, type SheetSpec } from "@/features/reports/workbook";
import { dateParam, monthRange, textParam, todayKey } from "@/features/reference-shared";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });

/** Every permission a report needs (all must be held). */
const REPORT_PERMISSIONS: Record<string, Permission[]> = {
  contracts: [
    PERMISSIONS.EMPLOYEES_EXPORT,
    PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW,
  ],
  employees: [PERMISSIONS.REPORTS_VIEW],
  leave: [PERMISSIONS.REPORTS_VIEW],
};

const LEAVE_STATUS: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

/**
 * GET /api/reports/export?report=contracts|employees|leave&…
 * Authenticated, RBAC-checked server-side, organization-scoped to the
 * caller's (acting) organization; every download is audit-logged.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return text(401, "Unauthorized");
  if (!user.organizationId) return text(403, "Forbidden");
  const organizationId = user.organizationId;

  const url = new URL(request.url);
  const get = (key: string) => url.searchParams.get(key) ?? undefined;
  const report = get("report") ?? "";
  const required = REPORT_PERMISSIONS[report];
  if (!required) return text(404, "Unknown report");

  const authorization = await getUserAuthorization(user.id);
  const granted = new Set<string>(authorization.permissionCodes);
  if (!required.every((code) => granted.has(code))) return text(403, "Forbidden");

  const today = todayKey();
  const month = monthRange(today);
  let sheets: SheetSpec[];
  let filename: string;

  if (report === "contracts") {
    const statusParam = get("status");
    const rows = sortByUrgency(await listContractRows(organizationId, today)).filter(
      (row) => !isContractStatus(statusParam) || row.status === statusParam
    );
    filename = `monitoring-kontrak-${today}.xlsx`;
    sheets = [
      {
        name: "Kontrak",
        columns: [
          { header: "No. Karyawan", key: "number", width: 16 },
          { header: "Nama", key: "name", width: 28 },
          { header: "Jabatan", key: "position", width: 22 },
          { header: "Departemen", key: "department", width: 20 },
          { header: "Lokasi Kerja", key: "location", width: 22 },
          { header: "Jenis Kepegawaian", key: "type", width: 18 },
          { header: "Mulai Kontrak", key: "start", width: 14 },
          { header: "Akhir Kontrak", key: "end", width: 14 },
          { header: "Sisa", key: "remaining", width: 18 },
          { header: "Status", key: "status", width: 14 },
        ],
        rows: rows.map((row) => ({
          number: row.employeeNumber,
          name: row.name,
          position: row.position,
          department: row.department,
          location: row.workLocation,
          type: row.employmentType,
          start: row.contractStart,
          end: row.contractEnd,
          remaining: remainingLabel(row.daysRemaining),
          status: CONTRACT_STATUS_LABELS[row.status],
        })),
      },
    ];
  } else if (report === "employees") {
    const from = dateParam(get("from"), month.from);
    const to = dateParam(get("to"), month.to);
    const result = buildEmployeeMovementReport(await listMovementEmployees(organizationId), from, to);
    const person = (date: "hireDate" | "exitDate") => (row: (typeof result.joined)[number]) => ({
      number: row.employeeNumber,
      name: row.name,
      position: row.position,
      department: row.department,
      location: row.workLocation,
      date: row[date],
    });
    const personColumns = (dateHeader: string) => [
      { header: "No. Karyawan", key: "number", width: 16 },
      { header: "Nama", key: "name", width: 28 },
      { header: "Jabatan", key: "position", width: 22 },
      { header: "Departemen", key: "department", width: 20 },
      { header: "Lokasi Kerja", key: "location", width: 22 },
      { header: dateHeader, key: "date", width: 14 },
    ];
    const groupColumns = (label: string) => [
      { header: label, key: "key", width: 28 },
      { header: "Masuk", key: "joined" },
      { header: "Keluar", key: "left" },
      { header: "Headcount akhir", key: "headcountEnd", width: 18 },
    ];
    filename = `laporan-karyawan-${result.from}_${result.to}.xlsx`;
    sheets = [
      {
        name: "Ringkasan",
        columns: [
          { header: "Keterangan", key: "label", width: 30 },
          { header: "Nilai", key: "value", width: 16 },
        ],
        rows: [
          { label: "Periode", value: `${result.from} s/d ${result.to}` },
          { label: "Headcount awal", value: result.headcountStart },
          { label: "Karyawan masuk", value: result.joined.length },
          { label: "Karyawan keluar", value: result.left.length },
          { label: "Headcount akhir", value: result.headcountEnd },
          { label: "Turnover (%)", value: result.turnoverRate ?? "—" },
        ],
      },
      { name: "Masuk", columns: personColumns("Tanggal Masuk"), rows: result.joined.map(person("hireDate")) },
      { name: "Keluar", columns: personColumns("Tanggal Keluar"), rows: result.left.map(person("exitDate")) },
      { name: "Per Departemen", columns: groupColumns("Departemen"), rows: result.byDepartment.map((g) => ({ ...g })) },
      { name: "Per Lokasi", columns: groupColumns("Lokasi Kerja"), rows: result.byWorkLocation.map((g) => ({ ...g })) },
    ];
  } else {
    const from = dateParam(get("from"), month.from);
    const to = dateParam(get("to"), month.to);
    const status = textParam(get("status"));
    const rows = await listLeaveReport(organizationId, {
      from,
      to,
      status: status && LEAVE_STATUS[status] ? status : undefined,
    });
    filename = `laporan-cuti-${from}_${to}.xlsx`;
    sheets = [
      {
        name: "Cuti",
        columns: [
          { header: "No. Karyawan", key: "number", width: 16 },
          { header: "Nama", key: "name", width: 28 },
          { header: "Jenis Cuti", key: "type", width: 20 },
          { header: "Mulai", key: "start", width: 12 },
          { header: "Selesai", key: "end", width: 12 },
          { header: "Hari", key: "days", width: 8 },
          { header: "Status", key: "status", width: 12 },
          { header: "Alasan", key: "reason", width: 40 },
        ],
        rows: rows.map((row) => ({
          number: row.employeeNumber,
          name: row.employeeName,
          type: row.leaveType,
          start: row.startDate,
          end: row.endDate,
          days: row.totalDays,
          status: LEAVE_STATUS[row.status] ?? row.status,
          reason: row.reason,
        })),
      },
    ];
  }

  const buffer = await buildReportWorkbook(sheets);
  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "report.exported",
      entityType: "report",
      metadata: { report, filename },
    });
  } catch (error) {
    console.error("[reports] export audit failed", error);
  }
  return new Response(buffer, {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
