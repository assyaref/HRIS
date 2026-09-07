/**
 * Work Location configuration guardrails (PHASE 9.5) — PURE module.
 *
 * No DB, no server-only, no Next.js imports: this file is imported by the
 * server actions (authoritative validation), the client forms (supplementary
 * UX validation) and the `node:test` unit suite.
 *
 * Scope:
 * - Numeric configuration rules (latitude/longitude/radius/GPS accuracy) that
 *   the Work Location schemas enforce.
 * - Active-completeness rules: an ACTIVE location must carry every field
 *   attendance resolution needs (project + latitude + longitude + radius).
 *   Incomplete draft/INACTIVE locations stay possible, matching the nullable
 *   columns in `db/schema/locations.ts`.
 * - Project eligibility rules mirroring the existing model:
 *   `features/attendance/queries.ts` only resolves ACTIVE projects with ACTIVE
 *   assignments, and the project selectors only offer ACTIVE projects.
 * - Operational WARNINGS (never destructive blockers) surfaced to Management.
 *
 * The geofence engine (`lib/attendance/geofence.ts`) and the attendance
 * enforcement logic are NOT modified by this module.
 */

export const WORK_LOCATION_STATUS_ACTIVE = "active";
export const WORK_LOCATION_STATUS_INACTIVE = "inactive";
export const WORK_LOCATION_STATUSES = [
  WORK_LOCATION_STATUS_ACTIVE,
  WORK_LOCATION_STATUS_INACTIVE,
] as const;

/**
 * Configuration ranges — accepted (inclusive) / rejected rules.
 *
 * Radius and GPS accuracy bounds are the EXISTING business rules already
 * enforced by `features/work-locations/schemas.ts` (Phase 8.2); Phase 9.5 does
 * not invent new maxima/minima. Latitude/longitude reflect the geofence
 * engine's coordinate domain.
 */
export const WORK_LOCATION_LATITUDE_MIN = -90;
export const WORK_LOCATION_LATITUDE_MAX = 90;
export const WORK_LOCATION_LONGITUDE_MIN = -180;
export const WORK_LOCATION_LONGITUDE_MAX = 180;
export const WORK_LOCATION_RADIUS_MIN_METERS = 50;
export const WORK_LOCATION_RADIUS_MAX_METERS = 50000;
export const WORK_LOCATION_GPS_ACCURACY_MIN_METERS = 1;
export const WORK_LOCATION_GPS_ACCURACY_MAX_METERS = 500;

/** Status copy for the ACTIVE/INACTIVE legend (Phase 9.5 step 7). */
export const WORK_LOCATION_STATUS_SUMMARY: Record<string, string> = {
  [WORK_LOCATION_STATUS_ACTIVE]:
    "ACTIVE — this location is available for attendance resolution.",
  [WORK_LOCATION_STATUS_INACTIVE]:
    "INACTIVE — this location is not available for attendance.",
};

/**
 * The fields a Work Location must have before it may be ACTIVE.
 *
 * `maxGpsAccuracyMeters` is intentionally NOT in this list: the current model
 * evaluates an unset accuracy against the documented engine default
 * (`DEFAULT_MAX_GPS_ACCURACY_METERS`, 100 m), so a location without an explicit
 * accuracy is still operationally usable. The field stays optional and, when
 * provided, must be finite and positive.
 */
export interface ActiveRequiredWorkLocationField {
  key: "projectId" | "latitude" | "longitude" | "radiusMeters";
  label: string;
}

export const ACTIVE_WORK_LOCATION_REQUIRED_FIELDS: readonly ActiveRequiredWorkLocationField[] =
  [
    { key: "projectId", label: "Project" },
    { key: "latitude", label: "Latitude" },
    { key: "longitude", label: "Longitude" },
    { key: "radiusMeters", label: "Radius (meters)" },
  ];

export interface WorkLocationConfigSnapshot {
  status: string | null | undefined;
  projectId: string | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  radiusMeters: number | null | undefined;
}

/** Missing fields are reported only when the target status is `active`. */
export function missingActiveWorkLocationFields(
  config: WorkLocationConfigSnapshot
): ActiveRequiredWorkLocationField[] {
  if (config.status !== WORK_LOCATION_STATUS_ACTIVE) return [];

  const missing: ActiveRequiredWorkLocationField[] = [];

  if (!config.projectId) {
    missing.push(ACTIVE_WORK_LOCATION_REQUIRED_FIELDS[0]);
  }

  const latitude = config.latitude;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < WORK_LOCATION_LATITUDE_MIN ||
    latitude > WORK_LOCATION_LATITUDE_MAX
  ) {
    missing.push(ACTIVE_WORK_LOCATION_REQUIRED_FIELDS[1]);
  }

  const longitude = config.longitude;
  if (
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < WORK_LOCATION_LONGITUDE_MIN ||
    longitude > WORK_LOCATION_LONGITUDE_MAX
  ) {
    missing.push(ACTIVE_WORK_LOCATION_REQUIRED_FIELDS[2]);
  }

  const radiusMeters = config.radiusMeters;
  if (
    typeof radiusMeters !== "number" ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0
  ) {
    missing.push(ACTIVE_WORK_LOCATION_REQUIRED_FIELDS[3]);
  }

  return missing;
}

