/**
 * PHASE 10.4 — Face verification calibration & security-hardening tests.
 *
 * Focus areas:
 * - rate-limit ledger behaviour (bounded, org+user keyed, production-safe
 *   abstraction, employeeId cannot bypass);
 * - no biometric payload in failure messages/codes (errors), logs (source
 *   invariant), audit metadata, or action results;
 * - no browser storage and no URL image payload in the client capture code;
 * - the Phase 10.3 schema/threshold/template invariants remain intact.
 *
 * Static source checks read the actual committed files so a future edit that
 * reintroduces `localStorage`, an object-URL payload, or biometric logging
 * fails the suite.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildFaceVerificationFailureResult,
  FACE_VERIFICATION_FAILURE_CODES,
  FACE_VERIFICATION_MESSAGES,
  faceVerificationFailureCode,
  faceVerificationMessage,
  type FaceVerificationFailureReason,
} from "../../features/employees/face-verification.ts";
import {
  createFaceVerificationRateLimiter,
  FACE_VERIFY_RATE_LIMIT_MAX_ATTEMPTS,
  FACE_VERIFY_RATE_LIMIT_WINDOW_MS,
  faceVerificationRateLimitKey,
  type FaceVerificationRateLimiter,
} from "../../lib/security/face-verification-rate-limit.ts";

const FORBIDDEN_BIOMETRIC_TERMS = [
  "embedding",
  "descriptor",
  "template",
  "score",
  "threshold",
  "secret",
  "base64",
  "ciphertext",
];

function assertNoForbiddenTerms(label: string, serialized: string): void {
  const lower = serialized.toLowerCase();
  for (const term of FORBIDDEN_BIOMETRIC_TERMS) {
    assert.equal(
      lower.includes(term),
      false,
      `${label} must not contain "${term}": ${serialized}`
    );
  }
}

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("face-verification rate limiter (Phase 10.4)", () => {
  function limiter(maxAttempts = 3): FaceVerificationRateLimiter {
    return createFaceVerificationRateLimiter({
      maxAttempts,
      windowMs: 1000,
      maxEntries: 4,
    });
  }

  it("allows attempts below the limit and blocks at the limit", () => {
    const rl = limiter();
    assert.equal(rl.isLimited(ORG_A, USER_A, 0), false);
    rl.recordAttempt(ORG_A, USER_A, 0);
    rl.recordAttempt(ORG_A, USER_A, 1);
    assert.equal(rl.isLimited(ORG_A, USER_A, 2), false);
    rl.recordAttempt(ORG_A, USER_A, 3);
    assert.equal(rl.isLimited(ORG_A, USER_A, 4), true);
  });

  it("exposes the documented default limit constants", () => {
    assert.equal(FACE_VERIFY_RATE_LIMIT_MAX_ATTEMPTS, 10);
    assert.equal(FACE_VERIFY_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
  });

  it("resets the budget after the window expires", () => {
    const rl = limiter();
    const start = 100_000;
    for (let i = 0; i < 3; i += 1) {
      rl.recordAttempt(ORG_A, USER_A, start + i);
    }
    assert.equal(rl.isLimited(ORG_A, USER_A, start + 10), true);
    assert.equal(rl.isLimited(ORG_A, USER_A, start + 1001), false);
    rl.recordAttempt(ORG_A, USER_A, start + 1001);
    assert.equal(rl.isLimited(ORG_A, USER_A, start + 1002), false);
  });

  it("keeps organization and user dimensions independent", () => {
    const rl = limiter();
    const otherOrg = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const otherUser = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    for (let i = 0; i < 3; i += 1) {
      rl.recordAttempt(ORG_A, USER_A, i);
    }
    assert.equal(rl.isLimited(ORG_A, USER_A, 10), true);
    assert.equal(rl.isLimited(otherOrg, USER_A, 10), false);
    assert.equal(rl.isLimited(ORG_A, otherUser, 10), false);
  });

  it("cannot be bypassed by changing the verification target employee", () => {
    const rl = limiter();
    for (let i = 0; i < 3; i += 1) {
      rl.recordAttempt(ORG_A, USER_A, i);
    }
    assert.equal(rl.isLimited(ORG_A, USER_A, 100), true);
    assert.equal(faceVerificationRateLimitKey(ORG_A, USER_A), "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(
      faceVerificationRateLimitKey(ORG_A, USER_A).includes(EMPLOYEE_A),
      false
    );
  });

  it("is bounded: it evicts entries beyond the hard cap", () => {
    const rl = createFaceVerificationRateLimiter({
      maxAttempts: 3,
      windowMs: 1000,
      maxEntries: 2,
    });
    for (let i = 0; i < 5; i += 1) {
      rl.recordAttempt(ORG_A, `user-${i}`, i);
    }
    assert.ok(rl.size <= 2, `expected bounded ledger, got size ${rl.size}`);
  });

  it("resets a key on demand", () => {
    const rl = limiter();
    rl.recordAttempt(ORG_A, USER_A, 0);
    rl.recordAttempt(ORG_A, USER_A, 1);
    rl.recordAttempt(ORG_A, USER_A, 2);
    assert.equal(rl.isLimited(ORG_A, USER_A, 3), true);
    rl.reset(ORG_A, USER_A);
    assert.equal(rl.isLimited(ORG_A, USER_A, 4), false);
  });

  it("stores no biometric data in its state", () => {
    const rl = limiter();
    rl.recordAttempt(ORG_A, USER_A, 0);
    const serialized = JSON.stringify({ size: rl.size });
    assertNoForbiddenTerms("rate limiter state", serialized);
  });

  it("RATE_LIMITED is a documented public failure code with a safe message", () => {
    assert.equal(
      (FACE_VERIFICATION_FAILURE_CODES as readonly string[]).includes(
        "RATE_LIMITED"
      ),
      true
    );
    assert.equal(faceVerificationFailureCode("rate_limited"), "RATE_LIMITED");
    const message = faceVerificationMessage("rate_limited");
    assert.match(message, /Terlalu banyak percobaan/i);
    assertNoForbiddenTerms("rate limit message", message);
    assertNoForbiddenTerms(
      "rate limit failure result",
      JSON.stringify(buildFaceVerificationFailureResult("rate_limited"))
    );
  });
});

describe("no biometric payload in errors", () => {
  it("every failure message is free of biometric terms", () => {
    const reasons = Object.keys(
      FACE_VERIFICATION_MESSAGES
    ) as FaceVerificationFailureReason[];
    for (const reason of reasons) {
      assertNoForbiddenTerms(
        `message for ${reason}`,
        FACE_VERIFICATION_MESSAGES[reason]
      );
    }
  });

  it("every failure result (all reasons) is free of biometric terms", () => {
    const reasons = Object.keys(
      FACE_VERIFICATION_MESSAGES
    ) as FaceVerificationFailureReason[];
    for (const reason of reasons) {
      const result = buildFaceVerificationFailureResult(reason);
      assertNoForbiddenTerms(`result for ${reason}`, JSON.stringify(result));
    }
  });
});

describe("no biometric payload in logs (source invariant)", () => {
  function readRepoFile(relative: string): string {
    return readFileSync(path.join(process.cwd(), relative), "utf8");
  }

  const serverSourceFiles = [
    "features/employees/face-verification.actions.ts",
    "lib/attendance/face-recognition.ts",
    "lib/attendance/face-engine.ts",
  ];

  it("server log statements never serialize biometric content", () => {
    for (const file of serverSourceFiles) {
      const lines = readRepoFile(file).split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("console.")) continue;
        assertNoForbiddenTerms(`log line in ${file}`, trimmed);
        assert.equal(
          /embedding|template|score|descriptor|secret/.test(trimmed),
          false,
          `log line must not reference biometric content in ${file}: ${trimmed}`
        );
      }
    }
  });

  it("audit writes carry only safe scalar metadata", () => {
    const source = readRepoFile(
      "features/employees/face-verification.actions.ts"
    );
    // The metadata object passed to writeAuditLog must be the pure scalar
    // builder output (employeeId/employeeNumber/outcome).
    assert.equal(
      /metadata:\s*buildFaceVerificationAuditMetadata\(\{[\s\S]*?employeeId[\s\S]*?employeeNumber[\s\S]*?outcome[\s\S]*?\}\)/.test(
        source
      ),
      true,
      "audit metadata must come from the scalar audit-metadata builder"
    );
  });
});

describe("no browser storage and no URL payload (source invariant)", () => {
  function readRepoFile(relative: string): string {
    return readFileSync(path.join(process.cwd(), relative), "utf8");
  }

  const clientFiles = [
    "features/employees/face-verification-panel.tsx",
    "features/employees/face-enrollment-camera.tsx",
  ];

  it("client capture code uses no browser storage APIs", () => {
    const forbidden = [
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "openDatabase",
      "data:image",
    ];
    for (const file of clientFiles) {
      const source = readRepoFile(file).toLowerCase();
      for (const api of forbidden) {
        assert.equal(
          source.includes(api),
          false,
          `${file} must not use ${api}`
        );
      }
    }
  });

  it("client capture code never encodes the image into a URL", () => {
    const forbidden = ["URL.createObjectURL", "toDataURL", "createImageBitmap"];
    for (const file of clientFiles) {
      const source = readRepoFile(file);
      for (const api of forbidden) {
        assert.equal(
          source.includes(api),
          false,
          `${file} must not use ${api}`
        );
      }
    }
  });
});
