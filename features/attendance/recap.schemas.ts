import { z } from "zod";

import {
  ATTENDANCE_RATE_DECIMALS,
  RECAP_MAX_PAGE_SIZE,
  RECAP_MAX_PERIOD_DAYS,
  RECAP_PAGE_SIZE,
} from "./recap";

/**
 * Attendance Recap input validation.
 *
 * The recap is a READ-ONLY reporting layer: the client may only send period
 * bounds + employee filters + paging/sorting hints. The organization is
 * ALWAYS resolved server-side from the authenticated session (an
 * `organizationId` param is rejected outright by the routes).
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateSchema = z
  .string()
  .regex(DATE_PATTERN, "Use the YYYY-MM-DD date format.");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidSchema = z.string().regex(UUID_PATTERN, "Invalid id.");

const EMPLOYMENT_STATUSES = ["active", "inactive"] as const;

/** Sortable recap columns (server maps these to whitelisted SQL columns). */
export const RECAP_SORT_FIELDS = [
  "employeeNumber",
  "employeeName",
  "department",
  "workLocation",
  "manager",
  "workingDays",
  "present",
  "late",
  "leave",
  "sick",
  "permission",
  "absent",
  "attendanceRate",
] as const;
export type RecapSortField = (typeof RECAP_SORT_FIELDS)[number];

const sortDirectionSchema = z.enum(["asc", "desc"]);

const daysBetween = (start: string, end: string): number =>
  Math.round(
    (new Date(`${end}T00:00:00.000Z`).getTime() -
      new Date(`${start}T00:00:00.000Z`).getTime()) /
      86_400_000
  );

/**
 * Filters for the recap page (URL query params). Both period bounds are
 * required together — pages/routes fall back to the default period (current
 * month) before parsing when they are absent.
 */
export const recapFilterSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    department: z.string().trim().max(120).optional(),
    workLocationId: uuidSchema.optional(),
    managerId: uuidSchema.optional(),
    employmentType: z.string().trim().max(120).optional(),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
    q: z.string().trim().max(80).optional(),
    sort: z.enum(RECAP_SORT_FIELDS).optional(),
    dir: sortDirectionSchema.optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(RECAP_MAX_PAGE_SIZE)
      .optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "Start date cannot be later than end date.",
    path: ["startDate"],
  })
  .refine(
    (data) => daysBetween(data.startDate, data.endDate) <= RECAP_MAX_PERIOD_DAYS,
    {
      message: `The period cannot be longer than ${RECAP_MAX_PERIOD_DAYS} days.`,
      path: ["endDate"],
    }
  );
export type RecapFilterInput = z.infer<typeof recapFilterSchema>;

/** Partial period fields as they arrive from the URL (may be missing). */
export const recapPeriodParamsSchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
});

export const RECAP_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type RecapSortDirection = (typeof RECAP_SORT_DIRECTIONS)[number];

/** Default recap sorting: lowest attendance rate first. */
export const DEFAULT_RECAP_SORT: {
  sort: RecapSortField;
  dir: RecapSortDirection;
} = {
  sort: "attendanceRate",
  dir: "asc",
};

export { RECAP_PAGE_SIZE, ATTENDANCE_RATE_DECIMALS };

/** Validation error message shown when period bounds are inverted. */
export const RECAP_PERIOD_ORDER_ERROR =
  "Start date cannot be later than end date.";
