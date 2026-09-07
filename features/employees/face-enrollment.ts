import { z } from "zod";

/**
 * Face enrollment logic (Phase 10.1 + 10.2) — PURE module.
 *
 * No DB, no browser APIs, no server imports. Only deterministic enrollment
 * rules:
 * - presentation status derivation (NOT_ENROLLED / ACTIVE / REVOKED);
 * - enrollment guard (authorization-relevant employee rules + duplicate
 *   policy);
 * - replacement planning (re-enrollment revokes the old active record);
 * - safe Indonesian messages for every face-enrollment failure reason;
 * - provider result status → failure-reason mapping (Phase 10.2);
 * - safe audit-metadata construction (Phase 10.2).
 *
 * IMPORTANT: this module NEVER fabricates a template, a score, or a
 * "verified" claim. The engine boundary is `lib/attendance/face-recognition.ts`
 * and it reports `not_configured` until an operator enables the engine.
 */

export const FACE_ENROLLMENT_PRESENTATION_STATUSES = [
  "NOT_ENROLLED",
  "ACTIVE",
  "REVOKED",
] as const;
export type FaceEnrollmentPresentationStatus =
  (typeof FACE_ENROLLMENT_PRESENTATION_STATUSES)[number];

export const FACE_ENROLLMENT_DB_STATUS_ACTIVE = "active";
export const FACE_ENROLLMENT_DB_STATUS_REVOKED = "revoked";

export type FaceEnrollmentFailureReason =
  | "employee_unavailable"
  | "already_enrolled"
  | "no_face"
  | "multiple_faces"
  | "poor_quality"
  | "invalid_input"
  | "processing_failed"
  | "provider_not_configured"
  | "permission_denied"
  | "unexpected";

/** Safe Indonesian employee/HR-facing messages (never leak internals). */
export const FACE_ENROLLMENT_MESSAGES: Record<
  FaceEnrollmentFailureReason,
  string
> = {
  employee_unavailable: "Karyawan tidak ditemukan atau tidak tersedia.",
  already_enrolled: "Karyawan sudah memiliki data wajah.",
  no_face: "Wajah tidak terdeteksi. Pastikan wajah terlihat jelas di kamera.",
  multiple_faces:
    "Tidak dapat melakukan enrollment. Pastikan hanya satu wajah terlihat di kamera.",
  poor_quality:
    "Kualitas gambar wajah belum cukup baik. Silakan coba lagi.",
  invalid_input: "Gambar wajah tidak valid. Silakan coba lagi.",
  processing_failed: "Enrollment wajah gagal. Silakan coba lagi.",
  provider_not_configured:
    "Enrollment wajah belum dapat dilakukan. Mesin pengenalan wajah belum dikonfigurasi.",
  permission_denied:
    "Anda tidak memiliki izin untuk melakukan enrollment wajah.",
  unexpected: "Enrollment wajah gagal. Silakan coba lagi.",
};

export function faceEnrollmentMessage(
  reason: FaceEnrollmentFailureReason
): string {
  return FACE_ENROLLMENT_MESSAGES[reason] ?? FACE_ENROLLMENT_MESSAGES.unexpected;
}

const FACE_ENROLLMENT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Strict server-side input schema for enrollment requests. Only `employeeId`
 * and an explicit `reenroll` flag are accepted — client-supplied organization,
 * role, permission, status or "verified" flags are rejected as unknown keys.
 */
export const faceEnrollmentInputSchema = z
  .object({
    employeeId: z
      .string()
      .regex(FACE_ENROLLMENT_UUID_PATTERN, "Identitas karyawan tidak valid."),
    reenroll: z.boolean().optional().default(false),
  })
  .strict();
export type FaceEnrollmentInput = z.infer<typeof faceEnrollmentInputSchema>;

export interface EnrollmentStatusInput {
  /** True when the employee currently has an ACTIVE enrollment. */
  hasActive: boolean;
  /** True when the employee has at least one REVOKED/historical enrollment. */
  hasRevoked: boolean;
}

/**
 * The presentation status is always derived server-side from stored records;
 * the browser can never declare ACTIVE/ENROLLED.
 */
export function deriveFaceEnrollmentStatus(
  input: EnrollmentStatusInput
): FaceEnrollmentPresentationStatus {
  if (input.hasActive) return "ACTIVE";
  if (input.hasRevoked) return "REVOKED";
  return "NOT_ENROLLED";
}

