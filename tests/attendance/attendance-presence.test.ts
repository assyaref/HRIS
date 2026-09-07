import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * PHASE 10.6 — Face + Geofence composite foundation tests (node:test).
 *
 * Verifies the PURE composite model (`features/attendance/attendance-presence.ts`)
 * that a FUTURE attendance engine will consume. No attendance event is written,
 * no check-in/check-out is enabled, and liveness NOT_CONFIGURED is never
 * treated as a pass. Face matching itself is not re-tested here (Phase 10.3
 * suites own that); this suite covers the composite rule, the production
 * readiness gate, and the client-authority boundaries carried by the existing
 * strict schemas.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ATTENDANCE_PRESENCE_MESSAGES,
  evaluateAttendancePresence,
  evaluateAttendanceReadiness,
  geofenceEvaluationToSignal,
  isAttendancePresenceValid,
  type AttendancePresenceDecision,
  type AttendancePresenceFailureReason,
  type AttendancePresenceSignals,
} from "../../features/attendance/attendance-presence.ts";
import { faceLivenessInputSchema } from "../../features/employees/face-liveness.ts";
import { faceVerificationInputSchema } from "../../features/employees/face-verification.ts";
import {
  evaluateGeofence,
  DEFAULT_MAX_GPS_ACCURACY_METERS,
} from "../../lib/attendance/geofence.ts";
import {
  GPS_MAXIMUM_AGE_MS,
} from "../../features/attendance/gps.ts";

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function validSignals(): AttendancePresenceSignals {
  return {
    identityMatch: true,
    liveness: "pass",
    geofenceValid: true,
    assignmentValid: true,
    employeeActive: true,
  };
}

function reasonSet(decision: AttendancePresenceDecision): AttendancePresenceFailureReason[] {
  if (decision.status === "PRESENCE_VALID") return [];
  return decision.reasons;
}

describe("composite presence decision", () => {
  it("1. all signals pass => PRESENCE_VALID", () => {
    assert.deepEqual(evaluateAttendancePresence(validSignals()), {
      status: "PRESENCE_VALID",
    });
    assert.equal(isAttendancePresenceValid(evaluateAttendancePresence(validSignals())), true);
  });

  it("2. identity mismatch => invalid", () => {
    const decision = evaluateAttendancePresence({
      ...validSignals(),
      identityMatch: false,
    });
    assert.equal(decision.status, "PRESENCE_INVALID");
    assert.ok(reasonSet(decision).includes("identity_not_verified"));
  });

  it("3. liveness NOT_CONFIGURED => invalid (never treated as a pass)", () => {
    const decision = evaluateAttendancePresence({
      ...validSignals(),
      liveness: "not_configured",
    });
    assert.equal(decision.status, "PRESENCE_INVALID");
    assert.deepEqual(reasonSet(decision), ["liveness_not_configured"]);
  });

  it("4. liveness fail => invalid", () => {
    const decision = evaluateAttendancePresence({
      ...validSignals(),
      liveness: "fail",
    });
    assert.equal(decision.status, "PRESENCE_INVALID");
    assert.ok(reasonSet(decision).includes("liveness_failed"));
  });

  it("5. geofence fail => invalid", () => {
    const decision = evaluateAttendancePresence({
      ...validSignals(),
      geofenceValid: false,
    });
    assert.equal(decision.status, "PRESENCE_INVALID");
    assert.ok(reasonSet(decision).includes("geofence_failed"));
  });

  it("6. assignment invalid => invalid", () => {
    const decision = evaluateAttendancePresence({
      ...validSignals(),
      assignmentValid: false,
    });
    assert.equal(decision.status, "PRESENCE_INVALID");
    assert.ok(reasonSet(decision).includes("assignment_invalid"));
  });

  it("7. employee inactive => invalid", () => {
    const decision = evaluateAttendancePresence({
      ...validSignals(),
      employeeActive: false,
    });
    assert.equal(decision.status, "PRESENCE_INVALID");
    assert.ok(reasonSet(decision).includes("employee_inactive"));
  });

  it("8. cross-org employee resolves unavailable => invalid without leaking existence", () => {
    // Server-side: an employee id from another organization resolves to null,
    // so the composite receives identity=false / active=false. The failure is
    // generic and never names the organization.
    const decision = evaluateAttendancePresence({
      identityMatch: false,
      liveness: "not_configured",
      geofenceValid: false,
      assignmentValid: false,
      employeeActive: false,
    });
    assert.equal(decision.status, "PRESENCE_INVALID");
    for (const reason of reasonSet(decision)) {
      const message = ATTENDANCE_PRESENCE_MESSAGES[reason];
      assert.equal(/organisasi lain|cross-org/i.test(message), false);
    }
  });

  it("9. cross-org work location resolves invalid => invalid without leaking", () => {
    const decision = evaluateAttendancePresence({
      ...validSignals(),
      assignmentValid: false,
    });
    assert.equal(decision.status, "PRESENCE_INVALID");
    assert.ok(reasonSet(decision).includes("assignment_invalid"));
    assert.equal(
      /organisasi lain|cross-org/i.test(ATTENDANCE_PRESENCE_MESSAGES.assignment_invalid),
      false
    );
  });

  it("lists every failing reason deterministically", () => {
    const decision = evaluateAttendancePresence({
      identityMatch: false,
      liveness: "not_configured",
      geofenceValid: false,
      assignmentValid: false,
      employeeActive: false,
    });
    assert.deepEqual(reasonSet(decision), [
      "employee_inactive",
      "identity_not_verified",
      "liveness_not_configured",
      "geofence_failed",
      "assignment_invalid",
    ]);
  });

  it("safe Indonesian messages never include biometric internals", () => {
    const forbidden = ["score", "threshold", "embedding", "template", "distance"];
    for (const message of Object.values(ATTENDANCE_PRESENCE_MESSAGES)) {
      const lower = message.toLowerCase();
      for (const term of forbidden) {
        assert.equal(lower.includes(term), false, `${term} in ${message}`);
      }
    }
  });
});

