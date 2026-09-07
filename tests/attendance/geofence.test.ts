/**
 * PHASE 9.1 — Geofence engine unit tests (Node built-in `node:test`).
 *
 * Runs against the EXISTING pure implementation in
 * `lib/attendance/geofence.ts`. No DB, no browser, no network, no env vars.
 *
 * These tests document the CURRENT contract (they intentionally do not change
 * the production algorithm):
 * - Accuracy is evaluated BEFORE distance.
 * - Accuracy `null` / `0` / negative / non-finite is treated as
 *   `missing_accuracy`.
 * - Distance > radius ⇒ `outside_geofence`; distance === radius is VALID
 *   (the comparison operator is `>`).
 * - A missing center coordinate resolves to `invalid_coordinates` because the
 *   first guard coerces `null → NaN` (this fires before the
 *   `geofence_not_configured` branch). A missing/invalid/non-positive radius
 *   resolves to `geofence_not_configured`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MAX_GPS_ACCURACY_METERS,
  evaluateGeofence,
  haversineDistanceMeters,
  isValidAccuracy,
  isValidLatitude,
  isValidLongitude,
  isValidRadius,
} from "../../lib/attendance/geofence.ts";
import type { EvaluateGeofenceInput } from "../../lib/attendance/geofence.ts";

/** A stable center near Jakarta so every test is deterministic. */
const CENTER = { latitude: -6.2088, longitude: 106.8456 };

function makeInput(
  overrides: Partial<EvaluateGeofenceInput> = {}
): EvaluateGeofenceInput {
  return {
    latitude: CENTER.latitude,
    longitude: CENTER.longitude,
    accuracyMeters: 10,
    centerLatitude: CENTER.latitude,
    centerLongitude: CENTER.longitude,
    radiusMeters: 100,
    maxAccuracyMeters: null,
    ...overrides,
  };
}

describe("evaluateGeofence — valid inside", () => {
  it("returns valid when the device is exactly on the center", () => {
    const result = evaluateGeofence(makeInput());
    assert.equal(result.status, "valid");
    if (result.status === "valid") {
      assert.equal(result.distanceMeters, 0);
    }
  });

  it("returns valid for a nearby point inside the radius", () => {
    const result = evaluateGeofence(
      makeInput({
        latitude: CENTER.latitude + 0.0002, // ≈ 22 m north
      })
    );
    assert.equal(result.status, "valid");
  });
});

describe("evaluateGeofence — outside", () => {
  it("returns outside_geofence when the device is beyond the radius", () => {
    const result = evaluateGeofence(
      makeInput({ longitude: CENTER.longitude + 0.01 }) // ≈ 1.1 km east
    );
    assert.equal(result.status, "outside_geofence");
    if (result.status === "outside_geofence") {
      assert.ok(result.distanceMeters > 1000);
      assert.ok(result.distanceMeters < 1200);
    }
  });
});

describe("evaluateGeofence — boundary", () => {
  it("treats distance exactly equal to radius as valid (operator is >)", () => {
    const point = {
      latitude: CENTER.latitude,
      longitude: CENTER.longitude + 0.01,
    };
    const distance = haversineDistanceMeters(CENTER, point);

    const exact = evaluateGeofence(
      makeInput({ ...point, radiusMeters: distance, accuracyMeters: 5 })
    );
    assert.equal(exact.status, "valid");

    const justOutside = evaluateGeofence(
      makeInput({ ...point, radiusMeters: distance - 0.001, accuracyMeters: 5 })
    );
    assert.equal(justOutside.status, "outside_geofence");
  });
});

describe("evaluateGeofence — GPS accuracy", () => {
  it("defaults maxAccuracy to DEFAULT_MAX_GPS_ACCURACY_METERS", () => {
    assert.equal(DEFAULT_MAX_GPS_ACCURACY_METERS, 100);
  });

  it("accepts accuracy below the threshold", () => {
    assert.equal(evaluateGeofence(makeInput({ accuracyMeters: 5 })).status, "valid");
  });

  it("accepts accuracy exactly at the threshold", () => {
    assert.equal(evaluateGeofence(makeInput({ accuracyMeters: 100 })).status, "valid");
  });

  it("rejects accuracy above the threshold as poor_accuracy", () => {
    const result = evaluateGeofence(makeInput({ accuracyMeters: 101 }));
    assert.equal(result.status, "poor_accuracy");
    if (result.status === "poor_accuracy") {
      assert.equal(result.accuracyMeters, 101);
    }
  });

  it("honors a custom maxAccuracyMeters threshold", () => {
    const atThreshold = evaluateGeofence(
      makeInput({ accuracyMeters: 50, maxAccuracyMeters: 50 })
    );
    assert.equal(atThreshold.status, "valid");

    const aboveThreshold = evaluateGeofence(
      makeInput({ accuracyMeters: 51, maxAccuracyMeters: 50 })
    );
    assert.equal(aboveThreshold.status, "poor_accuracy");
  });
});

