/**
 * PHASE 10.5 — Face liveness / anti-spoof contract tests (node:test).
 *
 * Honest scope: no REAL liveness engine is implemented (Outcome B). These
 * tests verify the pure contract, server-authority rules, safe responses and
 * the independent-signal boundary. Categories "real liveness success" and
 * "real liveness failure" are intentionally NOT testable — no code path in
 * the repository produces a `live` decision, and no test stubs `live = true`
 * and calls that liveness validation.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  areAttendancePresenceSignalsSatisfied,
  faceLivenessInputSchema,
  faceLivenessMessage,
  FACE_LIVENESS_MESSAGES,
  FACE_LIVENESS_RESULT_STATUSES,
  mapFaceLivenessResultStatusToReason,
  type FaceLivenessFailureReason,
} from "../../features/employees/face-liveness.ts";

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";

const FORBIDDEN_BIOMETRIC_TERMS = [
  "score",
  "template",
  "embedding",
  "descriptor",
  "ciphertext",
  "secret",
  "base64",
];

function assertNoBiometricTerms(label: string, serialized: string): void {
  const lower = serialized.toLowerCase();
  for (const term of FORBIDDEN_BIOMETRIC_TERMS) {
    assert.equal(
      lower.includes(term),
      false,
      `${label} must not contain "${term}": ${serialized}`
    );
  }
}

describe("face liveness provider status (Phase 10.5)", () => {
  it("is NOT_CONFIGURED: no real liveness engine is implemented", () => {
    // There is deliberately no `live` producer anywhere in the pure contract.
    // The provider can only report not_configured (mapped to a safe message).
    const reason = mapFaceLivenessResultStatusToReason("not_configured");
    assert.equal(reason, "provider_not_configured");
    const message = faceLivenessMessage(reason ?? "unexpected");
    assert.match(message, /liveness/i);
    assert.match(message, /belum dapat dijalankan/i);
    assertNoBiometricTerms("not_configured message", message);
  });

  it("declares the full documented status vocabulary", () => {
    for (const status of [
      "not_configured",
      "invalid_input",
      "no_face",
      "multiple_faces",
      "poor_quality",
      "insufficient_sequence",
      "processing_failed",
      "success",
    ]) {
      assert.equal(
        (FACE_LIVENESS_RESULT_STATUSES as readonly string[]).includes(status),
        true
      );
    }
  });

  it("maps face/sequence failures to safe Indonesian messages", () => {
    const cases: [string, string][] = [
      ["no_face", "Wajah tidak terdeteksi"],
      ["multiple_faces", "hanya satu wajah"],
      ["poor_quality", "Kualitas gambar wajah"],
      ["invalid_input", "tidak valid"],
      ["insufficient_sequence", "tidak mencukupi"],
      ["processing_failed", "gagal"],
    ];
    for (const [status, expected] of cases) {
      const reason = mapFaceLivenessResultStatusToReason(status);
      assert.equal(typeof reason, "string");
      assert.match(
        faceLivenessMessage(reason as FaceLivenessFailureReason),
        new RegExp(expected, "i")
      );
    }
  });

  it("never maps an unknown status to success", () => {
    assert.equal(mapFaceLivenessResultStatusToReason("success"), null);
    assert.equal(
      mapFaceLivenessResultStatusToReason("mystery_status"),
      "processing_failed"
    );
  });

  it("never fabricates a live=true decision", () => {
    // Every liveness reason/message is inspected: none claims a live person.
    const messages = Object.values(FACE_LIVENESS_MESSAGES) as string[];
    for (const message of messages) {
      assertNoBiometricTerms("liveness message", message);
    }
    for (const status of FACE_LIVENESS_RESULT_STATUSES) {
      const reason = mapFaceLivenessResultStatusToReason(status);
      if (reason) {
        assertNoBiometricTerms(`mapped ${status}`, reason);
      }
    }
  });
});

describe("face liveness input schema (server authority)", () => {
  it("accepts a valid employee id only", () => {
    assert.equal(
      faceLivenessInputSchema.safeParse({ employeeId: EMPLOYEE_A }).success,
      true
    );
  });

  it("rejects a client-supplied live flag", () => {
    const parsed = faceLivenessInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
      live: true,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a client-supplied liveness score", () => {
    const parsed = faceLivenessInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
      livenessScore: 0.99,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a client-supplied challenge / challenge-result / blink claim", () => {
    for (const extra of [
      { challenge: "blink-left-right" },
      { challengeResult: "completed" },
      { blinkDetected: true },
      { turnDetected: true },
      { antiSpoofResult: "real" },
    ]) {
      const parsed = faceLivenessInputSchema.safeParse({
        employeeId: EMPLOYEE_A,
        ...extra,
      });
      assert.equal(
        parsed.success,
        false,
        `expected rejection of ${JSON.stringify(extra)}`
      );
    }
  });

  it("rejects client-controlled identity/org/template fields", () => {
    for (const extra of [
      { organizationId: "22222222-2222-4222-8222-222222222222" },
      { matched: true },
      { score: 0.9 },
      { template: "base64..." },
      { provider: "human" },
    ]) {
      const parsed = faceLivenessInputSchema.safeParse({
        employeeId: EMPLOYEE_A,
        ...extra,
      });
      assert.equal(parsed.success, false);
    }
  });
});

describe("independent-signal boundary", () => {
  it("requires BOTH identity match and liveness pass", () => {
    assert.equal(
      areAttendancePresenceSignalsSatisfied({
        identityMatched: true,
        livenessPassed: true,
      }),
      true
    );
    assert.equal(
      areAttendancePresenceSignalsSatisfied({
        identityMatched: true,
        livenessPassed: false,
      }),
      false
    );
    assert.equal(
      areAttendancePresenceSignalsSatisfied({
        identityMatched: false,
        livenessPassed: true,
      }),
      false
    );
  });

  it("keeps identity and liveness independent (no cross-implication)", () => {
    // A face match alone must NOT imply liveness; a liveness pass alone must
    // NOT confirm identity. The combination rule enforces both signals.
    const identityOnly = {
      identityMatched: true,
      livenessPassed: false,
    };
    const livenessOnly = {
      identityMatched: false,
      livenessPassed: true,
    };
    assert.equal(
      areAttendancePresenceSignalsSatisfied(identityOnly),
      false
    );
    assert.equal(
      areAttendancePresenceSignalsSatisfied(livenessOnly),
      false
    );
  });
});

describe("data-minimization source invariants (Phase 10.5)", () => {
  function readRepoFile(relative: string): string {
    return readFileSync(path.join(process.cwd(), relative), "utf8");
  }

  it("the liveness contract module performs no storage or browser I/O", () => {
    const source = readRepoFile("features/employees/face-liveness.ts");
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "fs.writeFile",
      "createWriteStream",
      "writeFileSync",
      "data:image",
      "URL.createObjectURL",
    ]) {
      assert.equal(
        source.includes(forbidden),
        false,
        `face-liveness.ts must not use ${forbidden}`
      );
    }
  });

  it("reuses the existing verification rate limiter and defines no new one", () => {
    const actionsSource = readRepoFile(
      "features/employees/face-verification.actions.ts"
    );
    assert.match(
      actionsSource,
      /face-verification-rate-limit/
    );
    assert.equal(
      actionsSource.includes("createFaceVerificationRateLimiter"),
      false,
      "server action must use the singleton, not create a new limiter"
    );
    assert.equal(
      actionsSource.includes("new Map<"),
      false,
      "server action must not define its own in-memory limiter"
    );
    const livenessSource = readRepoFile("features/employees/face-liveness.ts");
    assert.equal(
      livenessSource.includes("faceVerificationRateLimiter"),
      false
    );
    assert.equal(
      livenessSource.includes("new Map"),
      false
    );
  });

  it("authentication/authorization live in the existing server action", () => {
    const actionsSource = readRepoFile(
      "features/employees/face-verification.actions.ts"
    );
    assert.match(actionsSource, /await requireUser\(\)/);
    assert.match(actionsSource, /requirePermission\(user\.id/);
  });
});
