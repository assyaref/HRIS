import { z } from "zod";

/**
 * Face verification logic (Phase 10.3 + 10.4) — PURE module.
 *
 * No DB, no browser APIs, no server-only imports. Only deterministic
 * verification rules:
 * - strict server-side input schema (only `employeeId`; client can never send
 *   an organizationId, a threshold, a `matched` flag, a template, or any
 *   biometric material);
 * - availability guard (active employee + ACTIVE enrollment + vault template);
 * - safe Indonesian messages for every face-verification outcome (including
 *   the Phase 10.4 `rate_limited` outcome);
 * - provider result status → failure-reason mapping;
 * - safe action-result builders (never image/template/embedding/score);
 * - safe audit-metadata construction.
 *
 * IMPORTANT: this module NEVER fabricates a match, a score, or a threshold.
 * The engine boundary is `lib/attendance/face-recognition.ts`; matching uses
 * @vladmandic/human's native similarity and the server-side threshold.
 */

/** Public (browser-safe) failure codes — no biometric detail is exposed. */
export const FACE_VERIFICATION_FAILURE_CODES = [
  "NOT_CONFIGURED",
  "EMPLOYEE_UNAVAILABLE",
  "ENROLLMENT_UNAVAILABLE",
  "VERIFY_UNAVAILABLE",
  "INVALID_INPUT",
  "NO_FACE",
  "MULTIPLE_FACES",
  "POOR_QUALITY",
  "RATE_LIMITED",
  "PROCESSING_FAILED",
] as const;
export type FaceVerificationFailureCode =
  (typeof FACE_VERIFICATION_FAILURE_CODES)[number];

/**
 * Safe employee/HR-facing failure reasons. The browser receives only the
 * mapped Indonesian message + a generic code — never internals.
 */
export type FaceVerificationFailureReason =
  | "employee_unavailable"
  | "no_active_enrollment"
  | "template_unavailable"
  | "provider_not_configured"
  | "no_face"
  | "multiple_faces"
  | "poor_quality"
  | "invalid_input"
  | "rate_limited"
  | "processing_failed"
  | "unexpected";

/** Safe Indonesian employee/HR-facing messages (never leak internals). */
export const FACE_VERIFICATION_MESSAGES: Record<
  FaceVerificationFailureReason,
  string
> = {
  employee_unavailable:
    "Karyawan tidak ditemukan atau tidak tersedia untuk verifikasi.",
  no_active_enrollment:
    "Verifikasi wajah tidak tersedia. Karyawan belum memiliki data wajah aktif.",
  template_unavailable:
    "Verifikasi wajah tidak tersedia saat ini. Silakan hubungi administrator.",
  provider_not_configured:
    "Verifikasi wajah belum dapat dilakukan. Mesin pengenalan wajah belum dikonfigurasi.",
  no_face: "Wajah tidak terdeteksi. Pastikan wajah terlihat jelas di kamera.",
  multiple_faces:
    "Tidak dapat melakukan verifikasi. Pastikan hanya satu wajah terlihat di kamera.",
  poor_quality:
    "Kualitas gambar wajah belum cukup baik. Silakan coba lagi.",
  invalid_input: "Gambar wajah tidak valid. Silakan coba lagi.",
  rate_limited:
    "Terlalu banyak percobaan verifikasi wajah. Silakan coba lagi beberapa saat lagi.",
  processing_failed: "Verifikasi wajah gagal. Silakan coba lagi.",
  unexpected: "Verifikasi wajah gagal. Silakan coba lagi.",
};

/** Success messages (no biometric detail, no score). */
export const FACE_VERIFICATION_SUCCESS_MESSAGES = {
  matched: "Verifikasi wajah berhasil.",
  not_matched: "Wajah tidak cocok dengan data wajah karyawan.",
} as const;

export function faceVerificationMessage(
  reason: FaceVerificationFailureReason
): string {
  return (
    FACE_VERIFICATION_MESSAGES[reason] ??
    FACE_VERIFICATION_MESSAGES.unexpected
  );
}

const FACE_VERIFICATION_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Strict server-side input schema for verification requests. ONLY
 * `employeeId` is accepted. A browser attempting to send `organizationId`,
 * `threshold`, `matched`, `template`, `score`, enrollment status or any other
 * key is rejected as an unknown key (fail closed).
 */
export const faceVerificationInputSchema = z
  .object({
    employeeId: z
      .string()
      .regex(FACE_VERIFICATION_UUID_PATTERN, "Identitas karyawan tidak valid."),
  })
  .strict();
export type FaceVerificationInput = z.infer<
  typeof faceVerificationInputSchema
>;
/* ------------------------------------------------------------------ */
/* Availability guard                                                  */
/* ------------------------------------------------------------------ */

/**
 * The server derives every value below from org-scoped database rows:
 * - `employeeExists` is false for employees of ANOTHER organization, so a
 *   cross-organization employee ID resolves to the same safe response as an
 *   unknown employee (existence never leaks);
 * - `employeeActive` is the employee `employmentStatus === "active"`;
 * - `templateLookup` describes the ACTIVE-enrollment + vault lookup:
 *   `no_active_enrollment` covers both "never enrolled" and "revoked only",
 *   which must produce the SAME safe response; `missing_template` is an
 *   integrity case (ACTIVE row with no vault row) and is treated as
 *   unavailable, never verified.
 */
export interface FaceVerificationGuardContext {
  employeeExists: boolean;
  employeeActive: boolean;
  templateLookup: "available" | "no_active_enrollment" | "missing_template";
}

