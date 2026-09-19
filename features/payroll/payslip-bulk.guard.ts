/**
 * Mode B — Bulk distribution upload — PURE planning/validation contract.
 *
 * Bulk upload is a follow-up phase. This module defines the deterministic
 * contract only (no DB, no filesystem, no PDF processing) so the eventual
 * server action and UI share one source of truth and the behaviour is unit
 * tested today.
 *
 * Filename convention (case-insensitive extension):
 *   `{employee_number}.pdf`
 *   `{employee_number}_anything.pdf`
 *   `{employee_number}-anything.pdf`
 *   `{employee_number} anything.pdf`
 *
 * The leading 1–32 digit run before the first separator is the employee
 * number. Every other file is reported as `invalid_filename`; the caller must
 * show the full report and never silently drop a file.
 */

/** Hard cap on files accepted in a single bulk upload. */
export const PAYSLIP_BULK_MAX_FILES = 200;

const EMPLOYEE_NUMBER_PREFIX_PATTERN = /^(\d{1,32})(?:[_\-\s.]|$)/;

export interface PayslipBulkFile {
  name: string;
}

export interface PayslipBulkEmployee {
  id: string;
  employeeNumber: string;
  hasBirthDate: boolean;
}

export type PayslipBulkEntryStatus =
  | "matched"
  | "unknown_employee"
  | "duplicate_employee"
  | "invalid_filename"
  | "missing_birth_date";

export interface PayslipBulkEntry {
  filename: string;
  employeeNumber: string | null;
  employeeId: string | null;
  status: PayslipBulkEntryStatus;
  message: string;
}

export interface PayslipBulkPlan {
  entries: PayslipBulkEntry[];
  total: number;
  matchedCount: number;
  problemCount: number;
  canProceed: boolean;
}

/**
 * Extract the employee number prefix from a filename. Returns `null` when the
 * filename is empty or does not begin with a 1–32 digit number followed by a
 * separator or the end of the name stem.
 */
export function extractEmployeeNumberFromFilename(
  filename: string
): string | null {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dotIndex = base.lastIndexOf(".");
  const stem = dotIndex > 0 ? base.slice(0, dotIndex) : base;
  const match = stem.match(EMPLOYEE_NUMBER_PREFIX_PATTERN);
  return match ? match[1] : null;
}

/**
 * Plan a bulk upload: match each file to an active employee by filename,
 * flag duplicates within the batch, and require a birth date (the PDF
 * password contract). Pure and deterministic; first problem wins per file.
 */
export function buildBulkUploadPlan(
  files: PayslipBulkFile[],
  employees: PayslipBulkEmployee[]
): PayslipBulkPlan {
  const employeeByNumber = new Map(
    employees.map((employee) => [employee.employeeNumber.trim(), employee])
  );

  const seenNumbers = new Set<string>();

  const entries: PayslipBulkEntry[] = files.map((file) => {
    const employeeNumber = extractEmployeeNumberFromFilename(file.name);

    if (!employeeNumber) {
      return {
        filename: file.name,
        employeeNumber: null,
        employeeId: null,
        status: "invalid_filename",
        message:
          "The filename must start with the employee number (digits), e.g. 03233.pdf.",
      };
    }

    const employee = employeeByNumber.get(employeeNumber);

    if (!employee) {
      return {
        filename: file.name,
        employeeNumber,
        employeeId: null,
        status: "unknown_employee",
        message: `No active employee with number ${employeeNumber} in this organization.`,
      };
    }

    if (seenNumbers.has(employeeNumber)) {
      return {
        filename: file.name,
        employeeNumber,
        employeeId: employee.id,
        status: "duplicate_employee",
        message: `Employee ${employeeNumber} appears more than once in this batch.`,
      };
    }

    seenNumbers.add(employeeNumber);

    if (!employee.hasBirthDate) {
      return {
        filename: file.name,
        employeeNumber,
        employeeId: employee.id,
        status: "missing_birth_date",
        message: `Employee ${employeeNumber} has no birth date, so the PDF password cannot be built.`,
      };
    }

    return {
      filename: file.name,
      employeeNumber,
      employeeId: employee.id,
      status: "matched",
      message: "",
    };
  });

  const matchedCount = entries.filter(
    (entry) => entry.status === "matched"
  ).length;

  return {
    entries,
    total: entries.length,
    matchedCount,
    problemCount: entries.length - matchedCount,
    canProceed:
      matchedCount > 0 && entries.length <= PAYSLIP_BULK_MAX_FILES,
  };
}
