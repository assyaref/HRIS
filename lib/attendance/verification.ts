import "server-only";

/**
 * Attendance identity verification abstraction (Phase 6).
 *
 * IMPORTANT BOUNDARY:
 * Phase 6 does NOT integrate a biometric engine. Merely opening a camera, or
 * capturing a frame, is NOT proof of identity. This module is the seam where a
 * future verification engine plugs in; today it reports `not_configured`.
 *
 * The attendance flow therefore establishes identity through the authenticated
 * session + employee/user link and records the verification status as
 * `unavailable` with an explanatory event reason. It must never claim
 * biometric verification.
 */

export type IdentityVerificationStatus =
  | "verified"
  | "failed"
  | "unavailable"
  | "not_configured";

export interface VerifyAttendanceIdentityInput {
  userId: string;
  employeeId: string;
  /** The mechanism the client attempted (for future engines). */
  method?: "face" | "camera";
}

export interface VerifyAttendanceIdentityResult {
  status: IdentityVerificationStatus;
  /** Persisted into the verification_status column. */
  persistedStatus: "verified" | "failed" | "unavailable";
  method: "face" | "camera" | "manual";
  reason?: string;
}

/**
 * Resolve whether the current user may be treated as the employee at the
 * attendance action.
 *
 * Default implementation: no biometric engine is configured, so identity is
 * NOT biometrically verified. The result is `not_configured`, which the
 * check-in/check-out actions accept as the Phase 6 policy (session identity)
 * while recording `verification_status = unavailable`.
 *
 * When a real engine is integrated later, this function becomes the single
 * enforcement point for `verified`/`failed`.
 */
export async function verifyAttendanceIdentity(
  input: VerifyAttendanceIdentityInput
): Promise<VerifyAttendanceIdentityResult> {
  // Reserved seam: a future engine will use the authenticated user + employee
  // to run a real biometric verification. Today the policy is "no engine".
  void input;

  return {
    status: "not_configured",
    persistedStatus: "unavailable",
    method: "manual",
    reason: "identity_verification_not_configured",
  };
}
