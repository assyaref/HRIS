/**
 * Announcements — RBAC role grants + permission-set resolver (pure, testable).
 *
 * Single source of truth for which catalog role receives which announcements
 * permission. The seed (`scripts/seed-rbac.mts`) imports `ANNOUNCEMENT_ROLE_GRANTS`
 * so the grants are never duplicated. Pure module (no `server-only`, no
 * `@/` aliases) so `node --test` can assert the matrix.
 *
 * Matrix:
 * - ADMIN: full control (create, view, update, delete, publish).
 * - MANAGEMENT / HR: everything except delete (deletion is irreversible and
 *   reserved for organization administrators).
 * - FINANCE / SUPERVISOR / EMPLOYEE: no announcements permissions. Employees
 *   consume announcements through the self-service view, which is
 *   authorization-free (authenticated + linked to an employee record).
 */

import { PERMISSIONS, type Permission } from "../../lib/auth/permissions.ts";
import { ROLE_CODES, type RoleCode } from "../../lib/auth/roles.ts";

export type AnnouncementRoleGrants = Record<
  RoleCode,
  readonly Permission[]
>;

export const ANNOUNCEMENT_ROLE_GRANTS: AnnouncementRoleGrants = {
  [ROLE_CODES.SUPERADMIN]: [
    PERMISSIONS.ANNOUNCEMENTS_VIEW,
    PERMISSIONS.ANNOUNCEMENTS_CREATE,
    PERMISSIONS.ANNOUNCEMENTS_UPDATE,
    PERMISSIONS.ANNOUNCEMENTS_DELETE,
    PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
  ],
  [ROLE_CODES.ADMIN]: [
    PERMISSIONS.ANNOUNCEMENTS_VIEW,
    PERMISSIONS.ANNOUNCEMENTS_CREATE,
    PERMISSIONS.ANNOUNCEMENTS_UPDATE,
    PERMISSIONS.ANNOUNCEMENTS_DELETE,
    PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
  ],
  [ROLE_CODES.MANAGEMENT]: [
    PERMISSIONS.ANNOUNCEMENTS_VIEW,
    PERMISSIONS.ANNOUNCEMENTS_CREATE,
    PERMISSIONS.ANNOUNCEMENTS_UPDATE,
    PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
  ],
  [ROLE_CODES.HR]: [
    PERMISSIONS.ANNOUNCEMENTS_VIEW,
    PERMISSIONS.ANNOUNCEMENTS_CREATE,
    PERMISSIONS.ANNOUNCEMENTS_UPDATE,
    PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
  ],
  [ROLE_CODES.FINANCE]: [],
  [ROLE_CODES.SUPERVISOR]: [],
  [ROLE_CODES.EMPLOYEE]: [],
};

export interface AnnouncementPermissionSet {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canPublish: boolean;
  /** Any announcements capability → management UI is reachable. */
  canManage: boolean;
}

/**
 * Derive the announcement capability flags from a user's effective permission
 * codes (as returned by `getUserAuthorization`). Pure mapping — the caller
 * decides who may even reach `getUserAuthorization`.
 */
export function resolveAnnouncementPermissions(
  permissionCodes: readonly Permission[]
): AnnouncementPermissionSet {
  const codes = new Set(permissionCodes) as Set<string>;
  const canView = codes.has(PERMISSIONS.ANNOUNCEMENTS_VIEW);
  const canCreate = codes.has(PERMISSIONS.ANNOUNCEMENTS_CREATE);
  const canUpdate = codes.has(PERMISSIONS.ANNOUNCEMENTS_UPDATE);
  const canDelete = codes.has(PERMISSIONS.ANNOUNCEMENTS_DELETE);
  const canPublish = codes.has(PERMISSIONS.ANNOUNCEMENTS_PUBLISH);
  return {
    canView,
    canCreate,
    canUpdate,
    canDelete,
    canPublish,
    canManage:
      canView || canCreate || canUpdate || canDelete || canPublish,
  };
}