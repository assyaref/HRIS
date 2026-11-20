import { z } from "zod";

/**
 * PM-03.2 — Employee payroll component assignment input validation.
 *
 * Pure module (no server imports) so the schemas are unit-testable with the
 * same `node:test` foundation used across the payroll suite.
 *
 * The schemas validate ONLY shape and format. Authorization, organization
 * ownership and business rules (active employee, active component, single
 * active assignment per employee/component, percentage ≤ 100) are enforced
 * in the server action through `employee-payroll-component.guard.ts` against
 * org-scoped DB reads.
 *
 * Amount semantics (mirror db/schema/payroll.ts):
 * - fixed / manual → non-negative integer IDR magnitude
 * - percentage → whole-number percentage 0–100 (checked in the guard against
 *   the component's calculation method, which is fetched server-side)
 *
 * `organizationId`, `active` and the assignment's employee/component identity
 * are intentionally absent here — they always come from the authenticated
 * session and the DB, never from the client.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD date string (matches features/payroll/schemas.ts). */
const dateStringSchema = z
  .string()
  .regex(DATE_PATTERN, "Gunakan format tanggal YYYY-MM-DD.");

const employeeIdSchema = z
  .string()
  .regex(UUID_PATTERN, "Karyawan wajib dipilih.");

const componentIdSchema = z
  .string()
  .regex(UUID_PATTERN, "Komponen payroll wajib dipilih.");

const amountSchema = z
  .number()
  .int("Jumlah harus bilangan bulat.")
  .min(0, "Jumlah tidak boleh negatif.");

const notesSchema = z
  .string()
  .trim()
  .max(500, "Catatan maksimal 500 karakter.")
  .optional();

/** Optional YYYY-MM-DD date; an empty string from a form normalizes to absent. */
const optionalDateSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  dateStringSchema.optional()
);

function assertDateRange<T extends { effectiveFrom: string; effectiveTo?: string }>(
  value: T,
  ctx: z.RefinementCtx
): void {
  if (value.effectiveTo && value.effectiveTo <= value.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Tanggal berakhir harus setelah tanggal mulai berlaku.",
    });
  }
}

/** Assign a payroll component to an employee. */
export const employeePayrollComponentCreateSchema = z
  .object({
    employeeId: employeeIdSchema,
    componentId: componentIdSchema,
    amount: amountSchema,
    effectiveFrom: dateStringSchema,
    effectiveTo: optionalDateSchema,
    notes: notesSchema,
  })
  .superRefine(assertDateRange);

export type EmployeePayrollComponentCreateInput = z.infer<
  typeof employeePayrollComponentCreateSchema
>;

/** Edit the amount/effective window/notes of an existing assignment. */
export const employeePayrollComponentUpdateSchema = z
  .object({
    amount: amountSchema,
    effectiveFrom: dateStringSchema,
    effectiveTo: optionalDateSchema,
    notes: notesSchema,
  })
  .superRefine(assertDateRange);

export type EmployeePayrollComponentUpdateInput = z.infer<
  typeof employeePayrollComponentUpdateSchema
>;

/** Soft-end an assignment. `effectiveTo` defaults to today server-side. */
export const employeePayrollComponentEndSchema = z.object({
  effectiveTo: optionalDateSchema,
});

export type EmployeePayrollComponentEndInput = z.infer<
  typeof employeePayrollComponentEndSchema
>;