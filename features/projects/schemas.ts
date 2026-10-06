import { z } from "zod";

export const PROJECT_STATUSES = [
  "active",
  "inactive",
  "completed",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_CODE_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$/;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const projectCodeSchema = z
  .string()
  .trim()
  .min(1, "Project code is required.")
  .max(32, "Project code must be 32 characters or fewer.")
  .regex(
    PROJECT_CODE_PATTERN,
    "Project code may contain letters, digits and . _ / - only."
  );

const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Project name is required.")
  .max(150, "Project name must be 150 characters or fewer.");

const optionalDateSchema = z
  .string()
  .regex(datePattern, "Use the YYYY-MM-DD date format.");

const projectStatusSchema = z.enum(PROJECT_STATUSES);

/**
 * Create project.
 *
 * organizationId is intentionally absent.
 * It must always come from the authenticated user's session.
 */
export const createProjectSchema = z
  .object({
    code: projectCodeSchema,
    name: projectNameSchema,
    status: projectStatusSchema.default("active"),
    startDate: optionalDateSchema.optional(),
    endDate: optionalDateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date cannot be earlier than start date.",
      });
    }
  })
  .strict();

/**
 * Update project profile/lifecycle.
 *
 * organizationId and projectId are intentionally absent.
 * Both are supplied by the server-side action.
 */
export const updateProjectSchema = z
  .object({
    code: projectCodeSchema.optional(),
    name: projectNameSchema.optional(),
    status: projectStatusSchema.optional(),
    startDate: optionalDateSchema.optional(),
    endDate: optionalDateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date cannot be earlier than start date.",
      });
    }
  })
  .strict();

/**
 * Explicit lifecycle transition.
 */
export const updateProjectStatusSchema = z.object({
  status: projectStatusSchema,
});

export const projectListSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: projectStatusSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type UpdateProjectStatusInput = z.infer<
  typeof updateProjectStatusSchema
>;
export type ProjectListSearchInput = z.infer<
  typeof projectListSearchSchema
>;
