import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  hasPermission,
  isSuperAdmin,
  requirePermission,
} from "@/lib/auth/rbac";

import {
  listAllOrganizationsForSuperAdmin,
  listRolesByOrganization,
} from "@/features/rbac/queries";
import { SuperAdminUserOrganizationSelector } from "@/features/rbac/superadmin-user-organization-selector";

import { CreateUserDialog } from "@/features/users/user-create-dialog";
import { UsersManager } from "@/features/users/users-manager";
import {
  countActiveSuperAdminAccounts,
  hasProtectedHistory,
  listLinkableEmployees,
  listUsersForOrganization,
} from "@/features/users/queries";

export const metadata: Metadata = {
  title: "User Management",
};

/**
 * User account administration (Phase 12 — CRUD).
 *
 * Guard: `users.view` (not a hardcoded SUPERADMIN check, so Management can
 * administer their own organization). SUPERADMIN may switch organizations via
 * the URL-bound selector and operate across organizations. Tenants are always
 * bound to their own organization.
 *
 * Every row's Delete button reflects what the server will accept: self
 * deletion, the last active Super Administrator guarantee, and protected
 * historical records are computed here so the UI hides ineligible actions.
 */
export default async function UsersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.USERS_VIEW);

  const actorIsSuperAdmin = await isSuperAdmin(user.id);
  const params = await searchParams;

  let organizationId = user.organizationId ?? "";

  if (actorIsSuperAdmin) {
    const organizations = await listAllOrganizationsForSuperAdmin();
    const activeOrganizations = organizations.filter(
      (organization) => organization.status === "active"
    );

    const requestedOrganizationId =
      typeof params.organizationId === "string"
        ? params.organizationId
        : "";

    organizationId = activeOrganizations.some(
      (organization) => organization.id === requestedOrganizationId
    )
      ? requestedOrganizationId
      : activeOrganizations[0]?.id ?? "";

    if (!organizationId) {
      return (
        <div className="space-y-6">
          <PageHeader hasCreate={false} actorIsSuperAdmin={true} />
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No active organization is available.
            </CardContent>
          </Card>
        </div>
      );
    }

    const canCreate = await hasPermission(user.id, PERMISSIONS.USERS_CREATE);
    const canUpdate = await hasPermission(user.id, PERMISSIONS.USERS_UPDATE);
    const canDelete = await hasPermission(user.id, PERMISSIONS.USERS_DELETE);

    const [users, roles, employees, activeSuperAdminCount] =
      await Promise.all([
        listUsersForOrganization(organizationId),
        listRolesByOrganization(organizationId),
        listLinkableEmployees(organizationId),
        countActiveSuperAdminAccounts(),
      ]);

    const canDeleteMap = await computeDeleteEligibility({
      users,
      actorUserId: user.id,
      canDelete,
      activeSuperAdminCount,
    });

    return (
      <div className="space-y-6">
        <PageHeader
          hasCreate={canCreate}
          organizationId={organizationId}
          roles={roles}
          employees={employees}
          actorIsSuperAdmin={true}
        />

        <Card>
          <CardContent className="pt-6">
            <SuperAdminUserOrganizationSelector
              organizations={activeOrganizations.map((organization) => ({
                id: organization.id,
                code: organization.code,
                name: organization.name,
              }))}
              selectedOrganizationId={organizationId}
            />
          </CardContent>
        </Card>

        <UsersManager
          users={users}
          roles={roles}
          employees={employees}
          canUpdate={canUpdate}
          canDeleteMap={canDeleteMap}
          actorIsSuperAdmin={true}
        />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <PageHeader hasCreate={false} actorIsSuperAdmin={false} />
        <EmptyState
          title="No organization assigned"
          description="Your account is not linked to an organization, so there are no user accounts to administer."
        />
      </div>
    );
  }

  const canCreate = await hasPermission(user.id, PERMISSIONS.USERS_CREATE);
  const canUpdate = await hasPermission(user.id, PERMISSIONS.USERS_UPDATE);
  const canDelete = await hasPermission(user.id, PERMISSIONS.USERS_DELETE);

  const [users, roles, employees, activeSuperAdminCount] = await Promise.all([
    listUsersForOrganization(organizationId),
    listRolesByOrganization(organizationId),
    listLinkableEmployees(organizationId),
    countActiveSuperAdminAccounts(),
  ]);

  const canDeleteMap = await computeDeleteEligibility({
    users,
    actorUserId: user.id,
    canDelete,
    activeSuperAdminCount,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        hasCreate={canCreate}
        organizationId={organizationId}
        roles={roles}
        employees={employees}
        actorIsSuperAdmin={false}
      />

      <UsersManager
        users={users}
        roles={roles}
        employees={employees}
        canUpdate={canUpdate}
        canDeleteMap={canDeleteMap}
        actorIsSuperAdmin={false}
      />
    </div>
  );
}

function PageHeader({
  hasCreate,
  organizationId,
  roles,
  employees,
  actorIsSuperAdmin,
}: {
  hasCreate: boolean;
  organizationId?: string;
  roles?: Array<{ id: string; name: string; code: string }>;
  employees?: Array<{
    id: string;
    employeeNumber: string;
    employeeName: string;
  }>;
  actorIsSuperAdmin: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          User Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Manage HRIS user accounts, roles and access.
        </p>
      </div>
      {hasCreate && organizationId && roles && employees ? (
        <CreateUserDialog
          organizationId={organizationId}
          roles={roles}
          employees={employees}
          isSuperAdmin={actorIsSuperAdmin}
        />
      ) : null}
    </div>
  );
}

async function computeDeleteEligibility({
  users,
  actorUserId,
  canDelete,
  activeSuperAdminCount,
}: {
  users: Array<{ id: string; roleCode: string | null }>;
  actorUserId: string;
  canDelete: boolean;
  activeSuperAdminCount: number;
}): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};
  if (!canDelete) return map;

  await Promise.all(
    users.map(async (target) => {
      const isSelf = target.id === actorUserId;
      const isOnlySuperAdmin =
        target.roleCode === "SUPERADMIN" && activeSuperAdminCount <= 1;
      const protectedHistory = isOnlySuperAdmin
        ? false
        : await hasProtectedHistory(target.id);
      map[target.id] = !isSelf && !isOnlySuperAdmin && !protectedHistory;
    })
  );

  return map;
}