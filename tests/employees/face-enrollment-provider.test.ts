/**
 * PHASE 10.2 — Face provider mapping + audit-metadata pure tests (node:test).
 *
 * These cover the deterministic boundaries of the provider contract that the
 * server action and seam rely on:
 * - provider result status → safe failure-reason mapping;
 * - safe Indonesian messages for every provider outcome;
 * - audit metadata contains ONLY safe scalars (never image/embedding data).
 *
 * Honest scope: this suite does NOT pretend a real face matched. Real engine
 * inference is exercised by the opt-in script `scripts/face-engine-check.mjs`
 * (requires the operator to configure the engine + model files), not here.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildFaceEnrollmentAuditMetadata,
  faceEnrollmentMessage,
  mapFaceTemplateResultToFailureReason,
} from "../../features/employees/face-enrollment.ts";

describe("mapFaceTemplateResultToFailureReason", () => {
  it("maps success to null (no failure)", () => {
    assert.equal(mapFaceTemplateResultToFailureReason("success"), null);
  });

  it("maps not_configured to a safe provider message", () => {
    assert.equal(
      mapFaceTemplateResultToFailureReason("not_configured"),
      "provider_not_configured"
    );
    assert.match(
      faceEnrollmentMessage(
        mapFaceTemplateResultToFailureReason("not_configured")!
      ),
      /mesin pengenalan wajah belum dikonfigurasi/i
    );
  });

  it("maps invalid input safely", () => {
    assert.equal(
      mapFaceTemplateResultToFailureReason("invalid_input"),
      "invalid_input"
    );
    assert.equal(
      faceEnrollmentMessage("invalid_input"),
      "Gambar wajah tidak valid. Silakan coba lagi."
    );
  });

  it("maps no-face safely", () => {
    assert.equal(mapFaceTemplateResultToFailureReason("no_face"), "no_face");
    assert.match(
      faceEnrollmentMessage(mapFaceTemplateResultToFailureReason("no_face")!),
      /Wajah tidak terdeteksi/i
    );
  });

  it("maps multiple-face safely", () => {
    assert.equal(
      mapFaceTemplateResultToFailureReason("multiple_faces"),
      "multiple_faces"
    );
    assert.match(
      faceEnrollmentMessage(
        mapFaceTemplateResultToFailureReason("multiple_faces")!
      ),
      /hanya satu wajah/i
    );
  });

  it("maps poor quality safely", () => {
    assert.equal(
      mapFaceTemplateResultToFailureReason("poor_quality"),
      "poor_quality"
    );
    assert.match(
      faceEnrollmentMessage(mapFaceTemplateResultToFailureReason("poor_quality")!),
      /Kualitas gambar wajah/i
    );
  });

  it("maps processing failure to the generic safe message", () => {
    assert.equal(
      mapFaceTemplateResultToFailureReason("processing_failed"),
      "processing_failed"
    );
    assert.equal(
      faceEnrollmentMessage("processing_failed"),
      "Enrollment wajah gagal. Silakan coba lagi."
    );
  });

  it("degrades an unknown provider status to processing_failed", () => {
    assert.equal(
      mapFaceTemplateResultToFailureReason("mystery_status"),
      "processing_failed"
    );
  });
});

describe("buildFaceEnrollmentAuditMetadata", () => {
  it("contains only safe scalar keys and never biometric data", () => {
    const metadata = buildFaceEnrollmentAuditMetadata({
      employeeId: "11111111-1111-4111-8111-111111111111",
      employeeNumber: "EMP-001",
      previousStatus: "NOT_ENROLLED",
      newStatus: "ACTIVE",
      operation: "created",
    });
    assert.deepEqual(metadata, {
      employeeId: "11111111-1111-4111-8111-111111111111",
      employeeNumber: "EMP-001",
      previousStatus: "NOT_ENROLLED",
      newStatus: "ACTIVE",
      operation: "created",
    });
    const serialized = JSON.stringify(metadata).toLowerCase();
    for (const forbidden of [
      "image",
      "photo",
      "base64",
      "embedding",
      "descriptor",
      "template",
      "secret",
      "score",
    ]) {
      assert.equal(
        serialized.includes(forbidden),
        false,
        `audit metadata must not contain ${forbidden}`
      );
    }
  });

  it("is deterministic for identical input", () => {
    const input = {
      employeeId: "11111111-1111-4111-8111-111111111111",
      employeeNumber: "EMP-001",
      previousStatus: "ACTIVE" as const,
      newStatus: "ACTIVE" as const,
      operation: "replaced" as const,
    };
    assert.deepEqual(
      buildFaceEnrollmentAuditMetadata(input),
      buildFaceEnrollmentAuditMetadata(input)
    );
  });
});
