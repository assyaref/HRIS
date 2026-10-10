import "server-only";

import { and, asc, eq, isNotNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  auditLogs,
  employeeFaceEnrollments,
  employees,
  leaveRequestEvents,
  leaveRequests,
  organizations,
  payrollEvents,
  payrollRuns,
  permissionRequestEvents,
  permissionRequests,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { ROLE_DISPLAY_PRECEDENCE } from "@/lib/auth/roles";

import type { UserStatus } from "./policy";

/**
 * User account read queries (Phase 12) — server-only.
 *
 * Every function is scoped to one organization. Pages and actions always
 * resolve the target organization from the authenticated session (or, for
 * SUPERADMIN, from the selection the actor navigated to) and pass it here, so
 * accounts of another organization can never be listed, loaded or written —
 * the same cross-organization isolation rule every other module follows.
 */

export interface UserAccountListItem {
  id: string;
  name: string | null;
  email: string;
  status: UserStatus;
  organizationCode: string | null;
  organizationName: string | null;
  roleId: string | null;
  roleCode: string | null;
  roleName: string | null;
  employeeId: string | null;
  employeeNumber: string | null;
  employeeName: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export type UserAccountDetail = UserAccountListItem;

export interface UserRoleGrant {
  id: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  scope: string;
  scopeId: string | null;
}

/** Candidate employee links that are not already bound to another user. */
export interface LinkableEmployeeAccount {
  id: string;
  employeeNumber: string;
  employeeName: string;
}

interface GrantRow {
  userId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
}

const countRows = (rows: Array<{ count: number }>): number =>
  rows[0]?.count ?? 0;

/** Resolve the primary (display) role from a user's grants. */
function primaryGrant(grants: GrantRow[]): GrantRow | null {
  if (grants.length === 0) return null;
  for (const code of ROLE_DISPLAY_PRECEDENCE) {
    const found = grants.find((grant) => grant.roleCode === code);
    if (found) return found;
  }
  return grants[0];
}

/**
 * List user accounts in one organization with their primary role and linked
 * employee. Roles are resolved from the same org-scoped grant model the RBAC
 * authorization layer uses.
 */
export async function listUsersForOrganization(
  organizationId: string
): Promise<UserAccountListItem[]> {
  const userRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      employeeId: employees.id,
      employeeNumber: employees.employeeNumber,
      employeeName: sql<string | null>`CASE WHEN ${employees.firstName} IS NULL THEN NULL ELSE (${employees.firstName} || ' ' || ${employees.lastName}) END`,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .leftJoin(employees, eq(employees.userId, users.id))
    .where(eq(users.organizationId, organizationId))
    .orderBy(asc(users.email));

  const orgRows = await db
    .select({
      code: organizations.code,
      name: organizations.name,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const organizationCode = orgRows[0]?.code ?? null;
  const organizationName = orgRows[0]?.name ?? null;

  const grants = await listGrantsForOrganization(organizationId);

  const grantsByUser = new Map<string, GrantRow[]>();
  for (const grant of grants) {
    const list = grantsByUser.get(grant.userId) ?? [];
    list.push(grant);
    grantsByUser.set(grant.userId, list);
  }

  return userRows.map((row) => {
    const primary = primaryGrant(grantsByUser.get(row.id) ?? []);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      status: row.status as UserStatus,
      organizationCode,
      organizationName,
      roleId: primary?.roleId ?? null,
      roleCode: primary?.roleCode ?? null,
      roleName: primary?.roleName ?? null,
      employeeId: row.employeeId,
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastLoginAt: row.lastLoginAt,
    };
  });
}

/** All org-scoped role grants for users belonging to `organizationId`. */
export async function listGrantsForOrganization(
  organizationId: string
): Promise<Array<GrantRow & { userId: string }>> {
  return db
    .select({
      userId: userRoles.userId,
      roleId: roles.id,
      roleCode: roles.code,
      roleName: roles.name,
    })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(roles.organizationId, organizationId)
      )
    );
}

/** All grants (regardless of scope) held by one user. */
export async function listGrantsForUser(
  userId: string
): Promise<UserRoleGrant[]> {
  return db
    .select({
      id: userRoles.id,
      roleId: roles.id,
      roleCode: roles.code,
      roleName: roles.name,
      scope: userRoles.scope,
      scopeId: userRoles.scopeId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
}

/** The account's primary (display) role code, by catalog precedence. */
export async function getPrimaryRoleCode(
  userId: string
): Promise<string | null> {
  const grants = await listGrantsForUser(userId);
  return primaryGrant(
    grants.map((grant) => ({
      userId,
      roleId: grant.roleId,
      roleCode: grant.roleCode,
      roleName: grant.roleName,
    }))
  )?.roleCode ?? null;
}

/** Load one account, but only when it belongs to `organizationId`. */
export async function getUserAccountInOrganization(
  userId: string,
  organizationId: string
): Promise<UserAccountDetail | null> {
  const list = await listUsersForOrganization(organizationId);
  const found = list.find((item) => item.id === userId);
  return found ?? null;
}

/** Whether a user holds the SUPERADMIN role (scope-agnostic). */
export async function isSuperAdminAccount(userId: string): Promise<boolean> {
  const grants = await listGrantsForUser(userId);
  return grants.some((grant) => grant.roleCode === "SUPERADMIN");
}

/** Count of active accounts holding the SUPERADMIN role (system scope). */
export async function countActiveSuperAdminAccounts(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(eq(roles.code, "SUPERADMIN"), eq(users.status, "active"))
    );
  return rows[0]?.count ?? 0;
}

/**
 * Employees in one organization that are not already linked to a different
 * user account — the safe pool for the Employee field. `currentUserId`
 * keeps the account's own current link available in edit flows.
 */
export async function listLinkableEmployees(
  organizationId: string,
  currentUserId?: string
): Promise<LinkableEmployeeAccount[]> {
  const employeeRows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      employeeName: sql<string>`(${employees.firstName} || ' ' || ${employees.lastName})`,
      userId: employees.userId,
    })
    .from(employees)
    .where(eq(employees.organizationId, organizationId))
    .orderBy(asc(employees.employeeNumber));

  const othersLinked = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        isNotNull(employees.userId),
        currentUserId ? ne(employees.userId, currentUserId) : sql`true`
      )
    );

  const blocked = new Set(
    othersLinked
      .map((row) => row.userId)
      .filter((id): id is string => typeof id === "string")
  );

  return employeeRows
    .filter((row) => !row.userId || !blocked.has(row.userId))
    .map((row) => ({
      id: row.id,
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
    }));
}

