import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Announcements — attachment storage on the private filesystem (server-only).
 *
 * Files live under `/opt/hris-private/announcements/<announcement_id>/`. The
 * `storage_key` persisted in the database is the path RELATIVE to the private
 * root (`<announcement_id>/<uuid>.<ext>`): the announcement id supplies the
 * directory, the server generates the filename. No user-supplied path
 * component is ever used — everything passes through `resolveWithinRoot`,
 * mirroring `lib/payroll/payslip-pdf.ts`, and reads/deletes resolve the same
 * key the store wrote.
 *
 * Bytes are stored verbatim on the private volume (the attachment classifier
 * has already verified magic bytes, extension and MIME alignment). The raw files
 * are never exposed except through the authenticated download route.
 */

// `HRIS_PRIVATE_ROOT` lets a staging/QA instance keep its files elsewhere;
// production keeps the fixed default.
const PRIVATE_ROOT = path.join(
  process.env.HRIS_PRIVATE_ROOT?.trim() || "/opt/hris-private",
  "announcements"
);

function resolveWithinRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Resolved attachment path escapes the private root.");
  }
  return resolved;
}

/**
 * Shape of a path component that ORIGINATES from a database UUID
 * (`announcements.id`). It is a `uuid` column, so any component that is not
 * a UUID is malformed by definition and is refused before it can reach the
 * filesystem.
 */
const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve one announcement's attachment folder.
 *
 * STRICTER than `resolveWithinRoot`, on purpose:
 *  - the segment must be a UUID, so `..`, `.` and absolute paths can never
 *    reach the filesystem;
 *  - the result must resolve STRICTLY INSIDE the private root — never the
 *    root itself. `rm(path, { recursive: true })` on the root would erase
 *    EVERY announcement attachment on the instance, so that target is refused
 *    outright instead of being relied upon to never happen.
 *
 * The store and the removal resolve the folder through this one function, so
 * an attachment can only ever be written to the same folder that the removal
 * is allowed to delete.
 */
function resolveAnnouncementFolder(announcementId: string): string {
  if (!UUID_PATH_SEGMENT.test(announcementId)) {
    throw new Error(
      "Refusing to use an announcement attachment folder outside the private root."
    );
  }
  const resolved = path.resolve(PRIVATE_ROOT, announcementId);
  if (!resolved.startsWith(`${PRIVATE_ROOT}${path.sep}`)) {
    throw new Error("Resolved attachment path escapes the private root.");
  }
  return resolved;
}

export interface StoredAnnouncementAttachment {
  storageKey: string;
  sha256: string;
  fileSize: number;
}

/**
 * Persist a validated attachment buffer and return the server-generated
 * metadata to store alongside the file.
 */
export async function storeAnnouncementAttachment(input: {
  announcementId: string;
  bytes: Uint8Array;
  extension: string;
}): Promise<StoredAnnouncementAttachment> {
  const directory = resolveAnnouncementFolder(input.announcementId);
  await mkdir(directory, { recursive: true });

  const fileName = `${randomUUID()}.${input.extension}`;
  const filePath = resolveWithinRoot(directory, fileName);
  const buffer = Buffer.from(input.bytes);
  await writeFile(filePath, buffer);

  return {
    storageKey: `${input.announcementId}/${fileName}`,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    fileSize: buffer.byteLength,
  };
}

/** Read a stored attachment by its database storage_key (validated filename). */
export async function readAnnouncementAttachment(
  storageKey: string
): Promise<Buffer> {
  const filePath = resolveWithinRoot(PRIVATE_ROOT, storageKey);
  return readFile(filePath);
}

/** Remove one stored attachment (no-op when missing). */
export async function deleteAnnouncementAttachment(
  storageKey: string
): Promise<void> {
  try {
    await unlink(resolveWithinRoot(PRIVATE_ROOT, storageKey));
  } catch {
    // Already gone — nothing to do.
  }
}

/** Outcome of a whole-folder removal, for the deletion audit trail. */
export interface AnnouncementStorageRemoval {
  /**
   * True when the removal completed WITHOUT ERROR.
   *
   * An already-absent folder also reports `true`: `rm(..., { force: true })`
   * is a no-op then, and there is nothing left to remove. Only a genuine
   * failure (an I/O error, or a refused path) reports `false` — and it
   * always carries the reason in `error`.
   */
  removed: boolean;
  /** Non-null only when the removal was attempted and threw. */
  error: string | null;
}

/**
 * Remove the whole announcement folder (used when an announcement is deleted).
 *
 * Never throws: the caller has already committed the row deletion by the time
 * this runs, so a refusal or an I/O error is reported through the outcome
 * rather than failing the request.
 */
export async function deleteAnnouncementStorage(
  announcementId: string
): Promise<AnnouncementStorageRemoval> {
  try {
    await rm(resolveAnnouncementFolder(announcementId), {
      recursive: true,
      force: true,
    });
    return { removed: true, error: null };
  } catch (error) {
    return {
      removed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}