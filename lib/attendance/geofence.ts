/**
 * Reusable geofence utilities (Phase 6).
 *
 * Security contract:
 * - The SERVER evaluates whether a reported coordinate is inside a geofence.
 * - The browser only supplies latitude/longitude/accuracy. Fields such as
 *   `insideGeofence` or `distance` are never accepted from the client.
 * - Accuracy is evaluated against a documented threshold before the distance
 *   check.
 *
 * This module is pure (no DB, no server-only) so it can be unit-tested and
 * reused by server actions.
 */

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

/** Earth radius in meters. */
const EARTH_RADIUS_METERS = 6371008.8;

/** Used when a work location does not define `max_gps_accuracy_meters`. */
export const DEFAULT_MAX_GPS_ACCURACY_METERS = 100;

export function isValidLatitude(latitude: number): boolean {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
}

export function isValidLongitude(longitude: number): boolean {
  return Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function isValidRadius(radiusMeters: number): boolean {
  return Number.isFinite(radiusMeters) && radiusMeters > 0;
}

export function isValidAccuracy(accuracyMeters: number): boolean {
  return Number.isFinite(accuracyMeters) && accuracyMeters >= 0;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates in meters (Haversine).
 */
export function haversineDistanceMeters(
  a: GeoCoordinate,
  b: GeoCoordinate
): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export type GeofenceEvaluation =
  | { status: "valid"; distanceMeters: number }
  | { status: "outside_geofence"; distanceMeters: number }
  | { status: "missing_accuracy" }
  | { status: "poor_accuracy"; accuracyMeters: number }
  | { status: "geofence_not_configured" }
  | { status: "invalid_coordinates" };

export interface EvaluateGeofenceInput {
  /** Reported device position. */
  latitude: number;
  longitude: number;
  /** Reported GPS accuracy in meters (may be 0, which we treat as missing). */
  accuracyMeters: number | null;
  /** Work-location center. */
  centerLatitude: number | null;
  centerLongitude: number | null;
  /** Work-location geofence radius in meters. */
  radiusMeters: number | null;
  /** Work-location accuracy threshold; null falls back to a documented default. */
  maxAccuracyMeters?: number | null;
}

/**
 * Server-side geofence evaluation.
 *
 * Order of checks:
 * 1. Coordinates/radius must be well-formed or the geofence is unusable.
 * 2. Reported accuracy must be available and within the allowed threshold;
 *    otherwise the position cannot be trusted (unavailable/poor accuracy).
 * 3. Distance from the work-location center decides valid vs outside.
 */
export function evaluateGeofence(input: EvaluateGeofenceInput): GeofenceEvaluation {
  const {
    latitude,
    longitude,
    accuracyMeters,
    centerLatitude,
    centerLongitude,
    radiusMeters,
    maxAccuracyMeters,
  } = input;

  if (
    !isValidLatitude(latitude) ||
    !isValidLongitude(longitude) ||
    !isValidLatitude(centerLatitude ?? Number.NaN) ||
    !isValidLongitude(centerLongitude ?? Number.NaN)
  ) {
    return { status: "invalid_coordinates" };
  }

  if (centerLatitude === null || centerLongitude === null) {
    return { status: "geofence_not_configured" };
  }
  if (!isValidRadius(radiusMeters ?? Number.NaN) || radiusMeters === null) {
    return { status: "geofence_not_configured" };
  }

  if (accuracyMeters === null || accuracyMeters === 0) {
    return { status: "missing_accuracy" };
  }
  if (!isValidAccuracy(accuracyMeters)) {
    return { status: "missing_accuracy" };
  }
  const threshold =
    maxAccuracyMeters ?? DEFAULT_MAX_GPS_ACCURACY_METERS;
  if (accuracyMeters > threshold) {
    return { status: "poor_accuracy", accuracyMeters };
  }

  const distanceMeters = haversineDistanceMeters(
    { latitude, longitude },
    { latitude: centerLatitude, longitude: centerLongitude }
  );

  if (distanceMeters > radiusMeters) {
    return { status: "outside_geofence", distanceMeters };
  }
  return { status: "valid", distanceMeters };
}
