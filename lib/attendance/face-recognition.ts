import "server-only";

import { randomUUID } from "node:crypto";

import {
  FACE_EMBEDDING_VERSION,
  processFaceEnrollmentCapture,
  processFaceVerificationCapture,
  resolveFaceEngineConfig,
  type FaceEngineFailureCode,
} from "./face-engine";
import {
  decryptTemplateSecret,
  encryptTemplateSecret,
  isTemplateEncryptionConfigured,
  FACE_TEMPLATE_KEY_ENV,
} from "./template-cipher";
import {
  decodeFaceEmbedding,
  faceScoreIsMatch,
  isSupportedFaceTemplateVersion,
  resolveFaceVerificationThreshold,
  FACE_MATCH_METRIC_SIMILARITY,
  FACE_VERIFY_THRESHOLD_ENV,
} from "./face-template";

/**
 * Face recognition engine boundary (Phase 10.1 + 10.2 + 10.3) — server-only
 * seam. This is the SINGLE integration point between the application and the
 * face engine.
 *
 * - Phase 10.2: @vladmandic/human on the tfjs WASM backend + encrypted
 *   enrollment templates (AES-256-GCM at rest).
 * - Phase 10.3: server-authoritative VERIFICATION against an ACTIVE enrolled
 *   template using Human's native matching + a server-only threshold.
 *
 * The engine is opt-in: unless an operator sets `FACE_PROVIDER=human` (plus a
 * reachable model folder and an at-rest template key) this seam reports
 * `not_configured` and the enrollment/verification flows behave safely.
 *
 * Rules:
 * - Never fabricate a template/embedding/score or a "verified" claim.
 * - The JPEG capture is transient, in-memory only, and never logged/persisted.
 * - The raw embedding never crosses this module's return contract: it is
 *   encrypted (AES-256-GCM) and returned only as an opaque secret blob plus an
 *   opaque template reference.
 * - Verification results never include the score, threshold, template,
 *   embedding or provider reference for browser-visible paths.
 * - The server remains the only authority for enrollment AND verification
 *   decisions.
 */

export type FaceTemplateResult =
  | { status: "not_configured"; reason: "face_recognition_not_configured" }
  | { status: "invalid_input" }
  | { status: "no_face" }
  | { status: "multiple_faces" }
  | { status: "poor_quality" }
  | { status: "processing_failed" }
  | {
      status: "success";
      providerTemplateRef: string;
      /** Encrypted template payload (nonce || ciphertext || tag). */
      templateSecret: Buffer;
      templateVersion: string;
    };

export interface CreateFaceTemplateInput {
  employeeId: string;
  organizationId: string;
  /** Transient JPEG bytes captured by the client and decoded server-side. */
  imageBuffer: Buffer;
  mimeType: string;
}

/** Whether the recognition engine + encryption key are ready for enrollment. */
export function isFaceRecognitionConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const engine = resolveFaceEngineConfig(env);
  return engine.configured && isTemplateEncryptionConfigured(env);
}

function toResultStatus(
  engineCode: FaceEngineFailureCode
): FaceTemplateResult {
  switch (engineCode) {
    case "not_configured":
      return {
        status: "not_configured",
        reason: "face_recognition_not_configured",
      };
    case "invalid_input":
      return { status: "invalid_input" };
    case "no_face":
      return { status: "no_face" };
    case "multiple_faces":
      return { status: "multiple_faces" };
    case "poor_quality":
      return { status: "poor_quality" };
    case "processing_failed":
      return { status: "processing_failed" };
    default:
      return { status: "processing_failed" };
  }
}

/**
 * Generate a template for an enrollment capture.
 *
 * Flow: transient JPEG → @vladmandic/human (face detection + 1024-d
 * embedding) → encrypt embedding → opaque provider reference. When the engine
 * is not configured this returns `not_configured` and no enrollment is
 * written.
 */
