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
  .min(1, "Masukkan nomor karyawan.")
  .max(32, "Nomor karyawan maksimal 32 karakter.")
  .regex(
    EMPLOYEE_NUMBER_PATTERN,
    "Employee number may contain letters, digits and . _ / - only."
  );

const nameSchema = z
  .string()
  .trim()
  .min(1, "Masukkan nama.")
  .max(100, "Nama maksimal 100 karakter.");

/** Last name may be empty (optional). Only length is capped when present. */
const lastNameSchema = z
  .string()
  .trim()
  .max(100, "Nama maksimal 100 karakter.")
  .optional()
  .default("");

const optionalEmailSchema = z
  .email("Masukkan alamat email yang valid.")
  .max(254, "Email maksimal 254 karakter.");

const optionalPhoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(30, "Telepon maksimal 30 karakter.");

const optionalDateSchema = z
  .string()
  .regex(DATE_PATTERN, "Gunakan format tanggal YYYY-MM-DD.");

const optionalUserLinkSchema = z
  .string()
  .regex(UUID_PATTERN, "Akun pengguna yang dipilih tidak valid.");

/** NIK (National Identity Number): 1 to 32 digits, numeric only. */
const optionalNikSchema = z
  .string()
  .trim()
  .regex(NIK_PATTERN, "NIK harus berisi 1–32 digit.");

/** Date of birth: valid calendar date, never in the future. */
const optionalBirthDateSchema = z
  .string()
  .regex(DATE_PATTERN, "Gunakan format tanggal YYYY-MM-DD.")
  .refine(isValidCalendarDate, "Bukan tanggal kalender yang valid.")
  .refine((value) => !isFutureDate(value), "Tanggal lahir tidak boleh di masa depan.");

/** Shared employee profile fields. */
const employeeFieldsSchema = z.object({
  employeeNumber: employeeNumberSchema,
  firstName: nameSchema,
  /** Last Name is optional — defaults to empty string when absent. */
  lastName: lastNameSchema,
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
  /**
   * Optional project filter. Only the UUID *shape* is validated here; whether
   * the project actually belongs to the selected organization is enforced
   * server-side by the page/route (and again by the organization-scoped
   * EXISTS predicate in the query), so a cross-tenant id can never match.
   */
  projectId: z.string().regex(UUID_PATTERN, "ID proyek tidak valid.").optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeListSearchInput = z.infer<
  typeof employeeListSearchSchema
>;
