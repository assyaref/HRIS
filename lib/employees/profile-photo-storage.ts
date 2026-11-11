import "server-only";

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Employee profile photos — private filesystem storage (server-only).
 *
 * One JPEG per employee at `/opt/hris-private/employee-photos/<organization_id>/
 * <employee_id>.jpg`. Both path segments come from database UUIDs that the
 * caller resolved from the authenticated session, never from the browser, and
 * are validated as UUIDs before touching the filesystem (mirrors
 * `lib/employee-documents/storage.ts`). The photo is served ONLY by the
 * authenticated route `app/api/employees/[employeeId]/photo/route.ts`; the
 * `employees.profile_photo_url` column stores that route URL, not a file path.
 *
 * The same stored JPEG doubles as the Face ID enrollment source, so the
 * employee does not have to sit in front of the camera twice.
 */

// `HRIS_PRIVATE_ROOT` lets a staging/QA instance keep its files elsewhere;
// production keeps the fixed default.
const PRIVATE_ROOT = path.join(
  process.env.HRIS_PRIVATE_ROOT?.trim() || "/opt/hris-private",
  "employee-photos"
);

export const PROFILE_PHOTO_MIME_TYPE = "image/jpeg";
/** Same cap as a face capture: the photo may be fed to the face engine. */
export const PROFILE_PHOTO_MAX_BYTES = 900_000;

const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolvePhotoPath(organizationId: string, employeeId: string): string {
  if (
    !UUID_PATH_SEGMENT.test(organizationId) ||
    !UUID_PATH_SEGMENT.test(employeeId)
  ) {
    throw new Error("Refusing to resolve a profile photo outside the private root.");
  }
  const resolved = path.resolve(PRIVATE_ROOT, organizationId, `${employeeId}.jpg`);
  if (!resolved.startsWith(`${PRIVATE_ROOT}${path.sep}`)) {
    throw new Error("Resolved profile photo path escapes the private root.");
  }
  return resolved;
}

/** Build the authenticated URL stored in `employees.profile_photo_url`. */
export function profilePhotoUrlFor(employeeId: string, version: number): string {
  return `/api/employees/${employeeId}/photo?v=${version}`;
}

/** JPEG magic bytes (FF D8 FF). */
export function hasJpegMagic(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Persist (overwrite) the employee's profile photo. */
export async function storeEmployeeProfilePhoto(input: {
  organizationId: string;
  employeeId: string;
  bytes: Uint8Array;
}): Promise<void> {
  const target = resolvePhotoPath(input.organizationId, input.employeeId);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(input.bytes));
}

/** Read the stored photo, or null when the employee has none. */
export async function readEmployeeProfilePhoto(
  organizationId: string,
  employeeId: string
): Promise<{ bytes: Buffer; modifiedAt: Date } | null> {
  const target = resolvePhotoPath(organizationId, employeeId);
  try {
    const [bytes, info] = await Promise.all([readFile(target), stat(target)]);
    return { bytes, modifiedAt: info.mtime };
  } catch {
    return null;
  }
}

/** Remove the stored photo (no-op when missing). */
export async function deleteEmployeeProfilePhoto(
  organizationId: string,
  employeeId: string
): Promise<void> {
  await rm(resolvePhotoPath(organizationId, employeeId), { force: true });
}
