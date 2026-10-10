import { z } from "zod";

/**
 * Login validation schema.
 *
 * The sign-in identifier is EITHER the account email OR the linked
 * employee's employee number (import-provisioned accounts use the employee
 * number as their initial password). The schema is deliberately permissive:
 * the shape of the identifier is decided by the database lookup in
 * `lib/auth/auth.ts`, never by client-side validation. Strength rules do not
 * apply at login.
 */
export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Masukkan Nomor Karyawan atau Email.")
    .max(254, "Identifier terlalu panjang."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type LoginIdentifierKind = "email" | "employeeNumber" | "unknown";

/**
 * Classify a raw login identifier for UI purposes (never for security).
 *
 * An identifier containing `@` is treated as an email; anything else is an
 * employee number candidate. `lib/auth/auth.ts` performs the authoritative
 * dual lookup and fails closed on ambiguity.
 */
export function classifyLoginIdentifier(identifier: string): LoginIdentifierKind {
  const trimmed = identifier.trim();
  if (trimmed === "") return "unknown";
  if (trimmed.includes("@")) return "email";
  return "employeeNumber";
}
