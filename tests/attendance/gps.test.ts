/**
 * PHASE 9.3 — GPS acquisition unit tests (Node built-in `node:test`).
 *
 * Exercises the PURE GPS orchestration in `features/attendance/gps.ts` with an
 * injected fake geolocation provider. No real GPS hardware, no browser APIs,
 * no network, no timers (sleep is injected as a no-op).
 *
 * Coverage: successful acquisition, timeout→retry, timeout→final failure,
 * permission denied, position unavailable, invalid/malformed fixes, accuracy
 * UX classification, deterministic failure mapping, and the "no bypass" rule
 * (a provider that never succeeds can never produce an obtained result).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  acquireGpsPosition,
  classifyGpsError,
  gpsRetryDelayMs,
  GPS_POOR_ACCURACY_THRESHOLD_METERS,
  isGpsAccuracyPoor,
  MAX_GPS_ATTEMPTS,
  type GpsPositionLike,
} from "../../features/attendance/gps.ts";

const DENIED = { code: 1 };
const UNAVAILABLE = { code: 2 };
const TIMEOUT = { code: 3 };

const FIX: GpsPositionLike = {
  coords: { latitude: -6.2088, longitude: 106.8456, accuracy: 35 },
};

function noopSleep(): Promise<void> {
  return Promise.resolve();
}

function okFix(overrides: Partial<GpsPositionLike["coords"]> = {}): GpsPositionLike {
  return { coords: { ...FIX.coords, ...overrides } };
}

describe("classifyGpsError", () => {
  it("maps PERMISSION_DENIED (1) to denied", () => {
    assert.equal(classifyGpsError(DENIED), "denied");
  });

  it("maps POSITION_UNAVAILABLE (2) to unavailable", () => {
    assert.equal(classifyGpsError(UNAVAILABLE), "unavailable");
  });

  it("maps TIMEOUT (3) to timeout", () => {
    assert.equal(classifyGpsError(TIMEOUT), "timeout");
  });

  it("degrades unknown values to unavailable (never a success)", () => {
    assert.equal(classifyGpsError("boom"), "unavailable");
    assert.equal(classifyGpsError(null), "unavailable");
    assert.equal(classifyGpsError({ weird: true }), "unavailable");
    assert.equal(classifyGpsError(undefined), "unavailable");
  });
});

describe("isGpsAccuracyPoor", () => {
  it("treats accuracy at or below the threshold as not poor", () => {
    assert.equal(isGpsAccuracyPoor(35), false);
    assert.equal(isGpsAccuracyPoor(GPS_POOR_ACCURACY_THRESHOLD_METERS), false);
  });

  it("treats accuracy above the threshold as poor (UX only)", () => {
    assert.equal(isGpsAccuracyPoor(GPS_POOR_ACCURACY_THRESHOLD_METERS + 1), true);
    assert.equal(isGpsAccuracyPoor(168), true);
  });

  it("treats non-finite accuracy as poor so the UI prompts a refresh", () => {
    assert.equal(isGpsAccuracyPoor(Number.NaN), true);
    assert.equal(isGpsAccuracyPoor(Number.POSITIVE_INFINITY), true);
  });
});

describe("acquireGpsPosition", () => {
  it("returns an obtained fix on the first successful acquisition", async () => {
    const calls: string[] = [];
    const result = await acquireGpsPosition({
      getPosition: async () => {
        calls.push("getPosition");
        return FIX;
      },
      sleep: noopSleep,
    });

    assert.deepEqual(result, {
      status: "obtained",
      fix: { latitude: -6.2088, longitude: 106.8456, accuracyMeters: 35 },
    });
    assert.equal(calls.length, 1);
  });

  it("retries after a TIMEOUT and succeeds on the next attempt", async () => {
    let call = 0;
    const retries: number[] = [];
    const result = await acquireGpsPosition({
      getPosition: async () => {
        call += 1;
        if (call === 1) throw TIMEOUT;
        return FIX;
      },
      sleep: noopSleep,
      maxAttempts: 3,
      onRetry: (attempt) => retries.push(attempt),
    });

    assert.equal(result.status, "obtained");
    assert.equal(call, 2);
    assert.deepEqual(retries, [2]);
  });

  it("returns a final timeout after exhausting retries", async () => {
    let call = 0;
    const retries: number[] = [];
    const result = await acquireGpsPosition({
      getPosition: async () => {
        call += 1;
        throw TIMEOUT;
      },
      sleep: noopSleep,
      maxAttempts: MAX_GPS_ATTEMPTS,
      onRetry: (attempt) => retries.push(attempt),
    });

    assert.deepEqual(result, { status: "timeout" });
    assert.equal(call, MAX_GPS_ATTEMPTS);
    assert.deepEqual(retries, [2, 3]);
  });

  it("never retries after PERMISSION_DENIED", async () => {
    let call = 0;
    const result = await acquireGpsPosition({
      getPosition: async () => {
        call += 1;
        throw DENIED;
      },
      sleep: noopSleep,
      maxAttempts: MAX_GPS_ATTEMPTS,
    });

    assert.deepEqual(result, { status: "denied" });
    assert.equal(call, 1);
  });

  it("never retries after POSITION_UNAVAILABLE", async () => {
    let call = 0;
    const result = await acquireGpsPosition({
      getPosition: async () => {
        call += 1;
        throw UNAVAILABLE;
      },
      sleep: noopSleep,
      maxAttempts: MAX_GPS_ATTEMPTS,
    });

    assert.deepEqual(result, { status: "unavailable" });
    assert.equal(call, 1);
  });

  it("treats a malformed fix (NaN coordinates) as unavailable", async () => {
    const result = await acquireGpsPosition({
      getPosition: async () => okFix({ latitude: Number.NaN }),
      sleep: noopSleep,
    });
    assert.deepEqual(result, { status: "unavailable" });
  });

  it("treats a negative accuracy as unavailable", async () => {
    const result = await acquireGpsPosition({
      getPosition: async () => okFix({ accuracy: -1 }),
      sleep: noopSleep,
    });
    assert.deepEqual(result, { status: "unavailable" });
  });

  it("no client-side bypass: an always-failing provider never yields obtained", async () => {
    const failures: unknown[] = [TIMEOUT, UNAVAILABLE, DENIED];
    let call = 0;
    const result = await acquireGpsPosition({
      getPosition: async () => {
        const failure = failures[Math.min(call, failures.length - 1)];
        call += 1;
        throw failure;
      },
      sleep: noopSleep,
      maxAttempts: 4,
    });

    assert.notEqual(result.status, "obtained");
    assert.ok(["denied", "unavailable", "timeout"].includes(result.status));
  });
});

describe("gpsRetryDelayMs", () => {
  it("returns short deterministic backoff for retry attempts", () => {
    assert.equal(gpsRetryDelayMs(2), 800);
    assert.equal(gpsRetryDelayMs(3), 1600);
  });
});
