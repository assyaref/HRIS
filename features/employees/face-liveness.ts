import { z } from "zod";

/**
 * Face liveness / anti-spoof contract (Phase 10.5) — PURE module.
 *
 * Phase 10.5 status: OUTCOME B — NO real liveness mechanism is implemented.
 *
 * Engine audit result:
 * - The installed @vladmandic/human 3.3.6 package DOES ship two small
 *   single-frame classifiers under `node_modules/@vladmandic/human/models`:
 *     * `antispoof.json/bin` (~0.85 MB) — "fake-face-detection" CNN
 *       (Kaggle: anku420/fake-face-detection), 128×128×3 input, sigmoid
 *       output. Provenance/licence not verifiable offline.
 *     * `liveness.json/bin` (~0.59 MB) — "LivenessNet"
 *       (https://github.com/leokwu/livenessnet), 32×32×3 input, 2-class
 *       softmax. Licence not verifiable offline.
 * - Both are SINGLE-FRAME presentation-attack classifiers. A single-frame
 *   classifier is NOT temporal liveness and provides no defensible evidence
 *   against video replay, masks, deepfakes, or 3D presentation attacks.
 * - No temporal/multi-frame liveness mechanism (validated blink/head-pose
 *   sequence or challenge-response) is available in this engine/runtime.
 *
 * Consequence (mirrors the repository rule "never fabricate a biometric
 * claim"): the liveness provider is NOT_CONFIGURED. Face identity matching
 * and face verification remain completely independent from liveness, and no
 * attendance decision path consumes a liveness signal yet.
 *
 * THIS MODULE ONLY defines the vocabulary, server-authority rules and safe
 * responses for a FUTURE real liveness engine. It never fabricates a
 * `live=true`, a liveness score, a blink, or a challenge result.
 */

export const FACE_LIVENESS_RESULT_STATUSES = [
  "not_configured",
  "invalid_input",
  "no_face",
  "multiple_faces",
  "poor_quality",
  "insufficient_sequence",
  "processing_failed",
  "success",
] as const;
export type FaceLivenessResultStatus =
  (typeof FACE_LIVENESS_RESULT_STATUSES)[number];

export const FACE_LIVENESS_PROVIDER_NOT_CONFIGURED_REASON =
  "face_liveness_not_configured" as const;

/**
 * Safe user-facing reasons. The browser receives only the mapped Indonesian
 * message + a generic status — never internals or raw model output.
 */
export type FaceLivenessFailureReason =
  | "liveness_unavailable"
  | "provider_not_configured"
  | "no_face"
  | "multiple_faces"
  | "poor_quality"
  | "invalid_input"
  | "insufficient_sequence"
  | "processing_failed"
  | "unexpected";

/** Safe Indonesian user-facing messages (never leak internals). */
export const FACE_LIVENESS_MESSAGES: Record<
  FaceLivenessFailureReason,
  string
> = {
  liveness_unavailable:
    "Pemeriksaan kehadiran (liveness) belum tersedia untuk verifikasi wajah.",
  provider_not_configured:
    "Pemeriksaan kehadiran (liveness) belum dapat dijalankan karena belum dikonfigurasi.",
  no_face: "Wajah tidak terdeteksi. Pastikan wajah terlihat jelas di kamera.",
  multiple_faces:
    "Tidak dapat melakukan pemeriksaan. Pastikan hanya satu wajah terlihat di kamera.",
  poor_quality:
    "Kualitas gambar wajah belum cukup baik. Silakan coba lagi.",
  invalid_input: "Masukan wajah tidak valid. Silakan coba lagi.",
  insufficient_sequence:
    "Urutan gambar tidak mencukupi untuk pemeriksaan kehadiran. Silakan coba lagi.",
  processing_failed:
    "Pemeriksaan kehadiran (liveness) gagal. Silakan coba lagi.",
  unexpected:
    "Pemeriksaan kehadiran (liveness) gagal. Silakan coba lagi.",
};

export function faceLivenessMessage(
  reason: FaceLivenessFailureReason
): string {
  return (
    FACE_LIVENESS_MESSAGES[reason] ?? FACE_LIVENESS_MESSAGES.unexpected
  );
}

/**
 * Map a liveness provider status to a safe user-facing reason. `success`
 * maps to `null` (the caller uses the provider `live` flag). An unknown
 * status can never slip through as success — it degrades to
 * `processing_failed`.
 */
export function mapFaceLivenessResultStatusToReason(
  status: string
): FaceLivenessFailureReason | null {
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
    case "insufficient_sequence":
      return "insufficient_sequence";
    case "processing_failed":
      return "processing_failed";
    default:
      return "processing_failed";
  }
}

const FACE_LIVENESS_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Strict server-side input schema for a FUTURE liveness request. ONLY the
 * employee id is accepted here; the raw frames travel separately as transient
 * FormData uploads. A browser attempting to send `live`, `livenessScore`,
 * `challenge`, `challengeResult`, `blinkDetected`, `organizationId`,
 * `matched` or any other key is rejected (fail closed).
 */
export const faceLivenessInputSchema = z
  .object({
    employeeId: z
      .string()
      .regex(FACE_LIVENESS_UUID_PATTERN, "Identitas karyawan tidak valid."),
  })
  .strict();
export type FaceLivenessInput = z.infer<typeof faceLivenessInputSchema>;

/* ------------------------------------------------------------------ */
/* Independent-signal boundary (Phase 10.5)                            */
/* ------------------------------------------------------------------ */

/**
 * Phase 10.5 boundary: identity matching and liveness are INDEPENDENT signals.
 *
 * A future attendance decision must require, at minimum:
 *
 *   IDENTITY_MATCH  AND  LIVENESS_PASS  AND  GEOFENCE_PASS
 *
 * Face identity matching MUST NOT imply "the person is live", and a liveness
 * pass MUST NOT confirm identity. This module only models the combination
 * rule; it does not run any of the signals.
 */
export interface FacePresenceSignals {
  /** Result of server-side face identity verification (Phase 10.3). */
  identityMatched: boolean;
  /** Result of a REAL liveness engine (Phase 10.5+; currently NOT_CONFIGURED). */
  livenessPassed: boolean;
}

/**
 * True only when BOTH independent signals pass. Documented for the future
 * attendance chain; nothing in this phase invokes it and no attendance code
 * consumes it.
 */
export function areAttendancePresenceSignalsSatisfied(
  signals: FacePresenceSignals
): boolean {
  return signals.identityMatched && signals.livenessPassed;
}
