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

const uuidSchema = z.string().uuid("Format ID tidak valid.");

const projectCodeSchema = z
  .string()
  .trim()
  .min(1, "Kode proyek wajib diisi.")
  .max(32, "Kode proyek maksimal 32 karakter.")
  .regex(
    PROJECT_CODE_PATTERN,
    "Project code may contain letters, digits and . _ / - only."
  );

const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Nama proyek wajib diisi.")
  .max(150, "Nama proyek maksimal 150 karakter.");

const optionalDateSchema = z
  .string()
  .regex(datePattern, "Gunakan format tanggal YYYY-MM-DD.");

const projectStatusSchema = z.enum(PROJECT_STATUSES);

/**
 * Create project.
 *
 * `organizationId` is REQUIRED and selects the tenant the project will belong
 * to. The value itself is never trusted: the server action validates that the
 * organization exists, is active and is a real `organizations.id` row before
 * inserting (Super Administrator organization selector).
 */
export const createProjectSchema = z
  .object({
    organizationId: uuidSchema,
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
        message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
      });
    }
  })
  .strict();

/**
 * Update project profile/lifecycle.
 *
 * `organizationId` is optional and only honored when the server action's
 * dependency guard allows moving the project to another organization.
 * `projectId` is intentionally absent — it is supplied by the server-side
 * action from its own bound argument, never from the client payload.
 */
export const updateProjectSchema = z
  .object({
    organizationId: uuidSchema.optional(),
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
        message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
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
  organizationId: uuidSchema.optional(),
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
