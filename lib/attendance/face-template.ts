import { Buffer } from "node:buffer";

/**
 * Pure face-template + matching-semantics helpers (Phase 10.3) — NO I/O.
 *
 * This module is intentionally free of `server-only` so it can be unit-tested
 * with plain `node --test`. It is imported exclusively from server modules and
 * tests; nothing here ever touches a database, the network, or process.env.
 *
 * ---------------------------------------------------------------------------
 * MATCHING SEMANTICS (documented contract — Phase 10.3)
 * ---------------------------------------------------------------------------
 * Engine:            @vladmandic/human 3.3.6, FaceRes description model
 *                    (`human-faceres-v1`). Runtime: tfjs WASM (server-side).
 * Embedding:         one 1024-dimensional float32 vector per detected face.
 * Serialized size:   1024 × 4 bytes = 4096 bytes (little-endian float32).
 * Matching metric:   Human's native `match.distance` (Euclidean order 2) and
 *                    `match.similarity` (normalized from that distance). We do
 *                    NOT invent a formula; the score below is produced by
 *                    Human itself:
 *                      similarity(a, b)  ->  0..1, higher is more similar;
 *                                            1.0 = identical descriptor.
 * Score semantics:   Human's normalization is designed so that a similarity
 *                    above ~0.5 can be considered a match (Human defaults map
 *                    a 0.2..0.8 similarity band to the 0..1 display range).
 * Threshold:         server-side only. Default 0.5 is the Phase 10.3/10.4
 *                    ENGINE BASELINE aligned with Human's documented
 *                    "above 0.5 ≈ match" semantics. It is NOT production
 *                    calibrated and MUST NOT gate attendance enforcement until
 *                    a labelled dataset is evaluated (see
 *                    `docs/face-verification.md` and
 *                    `scripts/face-calibration.mjs`). The operator can
 *                    override it with the server environment variable
 *                    `FACE_VERIFY_THRESHOLD` (0 < value <= 1). An invalid
 *                    configured value fails closed — verification refuses to
 *                    run rather than silently using a weaker threshold.
 * Template version:  `human-faceres-v1`. Stored templates of any other
 *                    provider/version are rejected (never silently compared).
 * ---------------------------------------------------------------------------
 */

/** Engine provider identifier (matches `FACE_PROVIDER=human`). */
export const FACE_PROVIDER_HUMAN = "human";

/** Provider+model version that produced enrolled templates. */
export const FACE_EMBEDDING_VERSION = "human-faceres-v1";

/** Embedding dimensionality produced by the FaceRes description model. */
export const FACE_EMBEDDING_DIMENSIONS = 1024;

/** Serialized plaintext size of one embedding: dims × float32 bytes. */
export const FACE_EMBEDDING_BYTE_LENGTH =
  FACE_EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT;

/** Similarity metric: normalized 0..1, higher is a closer match. */
export const FACE_MATCH_METRIC_SIMILARITY = "similarity";

/** Distance metric: raw Euclidean-derived, lower is a closer match. */
export const FACE_MATCH_METRIC_DISTANCE = "distance";

export type FaceMatchMetric =
  | typeof FACE_MATCH_METRIC_SIMILARITY
  | typeof FACE_MATCH_METRIC_DISTANCE;

/** Server environment variable that overrides the verification threshold. */
export const FACE_VERIFY_THRESHOLD_ENV = "FACE_VERIFY_THRESHOLD";

/**
 * Phase 10.3 baseline threshold (similarity). Rationale:
 * - Human's own similarity normalization targets "> 0.5 ≈ a match";
 * - the default is deliberately NOT tuned as a production attendance
 *   threshold, and this phase does not wire verification into attendance.
 */
export const FACE_VERIFY_DEFAULT_THRESHOLD = 0.5;

/** Allowed similarity-threshold range: (0, 1]. */
export const FACE_VERIFY_THRESHOLD_MIN_EXCLUSIVE = 0;
export const FACE_VERIFY_THRESHOLD_MAX_INCLUSIVE = 1;

/* ---------------------------------------------------------------------- */
/* Decrypted-template validation                                           */
/* ---------------------------------------------------------------------- */

export type FaceTemplateDecodeResult =
  | { ok: true; embedding: Float32Array }
  | { ok: false; reason: "invalid_plaintext_length" | "malformed_embedding" };

