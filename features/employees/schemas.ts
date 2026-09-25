import { z } from "zod";

import { EMPLOYEE_STATUSES } from "./constants.ts";

/**
 * Employee input validation (Phase 5).
 *
 * Mirrors the existing validation conventions (zod, server re-validation in
 * actions, normalized empty optionals). Optional fields are normalized from
 * empty strings to `undefined` before parsing (see features/employees/actions).
 */

export const EMPLOYEE_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$/;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `YYYY-MM-DD` (matching `<input type="date">` values and the `date` column). */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** NIK (National Identity Number): 1 to 32 digits, numeric only. */
export const NIK_PATTERN = /^\d{1,32}$/;

function isValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Lexical comparison is valid for `YYYY-MM-DD` values. */
function isFutureDate(value: string): boolean {
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return value > today;
}

const employeeNumberSchema = z
  .string()
  .trim()
  .min(1, "Enter an employee number.")
  .max(32, "Employee number must be 32 characters or fewer.")
  .regex(
    EMPLOYEE_NUMBER_PATTERN,
    "Employee number may contain letters, digits and . _ / - only."
  );

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(100, "Name must be 100 characters or fewer.");

const optionalEmailSchema = z
  .email("Enter a valid email address.")
  .max(254, "Email must be 254 characters or fewer.");

const optionalPhoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(30, "Phone must be 30 characters or fewer.");

const optionalDateSchema = z
  .string()
  .regex(DATE_PATTERN, "Use the YYYY-MM-DD date format.");

const optionalUserLinkSchema = z
  .string()
  .regex(UUID_PATTERN, "The selected user account is invalid.");

/** NIK (National Identity Number): 1 to 32 digits, numeric only. */
const optionalNikSchema = z
  .string()
  .trim()
  .regex(NIK_PATTERN, "NIK must be 1 to 32 digits.");

/** Date of birth: valid calendar date, never in the future. */
const optionalBirthDateSchema = z
  .string()
  .regex(DATE_PATTERN, "Use the YYYY-MM-DD date format.")
  .refine(isValidCalendarDate, "Not a valid calendar date.")
  .refine((value) => !isFutureDate(value), "Birth date cannot be in the future.");

/** Shared employee profile fields. */
const employeeFieldsSchema = z.object({
  employeeNumber: employeeNumberSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  email: optionalEmailSchema.optional(),
  phone: optionalPhoneSchema.optional(),
  hireDate: optionalDateSchema.optional(),
  nik: optionalNikSchema.optional(),
  birthDate: optionalBirthDateSchema.optional(),
  /** Existing user account (same organization) to link, or undefined to unlink. */
  userId: optionalUserLinkSchema.optional(),
});

export const createEmployeeSchema = employeeFieldsSchema;

/** Profile edit — status is optional and handled by the status action rules. */
export const updateEmployeeSchema = employeeFieldsSchema.extend({
  employmentStatus: z.enum(EMPLOYEE_STATUSES).optional(),
});

/** Filters/search read from the employee list URL query string. */
export const employeeListSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeListSearchInput = z.infer<
  typeof employeeListSearchSchema
>;
