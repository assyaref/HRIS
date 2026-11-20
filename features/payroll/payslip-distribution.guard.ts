/**
 * Mode B — Payslip distribution — PURE decision/validation functions.
 *
 * Mode B lets management publish payslip PDFs to employees WITHOUT using the
 * payroll calculation engine (Mode A). A "distribution" payslip is linked to a
 * `payroll_periods` row via `payslips.payroll_period_id` (no payroll item / run)
 * and its document is always uploaded.
 *
 * These functions stay pure (no DB, no auth, no filesystem, no Ghostscript):
 * callers (server actions) pass the org-scoped rows they already fetched.
 *
 * Security contract:
 * - Organization/employee identity never comes from the client.
 * - A distribution payslip number is deterministic and never client-supplied:
 *   `PS-{PERIOD_CODE}-D-{employee_number}`.
 * - Distribution is only allowed for periods that are not cancelled/locked.
 * - The employee must have exactly one payslip per period (calculated or
 *   distribution); duplicates are rejected by the action using row locks.
 * - PDF encryption still uses the shared employee-number password contract.
 */

/**
 * Provenance of a payslip row.
 *
 * - "calculated": a payslip produced over a `payroll_items` row (Mode A).
 * - "distribution": a payslip uploaded for direct distribution (Mode B).
 */
export const PAYSLIP_KINDS = ["calculated", "distribution"] as const;

export type PayslipKind = (typeof PAYSLIP_KINDS)[number];

/** Narrows a raw, database-sourced value to a known payslip kind. */
export function isPayslipKind(value: unknown): value is PayslipKind {
  return value === "calculated" || value === "distribution";
}

const DISTRIBUTION_PAYSLIP_NUMBER_PATTERN = /^PS-[A-Z0-9-]+-D-[0-9]+$/;

const EMPLOYEE_NUMBER_PATTERN = /^\d{1,32}$/;

/**
 * Derives the deterministic payslip number for a distribution payslip.
 *
 * The pattern `PS-{period code}-D-{employee number}` cannot collide with the
 * automatic Mode A pattern (`PS-{period code}-{running number}`) because of the
 * distinguishing `-D-` segment. The period code is uppercased and stripped of
 * whitespace so the same period always yields the same number; the employee
 * number is validated as 1–32 digits (the same contract as the PDF password).
 */
export function buildDistributionPayslipNumber(
  periodCode: string,
  employeeNumber: string
): string {
  const normalizedPeriodCode = periodCode
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  const normalizedEmployeeNumber = employeeNumber.trim();

  if (!EMPLOYEE_NUMBER_PATTERN.test(normalizedEmployeeNumber)) {
    throw new Error("Nomor karyawan harus berisi 1–32 digit.");
  }

  const payslipNumber = `PS-${normalizedPeriodCode}-D-${normalizedEmployeeNumber}`;

  if (!DISTRIBUTION_PAYSLIP_NUMBER_PATTERN.test(payslipNumber)) {
    throw new Error(
      "Kode periode payroll tidak dapat dipakai untuk slip gaji distribusi."
    );
  }

  return payslipNumber;
}

export interface DistributionPayslipUploadDecisionInput {
  /** Current status of the borrowing payroll period. */
  periodStatus: string;
  /** True when the employee already has ANY payslip in this period. */
  duplicateEmployeePayslip: boolean;
  /** Snapshot-adjacent identity: employee number is required. */
  employeeNumber: string | null;
  /** Birth date is required to build the encrypted PDF password. */
  birthDate: Date | string | null;
}

export interface DistributionPayslipUploadDecision {
  allowed: boolean;
  message: string;
}

/**
 * Pure, deterministic decision for uploading a distribution payslip into a
 * period. Checks run in a fixed, first-failure-wins order:
 *
 * 1. the employee must have an employee number (PDF password contract),
 * 2. the employee must have a birth date (PDF password contract),
 * 3. the period must not be cancelled,
 * 4. the period must not be locked (Mode A immutability is preserved),
 * 5. the employee must not already hold a payslip in this period.
 *
 * File-level validation is delegated to the shared
 * `buildPayslipPdfUploadDecision`; period locking and duplicate checks are
 * re-run inside the action transaction while holding the period row lock.
 */
export function buildDistributionPayslipUploadDecision(
  input: DistributionPayslipUploadDecisionInput
): DistributionPayslipUploadDecision {
  if (!input.employeeNumber || input.employeeNumber.length === 0) {
    return {
      allowed: false,
      message: "Nomor karyawan wajib ada sebelum slip gaji dapat diunggah.",
    };
  }

  if (!input.birthDate) {
    return {
      allowed: false,
      message: "Tanggal lahir karyawan diperlukan sebelum slip gaji dapat diunggah.",
    };
  }

  if (input.periodStatus === "cancelled") {
    return {
      allowed: false,
      message:
        "Slip gaji distribusi tidak dapat diunggah untuk periode payroll yang dibatalkan.",
    };
  }

  if (input.periodStatus === "locked") {
    return {
      allowed: false,
      message:
        "Slip gaji distribusi tidak dapat diunggah untuk periode payroll yang terkunci.",
    };
  }

  if (input.duplicateEmployeePayslip) {
    return {
      allowed: false,
      message:
        "Karyawan ini sudah memiliki slip gaji untuk periode payroll ini.",
    };
  }

  return { allowed: true, message: "" };
}

export interface PayslipPublishDecisionInput {
  /** Current lifecycle status of the payslip. */
  status: string;
  /** True when an encrypted `payslip_documents` row exists. */
  hasDocument: boolean;
}

export interface PayslipPublishDecision {
  allowed: boolean;
  message: string;
}

/**
 * Pure, deterministic decision for publishing a single payslip to employee
 * self-service. Only an unpublished (`generated`) payslip with an encrypted PDF
 * document can be published; published and revoked payslips are immutable.
 */
export function buildPayslipPublishDecision(
  input: PayslipPublishDecisionInput
): PayslipPublishDecision {
  if (input.status !== "generated") {
    return {
      allowed: false,
      message:
        "Hanya slip gaji berstatus dibuat yang dapat diterbitkan. Slip gaji terbit atau dicabut tidak dapat diubah.",
    };
  }

  if (!input.hasDocument) {
    return {
      allowed: false,
      message:
        "Slip gaji tidak dapat diterbitkan tanpa dokumen PDF terenkripsi.",
    };
  }

  return { allowed: true, message: "" };
}