export type FaceVerificationAvailabilityDecision =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "employee_unavailable"
        | "no_active_enrollment"
        | "template_unavailable";
    };

export function evaluateFaceVerificationGuard(
  context: FaceVerificationGuardContext
): FaceVerificationAvailabilityDecision {
  if (!context.employeeExists || !context.employeeActive) {
    return { ok: false, reason: "employee_unavailable" };
  }
  if (context.templateLookup === "no_active_enrollment") {
    return { ok: false, reason: "no_active_enrollment" };
  }
  if (context.templateLookup === "missing_template") {
    return { ok: false, reason: "template_unavailable" };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Provider result → safe failure mapping                              */
/* ------------------------------------------------------------------ */

/**
 * Statuses the face-verification provider seam can report (Phase 10.3).
 * Kept in the pure module so both the seam and the server action can share
 * one vocabulary without importing a `server-only` module from tests.
 */
export const FACE_VERIFICATION_RESULT_STATUSES = [
  "not_configured",
  "invalid_input",
  "no_face",
  "multiple_faces",
  "poor_quality",
  "template_corrupt",
  "processing_failed",
  "success",
] as const;
export type FaceVerificationResultStatus =
  (typeof FACE_VERIFICATION_RESULT_STATUSES)[number];

/**
 * Map a provider result status to a safe employee-facing failure reason.
 * `success` maps to `null` (the caller then uses the `matched` flag).
 * Unknown statuses degrade to `processing_failed` — an unexpected provider
 * value can never slip through as success.
 */
export function mapFaceVerificationResultStatusToFailure(
  status: string
): FaceVerificationFailureReason | null {
  switch (status) {
    case "success":
      return null;
    case "not_configured":
      return "provider_not_configured";
    case "invalid_input":
      return "invalid_input";
    case "no_face":
      return "no_face";
    case "multiple_faces":
      return "multiple_faces";
    case "poor_quality":
      return "poor_quality";
    case "template_corrupt":
      return "template_unavailable";
    case "processing_failed":
      return "processing_failed";
    default:
      return "processing_failed";
  }
}

/**
 * Public failure code for a given reason. Generic codes are deliberate: they
 * never reveal whether a person is enrolled, revoked, cross-organization,
 * or why a template was unusable.
 */
export function faceVerificationFailureCode(
  reason: FaceVerificationFailureReason
): FaceVerificationFailureCode {
  switch (reason) {
    case "employee_unavailable":
      return "EMPLOYEE_UNAVAILABLE";
    case "no_active_enrollment":
      return "ENROLLMENT_UNAVAILABLE";
    case "template_unavailable":
      return "VERIFY_UNAVAILABLE";
    case "provider_not_configured":
      return "NOT_CONFIGURED";
    case "invalid_input":
      return "INVALID_INPUT";
    case "no_face":
      return "NO_FACE";
    case "multiple_faces":
      return "MULTIPLE_FACES";
    case "poor_quality":
      return "POOR_QUALITY";
    case "rate_limited":
      return "RATE_LIMITED";
    case "processing_failed":
      return "PROCESSING_FAILED";
    case "unexpected":
      return "PROCESSING_FAILED";
  }
}

/* ------------------------------------------------------------------ */
/* Action-result builders (minimal + safe)                             */
/* ------------------------------------------------------------------ */

/**
 * The complete result the browser may see for one verification attempt.
 * There is NO score, NO threshold, NO embedding, NO template, NO provider
 * reference and NO enrollment state beyond the bare matched flag.
 */
export type FaceVerificationActionResult =
  | { ok: true; matched: true; message: string }
  | { ok: true; matched: false; message: string }
  | {
      ok: false;
      matched: false;
      code: FaceVerificationFailureCode;
      message: string;
    };

/** MATCH / NO MATCH success result (server decided; client can not influence). */
export function buildFaceVerificationSuccessResult(
  matched: boolean
): FaceVerificationActionResult {
  return {
    ok: true,
    matched,
    message: matched
      ? FACE_VERIFICATION_SUCCESS_MESSAGES.matched
      : FACE_VERIFICATION_SUCCESS_MESSAGES.not_matched,
  };
}

/** Processing/enrollment/authorization failure result (safe). */
export function buildFaceVerificationFailureResult(
  reason: FaceVerificationFailureReason
): FaceVerificationActionResult {
  return {
    ok: false,
    matched: false,
    code: faceVerificationFailureCode(reason),
    message: faceVerificationMessage(reason),
  };
}

/* ------------------------------------------------------------------ */
/* Safe audit metadata (Phase 10.3)                                    */
/* ------------------------------------------------------------------ */

export type FaceVerificationAuditOutcome =
  | "matched"
  | "not_matched"
  | "unavailable"
  | "failed";

/**
 * Safe audit metadata for a face verification attempt. Only scalar
 * identifiers and an outcome category are stored — NEVER an image, an
 * embedding, a template, ciphertext, or a score.
 */
export interface FaceVerificationAuditMetadataInput {
  employeeId: string;
  employeeNumber?: string | null;
  outcome: FaceVerificationAuditOutcome;
}

export function buildFaceVerificationAuditMetadata(
  input: FaceVerificationAuditMetadataInput
): Record<string, string> {
  return {
    employeeId: input.employeeId,
    employeeNumber: input.employeeNumber ?? "",
    outcome: input.outcome,
  };
}
