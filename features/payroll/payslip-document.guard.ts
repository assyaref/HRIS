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

/**
 * Provenance values for a `payslip_document_versions` row.
 *
 * - "generated": produced by the automated payslip generator.
 * - "uploaded": stored by a management upload/replacement.
 * - "legacy": created before version history existed; origin is not provable.
 */
export const PAYSLIP_DOCUMENT_SOURCES = [
  "generated",
  "uploaded",
  "legacy",
] as const;

export type PayslipDocumentSource = (typeof PAYSLIP_DOCUMENT_SOURCES)[number];

/**
 * Narrows a raw, database-sourced provenance string to a known source.
 *
 * The `source` column is `text` guarded by a CHECK, so the database only ever
 * contains a known value. Unknown/null input falls back to "generated" to keep
 * the mapping total for legacy callers and pre-migration snapshots.
 */
export function payslipDocumentSourceFrom(
  value: string | null | undefined
): PayslipDocumentSource {
  if (value === "uploaded") {
    return "uploaded";
  }

  if (value === "legacy") {
    return "legacy";
  }

  return "generated";
}

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

/** Maximum accepted size for an uploaded payslip PDF, in bytes. */
export const PAYSLIP_PDF_MAX_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * "Upload Payslip PDF" — extension validation.
 *
 * The client-supplied file name must carry a PDF extension, mirroring the
 * `accept="application/pdf,.pdf"` hint. Case-insensitive: `Payslip.PDF` is
 * accepted. A name that ends with `.pdf` after a directory prefix (raw
 * browser value) passes; the storage layer re-validates the content.
 */
export function hasPayslipPdfExtension(filename: string): boolean {
  return /\.pdf$/i.test(filename.trim());
}

export interface PayslipPdfUploadDecisionInput {
  mimeType: string;
  filename: string;
  size: number;
}

export interface PayslipPdfUploadDecision {
  allowed: boolean;
  message: string;
}

/**
 * Pure file-level validation for an uploaded payslip PDF, in fixed order:
 * 1. empty file (`size <= 0`),
 * 2. oversized file (> 20 MB),
 * 3. non-PDF MIME type,
 * 4. missing PDF extension.
 *
 * The messages mirror the server action so client and server stay
 * consistent. Content is additionally verified by the PDF-magic check and
 * the Ghostscript render pass in the storage layer.
 */
export function buildPayslipPdfUploadDecision(
  input: PayslipPdfUploadDecisionInput
): PayslipPdfUploadDecision {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { allowed: false, message: "The selected PDF is empty." };
  }

  if (input.size > PAYSLIP_PDF_MAX_SIZE_BYTES) {
    return {
      allowed: false,
      message: "The payslip PDF must not exceed 20 MB.",
    };
  }

  if (!isPayslipPdfMimeType(input.mimeType)) {
    return { allowed: false, message: "Only PDF files are allowed." };
  }

  if (!hasPayslipPdfExtension(input.filename)) {
    return {
      allowed: false,
      message: "The payslip file must have a .pdf extension.",
    };
  }

  return { allowed: true, message: "" };
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

/** Maximum accepted length of a payslip PDF replacement reason, in characters. */
export const PAYSLIP_DOCUMENT_REPLACE_REASON_MAX_LENGTH = 1000;

export interface PayslipPdfReplaceDecisionInput {
  mimeType: string;
  filename: string;
  size: number;
  /** The (untrusted) replacement reason as submitted by the client. */
  reason: string;
  /** Current lifecycle status of the payslip: generated | published | revoked. */
  payslipStatus: string;
  /** Payroll run status, or null when the payslip has no run. */
  runStatus: string | null;
  /**
   * Payslip provenance. Defaults to "calculated" to preserve the original
   * Mode A contract for existing callers.
   */
  payslipKind?: "calculated" | "distribution";
  /**
   * Borrowing payroll period status. Consulted for Mode B distribution
   * payslips instead of a run status.
   */
  periodStatus?: string | null;
  /** True when a `payslip_documents` row already exists for the payslip. */
  hasExistingDocument: boolean;
}

export interface PayslipPdfReplaceDecision {
  allowed: boolean;
  message: string;
}

/**
 * Pure, deterministic decision for replacing an existing payslip PDF.
 *
 * This is the ONLY place the replacement window is encoded. It never touches
 * the database; callers pass the organization-scoped rows and statuses they
 * already resolved, mirroring `buildPayslipPdfUploadDecision`. Checks run in a
 * fixed, first-failure-wins order:
 *
 * 1. a current document must exist (replacement never creates),
 * 2. the payslip must still be `generated` (never after publish/revoke),
 * 3. the borrowing payroll must be open:
 *    - Mode A (calculated): the run must be `approved` or `locked`,
 *    - Mode B (distribution): the period must not be `cancelled`/`locked`,
 * 4. the new file must pass the shared upload/PDF guard,
 * 5. the replacement reason is required,
 * 6. the reason must not exceed 1000 characters.
 *
 * The reason is trimmed before the emptiness/length checks so whitespace-only
 * input is rejected, but the original string is returned to no caller: the
 * action re-trims and stores the reason in the audit log only.
 */
