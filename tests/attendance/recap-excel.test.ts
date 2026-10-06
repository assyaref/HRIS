/**
 * Attendance Recap — Excel export builder tests (node:test).
 *
 * Asserts the workbook shape produced by
 * `features/attendance/excel/recap-export.ts`: sheet names, header columns,
 * one data row per employee and the attendance-rate cell. Uses the same
 * exceljs reload pattern as tests/employees/employee-excel.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  buildAttendanceRecapWorkbook,
  RECAP_EXPORT_SHEET_NAME,
  RECAP_EXPORT_SUMMARY_SHEET_NAME,
  type RecapExportEmployeeRow,
  type RecapExportKpi,
} from "../../features/attendance/excel/recap-export.ts";

const KPI: RecapExportKpi = {
  totalEmployees: 2,
  workingDays: 22,
  attendanceRate: 90.91,
  present: 20,
  late: 2,
  absent: 1,
  leave: 1,
  sick: 0,
  permission: 0,
};

const ROWS: RecapExportEmployeeRow[] = [
  {
    employeeNumber: "EMP-0001",
    employeeName: "Syarif Hidayatullah",
    department: "IT",
    workLocationName: "Duri",
    managerName: "Manager A",
    workingDays: 22,
    present: 20,
    late: 2,
    leave: 1,
    sick: 0,
    permission: 0,
    absent: 1,
    attendanceRate: 90.91,
  },
  {
    employeeNumber: "EMP-0002",
    employeeName: "Budi Santoso",
    department: "Finance",
    workLocationName: null,
    managerName: null,
    workingDays: 22,
    present: 22,
    late: 0,
    leave: 0,
    sick: 0,
    permission: 0,
    absent: 0,
    attendanceRate: 100,
  },
];

const METADATA = {
  organizationName: "Acme",
  periodLabel: "01 Oct 2026 - 31 Oct 2026",
  generatedAtLabel: "2026-10-05T10:00:00.000Z (UTC)",
  filterSummary: ["Department: IT"],
};

test("workbook has Summary and Attendance Recap sheets", async () => {
  const { buffer } = await buildAttendanceRecapWorkbook(KPI, ROWS, METADATA);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  assert.ok(workbook.getWorksheet(RECAP_EXPORT_SUMMARY_SHEET_NAME));
  assert.ok(workbook.getWorksheet(RECAP_EXPORT_SHEET_NAME));
});

test("recap sheet header contains the expected columns", async () => {
  const { buffer } = await buildAttendanceRecapWorkbook(KPI, ROWS, METADATA);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet = workbook.getWorksheet(RECAP_EXPORT_SHEET_NAME)!;
  const header = sheet.getRow(1);
  const expected = [
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
  ];
  expected.forEach((label, index) => {
    assert.equal(header.getCell(index + 1).value, label);
  });
});

test("recap sheet contains one row per employee with rate as a number", async () => {
  const { buffer } = await buildAttendanceRecapWorkbook(KPI, ROWS, METADATA);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet = workbook.getWorksheet(RECAP_EXPORT_SHEET_NAME)!;
  assert.equal(sheet.rowCount, 3); // header + 2 data rows
  assert.equal(sheet.getRow(2).getCell(1).value, "EMP-0001");
  assert.equal(sheet.getRow(2).getCell(13).value, 90.91);
  assert.equal(sheet.getRow(3).getCell(1).value, "EMP-0002");
  assert.equal(sheet.getRow(3).getCell(13).value, 100);
});

test("summary sheet records the period and KPI numbers", async () => {
  const { buffer } = await buildAttendanceRecapWorkbook(KPI, ROWS, METADATA);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet = workbook.getWorksheet(RECAP_EXPORT_SUMMARY_SHEET_NAME)!;
  const values: string[] = [];
  sheet.eachRow((row) => {
    values.push(String(row.getCell(2).value ?? ""));
  });
  assert.ok(values.includes("01 Oct 2026 - 31 Oct 2026"));
  assert.ok(values.includes("90.91%"));
  assert.ok(values.includes("Department: IT"));
});

test("filename follows the attendance-recap-YYYY-MM-DD.xlsx contract", async () => {
  const { filename } = await buildAttendanceRecapWorkbook(
    KPI,
    ROWS,
    METADATA
  );
  assert.match(filename, /^attendance-recap-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
