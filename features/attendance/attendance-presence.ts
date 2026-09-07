import type { GeofenceEvaluation } from "../../lib/attendance/geofence.ts";

/**
 * Attendance presence composite model (Phase 10.6) — PURE module.
 *
 * Establishes the safe composite boundary for the FUTURE attendance engine by
 * combining INDEPENDENT server-derived signals:
 *
 *   IDENTITY_MATCH
 *   AND LIVENESS_PASS
 *   AND GEOFENCE_PASS
 *   AND ASSIGNMENT_VALID
 *   AND EMPLOYEE_ACTIVE
 *
 * This module is pure (no DB, no server-only, no browser, no attendance
 * persistence). It never fabricates a signal: every input is produced by the
 * existing authoritative layers:
 * - identity        → Phase 10.3 face verification (server decision only);
 * - liveness        → Phase 10.5 liveness seam (currently NOT_CONFIGURED,
 *                     which is NEVER treated as PASS);
 * - geofence        → Phase 6/9 `lib/attendance/geofence.evaluateGeofence`
 *                     (the server computes distance; the client never sends a
 *                     distance or an insideGeofence flag);
 * - assignment      → org-scoped employee/project/work-location chain
 *                     (`getEligibleAssignmentLocation` in the server action);
 * - employee state  → org-scoped employee row (never client-supplied).
 *
 * PHASE 10.6 IS NOT PERMISSION TO ENABLE ATTENDANCE: nothing in this module
 * (or anywhere in the repository) writes attendance events or enables
 * check-in/check-out enforcement.
 */

export const ATTENDANCE_PRESENCE_STATUSES = [
  "PRESENCE_VALID",
  "PRESENCE_INVALID",
] as const;
export type AttendancePresenceStatus =
  (typeof ATTENDANCE_PRESENCE_STATUSES)[number];

/** Liveness tri-state: NOT_CONFIGURED is a real, distinct state — never PASS. */
export type FaceLivenessState = "pass" | "fail" | "not_configured";

export interface AttendancePresenceSignals {
  /** Server-side face identity verification result (Phase 10.3). */
  identityMatch: boolean;
  /** Phase 10.5 liveness seam result (currently only "not_configured"). */
  liveness: FaceLivenessState;
  /** Derived from the existing server-side geofence evaluation. */
  geofenceValid: boolean;
  /** Employee has an ACTIVE org-scoped assignment + work location. */
  assignmentValid: boolean;
  /** Employee `employment_status === "active"`. */
  employeeActive: boolean;
}

/** Deterministic machine-readable reasons (server-side diagnostics). */
export const ATTENDANCE_PRESENCE_FAILURE_REASONS = [
  "employee_inactive",
  "identity_not_verified",
  "liveness_not_configured",
  "liveness_failed",
  "geofence_failed",
  "assignment_invalid",
] as const;
export type AttendancePresenceFailureReason =
  (typeof ATTENDANCE_PRESENCE_FAILURE_REASONS)[number];

export type AttendancePresenceDecision =
  | { status: "PRESENCE_VALID" }
  | {
      status: "PRESENCE_INVALID";
      reasons: AttendancePresenceFailureReason[];
    };

/** Safe Indonesian messages for the composite reasons (no sensitive internals). */
export const ATTENDANCE_PRESENCE_MESSAGES: Record<
  AttendancePresenceFailureReason,
  string
> = {
  employee_inactive:
    "Karyawan tidak aktif. Kehadiran tidak dapat diproses.",
  identity_not_verified:
    "Verifikasi wajah tidak cocok. Silakan coba lagi.",
  liveness_not_configured:
    "Pemeriksaan kehadiran (liveness) belum tersedia. Kehadiran tidak dapat diproses.",
  liveness_failed:
    "Pemeriksaan kehadiran (liveness) gagal. Silakan coba lagi.",
  geofence_failed:
    "Lokasi Anda berada di luar area kerja yang ditentukan.",
  assignment_invalid:
    "Penugasan atau lokasi kerja tidak valid untuk karyawan ini.",
};

/**
 * The composite rule. Returns PRESENCE_VALID ONLY when every mandatory signal
 * passes; otherwise PRESENCE_INVALID with the deterministic reasons for every
 * failing condition. A liveness state of `not_configured` is a hard failure
 * (it can never be interpreted as a pass).
 */