export function buildPayslipPdfReplaceDecision(
  input: PayslipPdfReplaceDecisionInput
): PayslipPdfReplaceDecision {
  if (!input.hasExistingDocument) {
    return {
      allowed: false,
      message: "There is no payslip document to replace.",
    };
  }

  if (input.payslipStatus !== "generated") {
    return {
      allowed: false,
      message:
        "Only generated payslips can have their PDF replaced. Published or revoked payslips are immutable.",
    };
  }

  if (input.payslipKind === "distribution") {
    if (
      input.periodStatus === "cancelled" ||
      input.periodStatus === "locked"
    ) {
      return {
        allowed: false,
        message:
          "Distribution payslips cannot be replaced for a cancelled or locked payroll period.",
      };
    }
  } else if (input.runStatus !== "approved" && input.runStatus !== "locked") {
    return {
      allowed: false,
      message:
        "The payroll run must be approved or locked before replacing payslips.",
    };
  }

  const fileDecision = buildPayslipPdfUploadDecision({
    mimeType: input.mimeType,
    filename: input.filename,
    size: input.size,
  });

  if (!fileDecision.allowed) {
    return fileDecision;
  }

  const reason = input.reason.trim();

  if (reason.length === 0) {
    return {
      allowed: false,
      message: "A reason for replacing the payslip PDF is required.",
    };
  }

  if (reason.length > PAYSLIP_DOCUMENT_REPLACE_REASON_MAX_LENGTH) {
    return {
      allowed: false,
      message: `The replacement reason must not exceed ${PAYSLIP_DOCUMENT_REPLACE_REASON_MAX_LENGTH} characters.`,
    };
  }

  return { allowed: true, message: "" };
}

/**
 * Computes the next document version from the versions already recorded for a
 * payslip document. Returns 1 when no version exists yet, otherwise
 * `max(version) + 1`.
 *
 * Pure and deterministic so the increment rule is unit-testable. Callers must
 * compute this while holding a lock on the current document row and rely on the
 * `(organizationId, payslipDocumentId, version)` unique index as the final
 * database guard against a race.
 */
export function nextPayslipDocumentVersion(
  existingVersions: readonly number[]
): number {
  let highest = 0;

  for (const version of existingVersions) {
    if (Number.isFinite(version) && version > highest) {
      highest = version;
    }
  }

  return highest + 1;
}

export interface HistoricalPayslipPasswordIdentityInput {
  /** `payslips.employee_number_snapshot` — authoritative when present. */
  payslipEmployeeNumberSnapshot?: string | null;
  /** `payslips.birth_date_snapshot` — authoritative when present. */
  payslipBirthDateSnapshot?: Date | null;
  /**
   * `payroll_items.employee_number_snapshot` — the second-choice historical
   * source for calculated payslips created before Phase 11.
   */
  itemEmployeeNumberSnapshot?: string | null;
  /** Live employee number — legacy fallback ONLY. */
  liveEmployeeNumber?: string | null;
  /** Live employee birth date — legacy fallback ONLY. */
  liveBirthDate?: Date | null;
}

export interface HistoricalPayslipPasswordIdentity {
  employeeNumber: string | null;
  birthDate: Date | null;
  /**
   * True when at least one component had to fall back to the live employee
   * record because no historical snapshot was available (legacy rows only).
   */
  usedLiveFallback: boolean;
}

/**
 * Resolves the historical identity used to build a payslip PDF password.
 *
 * Precedence (Phase 11):
 *   employeeNumber: payslips.employeeNumberSnapshot
 *                 → payrollItems.employeeNumberSnapshot
 *                 → live employee.employeeNumber (legacy only)
 *   birthDate:      payslips.birthDateSnapshot
 *                 → live employee.birthDate (legacy only)
 *
 * The live employee values are a LAST-RESORT fallback for rows created before
 * the snapshot columns existed. They are never the primary source, so changing
 * an employee's number or birth date cannot silently change the opening
 * password of a payslip that already carries a snapshot. Pure and
 * deterministic; unit tested.
 */
export function resolveHistoricalPayslipPasswordIdentity(
  input: HistoricalPayslipPasswordIdentityInput
): HistoricalPayslipPasswordIdentity {
  const snapshotEmployeeNumber =
    input.payslipEmployeeNumberSnapshot ??
    input.itemEmployeeNumberSnapshot ??
    null;

  const employeeNumber =
    snapshotEmployeeNumber ?? input.liveEmployeeNumber ?? null;

  const birthDate =
    input.payslipBirthDateSnapshot ?? input.liveBirthDate ?? null;

  const employeeNumberFellBack =
    snapshotEmployeeNumber === null && employeeNumber !== null;
  const birthDateFellBack =
    input.payslipBirthDateSnapshot == null && birthDate !== null;

  return {
    employeeNumber,
    birthDate,
    usedLiveFallback: employeeNumberFellBack || birthDateFellBack,
  };
}