import { z } from "zod";

import {
  PERMISSION_REQUEST_STATUSES,
  PERMISSION_TYPES,
} from "./constants";

/**
 * Permission request validation (Phase 7).
 * Times arrive as ISO-8601 strings (produced from a datetime-local input on
 * the client); the server parses them into Date and never treats a
 * browser-provided timestamp as an authoritative submission/approval time.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

export const createPermissionRequestSchema = z.object({
  permissionType: z.enum(PERMISSION_TYPES),
  startAt: z
    .string()
    .regex(ISO_DATETIME_PATTERN, "Start time must be a valid date-time."),
  endAt: z
    .string()
    .regex(ISO_DATETIME_PATTERN, "End time must be a valid date-time."),
  reason: z
    .string()
    .trim()
    .min(1, "Enter a reason.")
    .max(1000, "Reason must be 1000 characters or fewer."),
});
export type CreatePermissionRequestInput = z.infer<
  typeof createPermissionRequestSchema
>;

export const reviewPermissionRequestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewerNote: z
    .string()
    .trim()
    .max(500, "Reviewer note must be 500 characters or fewer.")
    .optional(),
});
export type ReviewPermissionRequestInput = z.infer<
  typeof reviewPermissionRequestSchema
>;

/** Management list filters. */
export const permissionManagementFilterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(PERMISSION_REQUEST_STATUSES).optional(),
  permissionType: z.enum(PERMISSION_TYPES).optional(),
  page: z.coerce.number().int().min(1).optional(),
});
export type PermissionManagementFilterInput = z.infer<
  typeof permissionManagementFilterSchema
>;
