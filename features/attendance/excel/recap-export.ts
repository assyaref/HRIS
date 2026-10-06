/**
 * Attendance Recap Excel export builder.
 *
 * Uses exceljs (already installed for the employee master-data export) to
 * produce the attendance recap workbook:
 *   Summary          — period, generation time and the KPI block
 *   Attendance Recap — one row per employee (the page's table columns)
 *
 * The authenticated route (`app/api/attendance/recap/export/route.ts`)
 * supplies org-scoped, already-filtered rows and makes the RBAC decision;
 * this module is a pure writer so its output shape is unit-testable with
 * `node --test` (mirrors features/employees/excel/export.ts).
 */

import ExcelJS from "exceljs";

import { formatAttendanceRate } from "../recap.ts";

export interface RecapExportEmployeeRow {
  employeeNumber: string;
  employeeName: string;
  department: string | null;
  workLocationName: string | null;
  managerName: string | null;
  workingDays: number;
  present: number;
  late: number;
  leave: number;
  sick: number;
  permission: number;
  absent: number;
  /** Percent, 2 decimals — null when the employee had no expected days. */
  attendanceRate: number | null;
}

export interface RecapExportKpi {
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

export interface RecapExportMetadata {
  organizationName: string | null;
  /** Display label, e.g. "01 Oct 2026 - 31 Oct 2026". */
  periodLabel: string;
  /** Display label for the generation instant. */
  generatedAtLabel: string;
  /** Human-readable active-filter summary lines. */
  filterSummary: string[];
}

export const RECAP_EXPORT_SHEET_NAME = "Attendance Recap";
export const RECAP_EXPORT_SUMMARY_SHEET_NAME = "Summary";

const RECAP_EXPORT_HEADERS = [
  "Employee No",
  "Employee Name",
  "Department",
  "Work Location",
  "Manager",
  "Working Days",
  "Present",
  "Late",
  "Leave",
  "Sick",
  "Permission",
  "Absent",
  "Attendance Rate (%)",
] as const;

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "1FB6E8" },
} as const;

const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } } as const;

function applyHeaderRow(
  worksheet: ExcelJS.Worksheet,
  headers: readonly string[]
): void {
  const headerRow = worksheet.addRow([...headers]);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle" };
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

function autoWidth(
  worksheet: ExcelJS.Worksheet,
  headers: readonly string[]
): void {
  headers.forEach((header, index) => {
    const column = worksheet.getColumn(index + 1);
    column.width = Math.min(Math.max(header.length + 6, 12), 42);
  });
}

/**
 * Build the recap workbook. Returns an xlsx buffer and a filename in
 * `attendance-recap-YYYY-MM-DD.xlsx` format (generation-date stamped).
 */
export async function buildAttendanceRecapWorkbook(
  kpi: RecapExportKpi,
  rows: readonly RecapExportEmployeeRow[],
  metadata: RecapExportMetadata
): Promise<{ buffer: ExcelJS.Buffer; filename: string }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRIS";
  workbook.created = new Date();
  if (metadata.organizationName) {
    workbook.company = metadata.organizationName;
  }

  // -- Summary -------------------------------------------------------------
  const summarySheet = workbook.addWorksheet(RECAP_EXPORT_SUMMARY_SHEET_NAME);
  const summaryPairs: [string, string][] = [
    ["Report", "Attendance Recap"],
    ["Organization", metadata.organizationName ?? "—"],
    ["Period", metadata.periodLabel],
    ["Generated At", metadata.generatedAtLabel],
    ...metadata.filterSummary.map((line) => ["Filter", line] as [string, string]),
  ];
  for (const [label, value] of summaryPairs) {
    const row = summarySheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  summarySheet.addRow([]);
  const kpiPairs: [string, string][] = [
    ["Total Employees", String(kpi.totalEmployees)],
    ["Working Days", String(kpi.workingDays)],
    ["Attendance Rate", formatAttendanceRate(kpi.attendanceRate)],
    ["Present", String(kpi.present)],
    ["Late", String(kpi.late)],
    ["Absent", String(kpi.absent)],
    ["Leave", String(kpi.leave)],
    ["Sick", String(kpi.sick)],
    ["Permission", String(kpi.permission)],
  ];
  for (const [label, value] of kpiPairs) {
    const row = summarySheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  summarySheet.getColumn(1).width = 22;
  summarySheet.getColumn(2).width = 42;

  // -- Attendance Recap ----------------------------------------------------
  const recapSheet = workbook.addWorksheet(RECAP_EXPORT_SHEET_NAME);
  applyHeaderRow(recapSheet, RECAP_EXPORT_HEADERS);
  for (const row of rows) {
    recapSheet.addRow([
      row.employeeNumber,
      row.employeeName,
      row.department ?? "",
      row.workLocationName ?? "",
      row.managerName ?? "",
      row.workingDays,
      row.present,
      row.late,
      row.leave,
      row.sick,
      row.permission,
      row.absent,
      row.attendanceRate === null ? "" : row.attendanceRate,
    ]);
  }
  autoWidth(recapSheet, RECAP_EXPORT_HEADERS);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `attendance-recap-${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  return { buffer, filename };
}
