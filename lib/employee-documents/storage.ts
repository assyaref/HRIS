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
 * server-generated. Every resolver passes through `resolveWithinRoot`, so a tampered key can
 * never escape the private root. Bytes are stored verbatim after the
 * upload guard has verified extension + MIME + size. Files are served ONLY by
 * the authenticated download route (`app/api/employees/[employeeId]/
 * documents/[documentId]/download/route.ts`).
 */

const PRIVATE_ROOT = "/opt/hris-private/employee-documents";

function resolveWithinRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
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
  const folder = resolveWithinRoot(
    PRIVATE_ROOT,
    `${input.organizationId}/${input.employeeId}`
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

/** Remove the whole employee folder when the employee is purged. */
export async function deleteEmployeeDocumentStorage(
  organizationId: string,
  employeeId: string
): Promise<void> {
  try {
    await rm(
      resolveWithinRoot(PRIVATE_ROOT, `${organizationId}/${employeeId}`),
      { recursive: true, force: true }
    );
  } catch {
    // Folder may not exist — nothing to do.
  }
}