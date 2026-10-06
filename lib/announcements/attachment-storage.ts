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

const PRIVATE_ROOT = "/opt/hris-private/announcements";

function resolveWithinRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
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
  const directory = resolveWithinRoot(PRIVATE_ROOT, input.announcementId);
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

/** Remove the whole announcement folder (used when an announcement is deleted). */
export async function deleteAnnouncementStorage(
  announcementId: string
): Promise<void> {
  try {
    await rm(resolveWithinRoot(PRIVATE_ROOT, announcementId), {
      recursive: true,
      force: true,
    });
  } catch {
    // Folder may not exist — nothing to do.
  }
}