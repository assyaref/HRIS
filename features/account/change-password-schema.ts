import { z } from "zod";

/**
 * Change password validation schema.
 */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

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
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
