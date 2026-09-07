/**
 * PHASE 10.3 — Face verification pure-logic tests (node:test).
 *
 * Exercises the PURE verification module
 * (`features/employees/face-verification.ts`) plus the server-authority
 * boundaries that cannot depend on a live engine or database:
 * - strict input schema (the client can NEVER send organizationId, threshold,
 *   matched, template, score, or enrollment state);
 * - availability guard (missing enrollment / revoked-only / missing vault
 *   template / inactive employee / cross-organization employee all resolve to
 *   safe, non-leaking responses);
 * - provider status → safe Indonesian message mapping;
 * - minimal safe action-result shapes (no template/embedding/score anywhere);
 * - safe audit metadata.
 *
 * Honest scope (mirrors Phase 10.2): real @vladmandic/human inference for
 * successful/non-matching/no-face/multiple-face verification lives in the
 * opt-in script `scripts/face-verification-check.mjs`; authorization
 * (`requireUser`/`requirePermission`) is enforced in the server action by the
 * existing RBAC layer (server-only, org-scoped) — the pure suite covers the
 * deterministic rules those layers rely on.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildFaceVerificationAuditMetadata,
  buildFaceVerificationFailureResult,
  buildFaceVerificationSuccessResult,
  evaluateFaceVerificationGuard,
  FACE_VERIFICATION_FAILURE_CODES,
  faceVerificationFailureCode,
  faceVerificationInputSchema,
  faceVerificationMessage,
  mapFaceVerificationResultStatusToFailure,
  type FaceVerificationActionResult,
} from "../../features/employees/face-verification.ts";

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";

describe("faceVerificationInputSchema (server authority)", () => {
  it("accepts a valid employee ID only", () => {
    const parsed = faceVerificationInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects a malformed employee ID", () => {
    const parsed = faceVerificationInputSchema.safeParse({
      employeeId: "not-a-uuid",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a missing employee ID", () => {
    assert.equal(faceVerificationInputSchema.safeParse({}).success, false);
  });

  it("rejects client-supplied organizationId (org is session-derived)", () => {
    const parsed = faceVerificationInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
      organizationId: "22222222-2222-4222-8222-222222222222",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a client-controlled threshold", () => {
    const parsed = faceVerificationInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
      threshold: 0.1,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects client-controlled matched/result flags", () => {
    for (const extra of [
      { matched: true },
      { result: "MATCH" },
      { verified: true },
      { score: 0.99 },
    ]) {
      const parsed = faceVerificationInputSchema.safeParse({
        employeeId: EMPLOYEE_A,
        ...extra,
      });
      assert.equal(
        parsed.success,
        false,
        `expected schema to reject ${JSON.stringify(extra)}`
      );
    }
  });


describe("evaluateFaceVerificationGuard (state rules)", () => {
  it("allows verification for an active employee with an ACTIVE template", () => {
    assert.deepEqual(
      evaluateFaceVerificationGuard({
        employeeExists: true,
        employeeActive: true,
        templateLookup: "available",
      }),
      { ok: true }
    );
  });

  it("blocks a missing enrollment (never enrolled)", () => {
    assert.deepEqual(
      evaluateFaceVerificationGuard({
        employeeExists: true,
        employeeActive: true,
        templateLookup: "no_active_enrollment",
      }),
      { ok: false, reason: "no_active_enrollment" }
    );
  });

  it("blocks a revoked-only enrollment with the SAME reason as never enrolled", () => {
    // Step 5: NO_ENROLLMENT and REVOKED_ONLY must produce the same safe
    // response; the browser must not be able to distinguish them.
    const revokedOnly = evaluateFaceVerificationGuard({
      employeeExists: true,
      employeeActive: true,
      templateLookup: "no_active_enrollment",
    });
    const neverEnrolled = evaluateFaceVerificationGuard({
      employeeExists: true,
      employeeActive: true,
      templateLookup: "no_active_enrollment",
    });
    assert.deepEqual(revokedOnly, neverEnrolled);
    assert.deepEqual(revokedOnly, {
      ok: false,
      reason: "no_active_enrollment",
    });
    assert.equal(
      faceVerificationMessage(
        revokedOnly.ok ? "unexpected" : revokedOnly.reason
      ),
      faceVerificationMessage(
        neverEnrolled.ok ? "unexpected" : neverEnrolled.reason
      )
    );
    assert.match(
      faceVerificationMessage(
        revokedOnly.ok ? "unexpected" : revokedOnly.reason
      ),
      /data wajah aktif/i
    );
  });

  it("blocks an ACTIVE row whose vault template is missing", () => {
    assert.deepEqual(
      evaluateFaceVerificationGuard({
        employeeExists: true,
        employeeActive: true,
        templateLookup: "missing_template",
      }),
      { ok: false, reason: "template_unavailable" }
    );
  });

  it("blocks an inactive employee (generic, existence hidden)", () => {
    const decision = evaluateFaceVerificationGuard({
      employeeExists: true,
      employeeActive: false,
      templateLookup: "available",
    });
    assert.deepEqual(decision, {
      ok: false,
      reason: "employee_unavailable",
    });
    assert.match(
      faceVerificationMessage(decision.ok ? "unexpected" : decision.reason),
      /Karyawan tidak ditemukan atau tidak tersedia/i
    );
  });

  it("blocks a cross-organization employee exactly like an unknown employee", () => {
    // In the server action a cross-org lookup resolves employeeExists=false,
    // so the response is byte-identical to "employee does not exist" — org
    // membership can never be probed through this action.
    const crossOrg = evaluateFaceVerificationGuard({
      employeeExists: false,
      employeeActive: false,
      templateLookup: "available",
    });
    const unknown = evaluateFaceVerificationGuard({
      employeeExists: false,
      employeeActive: false,
      templateLookup: "available",
    });
    assert.deepEqual(crossOrg, unknown);
    assert.deepEqual(crossOrg, {
      ok: false,
      reason: "employee_unavailable",
    });

describe("mapFaceVerificationResultStatusToFailure (provider mapping)", () => {
  it("maps success to null (caller uses the matched flag)", () => {
    assert.equal(mapFaceVerificationResultStatusToFailure("success"), null);
  });

  it("maps processing statuses to safe Indonesian messages", () => {
    assert.equal(
      mapFaceVerificationResultStatusToFailure("no_face"),
      "no_face"
    );
    assert.match(
      faceVerificationMessage(
        mapFaceVerificationResultStatusToFailure("no_face")!
      ),
      /Wajah tidak terdeteksi/i
    );
    assert.equal(
      mapFaceVerificationResultStatusToFailure("multiple_faces"),
      "multiple_faces"
    );
    assert.equal(
      mapFaceVerificationResultStatusToFailure("poor_quality"),
      "poor_quality"
    );
    assert.equal(
      mapFaceVerificationResultStatusToFailure("invalid_input"),
      "invalid_input"
    );
  });

  it("maps not_configured to a safe provider message", () => {
    assert.equal(
      mapFaceVerificationResultStatusToFailure("not_configured"),
      "provider_not_configured"
    );
    assert.match(
      faceVerificationMessage(
        mapFaceVerificationResultStatusToFailure("not_configured")!
      ),
      /belum dikonfigurasi/i
    );
  });

  it("maps template_corrupt to a generic unavailable message", () => {
    assert.equal(
      mapFaceVerificationResultStatusToFailure("template_corrupt"),
      "template_unavailable"
    );
    const message = faceVerificationMessage(
      mapFaceVerificationResultStatusToFailure("template_corrupt")!
    );
    assert.match(message, /tidak tersedia/i);
    // Never reveals WHY the template was unusable (key/length/version/NaN).
    assert.doesNotMatch(
      message.toLowerCase(),
      /enkripsi|panjang|versi|kunci/i
    );
  });

  it("degrades unknown provider statuses to processing_failed", () => {
    assert.equal(
      mapFaceVerificationResultStatusToFailure("mystery_status"),
      "processing_failed"
    );
    assert.equal(
      mapFaceVerificationResultStatusToFailure(""),
      "processing_failed"
    );
  });
});

describe("public failure codes never leak biometric detail", () => {
  it("maps unavailable reasons to generic codes", () => {
    assert.equal(
      faceVerificationFailureCode("no_active_enrollment"),
      "ENROLLMENT_UNAVAILABLE"
    );
    assert.equal(
      faceVerificationFailureCode("template_unavailable"),
      "VERIFY_UNAVAILABLE"
    );
    assert.equal(
      faceVerificationFailureCode("employee_unavailable"),
      "EMPLOYEE_UNAVAILABLE"
    );
    assert.equal(
      faceVerificationFailureCode("provider_not_configured"),
      "NOT_CONFIGURED"
    );
  });

  it("exposes only the documented code set", () => {
    const codes = [
      faceVerificationFailureCode("no_active_enrollment"),
      faceVerificationFailureCode("no_face"),
      faceVerificationFailureCode("processing_failed"),
      faceVerificationFailureCode("unexpected"),
    ];
    for (const code of codes) {

describe("action result shapes (minimal + safe)", () => {
  it("returns a bare matched flag for a successful MATCH", () => {
    const result = buildFaceVerificationSuccessResult(true);
    assert.deepEqual(result, {
      ok: true,
      matched: true,
      message: "Verifikasi wajah berhasil.",
    });
  });

  it("returns a bare not-matched result for a NO MATCH", () => {
    const result = buildFaceVerificationSuccessResult(false);
    assert.deepEqual(result, {
      ok: true,
      matched: false,
      message: "Wajah tidak cocok dengan data wajah karyawan.",
    });
  });

  it("returns a safe failure object for processing failures", () => {
    const result = buildFaceVerificationFailureResult("no_face");
    assert.equal(result.ok, false);
    assert.equal(result.matched, false);
    assert.equal(result.code, "NO_FACE");
    assert.equal(typeof result.message, "string");
  });

  it("never includes score, threshold, embedding, template or provider data", () => {
    const samples: FaceVerificationActionResult[] = [
      buildFaceVerificationSuccessResult(true),
      buildFaceVerificationSuccessResult(false),
      buildFaceVerificationFailureResult("no_face"),
      buildFaceVerificationFailureResult("template_unavailable"),
      buildFaceVerificationFailureResult("processing_failed"),
    ];
    const forbidden = [
      "score",
      "threshold",
      "embedding",
      "descriptor",
      "template",
      "secret",
      "base64",
      "provider",
      "image",
      "encrypted",
    ];
    for (const sample of samples) {
      const serialized = JSON.stringify(sample).toLowerCase();
      for (const word of forbidden) {
        assert.equal(
          serialized.includes(word),
          false,
          `result must not contain ${word}: ${serialized}`
        );
      }
    }
  });

  it("server decision cannot be overridden by a client-supplied flag", () => {
    // The builder is the only place a `matched` value is produced; the input
    // schema (tested above) rejects any client attempt to supply one.
    const serverDecided = buildFaceVerificationSuccessResult(true);
    assert.equal(serverDecided.ok, true);
    assert.equal(serverDecided.matched, true);
    assert.equal("score" in serverDecided, false);
    assert.equal("threshold" in serverDecided, false);
  });
});

describe("buildFaceVerificationAuditMetadata (safe audit)", () => {
  it("contains only safe scalar keys and never biometric data", () => {
    const metadata = buildFaceVerificationAuditMetadata({
      employeeId: EMPLOYEE_A,
      employeeNumber: "EMP-001",
      outcome: "matched",
    });
    assert.deepEqual(metadata, {
      employeeId: EMPLOYEE_A,
      employeeNumber: "EMP-001",
      outcome: "matched",
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
      "threshold",
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
      employeeId: EMPLOYEE_A,
      employeeNumber: "EMP-001",
      outcome: "not_matched" as const,
    };
    assert.deepEqual(
      buildFaceVerificationAuditMetadata(input),
      buildFaceVerificationAuditMetadata(input)
    );
  });
});

      assert.equal(
        (FACE_VERIFICATION_FAILURE_CODES as readonly string[]).includes(code),
        true
      );
    }
  });
});

    assert.match(
      faceVerificationMessage(crossOrg.ok ? "unexpected" : crossOrg.reason),
      /tidak ditemukan/i
    );
  });
});

  it("rejects any template/biometric payload fields", () => {
    const parsed = faceVerificationInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
      providerTemplateRef: "opaque-ref",
      embedding: [1, 2, 3],
      template: "base64...",
    });
    assert.equal(parsed.success, false);
  });
});
