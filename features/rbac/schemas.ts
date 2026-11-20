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
  .min(1, "Masukkan nama.")
  .max(80, "Nama maksimal 80 karakter.");

const descriptionSchema = z
  .string()
  .trim()
  .max(300, "Deskripsi maksimal 300 karakter.");

/**
 * Custom role code: uppercase letters, digits and underscores; must start with
 * a letter. Reserved catalog roles are seeded by the system and cannot be
 * re-created.
 */
const roleCodeSchema = z
  .string()
  .trim()
  .min(2, "Kode minimal 2 karakter.")
  .max(32, "Kode maksimal 32 karakter.")
  .regex(
    /^[A-Z][A-Z0-9_]{0,31}$/,
    "Gunakan huruf kapital, angka, dan garis bawah, diawali huruf."
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
