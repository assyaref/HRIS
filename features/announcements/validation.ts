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
      { message: "Must be a valid date and time." }
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
  .min(1, { message: "Title is required." })
  .max(ANNOUNCEMENT_TITLE_MAX_LENGTH, {
    message: `Title may not exceed ${ANNOUNCEMENT_TITLE_MAX_LENGTH} characters.`,
  })
  .refine(isPlainText, { message: "Title may not contain HTML tags." });

const contentField = z
  .string()
  .trim()
  .min(1, { message: "Content is required." })
  .max(ANNOUNCEMENT_CONTENT_MAX_LENGTH, {
    message: `Content may not exceed ${ANNOUNCEMENT_CONTENT_MAX_LENGTH} characters.`,
  })
  .refine(isPlainText, { message: "Content may not contain HTML tags." });

const priorityField = z.enum(ANNOUNCEMENT_PRIORITIES, {
  message: "Invalid priority.",
});

const targetTypeField = z.enum(ANNOUNCEMENT_TARGET_TYPES, {
  message: "Invalid target.",
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
      .max(1000, { message: "Too many recipients selected." }),
  })
  .refine((data) => {
    if (data.targetType !== "selected_employees") return true;
    return data.employeeIds.length > 0;
  }, "Select at least one employee when targeting selected employees.")
  .refine(
    (data) =>
      !data.scheduledAt ||
      !data.expiresAt ||
      new Date(data.scheduledAt) <= new Date(data.expiresAt),
    "Scheduled time must not be after the expiry time."
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
    "Scheduled time must not be after the expiry time."
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