export function evaluateAttendancePresence(
  signals: AttendancePresenceSignals
): AttendancePresenceDecision {
  const reasons: AttendancePresenceFailureReason[] = [];

  if (!signals.employeeActive) reasons.push("employee_inactive");
  if (!signals.identityMatch) reasons.push("identity_not_verified");
  if (signals.liveness === "not_configured") {
    reasons.push("liveness_not_configured");
  } else if (signals.liveness === "fail") {
    reasons.push("liveness_failed");
  }
  if (!signals.geofenceValid) reasons.push("geofence_failed");
  if (!signals.assignmentValid) reasons.push("assignment_invalid");

  if (reasons.length === 0) return { status: "PRESENCE_VALID" };
  return { status: "PRESENCE_INVALID", reasons };
}

/** True only for a PRESENCE_VALID decision. */
export function isAttendancePresenceValid(
  decision: AttendancePresenceDecision
): boolean {
  return decision.status === "PRESENCE_VALID";
}

/**
 * Reuse the existing authoritative geofence evaluation: the ONLY pass state is
 * `valid`. Missing/poor accuracy, unconfigured geofences, invalid coordinates
 * and outside-geofence all fail the composite signal.
 */
export function geofenceEvaluationToSignal(
  evaluation: GeofenceEvaluation
): "pass" | "fail" {
  return evaluation.status === "valid" ? "pass" : "fail";
}

/* ------------------------------------------------------------------ */
/* Production readiness gate (Phase 10.6)                              */
/* ------------------------------------------------------------------ */

export const ATTENDANCE_READINESS_LEVELS = [
  "NOT_READY",
  "READY_FOR_CONTROLLED_TEST",
  "PRODUCTION_READY",
] as const;
export type AttendanceReadinessLevel =
  (typeof ATTENDANCE_READINESS_LEVELS)[number];

export interface AttendanceReadinessInput {
  /** A validated production face threshold exists (FAR/FRR calibrated). */
  faceCalibrationValidated: boolean;
  /** A REAL, validated liveness provider is configured. */
  livenessConfiguredAndValidated: boolean;
  /** Deployment geofence + assignment chain is complete and valid. */
  geofenceAndAssignmentChainValid: boolean;
  /** Rate limiting is production-safe (shared store for multi-process). */
  rateLimitingProductionSafe: boolean;
  /** All remaining security conditions are met. */
  securityConditionsMet: boolean;
  /**
   * Operator-explicit, server-side authorization to run a CONTROLLED,
   * supervised experiment. Never client-controlled. Defaults to false.
   */
  controlledTestAuthorized?: boolean;
}

export type AttendanceReadinessDecision =
  | { level: "NOT_READY"; missing: string[] }
  | { level: "READY_FOR_CONTROLLED_TEST" }
  | { level: "PRODUCTION_READY" };

const READINESS_REQUIREMENT_LABELS = [
  "face_calibration_validated",
  "liveness_configured_and_validated",
  "geofence_and_assignment_chain_valid",
  "rate_limiting_production_safe",
  "security_conditions_met",
] as const;

/**
 * Production readiness guard. Attendance enforcement stays disabled unless:
 *   - face calibration is validated (0.5 baseline is NOT calibrated);
 *   - a real liveness provider is configured AND validated;
 *   - geofence + assignment chain is valid;
 *   - rate limiting is production-safe;
 *   - security conditions are met.
 *
 * When all five hold the deployment is PRODUCTION_READY. When everything
 * EXCEPT liveness holds and an operator explicitly authorizes a controlled
 * experiment, the deployment is READY_FOR_CONTROLLED_TEST (the composite
 * decision still returns PRESENCE_INVALID while liveness is NOT_CONFIGURED,
 * so attendance enforcement remains impossible). Otherwise: NOT_READY.
 *
 * The client can never override this gate.
 */
export function evaluateAttendanceReadiness(
  input: AttendanceReadinessInput
): AttendanceReadinessDecision {
  const controlledTestAuthorized = input.controlledTestAuthorized ?? false;

  const requirements = [
    input.faceCalibrationValidated,
    input.livenessConfiguredAndValidated,
    input.geofenceAndAssignmentChainValid,
    input.rateLimitingProductionSafe,
    input.securityConditionsMet,
  ] as const;

  const allMandatory = requirements.every(Boolean);
  if (allMandatory) return { level: "PRODUCTION_READY" };

  const withoutLiveness = [
    input.faceCalibrationValidated,
    input.geofenceAndAssignmentChainValid,
    input.rateLimitingProductionSafe,
    input.securityConditionsMet,
  ].every(Boolean);

  if (withoutLiveness && controlledTestAuthorized) {
    return { level: "READY_FOR_CONTROLLED_TEST" };
  }

  const missing = READINESS_REQUIREMENT_LABELS.filter(
    (_label, index) => requirements[index] !== true
  );
  return { level: "NOT_READY", missing };
}
