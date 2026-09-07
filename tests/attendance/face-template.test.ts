/**
 * PHASE 10.3 — Face template + matching-semantics tests (node:test).
 *
 * Covers the PURE engine-agnostic layer (`lib/attendance/face-template.ts`)
 * that the server seam uses for:
 * - decrypted-template validation (version, byte length, dimensions, NaN,
 *   degenerate vectors);
 * - server threshold configuration + application;
 * - matching semantics (Human-native similarity, higher is better).
 *
 * Honest scope: this suite does NOT run the engine. Real @vladmandic/human
 * inference + native `match.similarity` against real face fixtures is
 * exercised by the opt-in script `scripts/face-verification-check.mjs`
 * (`npm run test:face-verification`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decryptTemplateSecret,
  encryptTemplateSecret,
} from "../../lib/attendance/template-cipher.ts";
import {
  decodeFaceEmbedding,
  faceDistanceIsMatch,
  faceScoreIsMatch,
  faceSimilarityIsMatch,
  FACE_EMBEDDING_BYTE_LENGTH,
  FACE_EMBEDDING_DIMENSIONS,
  FACE_EMBEDDING_VERSION,
  FACE_MATCH_METRIC_DISTANCE,
  FACE_MATCH_METRIC_SIMILARITY,
  FACE_VERIFY_DEFAULT_THRESHOLD,
  FACE_VERIFY_THRESHOLD_ENV,
  isSupportedFaceTemplateVersion,
  resolveFaceVerificationThreshold,
  type FaceMatchMetric,
} from "../../lib/attendance/face-template.ts";

const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

function serializeEmbedding(values: number[]): Uint8Array {
  const floats = new Float32Array(values);
  return new Uint8Array(floats.buffer);
}

function validEmbeddingValues(): number[] {
  const values = new Array<number>(FACE_EMBEDDING_DIMENSIONS).fill(0);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.sin(index + 1);
  }
  return values;
}

describe("FACE_EMBEDDING_VERSION contract", () => {
  it("is the Phase 10.3 provider version string", () => {
    assert.equal(FACE_EMBEDDING_VERSION, "human-faceres-v1");
  });

  it("documents the serialized plaintext size (1024 × float32 = 4096 bytes)", () => {
    assert.equal(FACE_EMBEDDING_DIMENSIONS, 1024);
    assert.equal(FACE_EMBEDDING_BYTE_LENGTH, 4096);
  });
});

describe("isSupportedFaceTemplateVersion", () => {
  it("accepts the engine template version", () => {
    assert.equal(isSupportedFaceTemplateVersion("human-faceres-v1"), true);
  });

  it("rejects a different provider version", () => {
    assert.equal(isSupportedFaceTemplateVersion("vendor-faceres-v3"), false);
  });

  it("rejects a different template version of the same provider", () => {
    assert.equal(isSupportedFaceTemplateVersion("human-faceres-v2"), false);
    assert.equal(isSupportedFaceTemplateVersion(""), false);
  });
});

describe("decodeFaceEmbedding", () => {
  it("decodes a genuine encrypted 1024-d round-trip", () => {
    const values = validEmbeddingValues();
    const secret = encryptTemplateSecret(serializeEmbedding(values), VALID_KEY);
    const plaintext = decryptTemplateSecret(secret, VALID_KEY);
    const decoded = decodeFaceEmbedding(plaintext);
    assert.equal(decoded.ok, true);
    if (!decoded.ok) return;
    assert.equal(decoded.embedding.length, FACE_EMBEDDING_DIMENSIONS);
    const restored = Array.from(decoded.embedding);
    // The template stores float32; compare against the quantized expectation.
    const expected = Array.from(new Float32Array(values));
    assert.deepEqual(restored, expected);
  });

  it("rejects a wrong-length plaintext (invalid template length)", () => {
    const short = new Uint8Array(FACE_EMBEDDING_BYTE_LENGTH - 1);
    const long = new Uint8Array(FACE_EMBEDDING_BYTE_LENGTH + 1);
    assert.deepEqual(decodeFaceEmbedding(short), {
      ok: false,
      reason: "invalid_plaintext_length",
    });
    assert.deepEqual(decodeFaceEmbedding(long), {
      ok: false,
      reason: "invalid_plaintext_length",
    });
    assert.deepEqual(decodeFaceEmbedding(new Uint8Array(0)), {
      ok: false,
      reason: "invalid_plaintext_length",
    });
  });

  it("rejects NaN payloads (malformed embedding)", () => {
    const values = validEmbeddingValues();
    values[0] = Number.NaN;
    const decoded = decodeFaceEmbedding(serializeEmbedding(values));
    assert.deepEqual(decoded, {
      ok: false,
      reason: "malformed_embedding",
    });
  });

  it("rejects an all-zero (degenerate) embedding", () => {
    const decoded = decodeFaceEmbedding(
      serializeEmbedding(new Array<number>(FACE_EMBEDDING_DIMENSIONS).fill(0))
    );
    assert.deepEqual(decoded, {
      ok: false,
      reason: "malformed_embedding",
    });
  });
});

describe("decryption failure boundaries (wrong key / corrupt ciphertext)", () => {
  it("rejects a template decrypted with the wrong key", () => {
    const values = validEmbeddingValues();
    const secret = encryptTemplateSecret(serializeEmbedding(values), VALID_KEY);
    const wrongKey = Buffer.alloc(32, 9).toString("base64");
    assert.throws(() => decryptTemplateSecret(secret, wrongKey));
  });

  it("rejects a corrupted encrypted template via the GCM auth tag", () => {
    const values = validEmbeddingValues();
    const secret = new Uint8Array(
      encryptTemplateSecret(serializeEmbedding(values), VALID_KEY)
    );
    secret[secret.length - 1] ^= 0xff;
    assert.throws(() => decryptTemplateSecret(secret, VALID_KEY));
  });
});

describe("resolveFaceVerificationThreshold", () => {
  it("defaults to 0.5 when the environment variable is unset", () => {
    const resolved = resolveFaceVerificationThreshold(undefined);
    assert.deepEqual(resolved, {
      ok: true,
      threshold: FACE_VERIFY_DEFAULT_THRESHOLD,
      source: "default",
    });
    assert.deepEqual(resolveFaceVerificationThreshold("  "), resolved);
  });

  it("accepts a valid environment override", () => {
    assert.deepEqual(resolveFaceVerificationThreshold("0.6"), {
      ok: true,
      threshold: 0.6,
      source: "environment",
    });
    assert.deepEqual(resolveFaceVerificationThreshold("1"), {
      ok: true,
      threshold: 1,
      source: "environment",
    });
  });

  it("fails closed on invalid configured values (never weakens silently)", () => {
    for (const bad of ["0", "-0.1", "1.5", "NaN", "abc", "0.5.5"]) {
      assert.deepEqual(resolveFaceVerificationThreshold(bad), {
        ok: false,
        error: "threshold_not_configured_correctly",
      });
    }
  });

  it("is documented as the FACE_VERIFY_THRESHOLD environment variable", () => {
    assert.equal(FACE_VERIFY_THRESHOLD_ENV, "FACE_VERIFY_THRESHOLD");
  });
});

describe("threshold behavior", () => {
  it("matches when similarity reaches the threshold (>=)", () => {
    assert.equal(faceSimilarityIsMatch(0.6, 0.5), true);
    assert.equal(faceSimilarityIsMatch(0.5, 0.5), true);
    assert.equal(faceSimilarityIsMatch(1, 0.5), true);
  });

  it("does not match below the similarity threshold", () => {
    assert.equal(faceSimilarityIsMatch(0.49, 0.5), false);
    assert.equal(faceSimilarityIsMatch(0, 0.5), false);
  });

  it("never matches a non-finite score", () => {
    assert.equal(faceSimilarityIsMatch(Number.NaN, 0.5), false);
    assert.equal(faceSimilarityIsMatch(Number.POSITIVE_INFINITY, 0.5), false);
  });

  it("honours the reserved distance metric (lower is closer)", () => {
    assert.equal(faceDistanceIsMatch(0.3, 0.5), true);
    assert.equal(faceDistanceIsMatch(0.6, 0.5), false);
    assert.equal(faceDistanceIsMatch(Number.NaN, 0.5), false);
  });

  it("routes metrics through faceScoreIsMatch and rejects unknown metrics", () => {
    assert.equal(
      faceScoreIsMatch(0.7, 0.5, FACE_MATCH_METRIC_SIMILARITY),
      true
    );
    assert.equal(
      faceScoreIsMatch(0.3, 0.5, FACE_MATCH_METRIC_DISTANCE),
      true
    );
    assert.equal(
      faceScoreIsMatch(0.7, 0.5, "unknown_metric" as FaceMatchMetric),
      false
    );
  });
});
