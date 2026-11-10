import { z } from "zod";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidSchema = z.string().regex(UUID_PATTERN, "ID tidak valid.");

/**
 * Leave master data validation: leave types and leave balances.
 * Pure (no server-only) so it is unit-testable with `node --test`.
 */

const daysSchema = z.coerce
  .number({ message: "Masukkan angka hari." })
  .finite("Masukkan angka hari.")
  .min(0, "Jumlah hari tidak boleh negatif.")
  .max(366, "Jumlah hari maksimal 366.")
  .refine((value) => Math.round(value * 2) === value * 2, {
    message: "Gunakan kelipatan 0,5 hari.",
  });

const signedDaysSchema = z.coerce
  .number({ message: "Masukkan angka hari." })
  .finite("Masukkan angka hari.")
  .min(-366, "Penyesuaian minimal -366 hari.")
  .max(366, "Penyesuaian maksimal 366 hari.")
  .refine((value) => Math.round(value * 2) === value * 2, {
    message: "Gunakan kelipatan 0,5 hari.",
  });

export const leaveYearSchema = z
  .string()
  .regex(/^\d{4}$/, "Tahun harus 4 digit.")
  .refine((value) => Number(value) >= 2000 && Number(value) <= 2100, {
    message: "Tahun di luar rentang yang diizinkan.",
  });

export const leaveTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Kode wajib diisi.")
    .max(40, "Kode maksimal 40 karakter.")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Kode hanya boleh huruf, angka, garis bawah atau tanda hubung."
    )
    .transform((value) => value.toUpperCase()),
  name: z
    .string()
    .trim()
    .min(1, "Nama wajib diisi.")
    .max(120, "Nama maksimal 120 karakter."),
  description: z
    .string()
    .trim()
    .max(500, "Deskripsi maksimal 500 karakter.")
    .optional()
    .transform((value) => (value ? value : null)),
  /** Empty → no default allowance (a balance must be set explicitly). */
  defaultAllowanceDays: z
    .union([z.literal(""), z.null(), z.undefined(), daysSchema])
    .transform((value) =>
      value === "" || value === null || value === undefined ? null : value
    ),
});
export type LeaveTypeInput = z.output<typeof leaveTypeSchema>;

export const leaveBalanceSchema = z.object({
  employeeId: uuidSchema,
  leaveTypeId: uuidSchema,
  year: leaveYearSchema,
  entitlement: daysSchema,
  adjustment: signedDaysSchema.default(0),
});
export type LeaveBalanceInput = z.output<typeof leaveBalanceSchema>;

export const generateLeaveBalancesSchema = z.object({
  leaveTypeId: uuidSchema,
  year: leaveYearSchema,
  /** Empty → use the leave type's default allowance. */
  entitlement: z
    .union([z.literal(""), z.null(), z.undefined(), daysSchema])
    .transform((value) =>
      value === "" || value === null || value === undefined ? null : value
    ),
});
export type GenerateLeaveBalancesInput = z.output<
  typeof generateLeaveBalancesSchema
>;

export const leaveBalanceFilterSchema = z.object({
  year: leaveYearSchema.optional().catch(undefined),
  leaveTypeId: uuidSchema.optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

/** Whether a balance can be deleted without losing request bookkeeping. */
export function isBalanceDeletable(balance: {
  used: number;
  pending: number;
}): boolean {
  return balance.used === 0 && balance.pending === 0;
}

/** Whether new entitlement/adjustment still cover what is already consumed. */
export function balanceCoversConsumption(input: {
  entitlement: number;
  adjustment: number;
  used: number;
  pending: number;
}): boolean {
  return input.entitlement + input.adjustment >= input.used + input.pending;
}
