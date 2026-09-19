/**
 * PM-05 — Payslip PDF generation guard — PURE decision module.
 *
 * Decides, without IO, which payslips are eligible for automated PDF
 * generation within an already-affirmed run and which must be skipped, and
 * in what order the skip reasons are reported.
 *
 * Callers are responsible for organization scoping and row locking before
 * invoking these functions; this module only reason about shapes.
 */

/**
 * Run statuses that permit payslip document generation. A run becomes
 * immutable only after approval/locking, so generated documents are only
 * produced for approved or locked runs. A null status (no run) is never
 * eligible.
 */
export function runStatusAllowsDocumentGeneration(status: string | null): boolean {
  return status === "approved" || status === "locked";
}

/** Only `generated` (unpublished, not revoked) payslips may receive a
 * document. Published payslips can never be regenerated. */
export function isGeneratedPayslipStatus(status: string): boolean {
  return status === "generated";
}

export type PayslipDocumentSkipReason =
  | "not_generated"
  | "document_exists"
  | "missing_employee_number"
  | "missing_birthdate";

export interface PayslipPdfCandidateInput {
  payslipId: string;
  status: string;
  /** Snapshot-adjacent identity values: employee number and birth date may be
   * absent in legacy employee records. */
  employeeNumber?: string | null;
  birthDate?: Date | string | null;
  /** True when a `payslip_documents` row already exists for the payslip. */
  existingDocument: boolean;
}

export interface PayslipPdfSkippedEntry {
  payslipId: string;
  reason: PayslipDocumentSkipReason;
}

export interface PayslipPdfGenerationOutcome {
  included: PayslipPdfCandidateInput[];
  skipped: PayslipPdfSkippedEntry[];
}

/**
 * Classifies candidates in priority order (first matching reason wins):
 * 1. payslip is not in `generated` status,
 * 2. a document already exists (never duplicate or overwrite),
 * 3. employee identity is missing its NIK,
 * 4. employee identity is missing its birth date.
 *
 * Skip reasons are why a payslip produces NO document; the count is reported
 * to the caller but never blocks processing of the rest.
 */
export function classifyPayslipPdfCandidates(
  candidates: PayslipPdfCandidateInput[]
): PayslipPdfGenerationOutcome {
  const included: PayslipPdfCandidateInput[] = [];
  const skipped: PayslipPdfSkippedEntry[] = [];

  for (const candidate of candidates) {
    if (!isGeneratedPayslipStatus(candidate.status)) {
      skipped.push({ payslipId: candidate.payslipId, reason: "not_generated" });
      continue;
    }

    if (candidate.existingDocument) {
      skipped.push({ payslipId: candidate.payslipId, reason: "document_exists" });
      continue;
    }

    if (!candidate.employeeNumber || candidate.employeeNumber.length === 0) {
      skipped.push({
        payslipId: candidate.payslipId,
        reason: "missing_employee_number",
      });
      continue;
    }

    if (!candidate.birthDate) {
      skipped.push({ payslipId: candidate.payslipId, reason: "missing_birthdate" });
      continue;
    }

    included.push(candidate);
  }

  return { included, skipped };
}