export async function createFaceTemplateFromEnrollmentCapture(
  input: CreateFaceTemplateInput
): Promise<FaceTemplateResult> {
  const engineReady = isFaceRecognitionConfigured();
  if (!engineReady) {
    return {
      status: "not_configured",
      reason: "face_recognition_not_configured",
    };
  }

  if (!input.imageBuffer || input.imageBuffer.length === 0) {
    return { status: "invalid_input" };
  }

  const engineOutcome = await processFaceEnrollmentCapture(
    input.imageBuffer,
    input.mimeType
  );
  if (!engineOutcome.ok) {
    return toResultStatus(engineOutcome.code);
  }

  const keyBase64 = process.env[FACE_TEMPLATE_KEY_ENV] ?? "";
  // Serialize the float embedding (little-endian float32) then encrypt.
  const plaintext = new Float32Array(engineOutcome.embedding);
  const plaintextBytes = new Uint8Array(plaintext.buffer);
  const templateSecret = encryptTemplateSecret(plaintextBytes, keyBase64);

  return {
    status: "success",
    providerTemplateRef: randomUUID(),
    templateSecret,
    templateVersion: engineOutcome.templateVersion ?? FACE_EMBEDDING_VERSION,
  };
}
/* ------------------------------------------------------------------ */
/* Phase 10.3 — face verification                                      */
/* ------------------------------------------------------------------ */

export type FaceVerificationResult =
  | { status: "not_configured"; reason: "face_recognition_not_configured" }
  | { status: "invalid_input" }
  | { status: "no_face" }
  | { status: "multiple_faces" }
  | { status: "poor_quality" }
  | { status: "template_corrupt" }
  | { status: "processing_failed" }
  | {
      status: "success";
      /** Server-side decision at the configured threshold. */
      matched: boolean;
      /**
       * Engine-native similarity (0..1) — server diagnostics only. The seam
       * NEVER returns this in an action result to the browser.
       */
      score: number;
      metric: "similarity";
      provider: "human";
      templateVersion: string;
    };

export interface VerifyFaceAgainstTemplateInput {
  /** Transient JPEG bytes captured by the client and decoded server-side. */
  imageBuffer: Buffer;
  mimeType: string;
  /** Stored `face_enrollment_templates.template_version` (DB row). */
  templateVersion: string;
  /** Encrypted template payload: nonce(12) || ciphertext || authTag(16). */
  encryptedTemplate: Uint8Array;
}

function toVerificationResultStatus(
  engineCode: FaceEngineFailureCode
): FaceVerificationResult {
  switch (engineCode) {
    case "not_configured":
      return {
        status: "not_configured",
        reason: "face_recognition_not_configured",
      };
    case "invalid_input":
      return { status: "invalid_input" };
    case "no_face":
      return { status: "no_face" };
    case "multiple_faces":
      return { status: "multiple_faces" };
    case "poor_quality":
      return { status: "poor_quality" };
    case "processing_failed":
      return { status: "processing_failed" };
    default:
      return { status: "processing_failed" };
  }
}

/**
 * Server-authoritative face verification (Phase 10.3).
 *
 * Contract (the browser provides ONLY a transient JPEG + a strict input that
 * identifies the employee):
 *   1. engine + encryption key configured, otherwise `not_configured`;
 *   2. stored template version must be exactly `human-faceres-v1` (provider
 *      and model-version validation) — anything else is `template_corrupt`;
 *   3. decrypt the stored AES-256-GCM secret with the server-only key; wrong
 *      key / tampered ciphertext / malformed secret -> `template_corrupt`;
 *   4. decoded plaintext must be exactly 4096 bytes = 1024 × float32 with
 *      finite, non-degenerate values, otherwise `template_corrupt`;
 *   5. process the transient capture (exactly one face) and compare with the
 *      reference embedding using Human's native matching functions;
 *   6. apply the SERVER threshold (`FACE_VERIFY_THRESHOLD`, default 0.5) and
 *      return `matched`. The score never leaves this module's contract for a
 *      browser-visible result.
 *
 * No plaintext template, embedding, ciphertext or provider reference is ever
 * returned by this function.
 */