describe("geofence signal reuse (existing authoritative implementation)", () => {
  it("only the geofence `valid` state becomes a pass", () => {
    assert.equal(geofenceEvaluationToSignal({ status: "valid", distanceMeters: 0 }), "pass");
    assert.equal(
      geofenceEvaluationToSignal({ status: "outside_geofence", distanceMeters: 50 }),
      "fail"
    );
    assert.equal(geofenceEvaluationToSignal({ status: "geofence_not_configured" }), "fail");
    assert.equal(geofenceEvaluationToSignal({ status: "missing_accuracy" }), "fail");
    assert.equal(geofenceEvaluationToSignal({ status: "invalid_coordinates" }), "fail");
  });

  it("invalid GPS coordinates are rejected by the existing engine", () => {
    const result = evaluateGeofence({
      latitude: 200,
      longitude: 106,
      accuracyMeters: 10,
      centerLatitude: -6,
      centerLongitude: 106,
      radiusMeters: 100,
    });
    assert.equal(result.status, "invalid_coordinates");
    assert.equal(geofenceEvaluationToSignal(result), "fail");
    assert.equal(
      geofenceEvaluationToSignal(evaluateGeofence({ latitude: Number.NaN, longitude: 1, accuracyMeters: 10, centerLatitude: 0, centerLongitude: 0, radiusMeters: 100 })),
      "fail"
    );
  });

  it("missing or poor accuracy is rejected (server authority)", () => {
    const base = {
      latitude: -6.2,
      longitude: 106.8,
      centerLatitude: -6.2,
      centerLongitude: 106.8,
      radiusMeters: 100,
    };
    const missing = evaluateGeofence({ ...base, accuracyMeters: null });
    assert.equal(missing.status, "missing_accuracy");
    const poor = evaluateGeofence({
      ...base,
      accuracyMeters: DEFAULT_MAX_GPS_ACCURACY_METERS + 1,
    });
    assert.equal(poor.status, "poor_accuracy");
    assert.equal(geofenceEvaluationToSignal(poor), "fail");
  });

  it("GPS acquisition is a one-shot fresh fix (maximumAge 0; no client timestamp)", () => {
    assert.equal(GPS_MAXIMUM_AGE_MS, 0);
    // The server accepts only status/latitude/longitude/accuracyMeters; any
    // client-supplied capturedAt/insideGeofence/distanceMeters field is never
    // read by the geofence engine (the composite signal uses the server-computed
    // evaluation only).
    const evaluation = evaluateGeofence({
      latitude: -6.2,
      longitude: 106.8,
      accuracyMeters: 10,
      centerLatitude: -6.2,
      centerLongitude: 106.8,
      radiusMeters: 100,
    });
    assert.equal(evaluation.status, "valid");
    assert.equal(geofenceEvaluationToSignal(evaluation), "pass");
  });
});

