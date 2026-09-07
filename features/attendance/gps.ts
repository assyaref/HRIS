/**
 * GPS acquisition orchestration (Phase 9.3) — PURE module.
 *
 * No browser APIs, no DOM, no server imports: the React component injects a
 * `getPosition` provider backed by `navigator.geolocation`, and tests inject a
 * fake provider. This keeps retry/classification/accuracy logic deterministic
 * and unit-testable with the same `node:test` foundation as the rest of the
 * attendance suite.
 *
 * Security contract preserved from Phase 6/9:
 * - One-shot acquisition (explicit user action). No `watchPosition`, no
 *   background tracking.
 * - Accuracy feedback here is UX ONLY — the server (lib/attendance/geofence)
 *   remains the sole authority for the geofence decision.
 * - A malformed provider result degrades to `unavailable`; it is NEVER treated
 *   as a success.
 */

export const GPS_TIMEOUT_MS = 15000;
export const GPS_ENABLE_HIGH_ACCURACY = true;
export const GPS_MAXIMUM_AGE_MS = 0;

/** Total acquisition attempts: first attempt + up to two automatic retries. */
export const MAX_GPS_ATTEMPTS = 3;

/**
 * UX-only accuracy threshold (meters). The client may warn when a fix exceeds
 * this value, but the server's per-location `maxGpsAccuracyMeters` remains the
 * enforcement point.
 */
export const GPS_POOR_ACCURACY_THRESHOLD_METERS = 100;

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

/** Shape produced by a `navigator.geolocation` success (browser adapter). */
export interface GpsPositionLike {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

export type GpsFailureStatus = "denied" | "unavailable" | "timeout";

export type GpsAcquisitionResult =
  | { status: "obtained"; fix: GpsFix }
  | { status: GpsFailureStatus };

/** `GeolocationPositionError` codes (duplicated intentionally — no DOM types here). */
const GEOLOCATION_ERROR_CODE = {
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
} as const;

/**
 * Map an unknown thrown value from a geolocation provider to a deterministic
 * failure status. Unrecognized values degrade to `unavailable` (never a
 * spoofed success, never an internal detail leak).
 */
export function classifyGpsError(error: unknown): GpsFailureStatus {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === GEOLOCATION_ERROR_CODE.PERMISSION_DENIED) return "denied";
    if (code === GEOLOCATION_ERROR_CODE.TIMEOUT) return "timeout";
  }
  return "unavailable";
}

/**
 * UX-only poor-accuracy signal. A non-finite accuracy is treated as poor so
 * the UI prompts the user to refresh instead of claiming a good fix.
 */
export function isGpsAccuracyPoor(accuracyMeters: number): boolean {
  return (
    !Number.isFinite(accuracyMeters) ||
    accuracyMeters > GPS_POOR_ACCURACY_THRESHOLD_METERS
  );
}

/** Short backoff before the N-th attempt (attempt numbers start at 2). */
export function gpsRetryDelayMs(nextAttempt: number): number {
  return nextAttempt === 2 ? 800 : 1600;
}

export interface GpsAcquisitionDeps {
  /** Resolves with a fix or rejects with a geolocation-style error. */
  getPosition: () => Promise<GpsPositionLike>;
  /** Delay hook between attempts (no-op in tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Total attempts including the first (default `MAX_GPS_ATTEMPTS`). */
  maxAttempts?: number;
  /** Delay for the next attempt (default `gpsRetryDelayMs`). */
  retryDelay?: (nextAttempt: number) => number;
  /** Invoked before each retry with the 1-based next attempt number. */
  onRetry?: (nextAttempt: number) => void;
}

/**
 * Acquire one GPS fix with bounded retry-on-timeout:
 * - `denied` and `unavailable` are terminal (no retry, no repeated prompts).
 * - `timeout` retries up to `maxAttempts`; a final `timeout` is returned after
 *   the last attempt.
 * - The provider result is validated (finite lat/lng/accuracy, non-negative
 *   accuracy); a malformed result degrades to `unavailable`.
 */
export async function acquireGpsPosition(
  deps: GpsAcquisitionDeps
): Promise<GpsAcquisitionResult> {
  const maxAttempts = deps.maxAttempts ?? MAX_GPS_ATTEMPTS;
  const sleep = deps.sleep ?? (async () => {});
  const retryDelay = deps.retryDelay ?? gpsRetryDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      deps.onRetry?.(attempt);
      await sleep(retryDelay(attempt));
    }

    try {
      const position = await deps.getPosition();
      const { latitude, longitude, accuracy } = position.coords;
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(accuracy) ||
        accuracy < 0
      ) {
        return { status: "unavailable" };
      }
      return {
        status: "obtained",
        fix: { latitude, longitude, accuracyMeters: accuracy },
      };
    } catch (error) {
      const status = classifyGpsError(error);
      if (status === "denied" || status === "unavailable") {
        return { status };
      }
      // status === "timeout": loop again unless attempts are exhausted.
      if (attempt >= maxAttempts) {
        return { status: "timeout" };
      }
    }
  }

  return { status: "timeout" };
}
