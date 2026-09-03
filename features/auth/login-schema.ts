import { z } from "zod";

/**
 * Login input validation.
 *
 * Deliberately permissive on password length/shape: at login we only assert
 * the field is present and let password verification decide. Enforcing
 * strength rules here would leak policy and reject legacy accounts. Strength
 * policy belongs to the future user-provisioning flow.
 */
export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginInput = z.infer<typeof loginSchema>;
