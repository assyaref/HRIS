import { z } from "zod";

import { PERMISSION_CATALOG, type Permission } from "@/lib/auth/permissions";

/**
 * RBAC administration input validation (Phase 4).
 *
 * Permission codes are validated against the centralized catalog so requests
 * cannot smuggle arbitrary capability strings into a role grant.
 */

/** Non-empty tuple of every catalog permission code (for `z.enum`). */
export const PERMISSION_CODE_TUPLE = PERMISSION_CATALOG.map(
  (definition) => definition.code
) as [Permission, ...Permission[]];

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(80, "Name must be 80 characters or fewer.");

const descriptionSchema = z
  .string()
  .trim()
  .max(300, "Description must be 300 characters or fewer.");

/**
 * Custom role code: uppercase letters, digits and underscores; must start with
 * a letter. Reserved catalog roles are seeded by the system and cannot be
 * re-created.
 */
const roleCodeSchema = z
  .string()
  .trim()
  .min(2, "Code must be at least 2 characters.")
  .max(32, "Code must be 32 characters or fewer.")
  .regex(
    /^[A-Z][A-Z0-9_]{0,31}$/,
    "Use uppercase letters, digits and underscores, starting with a letter."
  );

export const createRoleSchema = z.object({
  code: roleCodeSchema,
  name: nameSchema,
  description: descriptionSchema.optional(),
});

export const updateRoleSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
  permissionCodes: z.array(z.enum(PERMISSION_CODE_TUPLE)),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
