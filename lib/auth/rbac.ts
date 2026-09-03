import "server-only";

import { and, eq } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { db } from "@/db";
import {
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import {
  ALL_PERMISSION_CODES,
  type Permission,
} from "./permissions";
import { SUPERADMIN_ROLE_CODE, type RoleCode } from "./roles";

/**
 * RBAC authorization layer (Phase 4) — server-only.
 *
 * Design rules:
 * - PostgreSQL is the single source of truth. Roles and permissions are read
 *   from `user_roles → roles → role_permissions → permissions` on every check;
 *   nothing is trusted from cookies, client state or request bodies.
 * - Organization isolation: a user's effective roles are the roles GRANTED to
 *   them that belong to their own organization (`users.organization_id`). A
 *   user never gains a capability because a role with the same code exists in
 *   another organization.
 * - SUPERADMIN is system-level. It is seeded only under the reserved SYSTEM
 *   organization (see lib/auth/roles.ts), so tenant administrators structurally
 *   cannot hold, grant or modify it. A SUPERADMIN passes every permission
 *   check.
 * - Authentication ("who is this user?") stays in `lib/auth/auth.ts`;
 *   authorization ("what may this user do?") lives here. `requireUser()` is
 *   never bypassed by these helpers — callers authenticate first, then
 *   authorize.
 */

export interface UserAuthorization {
  /** Role codes the user holds in their own organization. */
  roleCodes: RoleCode[];
  /** Effective permission codes (full catalog for a SUPERADMIN). */
  permissionCodes: Permission[];
  isSuperAdmin: boolean;
}

/** Empty authorization used for unknown/org-less/deleted users. */
const EMPTY_AUTHORIZATION: UserAuthorization = {
  roleCodes: [],
  permissionCodes: [],
  isSuperAdmin: false,
};

/**
 * Resolve a user's effective roles and permissions from the database.
 *
 * The query is org-scoped: only granted roles whose `organization_id` equals
 * the user's own `organization_id` count. This is the structural guarantee
 * that role codes in another organization can never leak capabilities here.
 */
export async function getUserAuthorization(
  userId: string
): Promise<UserAuthorization> {
  const userRows = await db
    .select({ organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const organizationId = userRows[0]?.organizationId;
  if (!organizationId) return EMPTY_AUTHORIZATION;

  const roleRows = await db
    .selectDistinct({ code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(roles.organizationId, organizationId)
      )
    );
  const roleCodes = roleRows.map((row) => row.code as RoleCode);
  const isSuperAdmin = roleCodes.includes(SUPERADMIN_ROLE_CODE);

  if (isSuperAdmin) {
    return {
      roleCodes,
      permissionCodes: [...ALL_PERMISSION_CODES],
      isSuperAdmin: true,
    };
  }

  const permissionRows = await db
    .selectDistinct({ code: permissions.code })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(
      permissions,
      eq(permissions.id, rolePermissions.permissionId)
    )
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(roles.organizationId, organizationId)
      )
    );

  return {
    roleCodes,
    permissionCodes: permissionRows.map(
      (row) => row.code as Permission
    ),
    isSuperAdmin: false,
  };
}

/** Whether the user holds the system-level SUPERADMIN role. */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  return (await getUserAuthorization(userId)).isSuperAdmin;
}

/* ------------------------------------------------------------------ */
/* Role checks                                                         */
/* ------------------------------------------------------------------ */

export async function hasRole(
  userId: string,
  roleCode: RoleCode
): Promise<boolean> {
  return (await getUserAuthorization(userId)).roleCodes.includes(roleCode);
}

export async function hasAnyRole(
  userId: string,
  roleCodes: readonly RoleCode[]
): Promise<boolean> {
  const granted = new Set((await getUserAuthorization(userId)).roleCodes);
  return roleCodes.some((code) => granted.has(code));
}

export async function hasAllRoles(
  userId: string,
  roleCodes: readonly RoleCode[]
): Promise<boolean> {
  const granted = new Set((await getUserAuthorization(userId)).roleCodes);
  return roleCodes.every((code) => granted.has(code));
}

/* ------------------------------------------------------------------ */
/* Permission checks                                                   */
/* ------------------------------------------------------------------ */

export async function hasPermission(
  userId: string,
  permissionCode: Permission
): Promise<boolean> {
  const authorization = await getUserAuthorization(userId);
  if (authorization.isSuperAdmin) return true;
  return authorization.permissionCodes.includes(permissionCode);
}

export async function hasAnyPermission(
  userId: string,
  permissionCodes: readonly Permission[]
): Promise<boolean> {
  const authorization = await getUserAuthorization(userId);
  if (authorization.isSuperAdmin) return true;
  const granted = new Set(authorization.permissionCodes);
  return permissionCodes.some((code) => granted.has(code));
}

export async function hasAllPermissions(
  userId: string,
  permissionCodes: readonly Permission[]
): Promise<boolean> {
  const authorization = await getUserAuthorization(userId);
  if (authorization.isSuperAdmin) return true;
  const granted = new Set(authorization.permissionCodes);
  return permissionCodes.every((code) => granted.has(code));
}

/* ------------------------------------------------------------------ */
/* Guards — render a 403 (app/forbidden.tsx) when the check fails.     */
/* Suitable for Server Components and Server Actions. Callers must      */
/* authenticate first (requireUser) and pass the authenticated user id. */
/* ------------------------------------------------------------------ */

export async function requireRole(
  userId: string,
  roleCode: RoleCode
): Promise<void> {
  if (!(await hasRole(userId, roleCode))) forbidden();
}

export async function requireAnyRole(
  userId: string,
  roleCodes: readonly RoleCode[]
): Promise<void> {
  if (!(await hasAnyRole(userId, roleCodes))) forbidden();
}

export async function requirePermission(
  userId: string,
  permissionCode: Permission
): Promise<void> {
  if (!(await hasPermission(userId, permissionCode))) forbidden();
}

export async function requireAnyPermission(
  userId: string,
  permissionCodes: readonly Permission[]
): Promise<void> {
  if (!(await hasAnyPermission(userId, permissionCodes))) forbidden();
}

