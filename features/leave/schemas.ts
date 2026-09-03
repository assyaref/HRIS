import { z } from "zod";

import { LEAVE_REQUEST_STATUSES } from "./constants";

/**
 * Leave request validation (Phase 7). Server re-validates everything at the
 * action boundary; total days are computed by the server, never accepted from
 * the client.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const uuidSchema = z
  .string()
  .regex(UUID_PATTERN, "Invalid id.");

export const dateStringSchema = z
  .string()
  .regex(DATE_PATTERN, "Use the YYYY-MM-DD date format.");

export const createLeaveRequestSchema = z.object({
  leaveTypeId: uuidSchema,
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  reason: z
    .string()
    .trim()
    .min(1, "Enter a reason.")
    .max(1000, "Reason must be 1000 characters or fewer."),
});
export type CreateLeaveRequestInput = z.infer<
  typeof createLeaveRequestSchema
>;

export const reviewRequestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewerNote: z
    .string()
    .trim()
    .max(500, "Reviewer note must be 500 characters or fewer.")
    .optional(),
});
export type ReviewRequestInput = z.infer<typeof reviewRequestSchema>;

/** Management list filters (URL query params). */
export const leaveManagementFilterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(LEAVE_REQUEST_STATUSES).optional(),
  leaveTypeId: z.string().regex(UUID_PATTERN).optional(),
  page: z.coerce.number().int().min(1).optional(),
});
export type LeaveManagementFilterInput = z.infer<
  typeof leaveManagementFilterSchema
>;