describe("evaluateGeofence — missing accuracy", () => {
  it("treats null accuracy as missing_accuracy", () => {
    assert.equal(
      evaluateGeofence(makeInput({ accuracyMeters: null })).status,
      "missing_accuracy"
    );
  });

  it("treats zero accuracy as missing_accuracy", () => {
    assert.equal(
      evaluateGeofence(makeInput({ accuracyMeters: 0 })).status,
      "missing_accuracy"
    );
  });

  it("treats negative accuracy as missing_accuracy", () => {
    assert.equal(
      evaluateGeofence(makeInput({ accuracyMeters: -5 })).status,
      "missing_accuracy"
    );
  });

  it("treats NaN accuracy as missing_accuracy", () => {
    assert.equal(
      evaluateGeofence(makeInput({ accuracyMeters: Number.NaN })).status,
      "missing_accuracy"
    );
  });

  it("treats Infinity accuracy as missing_accuracy", () => {
    assert.equal(
      evaluateGeofence(makeInput({ accuracyMeters: Number.POSITIVE_INFINITY })).status,
      "missing_accuracy"
    );
  });
});
describe("evaluateGeofence — invalid coordinates", () => {
  it("rejects latitude above 90", () => {
    assert.equal(
      evaluateGeofence(makeInput({ latitude: 91 })).status,
      "invalid_coordinates"
    );
  });

  it("rejects latitude below -90", () => {
    assert.equal(
      evaluateGeofence(makeInput({ latitude: -91 })).status,
      "invalid_coordinates"
    );
  });

  it("rejects longitude above 180", () => {
    assert.equal(
      evaluateGeofence(makeInput({ longitude: 181 })).status,
      "invalid_coordinates"
    );
  });

  it("rejects longitude below -180", () => {
    assert.equal(
      evaluateGeofence(makeInput({ longitude: -181 })).status,
      "invalid_coordinates"
    );
  });

  it("rejects NaN latitude", () => {
    assert.equal(
      evaluateGeofence(makeInput({ latitude: Number.NaN })).status,
      "invalid_coordinates"
    );
  });

  it("rejects Infinity latitude", () => {
    assert.equal(
      evaluateGeofence(makeInput({ latitude: Number.POSITIVE_INFINITY })).status,
      "invalid_coordinates"
    );
  });

  it("rejects NaN longitude", () => {
    assert.equal(
      evaluateGeofence(makeInput({ longitude: Number.NaN })).status,
      "invalid_coordinates"
    );
  });

  it("rejects an invalid center latitude", () => {
    assert.equal(
      evaluateGeofence(makeInput({ centerLatitude: 91 })).status,
      "invalid_coordinates"
    );
  });

  it("rejects a missing center (null) as invalid_coordinates", () => {
    assert.equal(
      evaluateGeofence(
        makeInput({ centerLatitude: null, centerLongitude: null })
      ).status,
      "invalid_coordinates"
    );
  });
});

describe("evaluateGeofence — invalid radius", () => {
  it("rejects zero radius as geofence_not_configured", () => {
    assert.equal(
      evaluateGeofence(makeInput({ radiusMeters: 0 })).status,
      "geofence_not_configured"
    );
  });

  it("rejects negative radius as geofence_not_configured", () => {
    assert.equal(
      evaluateGeofence(makeInput({ radiusMeters: -100 })).status,
      "geofence_not_configured"
    );
  });

  it("rejects NaN radius as geofence_not_configured", () => {
    assert.equal(
      evaluateGeofence(makeInput({ radiusMeters: Number.NaN })).status,
      "geofence_not_configured"
    );
  });

  it("rejects Infinity radius as geofence_not_configured", () => {
    assert.equal(
      evaluateGeofence(makeInput({ radiusMeters: Number.POSITIVE_INFINITY })).status,
      "geofence_not_configured"
    );
  });

  it("rejects null radius as geofence_not_configured", () => {
    assert.equal(
      evaluateGeofence(makeInput({ radiusMeters: null })).status,
      "geofence_not_configured"
    );
  });
});

