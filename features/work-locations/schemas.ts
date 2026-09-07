import { z } from "zod";

import {
  ACTIVE_WORK_LOCATION_REQUIRED_FIELDS,
  WORK_LOCATION_GPS_ACCURACY_MAX_METERS,
  WORK_LOCATION_GPS_ACCURACY_MIN_METERS,
  WORK_LOCATION_LATITUDE_MAX,
  WORK_LOCATION_LATITUDE_MIN,
  WORK_LOCATION_LONGITUDE_MAX,
  WORK_LOCATION_LONGITUDE_MIN,
  WORK_LOCATION_RADIUS_MAX_METERS,
  WORK_LOCATION_RADIUS_MIN_METERS,
  WORK_LOCATION_STATUS_ACTIVE,
  WORK_LOCATION_STATUSES,
  type ActiveRequiredWorkLocationField,
} from "./guardrails.ts";

/**
 * Work Location Management input validation (Phase 8.2 + Phase 9.5 guardrails).
 * Server-side validation that enforces geospatial constraints and business rules.
 *
 * Phase 9.5 adds:
 * - strict schemas: unknown keys are rejected instead of silently stripped;
 * - active-completeness: an ACTIVE location must include every field
 *   attendance resolution needs (project, latitude, longitude, radius);
 * - non-finite numbers (NaN/±Infinity) are rejected explicitly;
 * - bounds come from `./guardrails` so the server schema, client UX and tests
 *   share a single source of truth.
 */

// List of valid IANA timezones (common ones for this application)
// This matches timezone format used by date-fns/tz or Intl.DateTimeFormat
const validTimezones = [
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Manila",
  "Asia/Bangkok",
  "UTC",
] as const;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Location name is required.")
  .max(100, "Location name must be 100 characters or fewer.");

const latitudeSchema = z
  .number()
  .finite("Latitude must be a finite number.")
  .min(WORK_LOCATION_LATITUDE_MIN, "Latitude must be between -90 and 90.")
  .max(WORK_LOCATION_LATITUDE_MAX, "Latitude must be between -90 and 90.")
  .optional();

const longitudeSchema = z
  .number()
  .finite("Longitude must be a finite number.")
  .min(WORK_LOCATION_LONGITUDE_MIN, "Longitude must be between -180 and 180.")
  .max(WORK_LOCATION_LONGITUDE_MAX, "Longitude must be between -180 and 180.")
  .optional();

const radiusMetersSchema = z
  .number()
  .finite("Radius must be a finite number.")
  .positive("Radius must be a positive number.")
  .min(
    WORK_LOCATION_RADIUS_MIN_METERS,
    "Minimum radius is 50 meters."
  )
  .max(
    WORK_LOCATION_RADIUS_MAX_METERS,
    "Maximum radius is 50km."
  )
  .optional();

const maxGpsAccuracyMetersSchema = z
  .number()
  .finite("GPS accuracy must be a finite number.")
  .positive("GPS accuracy must be a positive number.")
  .min(WORK_LOCATION_GPS_ACCURACY_MIN_METERS, "Minimum GPS accuracy is 1 meter.")
  .max(
    WORK_LOCATION_GPS_ACCURACY_MAX_METERS,
    "Maximum GPS accuracy is 500 meters."
  )
  .optional();

const timezoneSchema = z
  .enum(validTimezones)
  .optional()
  .default("Asia/Jakarta");

const statusSchema = z
  .enum(WORK_LOCATION_STATUSES)
  .default(WORK_LOCATION_STATUS_ACTIVE);

/** Update status: genuinely optional (no default — never guess the new status). */
const optionalStatusSchema = z.enum(WORK_LOCATION_STATUSES).optional();


// Project reference. Usage contract (Phase 8.2.1):
// - REQUIRED for new/updated locations so attendance eligibility
//   (employee → assignment → project → work_locations.projectId) can resolve
//   the location. The server additionally verifies the project belongs to the
//   actor's organization and is ACTIVE before persisting (see
//   `evaluateWorkLocationProjectEligibility`).
// - The DB column stays nullable to keep legacy rows readable — no migration.
const projectIdSchema = z.string().uuid("Invalid project ID format.");

/** Project options for the Work Location selector (client-safe, no server imports). */
export interface WorkLocationProjectOption {
  id: string;
  name: string;
  code: string;
  status: string;
}

/**
 * Active-completeness guardrail (Phase 9.5 step 3).
 *
 * An ACTIVE Work Location must carry every field attendance resolution needs.
 * INACTIVE locations may stay incomplete as drafts, matching the nullable DB
 * columns. On CREATE the status defaults to ACTIVE (existing product default),
 * so a create request missing coordinates is rejected. On UPDATE an omitted
 * status must NOT be guessed here — the server action merges the submitted
 * fields with the stored row and enforces completeness against the effective
 * status (see `missingActiveWorkLocationFields`).
 */
type ActiveCompletenessCandidate = {
  status?: string | undefined;
  projectId?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  radiusMeters?: number | null | undefined;
};

function assertCompleteWhenActive(
  candidate: ActiveCompletenessCandidate,
  ctx: z.RefinementCtx
): void {
  if (candidate.status !== WORK_LOCATION_STATUS_ACTIVE) return;

  for (const field of ACTIVE_WORK_LOCATION_REQUIRED_FIELDS) {
    const fieldDef = field as ActiveRequiredWorkLocationField;
    const value = candidate[fieldDef.key];
    if (value === undefined || value === null || value === "") {
      ctx.addIssue({
        code: "custom",
        path: [fieldDef.key],
        message: `${fieldDef.label} is required for an active work location.`,
      });
    }
  }
}

export const createWorkLocationSchema = z
  .object({
    name: nameSchema,
    projectId: projectIdSchema,
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    radiusMeters: radiusMetersSchema,
    maxGpsAccuracyMeters: maxGpsAccuracyMetersSchema,
    timezone: timezoneSchema,
    status: statusSchema,
  })
  .superRefine(assertCompleteWhenActive)
  .strict();

export const updateWorkLocationSchema = z
  .object({
    name: nameSchema.optional(),
    projectId: projectIdSchema,
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    radiusMeters: radiusMetersSchema,
    maxGpsAccuracyMeters: maxGpsAccuracyMetersSchema,
    timezone: timezoneSchema,
    status: optionalStatusSchema,
  })
  .superRefine(assertCompleteWhenActive)
  .strict();

export type CreateWorkLocationInput = z.infer<typeof createWorkLocationSchema>;
export type UpdateWorkLocationInput = z.infer<typeof updateWorkLocationSchema>;
