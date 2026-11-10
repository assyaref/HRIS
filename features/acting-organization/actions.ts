"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  isValidActingOrganization,
  setActingOrganizationCookie,
} from "@/lib/auth/acting-organization";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { requireSuperAdmin } from "@/lib/auth/rbac";

import { safeReturnPath } from "./return-path";

/**
 * Switch the organization a Super Administrator operates in.
 *
 * Re-authenticates and re-checks SUPERADMIN against PostgreSQL, validates the
 * target organization, stores the choice in an HttpOnly cookie, audits it and
 * redirects to a safe path (record detail URLs are trimmed to their list page
 * because a record id from the previous tenant would 403 in the new one).
 */
export async function switchActingOrganizationAction(
  organizationId: string,
  returnTo?: string,
  keepRecord = false
): Promise<{ ok: false; message: string } | never> {
  const user = await requireUser();
  await requireSuperAdmin(user.id);

  if (
    typeof organizationId !== "string" ||
    !(await isValidActingOrganization(organizationId))
  ) {
    return { ok: false, message: "Organisasi tidak ditemukan atau tidak aktif." };
  }

  const previousOrganizationId = user.organizationId;
  await setActingOrganizationCookie(organizationId);

  if (previousOrganizationId !== organizationId) {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "organization.context_switched",
      entityType: "organization",
      entityId: organizationId,
      metadata: { previousOrganizationId },
    });
  }

  revalidatePath("/", "layout");
  redirect(safeReturnPath(returnTo, keepRecord === true));
}
