import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Employee documents — private filesystem storage (server-only).
 *
 * Files live under `/opt/hris-private/employee-documents/`. The `storage_key`
 * persisted in the database is the path RELATIVE to the private root
 * (`<organization_id>/<employee_id>/<uuid>.<ext>`): both id components come
 * from the authenticated session (never the browser) and the file name is
 * server-generated. Every resolver passes through `resolveWithinRoot`,
 * mirroring `lib/announcements/attachment-storage.ts`, so a tampered key can
 * never escape the private root. Bytes are stored verbatim after the
 * upload guard has verified extension + MIME + size. Files are served ONLY by
 * the authenticated download route (`app/api/employees/[employeeId]/
 * documents/[documentId]/download/route.ts`).
 */

const PRIVATE_ROOT = "/opt/hris-private/employee-documents";

function resolveWithinRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Resolved path escapes the private root.");
  }
  return resolved;
}

/**
 * Shape of a path component that ORIGINATES from a database UUID
 * (`organizations.id`, `employees.id`). Both are `uuid` columns, so any
 * component that is not a UUID is malformed by definition and is refused
 * before it can reach the filesystem.
 */
const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve one employee's private document folder for removal.
 *
 * STRICTER than `resolveWithinRoot`, on purpose:
 *  - both path segments must be UUIDs, so `..`, `.` and absolute paths can
 *    never reach the filesystem;
 *  - the result must resolve STRICTLY INSIDE the private root — never the
 *    root itself. `rm(path, { recursive: true })` on the root would erase
 *    EVERY employee's documents, so that target is refused outright instead
 *    of being relied upon to never happen.
 *
 * A refusal is reported through the caller's outcome (`removed: false` with
 * the error message), so it is visible in the audit trail rather than silent.
 */
function resolveEmployeeDocumentFolder(
  organizationId: string,
  employeeId: string
): string {
  if (
    !UUID_PATH_SEGMENT.test(organizationId) ||
    !UUID_PATH_SEGMENT.test(employeeId)
  ) {
    throw new Error("Refusing to remove a document folder outside the private root.");
  }
  const resolved = path.resolve(PRIVATE_ROOT, organizationId, employeeId);
  if (!resolved.startsWith(`${PRIVATE_ROOT}${path.sep}`)) {
    throw new Error("Resolved path escapes the private root.");
  }
  return resolved;
}

export interface StoredEmployeeDocument {
  storageKey: string;
  fileSize: number;
}

/** Persist a validated document buffer under the org/employee folder. */
export async function storeEmployeeDocument(input: {
  organizationId: string;
  employeeId: string;
  bytes: Uint8Array;
  extension: string;
}): Promise<StoredEmployeeDocument> {
  const folder = resolveEmployeeDocumentFolder(
    input.organizationId,
    input.employeeId
  );
  await mkdir(folder, { recursive: true });

  const safeExtension = input.extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const fileName = `${randomUUID()}.${safeExtension}`;
  await writeFile(resolveWithinRoot(folder, fileName), Buffer.from(input.bytes));

  return {
    storageKey: `${input.organizationId}/${input.employeeId}/${fileName}`,
    fileSize: Buffer.from(input.bytes).byteLength,
  };
}

/** Read a stored document by its database storage_key. */
export async function readEmployeeDocument(storageKey: string): Promise<Buffer> {
  return readFile(resolveWithinRoot(PRIVATE_ROOT, storageKey));
}

/** Remove one stored document (no-op when missing). */
export async function deleteEmployeeDocumentFile(
  storageKey: string
): Promise<void> {
  try {
    await unlink(resolveWithinRoot(PRIVATE_ROOT, storageKey));
  } catch {
    // Already gone — nothing to do.
  }
}

/** Outcome of a whole-folder removal, for the deletion audit trail. */
export interface EmployeeDocumentStorageRemoval {
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
 * Remove the whole employee folder when the employee is purged.
 *
 * Never throws: the deletion transaction has already committed by the time
 * this runs, so the caller records the outcome in the file-purge audit row
 * instead of failing the request. The operator sweep script is the retry
 * path when `removed` is false with an `error`.
 */
export async function deleteEmployeeDocumentStorage(
  organizationId: string,
  employeeId: string
): Promise<EmployeeDocumentStorageRemoval> {
  try {
    await rm(resolveEmployeeDocumentFolder(organizationId, employeeId), {
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