/** An ACTIVE Work Location is complete when no required field is missing. */
export function isActiveWorkLocationComplete(
  config: WorkLocationConfigSnapshot
): boolean {
  return missingActiveWorkLocationFields(config).length === 0;
}

/**
 * Project binding eligibility (Phase 9.5 step 4).
 *
 * Mirrors the existing model rules: only ACTIVE projects are ever offered to
 * Management and only ACTIVE projects resolve through employee assignments.
 * Cross-organization projects are reported with a safe, generic error so their
 * existence is never revealed.
 *
 * `projectIsUnchanged` lets an existing location keep its current project when
 * that project was later deactivated (preserving existing valid configuration
 * instead of trapping the location in an uneditable state).
 */
export interface WorkLocationProjectContext {
  /** Authenticated user's organization (from session — never the client). */
  actorOrganizationId: string;
  project: {
    id: string;
    organizationId: string;
    status: string;
  } | null;
  /** True when the submitted projectId equals the location's current project. */
  projectIsUnchanged: boolean;
}

export type WorkLocationProjectDecision =
  | { ok: true }
  | { ok: false; message: string };

export function evaluateWorkLocationProjectEligibility(
  context: WorkLocationProjectContext
): WorkLocationProjectDecision {
  const { project } = context;

  if (!project || project.organizationId !== context.actorOrganizationId) {
    return { ok: false, message: "The selected project is not available." };
  }

  if (
    project.status !== WORK_LOCATION_STATUS_ACTIVE &&
    !context.projectIsUnchanged
  ) {
    return {
      ok: false,
      message: "Only active projects can be bound to a work location.",
    };
  }

  return { ok: true };
}

/**
 * Operational warnings shown to Management (Phase 9.5 step 6).
 *
 * These are warnings, never destructive blockers: a location may legitimately
 * be configured before employees are assigned, and inactive locations are a
 * valid state.
 */
export interface WorkLocationWarningContext {
  status: string;
  projectStatus: string | null | undefined;
  hasActiveAssignments: boolean;
}

export function collectWorkLocationWarnings(
  context: WorkLocationWarningContext
): string[] {
  const warnings: string[] = [];

  if (context.status === WORK_LOCATION_STATUS_INACTIVE) {
    warnings.push(
      "This Work Location is inactive. Employees assigned to this project cannot use this location for attendance until it is activated."
    );
  }

  if (
    context.projectStatus &&
    context.projectStatus !== WORK_LOCATION_STATUS_ACTIVE
  ) {
    warnings.push(
      "The project linked to this Work Location is no longer active. Employees cannot use this location for attendance until the project is active again or the location is moved to an active project."
    );
  }

  const projectOperational =
    !context.projectStatus ||
    context.projectStatus === WORK_LOCATION_STATUS_ACTIVE;
  if (
    context.status === WORK_LOCATION_STATUS_ACTIVE &&
    projectOperational &&
    !context.hasActiveAssignments
  ) {
    warnings.push(
      "This Work Location is not associated with any active employee project assignment. Employees cannot check in here until at least one employee is actively assigned to this project."
    );
  }

  return warnings;
}

/**
 * Parse a Work Location numeric form field (Phase 9.5 guardrails).
 *
 * A well-formed decimal is converted to a number; empty input yields
 * `undefined` (field not provided); anything else yields `NaN` so the Zod
 * schema rejects it. This replaces permissive `parseFloat`/`parseInt`
 * conversions that silently accepted suffixes such as `100px`. Shared by the
 * server actions (authoritative) and the client forms (supplementary UX
 * validation) so both layers reject the same malformed input.
 */
const DECIMAL_INPUT_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function parseWorkLocationNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  if (raw === "") return undefined;
  if (!DECIMAL_INPUT_PATTERN.test(raw)) return Number.NaN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Map Zod issues to the `fieldErrors` shape consumed by the server action state
 * and the client forms. Root-level issues (no path) are intentionally skipped
 * so unknown-key rejection never overrides a field-level message.
 */
export function workLocationZodFieldErrors(
  issues: ReadonlyArray<{
    path: ReadonlyArray<string | number | symbol>;
    message: string;
  }>
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.path[0]) {
      fieldErrors[issue.path[0].toString()] = issue.message;
    }
  }
  return fieldErrors;
}
