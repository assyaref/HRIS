/**
 * Employee document storage policy (pure).
 *
 * Employee documents are served from the private filesystem. Files never keep
 * their original name on disk — the server generates a random storage key and
 * only the display name + DB row are surfaced to the application. This module
 * is free of `server-only`/`fs` so the upload guard is unit-testable.
 */

/** Extension → accepted MIME types. Only these document images are allowed. */
export const DOCUMENT_EXTENSION_MIME: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  doc: [
    "application/msword",
    "application/vnd.ms-office",
  ],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface DocumentUploadCheckInput {
  filename: string;
  mimeType: string;
  fileSize: number;
}

export type DocumentUploadCheckResult =
  | { ok: true; extension: string }
  | { ok: false; error: string };

/**
 * Validate an upload before it touches disk. Rejects unsafe extensions,
 * mismatched MIME types (protects against disguised payloads) and oversized
 * files.
 */
export function validateDocumentUpload(
  input: DocumentUploadCheckInput
): DocumentUploadCheckResult {
  if (!input.filename) {
    return { ok: false, error: "A file is required." };
  }
  if (input.fileSize <= 0) {
    return { ok: false, error: "The uploaded file is empty." };
  }
  if (input.fileSize > DOCUMENT_MAX_SIZE_BYTES) {
    return { ok: false, error: "File must be 10 MB or smaller." };
  }

  const lastDot = input.filename.lastIndexOf(".");
  const extension = lastDot < 0 ? "" : input.filename.slice(lastDot + 1).toLowerCase();
  const allowed = DOCUMENT_EXTENSION_MIME[extension];
  if (!allowed) {
    return {
      ok: false,
      error: "File type is not supported. Use PDF, image (PNG/JPG/WebP), Word or Excel.",
    };
  }
  const lowerMime = input.mimeType.toLowerCase();
  if (!allowed.includes(lowerMime)) {
    return {
      ok: false,
      error: `The file's content type does not match its .${extension} extension.`,
    };
  }
  return { ok: true, extension };
}

/**
 * Strip any directory components from an uploaded file name so the display
 * name can never act as a filesystem path.
 */
export function sanitizeOriginalFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/[^\x20-\x7E]/g, "").slice(0, 200) || "document";
}

/**
 * Build the server-generated storage key. Structure:
 *   employee-documents/<orgId>/<employeeId>/<uuid>.<ext>
 * Only this key (never the raw path) is stored and later resolved inside the
 * authenticated download route.
 */
export function buildDocumentStorageKey(
  organizationId: string,
  employeeId: string,
  fileId: string,
  extension: string
): string {
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `employee-documents/${organizationId}/${employeeId}/${fileId}.${safeExtension}`;
}