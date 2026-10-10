import { z } from "zod";

import { validatePasswordPolicy, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "../../lib/auth/password-policy.ts";

/**
 * Change password validation schema.
 * Uses the shared password policy from lib/auth/password-policy.ts
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Password saat ini wajib diisi."),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password baru minimal ${PASSWORD_MIN_LENGTH} karakter.`)
      .max(PASSWORD_MAX_LENGTH, `Password maksimal ${PASSWORD_MAX_LENGTH} karakter.`),
    confirmPassword: z.string().min(1, "Konfirmasi password wajib diisi."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Konfirmasi password tidak sama.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Password baru harus berbeda dari password saat ini.",
    path: ["newPassword"],
  })
  .refine((data) => {
    const result = validatePasswordPolicy(data.newPassword, { complexity: true });
    return result.ok;
  }, {
    message: "Password baru harus memenuhi: minimal 8 karakter, huruf besar, huruf kecil, angka, dan karakter khusus.",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;