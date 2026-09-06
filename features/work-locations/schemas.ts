import { z } from "zod";

/**
 * Work Location Management input validation (Phase 8.2).
 * Server-side validation that enforces geospatial constraints and business rules.
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
  .min(-90, "Latitude must be between -90 and 90.")
  .max(90, "Latitude must be between -90 and 90.")
  .optional();

const longitudeSchema = z
  .number()
  .min(-180, "Longitude must be between -180 and 180.")
  .max(180, "Longitude must be between -180 and 180.")
  .optional();

const radiusMetersSchema = z
  .number()
  .positive("Radius must be a positive number.")
  .min(50, "Minimum radius is 50 meters.")
  .max(50000, "Maximum radius is 50km.")
  .optional();

const maxGpsAccuracyMetersSchema = z
  .number()
  .positive("GPS accuracy must be a positive number.")
  .min(1, "Minimum GPS accuracy is 1 meter.")
  .max(500, "Maximum GPS accuracy is 500 meters.")
  .optional();

const timezoneSchema = z
  .enum(validTimezones)
  .optional()
  .default("Asia/Jakarta");

const statusSchema = z.enum(["active", "inactive"]).default("active");

// Project reference. Usage contract (Phase 8.2.1):
// - REQUIRED for new/updated locations so attendance eligibility
//   (employee → assignment → project → work_locations.projectId) can resolve
//   the location. The server additionally verifies the project belongs to the
//   actor's organization before persisting.
// - The DB column stays nullable to keep legacy rows readable — no migration.
const projectIdSchema = z.string().uuid("Invalid project ID format.");

/** Project options for the Work Location selector (client-safe, no server imports). */
export interface WorkLocationProjectOption {
  id: string;
  name: string;
  code: string;
  status: string;
}

export const createWorkLocationSchema = z.object({
  name: nameSchema,
  projectId: projectIdSchema,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  radiusMeters: radiusMetersSchema,
  maxGpsAccuracyMeters: maxGpsAccuracyMetersSchema,
  timezone: timezoneSchema,
  status: statusSchema,
});

export const updateWorkLocationSchema = z.object({
  name: nameSchema.optional(),
  projectId: projectIdSchema,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  radiusMeters: radiusMetersSchema,
  maxGpsAccuracyMeters: maxGpsAccuracyMetersSchema,
  timezone: timezoneSchema,
  status: statusSchema.optional(),
});

export type CreateWorkLocationInput = z.infer<typeof createWorkLocationSchema>;
export type UpdateWorkLocationInput = z.infer<typeof updateWorkLocationSchema>;