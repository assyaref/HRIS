import { z } from "zod";

import {
  ORGANIZATION_CODE_MAX_LENGTH,
  ORGANIZATION_CODE_MIN_LENGTH,
  ORGANIZATION_CODE_PATTERN,
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_STATUSES,
} from "./constants.ts";

/**
 * Organizations — input validation (R19).
 *
 * Mirrors `features/work-locations/schemas.ts`: strict zod schemas re-checked
 * by the server actions, `.strict()` so unknown keys are rejected, and the
 * shared limits come from `./constants` so schema, UI and tests agree.
 * Authorization is decided by `requireSuperAdmin` in the actions — never here.
 */

const nameSchema = z
  .string()
  .trim()
  .min(1, "Nama organisasi wajib diisi.")
  .max(
    ORGANIZATION_NAME_MAX_LENGTH,
    `Nama organisasi maksimal ${ORGANIZATION_NAME_MAX_LENGTH} karakter.`
  );

/**
 * Codes are normalized to uppercase before parsing by the actions (tenant
 * identifiers must be stable). Only letters, digits, `-` and `_` are allowed,
 * starting with a letter/digit — mirroring the role-code convention.
 */
const codeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => value.length >= ORGANIZATION_CODE_MIN_LENGTH,
    `Kode minimal ${ORGANIZATION_CODE_MIN_LENGTH} karakter.`
  )
  .refine(
    (value) => value.length <= ORGANIZATION_CODE_MAX_LENGTH,
    `Kode maksimal ${ORGANIZATION_CODE_MAX_LENGTH} karakter.`
  )
  .refine(
    (value) => ORGANIZATION_CODE_PATTERN.test(value),
    "Kode hanya boleh berisi huruf, angka, tanda hubung, dan garis bawah, serta harus diawali huruf atau angka."
  );

const statusSchema = z.enum(ORGANIZATION_STATUSES);

export const createOrganizationSchema = z
  .object({
    name: nameSchema,
    code: codeSchema,
    status: statusSchema.default("active"),
  })
  .strict();

export const updateOrganizationSchema = z
  .object({
    name: nameSchema.optional(),
    code: codeSchema.optional(),
    status: statusSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.code !== undefined ||
      value.status !== undefined,
    { message: "Isi minimal satu field untuk diperbarui." }
  );

export type CreateOrganizationInput = z.infer<
  typeof createOrganizationSchema
>;
export type UpdateOrganizationInput = z.infer<
  typeof updateOrganizationSchema
>;