/**
 * Whether protected business/historical records reference the account as an
 * actor or reviewer. Deleting such an account would null-out those references
 * and break audit traceability, so those accounts must be deactivated instead.
 * Account-specific relations (sessions, role grants) and the linked-employee
 * reference are intentionally NOT protected — they are safely removed/unlinked
 * by the delete flow.
 */
export async function hasProtectedHistory(userId: string): Promise<boolean> {
  const checks: Array<Promise<number>> = [
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, userId)).then(countRows),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .where(eq(leaveRequests.reviewedBy, userId)).then(countRows),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leaveRequestEvents)
      .where(eq(leaveRequestEvents.actorUserId, userId)).then(countRows),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(permissionRequests)
      .where(eq(permissionRequests.reviewedBy, userId)).then(countRows),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(permissionRequestEvents)
      .where(eq(permissionRequestEvents.actorUserId, userId)).then(countRows),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(payrollRuns)
      .where(
        or(
          eq(payrollRuns.submittedBy, userId),
          eq(payrollRuns.approvedBy, userId),
          eq(payrollRuns.lockedBy, userId)
        )
      ).then(countRows),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(payrollEvents)
      .where(eq(payrollEvents.actorUserId, userId)).then(countRows),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(employeeFaceEnrollments)
      .where(
        or(
          eq(employeeFaceEnrollments.enrolledByUserId, userId),
          eq(employeeFaceEnrollments.revokedByUserId, userId)
        )
      ).then(countRows),
  ];

  const counts = await Promise.all(checks);
  return counts.some((count) => count > 0);
}