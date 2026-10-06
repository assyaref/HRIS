/**
 * Announcements — attachment metadata classification (pure, unit-testable).
 *
 * Classification requires three aligned signals: magic bytes (sniffed from the
 * first bytes of the file), the file extension, and the declared MIME type.
 * Only whitelisted kinds pass; everything else is rejected before anything is
 * written to disk. The server-side storage layer (which performs the actual
 * buffered write + SHA-256) lives separately in `lib/announcements/`.
 */

import {
  ANNOUNCEMENT_ATTACHMENT_KINDS,
  ANNOUNCEMENT_FILENAME_MAX_LENGTH,
  type AnnouncementAttachmentKind,
} from "./constants.ts";

export type AttachmentClassificationReason =
  | "filename.empty"
  | "filename.extension"
  | "magic.mismatch"
  | "mime.mismatch";

export type AttachmentClassification =
  | {
      ok: true;
      kind: AnnouncementAttachmentKind;
      extension: string;
      mimeType: string;
    }
  | {
      ok: false;
      reason: AttachmentClassificationReason;
    };

/** Sanitize a user-supplied filename to a safe display string. */
export function sanitizeOriginalFilename(filename: string): string {
  const cleaned = String(filename ?? "")
    .replace(/[\x00-\x1f\x7f\\/]/g, "")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) return "attachment";
  return cleaned.slice(0, ANNOUNCEMENT_FILENAME_MAX_LENGTH);
}

/** Lowercased extension of a filename (without the dot), or "". */
export function extractExtension(filename: string): string {
  const sanitized = sanitizeOriginalFilename(filename);
  const dotIndex = sanitized.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === sanitized.length - 1) return "";
  const extension = sanitized.slice(dotIndex + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : "";
}

function bytesMatch(prefix: number[], bytes: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  return true;
}

const ZIP_EMPTY_MAGIC = [0x50, 0x4b, 0x05, 0x06];

const magicMatches = (
  kind: (typeof ANNOUNCEMENT_ATTACHMENT_KINDS)[AnnouncementAttachmentKind],
  bytes: Uint8Array
): boolean => {
  if (bytesMatch(kind.magic as unknown as number[], bytes)) return true;
  if (kind.magic[0] === 0x50 && bytesMatch(ZIP_EMPTY_MAGIC, bytes)) {
    return true;
  }
  return false;
};

/** Find the sole kind whose whitelisted extensions include `extension`. */
function kindForExtension(extension: string): AnnouncementAttachmentKind | null {
  for (const kind of Object.keys(
    ANNOUNCEMENT_ATTACHMENT_KINDS
  ) as AnnouncementAttachmentKind[]) {
    const definition = ANNOUNCEMENT_ATTACHMENT_KINDS[kind];
    if ((definition.extensions as readonly string[]).includes(extension)) {
      return kind;
    }
  }
  return null;
}

/**
 * Classify a proposed attachment from its raw signals. `magic` should contain
 * at least the longest magic prefix defined for the target kind.
 */
export function classifyAttachment(input: {
  filename: string;
  mimeType: string;
  magic: Uint8Array;
}): AttachmentClassification {
  const extension = extractExtension(input.filename);
  if (!extension) {
    return { ok: false, reason: "filename.extension" };
  }

  const kind = kindForExtension(extension);
  if (!kind) return { ok: false, reason: "filename.extension" };

  const definition = ANNOUNCEMENT_ATTACHMENT_KINDS[kind];
  if (!magicMatches(definition, input.magic)) {
    return { ok: false, reason: "magic.mismatch" };
  }

  const declaredMime = String(input.mimeType ?? "").trim().toLowerCase();
  const allowedMimes = definition.mimeTypes as readonly string[];
  if (declaredMime && !allowedMimes.includes(declaredMime)) {
    return { ok: false, reason: "mime.mismatch" };
  }

  return {
    ok: true,
    kind,
    extension,
    mimeType: declaredMime && allowedMimes.includes(declaredMime)
      ? declaredMime
      : definition.mimeType,
  };
}