/**
 * Decode a decrypted template blob into an embedding, validating:
 * - byte length must be exactly 4096 (1024 × float32);
 * - every value must be finite (reject NaN/Infinity);
 * - the vector must not be degenerate (all zeros) — such a vector can never
 *   be a genuine model output and is rejected instead of silently compared.
 *
 * Values are read little-endian explicitly so templates produced on a
 * little-endian host decode identically on any server.
 */
export function decodeFaceEmbedding(
  plaintext: Uint8Array
): FaceTemplateDecodeResult {
  if (!plaintext || plaintext.byteLength !== FACE_EMBEDDING_BYTE_LENGTH) {
    return { ok: false, reason: "invalid_plaintext_length" };
  }
  const bytes = Buffer.from(
    plaintext.buffer,
    plaintext.byteOffset,
    plaintext.byteLength
  );
  const embedding = new Float32Array(FACE_EMBEDDING_DIMENSIONS);
  let sumOfSquares = 0;
  for (let index = 0; index < FACE_EMBEDDING_DIMENSIONS; index += 1) {
    const value = bytes.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);
    if (!Number.isFinite(value)) {
      return { ok: false, reason: "malformed_embedding" };
    }
    embedding[index] = value;
    sumOfSquares += value * value;
  }
  if (!Number.isFinite(sumOfSquares) || sumOfSquares === 0) {
    return { ok: false, reason: "malformed_embedding" };
  }
  return { ok: true, embedding };
}


/**
 * True when a stored `template_version` is the provider+version this engine
 * can verify. Anything else (a different provider, a different model version,
 * an unknown string) is rejected — a template is never silently used when its
 * semantics are not guaranteed.
 */
export function isSupportedFaceTemplateVersion(
  templateVersion: string,
  expectedTemplateVersion: string = FACE_EMBEDDING_VERSION
): boolean {
  return templateVersion === expectedTemplateVersion;
}

/* ---------------------------------------------------------------------- */
/* Server-side threshold configuration and decision                        */
/* ---------------------------------------------------------------------- */

export type FaceVerificationThresholdResolution =
  | { ok: true; threshold: number; source: "default" | "environment" }
  | { ok: false; error: "threshold_not_configured_correctly" };

/**
 * Resolve the matching threshold from server configuration.
 *
 * - unset/empty  -> `FACE_VERIFY_DEFAULT_THRESHOLD` (source "default");
 * - set to a valid number in (0, 1] -> that value (source "environment");
 * - set to anything else (NaN, <= 0, > 1) -> `ok: false`. Callers fail
 *   closed: verification must not run on an unintended threshold.
 */
export function resolveFaceVerificationThreshold(
  configuredValue: string | undefined,
  defaultValue: number = FACE_VERIFY_DEFAULT_THRESHOLD
): FaceVerificationThresholdResolution {
  const raw = configuredValue?.trim();
  if (raw === undefined || raw === "") {
    return { ok: true, threshold: defaultValue, source: "default" };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: "threshold_not_configured_correctly" };
  }
  if (
    parsed <= FACE_VERIFY_THRESHOLD_MIN_EXCLUSIVE ||
    parsed > FACE_VERIFY_THRESHOLD_MAX_INCLUSIVE
  ) {
    return { ok: false, error: "threshold_not_configured_correctly" };
  }
  return { ok: true, threshold: parsed, source: "environment" };
}

/**
 * Apply the threshold to a native similarity score (higher is better).
 * Returns `true` when the score reaches the configured threshold.
 */
export function faceSimilarityIsMatch(
  score: number,
  threshold: number
): boolean {
  if (!Number.isFinite(score) || !Number.isFinite(threshold)) return false;
  return score >= threshold;
}

/** Apply the threshold to a raw distance (lower is better). Reserved. */
export function faceDistanceIsMatch(
  distance: number,
  threshold: number
): boolean {
  if (!Number.isFinite(distance) || !Number.isFinite(threshold)) return false;
  return distance <= threshold;
}

/**
 * Metric-aware threshold decision. The active metric is "similarity"
 * (Human-native normalized 0..1). Unknown metrics never match.
 */
export function faceScoreIsMatch(
  score: number,
  threshold: number,
  metric: FaceMatchMetric = FACE_MATCH_METRIC_SIMILARITY
): boolean {
  if (metric === FACE_MATCH_METRIC_SIMILARITY) {
    return faceSimilarityIsMatch(score, threshold);
  }
  if (metric === FACE_MATCH_METRIC_DISTANCE) {
    return faceDistanceIsMatch(score, threshold);
  }
  return false;
}