export interface FaceEnrollmentGuardContext {
  /** Employee exists in the actor's organization. */
  employeeExists: boolean;
  /** Employee `employmentStatus` is active. */
  employeeActive: boolean;
  /** Employee already has an ACTIVE face enrollment. */
  hasActiveEnrollment: boolean;
  /** Explicit re-enrollment requested (replaces the old active enrollment). */
  allowReplacement: boolean;
}

export type FaceEnrollmentGuardDecision =
  | { ok: true }
  | { ok: false; reason: FaceEnrollmentFailureReason; message: string };

export function evaluateFaceEnrollmentGuard(
  context: FaceEnrollmentGuardContext
): FaceEnrollmentGuardDecision {
  if (!context.employeeExists || !context.employeeActive) {
    return {
      ok: false,
      reason: "employee_unavailable",
      message: faceEnrollmentMessage("employee_unavailable"),
    };
  }
  if (context.hasActiveEnrollment && !context.allowReplacement) {
    return {
      ok: false,
      reason: "already_enrolled",
      message: faceEnrollmentMessage("already_enrolled"),
    };
  }
  return { ok: true };
}

export type EnrollmentWritePlan =
  | { operation: "create" }
  | { operation: "replace"; revokeExistingActive: true };

/**
 * Controlled replacement policy: an existing ACTIVE enrollment must be
 * revoked before (or atomically with) creating the new ACTIVE one, so two
 * active enrollments can never coexist.
 */
export function planFaceEnrollmentWrite(
  hasActiveEnrollment: boolean
): EnrollmentWritePlan {
  if (hasActiveEnrollment) {
    return { operation: "replace", revokeExistingActive: true };
  }
  return { operation: "create" };
}

/** Deterministic: identical input → identical output. */
export function faceEnrollmentDeterministic(
  statusInput: EnrollmentStatusInput,
  guardContext: FaceEnrollmentGuardContext
): {
  status: FaceEnrollmentPresentationStatus;
  guard: FaceEnrollmentGuardDecision;
  plan: EnrollmentWritePlan;
} {
  return {
    status: deriveFaceEnrollmentStatus(statusInput),
    guard: evaluateFaceEnrollmentGuard(guardContext),
    plan: planFaceEnrollmentWrite(guardContext.hasActiveEnrollment),
  };
}

/* ------------------------------------------------------------------ */
/* Phase 10.2 — provider result mapping and audit metadata            */
/* ------------------------------------------------------------------ */

/**
 * Client captures are downscaled to JPEG; the cap stays below the 1 MB server
 * action body budget with headroom for multipart overhead.
 */
export const FACE_CAPTURE_MAX_BYTES = 900_000;

/**
 * Statuses the face-recognition provider seam can report (Phase 10.2).
 * Kept in the pure module so both the seam (`lib/attendance/face-recognition.ts`)
 * and the server action can share one vocabulary without importing a
 * `server-only` module from tests.
 */
export const FACE_TEMPLATE_RESULT_STATUSES = [
  "not_configured",
  "invalid_input",
  "no_face",
  "multiple_faces",
  "poor_quality",
  "processing_failed",
  "success",
] as const;
export type FaceTemplateResultStatus =
  (typeof FACE_TEMPLATE_RESULT_STATUSES)[number];

/**
 * Map a provider result status to a safe employee-facing failure reason.
 * `success` maps to `null` (no failure). Unknown statuses degrade to
 * `processing_failed` so an unexpected provider value can never slip through
 * as success.
 */
export function mapFaceTemplateResultToFailureReason(
  status: string
): FaceEnrollmentFailureReason | null {
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
    case "processing_failed":
      return "processing_failed";
    default:
      return "processing_failed";
  }
}

/**
 * Safe audit metadata for a face enrollment write. Only scalar identifiers,
 * state transitions and the operation are stored — NEVER an image, embedding,
 * descriptor, or provider response.
 */
export interface FaceEnrollmentAuditMetadataInput {
  employeeId: string;
  employeeNumber?: string | null;
  previousStatus: FaceEnrollmentPresentationStatus;
  newStatus: FaceEnrollmentPresentationStatus;
  operation: "created" | "replaced";
}

export function buildFaceEnrollmentAuditMetadata(
  input: FaceEnrollmentAuditMetadataInput
): Record<string, string> {
  return {
    employeeId: input.employeeId,
    employeeNumber: input.employeeNumber ?? "",
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
    operation: input.operation,
  };
}
