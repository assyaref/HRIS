import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { roles, userRoles, users } from "@/db/schema";

export interface UserRoleItem {
  id: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  isSystem: boolean;
  scope: string;
  scopeId: string | null;
  grantedBy: string | null;
  createdAt: Date;
}

export interface SuperAdminUserItem {
  id: string;
  email: string;
  status: string;
  organizationId: string | null;
}

/**
 * List roles currently assigned to one user.
 *
 * This query is intentionally organization-scoped.
 * The caller must already have passed the SUPERADMIN authorization boundary
 * when using this for cross-organization administration.
 */
export async function listUserRolesForSuperAdmin(
  userId: string,
  organizationId: string
): Promise<UserRoleItem[]> {
  return db
    .select({
      id: userRoles.id,
      roleId: roles.id,
      roleCode: roles.code,
      roleName: roles.name,
      isSystem: roles.isSystem,
      scope: userRoles.scope,
      scopeId: userRoles.scopeId,
      grantedBy: userRoles.grantedBy,
      createdAt: userRoles.createdAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(users.organizationId, organizationId),
        eq(roles.organizationId, organizationId)
      )
    )
    .orderBy(asc(roles.code));
}

/**
 * List tenant users for SUPERADMIN administration.
 */
export async function listUsersForSuperAdmin(
  organizationId: string
): Promise<SuperAdminUserItem[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      status: users.status,
      organizationId: users.organizationId,
    })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(asc(users.email));
}
