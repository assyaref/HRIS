import { z } from "zod";

import { PAYROLL_COMPONENT_METHODS, PAYROLL_COMPONENT_TYPES } from "./constants";

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
  .regex(DATE_PATTERN, "Use the YYYY-MM-DD date format.");

export const uuidStringSchema = z
  .string()
  .regex(UUID_PATTERN, "Invalid id.");

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
      .min(2, "Code must be at least 2 characters.")
      .max(20, "Code must be 20 characters or fewer.")
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._/-]{0,19}$/,
        "Code may contain letters, digits and . _ / - only."
      ),
    name: z
      .string()
      .trim()
      .min(1, "Enter a period name.")
      .max(100, "Name must be 100 characters or fewer."),
    periodStart: dateStringSchema,
    periodEnd: dateStringSchema,
    paymentDate: dateStringSchema,
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: "Period end must not be before period start.",
    path: ["periodEnd"],
  })
  .refine((data) => data.paymentDate >= data.periodStart, {
    message: "Payment date must not be before the period start.",
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
    .min(1, "Enter a reason.")
    .max(500, "Reason must be 500 characters or fewer."),
});
export type RejectPayrollInput = z.infer<typeof rejectPayrollSchema>;

/** Payroll component definition (management). */
export const payrollComponentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters.")
    .max(32, "Code must be 32 characters or fewer.")
    .regex(/^[a-z0-9_]+$/, "Code must be lowercase letters, digits and _."),
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(100, "Name must be 100 characters or fewer."),
  type: z.enum(PAYROLL_COMPONENT_TYPES),
  calculationMethod: z.enum(PAYROLL_COMPONENT_METHODS),
  defaultAmount: z.number().int().min(0).default(0),
  description: z.string().trim().max(200).optional(),
});

export type PayrollComponentInput = z.infer<
  typeof payrollComponentSchema
>;