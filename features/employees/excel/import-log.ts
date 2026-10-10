/**
 * Employee import result log — PURE builder.
 *
 * No `server-only`, database, Next.js or browser imports. The dialog feeds
 * this the `details` already returned by `confirmExcelImportAction` — no
 * re-query — and triggers a client-side download.
 *
 * SECURITY: the log never carries credential material. `passwordNote` (which
 * contains no password, only the status "initial password = employee number")
 * is reduced to a fixed, safe sentence. No actual password/hash ever appears.
 */

import type { ImportResultDetail } from "./import-settings";
import { escapeCsvCell } from "../export/export-csv";

const IMPORT_LOG_CSV_HEADER = [
  "Timestamp",
  "Employee Number",
  "Employee Name",
  "Action",
  "Email",
  "Account Status",
  "Assignment Status",
  "Organization",
  "Project",
  "Work Location",
  "Role",
  "Status",
  "Error",
  "Warning",
].join(",");

export function accountStatusLabel(
  status: ImportResultDetail["account"]
): string {
  switch (status) {
    case "created":
      return "CREATED";
    case "existing":
      return "EXISTING";
    case "failed":
      return "FAILED";
    default:
      return "SKIPPED";
  }
}

export function assignmentStatusLabel(
  status: ImportResultDetail["assignment"]
): string {
  switch (status) {
    case "created":
      return "CREATED";
    case "existing":
      return "EXISTING";
    default:
      return "FAILED";
  }
}

/** Action label for the log. */
export function actionLabel(operation: ImportResultDetail["operation"]): string {
  return operation.toUpperCase();
}

/**
 * Security-safe warning text for a detail row. May not contain a real
 * password, a hash, or any credential — only the fixed status phrases.
 */
export function warningForDetail(detail: ImportResultDetail): string {
  switch (detail.account) {
    case "created":
      return "Initial password configured as Employee Number; change required on first login.";
    case "skipped_no_email":
      return "No user account created - no email address.";
    case "skipped_inactive":
      return "No user account created - employee is inactive.";
    case "skipped_not_enabled":
      return "Account provisioning disabled for this import.";
    default:
      return "";
  }
}

/** Render a single detail row as one CSV line (no trailing newline). */
export function buildImportLogCsvRow(
  detail: ImportResultDetail,
  timestamp: string
): string {
  return [
    escapeCsvCell(timestamp),
    escapeCsvCell(detail.employeeNumber),
    escapeCsvCell(detail.employeeName),
    escapeCsvCell(actionLabel(detail.operation)),
    escapeCsvCell(detail.email),
    escapeCsvCell(accountStatusLabel(detail.account)),
    escapeCsvCell(assignmentStatusLabel(detail.assignment)),
    escapeCsvCell(detail.organization),
    escapeCsvCell(detail.project),
    escapeCsvCell(detail.workLocation),
    escapeCsvCell(detail.role),
    escapeCsvCell(detail.error ? "FAILED" : "SUCCESS"),
    escapeCsvCell(detail.error),
    escapeCsvCell(warningForDetail(detail)),
  ].join(",");
}

function fileStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Build the complete import log CSV (with UTF-8 BOM) for the given details.
 */
export function buildImportLogCsv(
  details: readonly ImportResultDetail[]
): { csv: string; filename: string } {
  const now = new Date();
  const timestamp = now.toISOString();
  const body = [
    IMPORT_LOG_CSV_HEADER,
    ...details.map((detail) => buildImportLogCsvRow(detail, timestamp)),
  ].join("\n");
  const filename = `employee-import-log-${fileStamp(now)}.csv`;
  return { csv: `\uFEFF${body}\n`, filename };
}