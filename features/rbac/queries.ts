import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  permissions,
  rolePermissions,
  roles,
  userRoles,
} from "@/db/schema";
import type { Permission } from "@/lib/auth/permissions";

/**
 * Read queries for the RBAC administration UI (Phase 4).
 *
 * Every query is scoped to one organization. Pages and actions always resolve
 * the caller's organization from the authenticated session and pass it here,
 * so a role from another organization can never be listed or loaded.
 */

export interface RoleListItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  memberCount: number;
  createdAt: Date;
}

export interface RoleRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  organizationId: string;
  createdAt: Date;
}

export interface PermissionRow {
  id: string;
  code: Permission;
  module: string;
  description: string | null;
}

/** All roles in one organization, ordered by code, with counts. */
export async function listRolesByOrganization(
  organizationId: string
): Promise<RoleListItem[]> {
  const roleRows = await db
    .select({
      id: roles.id,
      code: roles.code,
      name: roles.name,
      description: roles.description,
      isSystem: roles.isSystem,
      createdAt: roles.createdAt,
    })
    .from(roles)
    .where(eq(roles.organizationId, organizationId))
    .orderBy(asc(roles.code));

  if (roleRows.length === 0) return [];

  const roleIds = roleRows.map((row) => row.id);

  const permissionCountRows = await db
    .select({
      roleId: rolePermissions.roleId,
      count: sql<number>`count(*)::int`,
    })
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, roleIds))
    .groupBy(rolePermissions.roleId);

  const memberCountRows = await db
    .select({
      roleId: userRoles.roleId,
      count: sql<number>`count(*)::int`,
    })
    .from(userRoles)
    .where(inArray(userRoles.roleId, roleIds))
    .groupBy(userRoles.roleId);

  const permissionCounts = new Map(
    permissionCountRows.map((row) => [row.roleId, row.count])
  );
  const memberCounts = new Map(
    memberCountRows.map((row) => [row.roleId, row.count])
  );

  return roleRows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    permissionCount: permissionCounts.get(row.id) ?? 0,
    memberCount: memberCounts.get(row.id) ?? 0,
    createdAt: row.createdAt,
  }));
}

/**
 * Load one role, but only when it belongs to `organizationId`.
 * Returns `null` for unknown roles and for roles owned by another
 * organization (callers respond with 403 so cross-org existence is not
 * revealed).
 */
export async function getRoleInOrganization(
  roleId: string,
  organizationId: string
): Promise<RoleRecord | null> {
  const rows = await db
    .select({
      id: roles.id,
      code: roles.code,
      name: roles.name,
      description: roles.description,
      isSystem: roles.isSystem,
      organizationId: roles.organizationId,
      createdAt: roles.createdAt,
    })
    .from(roles)
    .where(
      and(eq(roles.id, roleId), eq(roles.organizationId, organizationId))
    )
    .limit(1);

  const row = rows[0];
  if (!row || row.organizationId !== organizationId) return null;
  return row;
}

/** Permission codes currently granted to a role (database source of truth). */
export async function listPermissionCodesForRole(
  roleId: string
): Promise<Permission[]> {
  const rows = await db
    .selectDistinct({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(
      permissions,
      eq(permissions.id, rolePermissions.permissionId)
    )
    .where(eq(rolePermissions.roleId, roleId))
    .orderBy(asc(permissions.code));

  return rows.map((row) => row.code as Permission);
}

/** The global permission catalog, ordered by module then code. */
export async function listPermissionCatalog(): Promise<PermissionRow[]> {
  const rows = await db
    .select({
      id: permissions.id,
      code: permissions.code,
      module: permissions.module,
      description: permissions.description,
    })
    .from(permissions)
    .orderBy(asc(permissions.module), asc(permissions.code));

  return rows.map((row) => ({
    id: row.id,
    code: row.code as Permission,
    module: row.module,
    description: row.description,
  }));
}

