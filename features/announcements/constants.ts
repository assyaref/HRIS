/**
 * Announcements — application-level constants (pure, unit-testable).
 *
 * Deliberately free of `server-only`, database and Next.js imports so the
 * rules can be exercised with `node --test` (mirroring
 * `features/employees/constants.ts` / `features/work-locations/guardrails.ts`).
 */

export const ANNOUNCEMENT_STATUSES = [
  "draft",
  "published",
  "unpublished",
] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_PRIORITIES = [
  "normal",
  "important",
  "urgent",
] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

export const ANNOUNCEMENT_TARGET_TYPES = [
  "all_employees",
  "selected_employees",
] as const;
export type AnnouncementTargetType =
  (typeof ANNOUNCEMENT_TARGET_TYPES)[number];

export const ANNOUNCEMENT_STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: "Draft",
  published: "Published",
  unpublished: "Unpublished",
};

export const ANNOUNCEMENT_PRIORITY_LABELS: Record<
  AnnouncementPriority,
  string
> = {
  normal: "Normal",
  important: "Important",
  urgent: "Urgent",
};

export const ANNOUNCEMENT_TARGET_LABELS: Record<
  AnnouncementTargetType,
  string
> = {
  all_employees: "All employees",
  selected_employees: "Selected employees",
};

export function isAnnouncementStatus(
  value: string
): value is AnnouncementStatus {
  return (ANNOUNCEMENT_STATUSES as readonly string[]).includes(value);
}

export function isAnnouncementPriority(
  value: string
): value is AnnouncementPriority {
  return (ANNOUNCEMENT_PRIORITIES as readonly string[]).includes(value);
}

export function isAnnouncementTargetType(
  value: string
): value is AnnouncementTargetType {
  return (ANNOUNCEMENT_TARGET_TYPES as readonly string[]).includes(value);
}

/** Title length cap (input is additionally trimmed). */
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 200;

/** Content length cap (plain text input; the client renders it as paragraphs). */
export const ANNOUNCEMENT_CONTENT_MAX_LENGTH = 10000;

/** Hard cap on attachments per announcement. */
export const ANNOUNCEMENT_MAX_ATTACHMENTS = 3;

/** Per-file size cap (10 MB). */
export const ANNOUNCEMENT_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum display length of a sanitized original filename. */
export const ANNOUNCEMENT_FILENAME_MAX_LENGTH = 255;

/**
 * Accepted attachment formats. Classification requires alignment of three
 * signals: magic bytes, file extension and declared MIME type. Anything else
 * is rejected — no executables, HTML, or arbitrary blobs.
 */
export const ANNOUNCEMENT_ATTACHMENT_KINDS = {
  pdf: {
    mimeType: "application/pdf",
    extensions: ["pdf"],
    mimeTypes: ["application/pdf"],
    magic: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  png: {
    mimeType: "image/png",
    extensions: ["png"],
    mimeTypes: ["image/png"],
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  jpeg: {
    mimeType: "image/jpeg",
    extensions: ["jpg", "jpeg"],
    mimeTypes: ["image/jpeg"],
    magic: [0xff, 0xd8, 0xff],
  },
  zip: {
    mimeType: "application/zip",
    extensions: ["zip", "docx", "xlsx"],
    mimeTypes: [
      "application/zip",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
  ole: {
    mimeType: "application/octet-stream",
    extensions: ["doc", "xls"],
    mimeTypes: [
      "application/octet-stream",
      "application/msword",
      "application/vnd.ms-excel",
    ],
    magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  },
} as const;

export type AnnouncementAttachmentKind =
  keyof typeof ANNOUNCEMENT_ATTACHMENT_KINDS;

/** Display order for the accepted kinds. */
export const ANNOUNCEMENT_ATTACHMENT_KIND_ORDER: readonly AnnouncementAttachmentKind[] =
  ["pdf", "png", "jpeg", "zip", "ole"];