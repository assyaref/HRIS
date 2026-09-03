import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/auth";
import {
  PERMISSION_CATALOG,
  PERMISSIONS,
} from "@/lib/auth/permissions";
import {
  hasPermission,
  isSuperAdmin,
  requirePermission,
} from "@/lib/auth/rbac";
import { SUPERADMIN_ROLE_CODE } from "@/lib/auth/roles";

import {
  deleteRoleAction,
  updateRoleAction,
} from "@/features/rbac/actions";
import {
  getRoleInOrganization,
  listPermissionCodesForRole,
} from "@/features/rbac/queries";
import { RolePermissionEditor } from "@/features/rbac/role-editor";

export const metadata: Metadata = {
  title: "Role details",
};

/**
 * Role detail page — view and (when permitted) edit a role's profile and
 * permission assignment.
 *
 * Roles are org-scoped: a role that does not belong to the caller's
 * organization is treated as forbidden so cross-organization existence is
 * never revealed.
 */
export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ROLES_VIEW);

  if (!user.organizationId) {
    forbidden();
  }

  const role = await getRoleInOrganization(roleId, user.organizationId);
  if (!role) forbidden();

  const actorIsSuperAdmin = await isSuperAdmin(user.id);
  if (role.code === SUPERADMIN_ROLE_CODE && !actorIsSuperAdmin) {
    // The SUPERADMIN role is seeded only under the SYSTEM organization, so a
    // tenant user should never reach this; guard defensively regardless.
    forbidden();
  }

  const [grantedCodes, canUpdatePermission, canDeletePermission] =
    await Promise.all([
      listPermissionCodesForRole(role.id),
      hasPermission(user.id, PERMISSIONS.ROLES_UPDATE),
      hasPermission(user.id, PERMISSIONS.ROLES_DELETE),
    ]);

  // SUPERADMIN is only editable by SUPERADMIN holders (defensive; the guard
  // above already rejected everyone else).
  const canEdit = role.code === SUPERADMIN_ROLE_CODE
    ? actorIsSuperAdmin && canUpdatePermission
    : canUpdatePermission;
  const canDelete =
    canDeletePermission &&
    !role.isSystem &&
    role.code !== SUPERADMIN_ROLE_CODE;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link
              href="/settings/roles"
              className="hover:text-foreground hover:underline"
            >
              Roles
            </Link>
          </p>
        </div>
        <Link
          href="/settings/roles"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back to roles
        </Link>
      </div>

      <RolePermissionEditor
        roleCode={role.code}
        roleName={role.name}
        roleDescription={role.description ?? ""}
        isSystemRole={role.isSystem}
        canEdit={canEdit}
        canDelete={canDelete}
        catalog={PERMISSION_CATALOG}
        grantedCodes={grantedCodes}
        updateAction={updateRoleAction.bind(null, role.id)}
        deleteAction={deleteRoleAction.bind(null, role.id)}
      />
    </div>
  );
}
