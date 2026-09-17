/**
 * PM-04 — Payslip PDF document layer — PURE decision/validation functions.
 *
 * These encode the security and integrity invariants of the payslip document
 * layer (upload action, PDF route, publish gate) so the server modules stay
 * thin and the rules become unit-testable with the existing `node:test`
 * foundation. No DB, no auth, no filesystem, no Ghostscript here: callers
 * (server action / route handlers) pass org-scoped rows they already fetched.
 *
 * Contract (mirrors the security comments in each consumer):
 * - Organization/employee identity never comes from the client.
 * - Payloads are strict whitelists; only expected fields are honored.
 * - Filenames are neutralized for both storage metadata (path/control char
 *   stripping) and HTTP `Content-Disposition` headers (quote/backslash
 *   stripping), and never include NUL/control characters.
 * - A payslip PDF is visible to its linked employee owner OR to an actor with
 *   explicit payroll/payslip management (or view) access.
 * - A payroll run may only be published when every generated payslip has an
 *   encrypted PDF document.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAYSLIP_PDF_MIME = "application/pdf";

export const PAYSLIP_PDF_FILENAME_LIMIT = 255;

/** Validates a UUID identifier that comes out of the URL or payload. */
export function isPayslipUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Accepts `application/pdf` and the empty string.
 *
 * The empty string is tolerated because some browsers leave `File.type`
 * blank; the file is still re-verified server-side by the PDF-magic check and
 * the Ghostscript render pass before it is stored.
 */
export function isPayslipPdfMimeType(value: string): boolean {
  return value === PAYSLIP_PDF_MIME || value === "";
}

/**
 * Neutralizes an uploaded file name for stored metadata.
 *
 * Removes control characters, normalizes backslashes to forward slashes,
 * drops any directory path, trims, and caps the length so the stored
 * `original_filename` is always safe to display.
 */
export function sanitizePayslipOriginalFilename(value: string): string {
  const normalized =
    value
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replaceAll("\\", "/")
      .split("/")
      .pop()
      ?.trim() ?? "";

  if (!normalized) {
    return "payslip.pdf";
  }

  return normalized.slice(0, PAYSLIP_PDF_FILENAME_LIMIT);
}

/**
 * Neutralizes a file name for a `Content-Disposition` response header.
 *
 * Unlike the stored-name sanitizer this also removes quote and backslash
 * characters so the value cannot break out of a quoted header parameter, and
 * guarantees a `.pdf` extension.
 */
export function sanitizePayslipHeaderFilename(value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/["\\]/g, "")
    .trim();

  if (!cleaned) {
    return "payslip.pdf";
  }

  return cleaned.endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

export interface PayslipDocumentAccessContext {
  /** The linked employee of the authenticated actor, or null when none. */
  linkedEmployeeId: string | null;
  /** The employee the published payslip belongs to. */
  payslipEmployeeId: string;
  /** Explicit payroll/payslip management or view access. */
  managementAllowed: boolean;
}

/**
 * Decides whether an actor may view a published payslip PDF.
 *
 * The actor is allowed when they hold an explicit payroll/payslip management
 * (or payroll-view) permission, or when they are the employee the payslip
 * belongs to. An employee self-service actor without ownership is denied even
 * if they technically hold `PAYSLIP_VIEW`; ownership is always resolved
 * server-side from the session-linked employee, never from the client.
 */
export function canViewPublishedPayslip(
  context: PayslipDocumentAccessContext
): boolean {
  if (context.managementAllowed) {
    return true;
  }

  return (
    context.linkedEmployeeId !== null &&
    context.linkedEmployeeId === context.payslipEmployeeId
  );
}

export interface PayslipDocumentAccessDecision {
  /** Whether the PDF may be served. */
  allowed: boolean;
  /**
   * Whether the `payslip.document.viewed` audit event must be recorded.
   *
   * Always `true` when access is allowed and `false` when denied, so the
   * access audit is recorded exactly when (and only when) authorization for
   * the document view succeeded.
   */
  recordAudit: boolean;
}

/**
 * Builds the access + audit decision for a published payslip PDF request.
 *
 * Owns the single mapping from authorization to the last-viewed audit event:
 * no audit decision when the actor is denied, audit decision when allowed.
 * This is a pure function (no DB, no auth, no filesystem) so the rule is
 * unit-testable with the existing `node:test` foundation.
 */
export function buildPayslipDocumentAccessDecision(
  context: PayslipDocumentAccessContext
): PayslipDocumentAccessDecision {
  const allowed = canViewPublishedPayslip(context);

  return { allowed, recordAudit: allowed };
}

/**
 * Counts the generated payslips that still lack an encrypted PDF document.
 *
 * Both id lists must already be organization-scoped by the caller.
 */
export function countPayslipsMissingDocuments(
  pendingPayslipIds: readonly string[],
  documentPayslipIds: readonly string[]
): number {
  const documentIdSet = new Set(documentPayslipIds);

  return pendingPayslipIds.filter((id) => !documentIdSet.has(id)).length;
}