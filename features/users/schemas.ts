import { z } from "zod";

import { USER_STATUSES } from "./policy.ts";

/**
 * User account CRUD input validation (Phase 12).
 *
 * Mirrors the project validation conventions: zod schemas re-validated by the
 * server actions, empty optionals normalized before parsing, and strict
 * unknown-key rejection. Authorization is never decided here — these schemas
 * only shape/validate input. Roles are referenced by UUID (never by code)
 * because role IDs are the stable identity of the role catalog; the server
 * resolves the code from the database.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const emailSchema = z
  .email("Enter a valid email address.")
  .max(254, "Email must be 254 characters or fewer.");

const optionalNameSchema = z
  .string()
  .trim()
  .max(120, "Name must be 120 characters or fewer.");

const uuidSchema = z
  .string()
  .regex(UUID_PATTERN, "The selected value is invalid.");

const optionalUuidSchema = z
  .string()
  .regex(UUID_PATTERN, "The selected value is invalid.");

/** Password rules mirror the existing employee account creation policy. */
export const PASSWORD_MIN_LENGTH = 8;

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(128, "Password must be 128 characters or fewer.");

/**
 * Create payload. `name` is optional in storage (legacy accounts have no
 * name), but the UI encourages it; `email` must be a valid address with
 * server-side duplicate protection. `status` uses the existing
 * pending|active|suspended|locked contract. When the account is created
 * `active`, a password is required because the authentication layer (Argon2id
 * hash) requires credentials for active accounts; a `pending` invitation may
 * be created without one.
 */
export const createUserSchema = z
  .object({
    name: optionalNameSchema.optional(),
    email: emailSchema,
    organizationId: uuidSchema,
    roleId: uuidSchema,
    employeeId: optionalUuidSchema.optional(),
    status: z.enum(USER_STATUSES),
    password: passwordSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "active" && !value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "A password is required for an active account.",
      });
    }
  });

/** Update payload — organization is immutable after creation (see actions). */
export const updateUserSchema = z.object({
  name: optionalNameSchema.optional(),
  email: emailSchema,
  roleId: optionalUuidSchema.optional(),
  employeeId: optionalUuidSchema.optional(),
  status: z.enum(USER_STATUSES),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;