describe("evaluateGeofence — not configured", () => {
  it("reports geofence_not_configured when the radius is missing", () => {
    assert.equal(
      evaluateGeofence(makeInput({ radiusMeters: null })).status,
      "geofence_not_configured"
    );
  });

  it("documents current contract: missing center coordinates report invalid_coordinates", () => {
    assert.equal(
      evaluateGeofence(
        makeInput({ centerLatitude: null, centerLongitude: null })
      ).status,
      "invalid_coordinates"
    );
  });
});

describe("haversineDistanceMeters", () => {
  it("returns ~0 for identical points", () => {
    assert.equal(haversineDistanceMeters(CENTER, CENTER), 0);
  });

  it("computes ≈111194.9 m for one degree of longitude at the equator", () => {
    const distance = haversineDistanceMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 }
    );
    assert.ok(
      Math.abs(distance - 111194.9) < 5,
      `distance was ${distance}, expected ≈111194.9`
    );
  });

  it("computes ≈111.2 m for 0.001 degrees at the equator", () => {
    const distance = haversineDistanceMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.001 }
    );
    assert.ok(
      Math.abs(distance - 111.19) < 0.5,
      `distance was ${distance}, expected ≈111.19`
    );
  });

  it("orders clearly separated points by increasing distance", () => {
    const origin = { latitude: 0, longitude: 0 };
    const near = { latitude: 1, longitude: 1 };
    const far = { latitude: 10, longitude: 10 };

    const distanceNear = haversineDistanceMeters(origin, near);
    const distanceFar = haversineDistanceMeters(origin, far);

    assert.ok(distanceFar > distanceNear);
    assert.ok(distanceNear > 150000 && distanceNear < 165000, `near ${distanceNear}`);
    assert.ok(distanceFar > 1500000 && distanceFar < 1650000, `far ${distanceFar}`);
  });

  it("is symmetric", () => {
    const a = { latitude: -6.2, longitude: 106.8 };
    const b = { latitude: 3.1, longitude: 101.6 };
    assert.equal(haversineDistanceMeters(a, b), haversineDistanceMeters(b, a));
  });
});

describe("evaluateGeofence — determinism", () => {
  it("returns identical results for the same input", () => {
    const input = makeInput({ longitude: CENTER.longitude + 0.01 });
    assert.deepEqual(evaluateGeofence(input), evaluateGeofence(input));
  });
});

describe("validator helpers", () => {
  it("isValidLatitude accepts -90..90 and rejects everything else", () => {
    assert.equal(isValidLatitude(-90), true);
    assert.equal(isValidLatitude(0), true);
    assert.equal(isValidLatitude(90), true);
    assert.equal(isValidLatitude(90.0001), false);
    assert.equal(isValidLatitude(Number.NaN), false);
    assert.equal(isValidLatitude(Number.POSITIVE_INFINITY), false);
  });

  it("isValidLongitude accepts -180..180 and rejects everything else", () => {
    assert.equal(isValidLongitude(-180), true);
    assert.equal(isValidLongitude(0), true);
    assert.equal(isValidLongitude(180), true);
    assert.equal(isValidLongitude(180.0001), false);
    assert.equal(isValidLongitude(Number.NaN), false);
  });

  it("isValidRadius accepts positive finite numbers", () => {
    assert.equal(isValidRadius(1), true);
    assert.equal(isValidRadius(0), false);
    assert.equal(isValidRadius(-1), false);
    assert.equal(isValidRadius(Number.NaN), false);
    assert.equal(isValidRadius(Number.POSITIVE_INFINITY), false);
  });

  it("isValidAccuracy accepts non-negative finite numbers", () => {
    assert.equal(isValidAccuracy(0), true);
    assert.equal(isValidAccuracy(10), true);
    assert.equal(isValidAccuracy(-1), false);
    assert.equal(isValidAccuracy(Number.NaN), false);
    assert.equal(isValidAccuracy(Number.POSITIVE_INFINITY), false);
  });
});
