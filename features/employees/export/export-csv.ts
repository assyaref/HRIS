/**
 * Employee CSV export — PURE builder.
 *
 * No `server-only`, database, Next.js or browser imports so the escaping and
 * column contract can be unit-tested with `node --test`. The authenticated
 * route handler (`app/api/employees/export/route.ts`) supplies the org-scoped
 * rows, runs RBAC and writes the audit log.
 */

export interface ExportEmployeeRow {
  employeeNumber: string;
  name: string;
  email: string | null;
  status: string;
  /** `YYYY-MM-DD` or null. */
  hireDate: string | null;
}

/** CSV header — mirrors the import template (see features/employees/import). */
export const EXPORT_CSV_HEADER = "Employee No.,Name,Email,Status,Hire Date";

export function neutralizeSpreadsheetFormula(value: string): string {
  if (/^[\s]*[=+\-@]/.test(value) || /^[\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/** Quote a single CSV field, doubling embedded quotes. */
export function escapeCsvCell(value: string | null): string {
  if (value === null) return "";
  const safeValue = neutralizeSpreadsheetFormula(value);
  if (
    safeValue.includes(",") ||
    safeValue.includes('"') ||
    safeValue.includes("\n") ||
    safeValue.includes("\r")
  ) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

/**
 * Build the complete CSV payload.
 *
 * Includes a UTF-8 byte order mark so spreadsheet applications (Excel etc.)
 * render the file correctly when opened directly.
 */
export function buildEmployeesCsv(
  rows: readonly ExportEmployeeRow[]
): { csv: string; filename: string } {
  const dataRows = rows.map((row) =>
    [
      escapeCsvCell(row.employeeNumber),
      escapeCsvCell(row.name),
      escapeCsvCell(row.email),
      escapeCsvCell(row.status),
      escapeCsvCell(row.hireDate),
    ].join(",")
  );

  const body = [EXPORT_CSV_HEADER, ...dataRows].join("\n");
  const filename = `employees-${new Date().toISOString().slice(0, 10)}.csv`;

  return { csv: `\uFEFF${body}\n`, filename };
}