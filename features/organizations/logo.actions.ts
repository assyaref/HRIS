"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireSuperAdmin } from "@/lib/auth/rbac";
import {
  deleteOrganizationLogo,
  detectLogoKind,
  ORGANIZATION_LOGO_MAX_BYTES,
  storeOrganizationLogo,
} from "@/lib/organizations/logo-storage";

/**
 * Organization logo — SUPERADMIN-only server actions.
 *
 * The logo is a file on the private volume (no schema change); the routes and
 * the shell discover it by presence. Validation is server-side: PNG or JPEG by
 * magic bytes, at most 1 MB. The organization id is verified against the
 * database before anything is written.
 */

export interface OrganizationLogoActionResult {
  ok: boolean;
  message: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireOrganization(organizationId: string) {
  const user = await requireUser();
  await requireSuperAdmin(user.id);
  if (!UUID_PATTERN.test(organizationId)) return null;
  const rows = await db
    .select({ id: organizations.id, code: organizations.code })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const organization = rows[0];
  return organization ? { user, organization } : null;
}

function revalidateLogo(organizationId: string): void {
  revalidatePath(`/settings/organizations/${organizationId}`);
  revalidatePath("/settings/organizations");
  // The shell (sidebar, hero, drawer) renders the logo on every page.
  revalidatePath("/", "layout");
}

export async function uploadOrganizationLogoAction(
  organizationId: string,
  formData: FormData
): Promise<OrganizationLogoActionResult> {
  const context = await requireOrganization(organizationId);
  if (!context) return { ok: false, message: "Organisasi tidak ditemukan." };

  const file = formData.get("logo");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return { ok: false, message: "Pilih berkas logo terlebih dahulu." };
  }
  const blob = file as File;
  if (blob.size <= 0) return { ok: false, message: "Berkas logo kosong." };
  if (blob.size > ORGANIZATION_LOGO_MAX_BYTES) {
    return { ok: false, message: "Ukuran logo maksimal 1 MB." };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = detectLogoKind(bytes);
  if (!kind) {
    return { ok: false, message: "Format logo harus PNG atau JPG." };
  }

  try {
    await storeOrganizationLogo({ organizationId, bytes, kind });
  } catch (error) {
    console.error("[organizations] logo store failed", error);
    return { ok: false, message: "Logo tidak dapat disimpan. Coba lagi." };
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: context.user.id,
      action: "organization.logo.updated",
      entityType: "organization",
      entityId: organizationId,
      metadata: { code: context.organization.code, kind, size: blob.size },
    });
  } catch {
    // Audit is best-effort.
  }
  revalidateLogo(organizationId);
  return { ok: true, message: "Logo organisasi diperbarui." };
}

export async function removeOrganizationLogoAction(
  organizationId: string
): Promise<OrganizationLogoActionResult> {
  const context = await requireOrganization(organizationId);
  if (!context) return { ok: false, message: "Organisasi tidak ditemukan." };

  try {
    await deleteOrganizationLogo(organizationId);
  } catch (error) {
    console.error("[organizations] logo remove failed", error);
    return { ok: false, message: "Logo tidak dapat dihapus. Coba lagi." };
  }
  try {
    await writeAuditLog({
      organizationId,
      actorUserId: context.user.id,
      action: "organization.logo.removed",
      entityType: "organization",
      entityId: organizationId,
      metadata: { code: context.organization.code },
    });
  } catch {
    // Audit is best-effort.
  }
  revalidateLogo(organizationId);
  return { ok: true, message: "Logo organisasi dihapus." };
}
