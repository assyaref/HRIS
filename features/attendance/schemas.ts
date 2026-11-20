import { z } from "zod";
import {
  isValidLatitude,
  isValidLongitude,
} from "@/lib/attendance/geofence";

/**
 * Attendance input validation (Phase 6).
 *
 * The client supplies only: project/location selection, GPS latitude /
 * longitude / accuracy (or an explicit location-issue reason), and optional
 * notes. The employee, organization, attendance date and timestamps are
 * ALWAYS resolved server-side.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidSchema = z
  .string()
  .regex(UUID_PATTERN, "ID tidak valid.");

const latitudeSchema = z
  .number("Latitude wajib diisi.")
  .refine(isValidLatitude, "Latitude di luar rentang.");

const longitudeSchema = z
  .number("Longitude wajib diisi.")
  .refine(isValidLongitude, "Longitude di luar rentang.");

const accuracySchema = z
  .number("Akurasi lokasi wajib diisi.")
  .min(0, "Akurasi tidak boleh negatif.");

const notesSchema = z
  .string()
  .trim()
  .max(500, "Catatan maksimal 500 karakter.");

export const attendanceLocationIssueSchema = z.enum([
  "denied",
  "unavailable",
  "timeout",
]);
export type AttendanceLocationIssue = z.infer<
  typeof attendanceLocationIssueSchema
>;

/**
 * GPS result from the browser: either a coordinate fix or an explicit issue.
 * An "obtained" fix still must pass server-side geofence evaluation.
 */
export const attendanceLocationSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("obtained"),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    accuracyMeters: accuracySchema,
  }),
  z.object({
    status: z.literal("denied"),
  }),
  z.object({
    status: z.literal("unavailable"),
  }),
]);
export type AttendanceLocationInput = z.infer<
  typeof attendanceLocationSchema
>;

export const checkInSchema = z.object({
  projectId: uuidSchema,
  workLocationId: uuidSchema,
  location: attendanceLocationSchema,
  notes: notesSchema.optional(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const checkOutSchema = z.object({
  location: attendanceLocationSchema,
  notes: notesSchema.optional(),
});
export type CheckOutInput = z.infer<typeof checkOutSchema>;

/** Filters for the management attendance view (URL query params). */
export const attendanceFilterSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Gunakan format tanggal YYYY-MM-DD.")
    .optional(),
  projectId: z.string().regex(UUID_PATTERN).optional(),
  status: z.enum(["present", "completed", "incomplete", "rejected"]).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
});
export type AttendanceFilterInput = z.infer<typeof attendanceFilterSchema>;
