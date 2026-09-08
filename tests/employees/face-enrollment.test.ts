/**
 * PHASE 10.1 — Face enrollment pure-logic tests (node:test).
 *
 * Exercises the PURE enrollment module (`features/employees/face-enrollment.ts`):
 * input schema, status derivation, duplicate/replacement policy, guard rules,
 * and safe Indonesian messages.
 *
 * Scope notes (honest boundaries):
 * - No real face-recognition engine exists in the repository; there are NO
 *   fake-recognition tests. The provider seam (`lib/attendance/face-recognition.ts`)
 *   always reports `not_configured`.
 * - Cross-organization rejection and permission checks are enforced by the
 *   server action (org-scoped SQL + `requirePermission`); this pure suite
 *   covers the deterministic rules those layers rely on.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deriveFaceEnrollmentStatus,
  evaluateFaceEnrollmentConsent,
  evaluateFaceEnrollmentGuard,
  faceEnrollmentDeterministic,
  faceEnrollmentInputSchema,
  faceEnrollmentMessage,
  planFaceEnrollmentWrite,
} from "../../features/employees/face-enrollment.ts";

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";

describe("faceEnrollmentInputSchema", () => {
  it("accepts valid employee enrollment input", () => {
    const parsed = faceEnrollmentInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects a malformed employee ID", () => {
    const parsed = faceEnrollmentInputSchema.safeParse({
      employeeId: "not-a-uuid",
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "employeeId");
    }
  });

  it("rejects a missing employeeId", () => {
    const parsed = faceEnrollmentInputSchema.safeParse({});
    assert.equal(parsed.success, false);
  });

  it("rejects unknown fields such as a client organizationId or verified flag", () => {
    const withOrg = faceEnrollmentInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
      organizationId: "22222222-2222-4222-8222-222222222222",
    });
    const withVerifiedFlag = faceEnrollmentInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
      faceVerified: true,
    });
    assert.equal(withOrg.success, false);
    assert.equal(withVerifiedFlag.success, false);
  });
});

describe("face enrollment consent (Phase 10.7C-42)", () => {
  it("defaults consent to false when the field is omitted", () => {
    const parsed = faceEnrollmentInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.consent, false);
    }
  });

  it("accepts an explicit consent true acknowledgement", () => {
    const parsed = faceEnrollmentInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
      consent: true,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.consent, true);
    }
  });

  it("blocks enrollment when consent is false (default unchecked)", () => {
    const decision = evaluateFaceEnrollmentConsent(false);
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /Persetujuan pemrosesan data biometrik/i);
    }
  });

  it("permits the existing validation flow when consent is true", () => {
    assert.deepEqual(evaluateFaceEnrollmentConsent(true), { ok: true });
  });

  it("maps consent_required to a safe Indonesian message", () => {
    assert.match(faceEnrollmentMessage("consent_required"), /sebelum enrollment/i);
  });
});

describe("deriveFaceEnrollmentStatus", () => {
  it("derives NOT_ENROLLED when no records exist", () => {
    assert.equal(
      deriveFaceEnrollmentStatus({ hasActive: false, hasRevoked: false }),
      "NOT_ENROLLED"
    );
  });

  it("derives ACTIVE only from a stored active enrollment", () => {
    assert.equal(
      deriveFaceEnrollmentStatus({ hasActive: true, hasRevoked: false }),
      "ACTIVE"
    );
  });

  it("derives REVOKED when only historical (revoked) records remain", () => {
    assert.equal(
      deriveFaceEnrollmentStatus({ hasActive: false, hasRevoked: true }),
      "REVOKED"
    );
  });
});

describe("evaluateFaceEnrollmentGuard", () => {
  const validBase = {
    employeeExists: true,
    employeeActive: true,
    hasActiveEnrollment: false,
    allowReplacement: false,
  };

  it("authorizes a valid, active employee without an active enrollment", () => {
    assert.deepEqual(evaluateFaceEnrollmentGuard(validBase), { ok: true });
  });

  it("rejects an inactive employee with a generic safe message", () => {
    const decision = evaluateFaceEnrollmentGuard({
      ...validBase,
      employeeActive: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /Karyawan tidak ditemukan/i);
    }
  });

  it("rejects a missing employee (same generic path as cross-org)", () => {
    const decision = evaluateFaceEnrollmentGuard({
      ...validBase,
      employeeExists: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /Karyawan tidak ditemukan/i);
    }
  });

  it("prevents a duplicate active enrollment without explicit replacement", () => {
    const decision = evaluateFaceEnrollmentGuard({
      ...validBase,
      hasActiveEnrollment: true,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, "already_enrolled");
      assert.match(decision.message, /sudah memiliki data wajah/i);
    }
  });

  it("allows controlled replacement when re-enrollment is explicit", () => {
    const decision = evaluateFaceEnrollmentGuard({
      ...validBase,
      hasActiveEnrollment: true,
      allowReplacement: true,
    });
    assert.deepEqual(decision, { ok: true });
  });
});


describe("planFaceEnrollmentWrite (duplicate/replacement policy)", () => {
  it("plans a create when no active enrollment exists", () => {
    assert.deepEqual(planFaceEnrollmentWrite(false), { operation: "create" });
  });

  it("plans a replace (revoke old active first) when one exists", () => {
    assert.deepEqual(planFaceEnrollmentWrite(true), {
      operation: "replace",
      revokeExistingActive: true,
    });
  });
});

describe("safe Indonesian messages", () => {
  it("maps no-face safely", () => {
    assert.match(faceEnrollmentMessage("no_face"), /Wajah tidak terdeteksi/i);
  });

  it("maps multiple-face safely", () => {
    assert.match(faceEnrollmentMessage("multiple_faces"), /hanya satu wajah/i);
  });

  it("maps poor quality safely", () => {
    assert.match(faceEnrollmentMessage("poor_quality"), /Kualitas gambar wajah/i);
  });

  it("maps provider-not-configured safely", () => {
    assert.match(
      faceEnrollmentMessage("provider_not_configured"),
      /mesin pengenalan wajah belum dikonfigurasi/i
    );
  });

  it("maps unexpected errors to a generic Indonesian fallback", () => {
    assert.equal(
      faceEnrollmentMessage("unexpected"),
      "Enrollment wajah gagal. Silakan coba lagi."
    );
  });
});

describe("determinism", () => {
  it("produces identical output for identical input", () => {
    const input = {
      statusInput: { hasActive: true, hasRevoked: false },
      guardContext: {
        employeeExists: true,
        employeeActive: true,
        hasActiveEnrollment: true,
        allowReplacement: true,
      },
    };
    assert.deepEqual(
      faceEnrollmentDeterministic(input.statusInput, input.guardContext),
      faceEnrollmentDeterministic(input.statusInput, input.guardContext)
    );
  });

  it("is deterministic for failure messages", () => {
    assert.equal(faceEnrollmentMessage("no_face"), faceEnrollmentMessage("no_face"));
  });
});

describe("state transitions", () => {
  it("models the intended lifecycle: NOT_ENROLLED → create → ACTIVE → re-enroll → replace", () => {
    const initial = faceEnrollmentDeterministic(
      { hasActive: false, hasRevoked: false },
      {
        employeeExists: true,
        employeeActive: true,
        hasActiveEnrollment: false,
        allowReplacement: false,
      }
    );
    assert.equal(initial.status, "NOT_ENROLLED");
    assert.deepEqual(initial.plan, { operation: "create" });

    const afterEnrollment = faceEnrollmentDeterministic(
      { hasActive: true, hasRevoked: false },
      {
        employeeExists: true,
        employeeActive: true,
        hasActiveEnrollment: true,
        allowReplacement: true,
      }
    );
    assert.equal(afterEnrollment.status, "ACTIVE");
    assert.deepEqual(afterEnrollment.plan, {
      operation: "replace",
      revokeExistingActive: true,
    });
  });

  it("derives REVOKED after the active enrollment is revoked", () => {
    assert.equal(
      deriveFaceEnrollmentStatus({ hasActive: false, hasRevoked: true }),
      "REVOKED"
    );
  });
});
