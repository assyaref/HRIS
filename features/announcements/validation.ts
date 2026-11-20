/**
 * Announcements — input validation (pure, unit-testable).
 *
 * Uses only `zod` + local constants so the rules can be exercised with
 * `node --test`. The server actions parse raw FormData through these schemas
 * before anything touches storage or the database.
 */

import { z } from "zod";
import {
  ANNOUNCEMENT_CONTENT_MAX_LENGTH,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_TARGET_TYPES,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
} from "./constants.ts";

/** `localdatetime` inputs as emitted by `<input type="datetime-local">`. */
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const optionalLocalDateTime = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") return null;
    return String(value);
  },
  z
    .string()
    .refine(
      (value) =>
        localDateTimePattern.test(value) &&
        !Number.isNaN(new Date(value).getTime()),
      { message: "Harus berupa tanggal dan jam yang valid." }
    )
    .nullable()
);

/** Checkbox values arrive as `"on"` / `true` when checked, absent otherwise. */
const pinnedField = z.preprocess(
  (value) => value === "on" || value === true || value === "true",
  z.boolean()
);

/** Plain-text guard — announcements render with `whitespace-pre-wrap`, never HTML. */
function isPlainText(value: string): boolean {
  return !value.includes("<") && !value.includes(">");
}

const titleField = z
  .string()
  .trim()
  .min(1, { message: "Judul wajib diisi." })
  .max(ANNOUNCEMENT_TITLE_MAX_LENGTH, {
    message: `Judul maksimal ${ANNOUNCEMENT_TITLE_MAX_LENGTH} karakter.`,
  })
  .refine(isPlainText, { message: "Judul tidak boleh berisi tag HTML." });

const contentField = z
  .string()
  .trim()
  .min(1, { message: "Isi wajib diisi." })
  .max(ANNOUNCEMENT_CONTENT_MAX_LENGTH, {
    message: `Isi maksimal ${ANNOUNCEMENT_CONTENT_MAX_LENGTH} karakter.`,
  })
  .refine(isPlainText, { message: "Isi tidak boleh mengandung tag HTML." });

const priorityField = z.enum(ANNOUNCEMENT_PRIORITIES, {
  message: "Prioritas tidak valid.",
});

const targetTypeField = z.enum(ANNOUNCEMENT_TARGET_TYPES, {
  message: "Target tidak valid.",
});

export const createAnnouncementSchema = z
  .object({
    title: titleField,
    content: contentField,
    priority: priorityField,
    pinned: pinnedField,
    scheduledAt: optionalLocalDateTime,
    expiresAt: optionalLocalDateTime,
    targetType: targetTypeField,
    employeeIds: z
      .array(z.string().uuid())
      .max(1000, { message: "Terlalu banyak penerima yang dipilih." }),
  })
  .refine((data) => {
    if (data.targetType !== "selected_employees") return true;
    return data.employeeIds.length > 0;
  }, "Pilih minimal satu karyawan saat menargetkan karyawan terpilih.")
  .refine(
    (data) =>
      !data.scheduledAt ||
      !data.expiresAt ||
      new Date(data.scheduledAt) <= new Date(data.expiresAt),
    "Waktu terjadwal tidak boleh setelah waktu kedaluwarsa."
  );

export type CreateAnnouncementInput = z.infer<
  typeof createAnnouncementSchema
>;

/**
 * Update payload — the audience (targetType/recipients) is immutable once an
 * announcement exists; it is managed via dedicated publish-time actions.
 */
export const updateAnnouncementSchema = z
  .object({
    title: titleField,
    content: contentField,
    priority: priorityField,
    pinned: pinnedField,
    scheduledAt: optionalLocalDateTime,
    expiresAt: optionalLocalDateTime,
  })
  .refine(
    (data) =>
      !data.scheduledAt ||
      !data.expiresAt ||
      new Date(data.scheduledAt) <= new Date(data.expiresAt),
    "Waktu terjadwal tidak boleh setelah waktu kedaluwarsa."
  );

export type UpdateAnnouncementInput = z.infer<
  typeof updateAnnouncementSchema
>;

/**
 * Raw FormData extraction helpers — normalize multipart values before the
 * zod parse above so checkbox/multi-select semantics survive.
 */
export function extractCreateAnnouncementFormData(
  formData: FormData
): Record<string, unknown> {
  return {
    title: formData.get("title") ?? "",
    content: formData.get("content") ?? "",
    priority: formData.get("priority") ?? "normal",
    pinned: formData.get("pinned") ?? false,
    scheduledAt: formData.get("scheduledAt") ?? null,
    expiresAt: formData.get("expiresAt") ?? null,
    targetType: formData.get("targetType") ?? "all_employees",
    employeeIds: formData.getAll("employeeIds").map((value) =>
      String(value)
    ),
  };
}

export function extractUpdateAnnouncementFormData(
  formData: FormData
): Record<string, unknown> {
  return {
    title: formData.get("title") ?? "",
    content: formData.get("content") ?? "",
    priority: formData.get("priority") ?? "normal",
    pinned: formData.get("pinned") ?? false,
    scheduledAt: formData.get("scheduledAt") ?? null,
    expiresAt: formData.get("expiresAt") ?? null,
  };
}