export async function verifyFaceAgainstTemplate(
  input: VerifyFaceAgainstTemplateInput
): Promise<FaceVerificationResult> {
  const engineReady = isFaceRecognitionConfigured();
  if (!engineReady) {
    return {
      status: "not_configured",
      reason: "face_recognition_not_configured",
    };
  }
  if (!input.imageBuffer || input.imageBuffer.length === 0) {
    return { status: "invalid_input" };
  }

  // Provider/version validation: an ACTIVE enrollment written by this engine
  // always stores `human-faceres-v1`. Anything else is never silently used.
  if (
    !isSupportedFaceTemplateVersion(
      input.templateVersion,
      FACE_EMBEDDING_VERSION
    )
  ) {
    return { status: "template_corrupt" };
  }

  const keyBase64 = process.env[FACE_TEMPLATE_KEY_ENV] ?? "";
  let plaintext: Buffer;
  try {
    plaintext = decryptTemplateSecret(input.encryptedTemplate, keyBase64);
  } catch {
    // Wrong key, tampered ciphertext, malformed blob — same safe outcome.
    return { status: "template_corrupt" };
  }
  const decoded = decodeFaceEmbedding(plaintext);
  if (!decoded.ok) {
    return { status: "template_corrupt" };
  }

  // Threshold is resolved here from server configuration ONLY — never from
  // the client. An invalid configured threshold fails closed.
  const thresholdResolution = resolveFaceVerificationThreshold(
    process.env[FACE_VERIFY_THRESHOLD_ENV]
  );
  if (!thresholdResolution.ok) {
    return { status: "processing_failed" };
  }

  const engineOutcome = await processFaceVerificationCapture(
    input.imageBuffer,
    input.mimeType,
    decoded.embedding
  );
  if (!engineOutcome.ok) {
    return toVerificationResultStatus(engineOutcome.code);
  }

  const matched = faceScoreIsMatch(
    engineOutcome.score,
    thresholdResolution.threshold,
    FACE_MATCH_METRIC_SIMILARITY
  );

  return {
    status: "success",
    matched,
    score: engineOutcome.score,
    metric: FACE_MATCH_METRIC_SIMILARITY,
    provider: "human",
    templateVersion: engineOutcome.templateVersion,
  };
}
/* ------------------------------------------------------------------ */
/* Phase 10.5 — liveness / anti-spoof provider seam                    */
/* ------------------------------------------------------------------ */

export type FaceLivenessResult =
  | {
      status: "not_configured";
      reason: "face_liveness_not_configured";
    }
  | { status: "invalid_input" }
  | { status: "no_face" }
  | { status: "multiple_faces" }
  | { status: "poor_quality" }
  | { status: "insufficient_sequence" }
  | { status: "processing_failed" }
  | {
      status: "success";
      /** Server decision from a REAL liveness engine — never fabricated. */
      live: boolean;
      provider: string;
      version: string;
      method: string;
    };

export interface AssessFaceLivenessInput {
  /**
   * Transient JPEG frames (memory-only) for a FUTURE temporal/challenge
   * liveness engine. Currently unused because no real mechanism is wired.
   */
  frames: Buffer[];
  mimeType: string;
}

/**
 * Whether a validated liveness provider is configured.
 *
 * Phase 10.5 status: FALSE — no real liveness/anti-spoof mechanism is
 * implemented. The bundled @vladmandic/human `antispoof`/`liveness` models are
 * single-frame presentation-attack classifiers with unverifiable provenance
 * and no temporal/challenge evidence; per the repository rule "never fabricate
 * a biometric claim" they are deliberately NOT wired as liveness. This seam is
 * the single future integration point for a real provider.
 */
export function isFaceLivenessConfigured(): boolean {
  return false;
}

/**
 * Server-authoritative liveness assessment (Phase 10.5).
 *
 * Always returns `not_configured` until a REAL, validated liveness engine is
 * integrated through this seam. The input frames are never inspected or
 * persisted; the function never returns a fabricated `live` value.
 */
export async function assessFaceLiveness(
  _input: AssessFaceLivenessInput
): Promise<FaceLivenessResult> {
  void _input;
  return {
    status: "not_configured",
    reason: "face_liveness_not_configured",
  };
}