describe("client authority boundaries (existing strict schemas)", () => {
  const forbiddenFields = {
    organizationId: ORG,
    matched: true,
    live: true,
    livenessScore: 0.99,
    geofenceResult: "inside",
    insideGeofence: true,
    distanceMeters: 5,
    threshold: 0.5,
  };

  it("face verification schema rejects every composite-authority field", () => {
    for (const [key, value] of Object.entries(forbiddenFields)) {
      const parsed = faceVerificationInputSchema.safeParse({
        employeeId: EMPLOYEE_A,
        [key]: value,
      });
      assert.equal(parsed.success, false, `expected rejection of ${key}`);
    }
  });

  it("face liveness schema rejects every composite-authority field", () => {
    for (const [key, value] of Object.entries(forbiddenFields)) {
      const parsed = faceLivenessInputSchema.safeParse({
        employeeId: EMPLOYEE_A,
        [key]: value,
      });
      assert.equal(parsed.success, false, `expected rejection of ${key}`);
    }
  });
});

describe("production readiness gate (Phase 10.6)", () => {
  function readyInput() {
    return {
      faceCalibrationValidated: true,
      livenessConfiguredAndValidated: true,
      geofenceAndAssignmentChainValid: true,
      rateLimitingProductionSafe: true,
      securityConditionsMet: true,
    };
  }

  it("is PRODUCTION_READY only when every requirement holds", () => {
    assert.deepEqual(evaluateAttendanceReadiness(readyInput()), {
      level: "PRODUCTION_READY",
    });
  });

  it("20. stays closed with an uncalibrated (NON-PRODUCTION) face threshold", () => {
    const decision = evaluateAttendanceReadiness({
      ...readyInput(),
      faceCalibrationValidated: false,
    });
    assert.equal(decision.level, "NOT_READY");
    if (decision.level === "NOT_READY") {
      assert.ok(decision.missing.includes("face_calibration_validated"));
    }
  });

  it("21. stays closed with liveness NOT_CONFIGURED", () => {
    const decision = evaluateAttendanceReadiness({
      ...readyInput(),
      livenessConfiguredAndValidated: false,
    });
    assert.equal(decision.level, "NOT_READY");
    if (decision.level === "NOT_READY") {
      assert.ok(decision.missing.includes("liveness_configured_and_validated"));
    }
  });

  it("an operator-authorized CONTROLLED TEST still cannot enable attendance", () => {
    // Even when an operator authorizes a controlled experiment, the composite
    // presence decision with liveness NOT_CONFIGURED remains PRESENCE_INVALID.
    const readiness = evaluateAttendanceReadiness({
      ...readyInput(),
      livenessConfiguredAndValidated: false,
      controlledTestAuthorized: true,
    });
    assert.equal(readiness.level, "READY_FOR_CONTROLLED_TEST");
    const presence = evaluateAttendancePresence({
      ...validSignals(),
      liveness: "not_configured",
    });
    assert.equal(presence.status, "PRESENCE_INVALID");
  });

  it("readiness cannot be changed by any client-controlled value", () => {
    // The gate only accepts server inputs; the module exposes no client schema.
    const decision = evaluateAttendanceReadiness({
      faceCalibrationValidated: false,
      livenessConfiguredAndValidated: false,
      geofenceAndAssignmentChainValid: true,
      rateLimitingProductionSafe: true,
      securityConditionsMet: true,
    });
    assert.equal(decision.level, "NOT_READY");
  });
});

describe("rate limiter reuse (Phase 10.6)", () => {
  it("the composite module defines no new rate limiter", () => {
    const source = readFileSync(
      path.join(process.cwd(), "features/attendance/attendance-presence.ts"),
      "utf8"
    );
    assert.equal(source.includes("new Map"), false);
    assert.equal(source.includes("faceVerificationRateLimiter"), false);
  });

  it("the face verification action still uses only the shared singleton", () => {
    const source = readFileSync(
      path.join(process.cwd(), "features/employees/face-verification.actions.ts"),
      "utf8"
    );
    assert.match(source, /face-verification-rate-limit/);
    assert.equal(source.includes("createFaceVerificationRateLimiter"), false);
  });
});
