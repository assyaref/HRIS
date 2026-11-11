import "server-only";

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Organization logos — private filesystem storage (server-only).
 *
 * One logo per organization at `/opt/hris-private/organizations/<organization_id>/
 * logo.<png|jpg>`. No database column is involved: the presence of the file IS
 * the setting, so adding a logo needs no schema migration. The organization id
 * always comes from the session or a SUPERADMIN-validated route parameter and
 * is checked as a UUID before it reaches the filesystem. The file is served only
 * by the authenticated route `app/api/organizations/[organizationId]/logo`.
 */

// `HRIS_PRIVATE_ROOT` lets a staging/QA instance keep its files elsewhere;
// production keeps the fixed default.
const PRIVATE_ROOT = path.join(
  process.env.HRIS_PRIVATE_ROOT?.trim() || "/opt/hris-private",
  "organizations"
);

export const ORGANIZATION_LOGO_MAX_BYTES = 1_000_000;

export type OrganizationLogoKind = "png" | "jpg";

export const ORGANIZATION_LOGO_MIME: Record<OrganizationLogoKind, string> = {
  png: "image/png",
  jpg: "image/jpeg",
};

const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveFolder(organizationId: string): string {
  if (!UUID_PATH_SEGMENT.test(organizationId)) {
    throw new Error("Refusing to resolve an organization folder outside the private root.");
  }
  const resolved = path.resolve(PRIVATE_ROOT, organizationId);
  if (!resolved.startsWith(`${PRIVATE_ROOT}${path.sep}`)) {
    throw new Error("Resolved organization path escapes the private root.");
  }
  return resolved;
}

/** Detect PNG / JPEG from magic bytes; anything else is rejected. */
export function detectLogoKind(bytes: Uint8Array): OrganizationLogoKind | null {
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  return null;
}

export interface StoredOrganizationLogo {
  kind: OrganizationLogoKind;
  mimeType: string;
  /** Cache-busting version derived from the file's modification time. */
  version: number;
}

/** Locate the stored logo, or null when the organization has none. */
export async function findOrganizationLogo(
  organizationId: string
): Promise<StoredOrganizationLogo | null> {
  let folder: string;
  try {
    folder = resolveFolder(organizationId);
  } catch {
    return null;
  }
  // Probe the two fixed candidate names (no directory listing: a dynamic
  // readdir makes the bundler trace the whole project into the server output).
  for (const kind of ["png", "jpg"] as const) {
    try {
      const info = await stat(path.join(folder, `logo.${kind}`));
      return {
        kind,
        mimeType: ORGANIZATION_LOGO_MIME[kind],
        version: Math.floor(info.mtimeMs),
      };
    } catch {
      // Not this kind — try the next one.
    }
  }
  return null;
}

/** Authenticated URL for the organization's logo (null when none is stored). */
export async function organizationLogoUrl(
  organizationId: string | null | undefined
): Promise<string | null> {
  if (!organizationId) return null;
  const logo = await findOrganizationLogo(organizationId);
  return logo ? `/api/organizations/${organizationId}/logo?v=${logo.version}` : null;
}

/** Read the logo bytes for the download route. */
export async function readOrganizationLogo(
  organizationId: string,
  kind: OrganizationLogoKind
): Promise<Buffer> {
  return readFile(path.join(resolveFolder(organizationId), `logo.${kind}`));
}

/** Persist the logo, replacing any previous file of either kind. */
export async function storeOrganizationLogo(input: {
  organizationId: string;
  bytes: Uint8Array;
  kind: OrganizationLogoKind;
}): Promise<void> {
  const folder = resolveFolder(input.organizationId);
  await mkdir(folder, { recursive: true });
  await deleteOrganizationLogo(input.organizationId);
  await writeFile(path.join(folder, `logo.${input.kind}`), Buffer.from(input.bytes));
}

/** Remove every stored logo variant (no-op when none exists). */
export async function deleteOrganizationLogo(organizationId: string): Promise<void> {
  const folder = resolveFolder(organizationId);
  await Promise.all(
    (["png", "jpg"] as const).map((kind) =>
      rm(path.join(folder, `logo.${kind}`), { force: true })
    )
  );
}
