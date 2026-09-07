/**
 * Mobile/PWA compatibility helpers (PHASE 9.7) — PURE module.
 *
 * No browser APIs, no DOM, no server imports. Small deterministic helpers for
 * camera error classification, offline/network presentation, and transient
 * GPS state reset. The attendance security chain is untouched: these helpers
 * only improve mobile UX and are never an attendance authority.
 *
 * Employee-facing copy stays consistent with the Phase 9.4 rejection
 * terminology (Indonesian) for the network message.
 */

export type CameraFailureKind = "denied" | "unavailable" | "unknown";

/**
 * Classify a `getUserMedia` error name into a safe UI state.
 * Unknown/unrecognized names degrade to `unknown` (never a success).
 */
export function classifyCameraErrorName(
  name: string | null | undefined
): CameraFailureKind {
  if (!name) return "unknown";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "denied";
  }
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "NotReadableError" ||
    name === "TrackStartError"
  ) {
    return "unavailable";
  }
  return "unknown";
}

/**
 * Indonesian employee-facing message shown when attendance cannot reach the
 * server. Attendance is NEVER queued offline — the full server validation
 * chain must always run.
 */
export const NETWORK_REQUIRED_MESSAGE =
  "Koneksi internet diperlukan untuk melakukan absensi. Periksa koneksi Anda, lalu coba lagi.";

/** Offline guard: only report offline when the browser says it is offline. */
export function isBrowserOffline(
  navigatorOnLine: boolean | null | undefined
): boolean {
  return navigatorOnLine === false;
}

/**
 * Transient GPS states that are safe to reset to idle when the app is hidden
 * or backgrounded. The user must explicitly retry GPS after resuming — this
 * never auto-starts location acquisition.
 */
export function shouldResetGpsStateOnHidden(stateKind: string): boolean {
  return stateKind === "requesting" || stateKind === "retrying";
}
