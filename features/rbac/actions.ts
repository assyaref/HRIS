"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import type { z } from "zod";

import { db } from "@/db";
import { permissions, rolePermissions, roles, userRoles } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  isSuperAdmin,
  requirePermission,
} from "@/lib/auth/rbac";
import {
  SUPERADMIN_ROLE_CODE,
  isReservedRoleCode,
} from "@/lib/auth/roles";

import {
  getRoleInOrganization,
  listPermissionCodesForRole,
} from "./queries";
import { createRoleSchema, updateRoleSchema } from "./schemas";

/**
 * RBAC administration server actions (Phase 4).
 *
 * Security rules enforced here:
 * - Every action re-authenticates (`requireUser`) and re-authorizes
 *   (`requirePermission`) against PostgreSQL. Nothing is trusted from the
 *   form body beyond field values.
 * - All role writes are scoped to the actor's own organization; roles owned
 *   by another organization can never be loaded (forbidden).
 * - The system-level SUPERADMIN role cannot be created, edited by a
 *   non-SUPERADMIN, stripped of all permissions, or deleted.
 * - System (seeded) roles cannot be deleted.
 * - Administrative changes are appended to `audit_logs`.
 */

export interface RoleActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

function toStateError(
  message: string | undefined,
  fieldErrors?: Record<string, string>
): RoleActionState {
  return { status: "error", message, fieldErrors };
}

/** Create a custom role in the actor's organization. */
export async function createRoleAction(
  _prevState: RoleActionState,
  formData: FormData
): Promise<RoleActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ROLES_CREATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }

  const parsed = createRoleSchema.safeParse({
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const { code, name, description } = parsed.data;

  // Reserved catalog roles are seeded by the system and must not be
  // re-created (this structurally prevents forging a SUPERADMIN role).
  if (isReservedRoleCode(code)) {
    return toStateError(undefined, {
      code: `"${code}" is a reserved system role code.`,
    });
  }

  const existing = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        eq(roles.organizationId, user.organizationId),
        eq(roles.code, code)
      )
    )
    .limit(1);
  if (existing[0]) {
    return toStateError(undefined, {
      code: `A role with code "${code}" already exists in this organization.`,
    });
  }

  let roleId: string;
  try {
    const inserted = await db
      .insert(roles)
      .values({
        organizationId: user.organizationId,
        code,
        name,
        description: description || null,
        isSystem: false,
      })
      .returning({ id: roles.id });
    const row = inserted[0];
    if (!row) throw new Error("Role insert returned no row.");
    roleId = row.id;
  } catch (error) {
    console.error("[rbac] create role failed", error);
    return toStateError("Could not create the role. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "rbac.role.created",
      entityType: "role",
      entityId: roleId,
      metadata: { code, name },
    });
  } catch (error) {
    // The role is already committed; never report failure for a lost audit row.
    console.error("[rbac] audit failed after role creation", error);
  }

  redirect(`/settings/roles/${roleId}`);
}

/** Update a role's name, description and permission assignment. */
export async function updateRoleAction(
  roleId: string,
  _prevState: RoleActionState,
  formData: FormData
): Promise<RoleActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ROLES_UPDATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }

  // Org-scoped load: roles owned by another organization are unreachable.
  const role = await getRoleInOrganization(roleId, user.organizationId);
  if (!role) forbidden();

  const parsed = updateRoleSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    permissionCodes: formData
      .getAll("permissionCodes")
      .map((value) => String(value)),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const { name, description, permissionCodes } = parsed.data;

  const actorIsSuperAdmin = await isSuperAdmin(user.id);
  if (role.code === SUPERADMIN_ROLE_CODE) {
    // Only a SUPERADMIN may touch the SUPERADMIN role.
    if (!actorIsSuperAdmin) forbidden();
    // A SUPERADMIN must keep at least one permission.
    if (permissionCodes.length === 0) {
      return toStateError("SUPERADMIN must retain at least one permission.");
    }
  }

  // Resolve codes to database permission ids against the seeded catalog.
  const permissionRows = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions)
    .where(inArray(permissions.code, [...permissionCodes]));
  if (permissionRows.length !== permissionCodes.length) {
    return toStateError(
      "The permission catalog is out of date — run `npm run db:seed:rbac` and try again."
    );
  }
  const permissionIdByCode = new Map(
    permissionRows.map((row) => [row.code, row.id])
  );

  const grantedBefore = await listPermissionCodesForRole(role.id);
  const nextSet = new Set(permissionCodes);
  const grantedSet = new Set(grantedBefore);
  const permissionsChanged =
    grantedBefore.length !== permissionCodes.length ||
    grantedBefore.some((code) => !nextSet.has(code)) ||
    permissionCodes.some((code) => !grantedSet.has(code));
  const profileChanged =
    role.name !== name || (role.description ?? "") !== (description ?? "");

  if (!permissionsChanged && !profileChanged) {
    return { status: "success", message: "No changes were made to this role." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(roles)
        .set({ name, description: description || null })
        .where(eq(roles.id, role.id));

      await tx
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, role.id));

      if (permissionCodes.length > 0) {
        await tx.insert(rolePermissions).values(
          permissionCodes.map((code) => ({
            roleId: role.id,
            permissionId: permissionIdByCode.get(code)!,
          }))
        );
      }
    });
  } catch (error) {
    console.error("[rbac] update role failed", error);
    return toStateError("Could not update the role. Please try again.");
  }

  try {
    if (profileChanged) {
      await writeAuditLog({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "rbac.role.updated",
        entityType: "role",
        entityId: role.id,
        metadata: { code: role.code, name, description: description || null },
      });
    }
    if (permissionsChanged) {
      await writeAuditLog({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "rbac.role.permissions.updated",
        entityType: "role",
        entityId: role.id,
        metadata: { code: role.code, permissionCodes },
      });
    }
  } catch (error) {
    // The update is already committed; never report failure for a lost audit.
    console.error("[rbac] audit failed after role update", error);
  }

  revalidatePath(`/settings/roles/${role.id}`);
  revalidatePath("/settings/roles");
  return { status: "success", message: "Role updated." };
}

/** Delete a custom role in the actor's organization. */
export async function deleteRoleAction(
  roleId: string
): Promise<RoleActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ROLES_DELETE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }

  const role = await getRoleInOrganization(roleId, user.organizationId);
  if (!role) forbidden();

  // System roles (including SUPERADMIN) are part of the seeded catalog and
  // cannot be deleted through the UI.
  if (role.code === SUPERADMIN_ROLE_CODE) {
    return toStateError("The SUPERADMIN role cannot be deleted.");
  }
  if (role.isSystem) {
    return toStateError("System roles cannot be deleted.");
  }

  const members = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(eq(userRoles.roleId, role.id));
  if (members.length > 0) {
    return toStateError(
      "This role is assigned to users. Reassign those users before deleting it."
    );
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, role.id));
      await tx.delete(roles).where(eq(roles.id, role.id));
    });
  } catch (error) {
    console.error("[rbac] delete role failed", error);
    return toStateError("Could not delete the role. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "rbac.role.deleted",
      entityType: "role",
      entityId: role.id,
      metadata: { code: role.code, name: role.name },
    });
  } catch (error) {
    // The role is already committed; never report failure for a lost audit.
    console.error("[rbac] audit failed after role deletion", error);
  }

  revalidatePath("/settings/roles");
  redirect("/settings/roles");
}

