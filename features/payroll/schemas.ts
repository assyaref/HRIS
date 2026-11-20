import { z } from "zod";

import { PAYROLL_COMPONENT_METHODS, PAYROLL_COMPONENT_TYPES } from "./constants.ts";

/**
 * Payroll input validation (Phase 8).
 *
 * Server actions never accept totals, net/gross, or status from the client —
 * those are computed/transitioned server-side only. Salaries/amounts are
 * integer IDR.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const dateStringSchema = z
  .string()
  .regex(DATE_PATTERN, "Gunakan format tanggal YYYY-MM-DD.");

export const uuidStringSchema = z
  .string()
  .regex(UUID_PATTERN, "ID tidak valid.");

/** Converts a YYYY-MM-DD string to a UTC Date safely. */
export function dateToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Payroll period creation. Dates are YYYY-MM-DD; the server derives the
 * Date objects. Totals and status are never accepted here.
 */
export const createPayrollPeriodSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Kode minimal 2 karakter.")
      .max(20, "Kode maksimal 20 karakter.")
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._/-]{0,19}$/,
        "Code may contain letters, digits and . _ / - only."
      ),
    name: z
      .string()
      .trim()
      .min(1, "Masukkan nama periode.")
      .max(100, "Nama maksimal 100 karakter."),
    periodStart: dateStringSchema,
    periodEnd: dateStringSchema,
    paymentDate: dateStringSchema,
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: "Akhir periode tidak boleh sebelum awal periode.",
    path: ["periodEnd"],
  })
  .refine((data) => data.paymentDate >= data.periodStart, {
    message: "Tanggal pembayaran tidak boleh sebelum awal periode.",
    path: ["paymentDate"],
  });

export type CreatePayrollPeriodInput = z.infer<
  typeof createPayrollPeriodSchema
>;

/** Per-employee manual payroll item adjustments (optional) during a run. */
export const payrollItemManualAdjustmentSchema = z.object({
  payrollItemId: uuidStringSchema,
  /** Optional manual per-item note/target component amount. */
  componentCode: z.string().trim().max(32).optional(),
  amount: z.number().int().min(0).optional(),
});

export const rejectPayrollSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Masukkan alasan.")
    .max(500, "Alasan maksimal 500 karakter."),
});
export type RejectPayrollInput = z.infer<typeof rejectPayrollSchema>;

/** Payroll component definition (management). */
export const payrollComponentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Kode minimal 2 karakter.")
    .max(32, "Kode maksimal 32 karakter.")
    .regex(/^[a-z0-9_]+$/, "Code must be lowercase letters, digits and _."),
  name: z
    .string()
    .trim()
    .min(1, "Masukkan nama.")
    .max(100, "Nama maksimal 100 karakter."),
  type: z.enum(PAYROLL_COMPONENT_TYPES),
  calculationMethod: z.enum(PAYROLL_COMPONENT_METHODS),
  defaultAmount: z.number().int().min(0).default(0),
  description: z.string().trim().max(200).optional(),
}).superRefine((value, ctx) => {
  if (value.calculationMethod === "percentage" && value.defaultAmount > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["defaultAmount"],
      message: "Persentase harus antara 0 dan 100.",
    });
  }
});

export type PayrollComponentInput = z.infer<
  typeof payrollComponentSchema
>;