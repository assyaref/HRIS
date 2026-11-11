import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { organizations, roles, userRoles } from "@/db/schema";
import { isProduction } from "@/lib/config/env";
import { organizationLogoUrl } from "@/lib/organizations/logo-storage";
import { SUPERADMIN_ROLE_CODE, SYSTEM_ORGANIZATION_CODE } from "./roles";

/**
 * Super Administrator "acting organization" context.
 *
 * The Super Administrator account lives in the reserved SYSTEM organization,
 * which holds no tenant data. Every tenant module (employees, attendance,
 * leave, permission, payroll, announcements, work locations, roles, custom
 * fields…) scopes its reads AND writes to `user.organizationId`. Without a
 * context, a Super Administrator passes every permission check and still sees
 * empty SYSTEM data and cannot manage any tenant.
 *
 * This module lets a Super Administrator choose the tenant they work in. The
 * choice is a cookie holding an organization id, and it is only ever a
 * REQUEST:
 * - It is honoured only when the session user holds SUPERADMIN in their own
 *   (home) organization, re-read from PostgreSQL on every request.
 * - The organization must exist and be active (SYSTEM is always allowed so
 *   system-level users and roles stay manageable).
 * - For every other user the cookie is ignored outright, so tenant isolation
 *   for tenant users is unchanged.
 *
 * Authorization itself never reads this value: `getUserAuthorization` still
 * resolves roles from `users.organization_id` (the home organization).
 */

export const ACTING_ORGANIZATION_COOKIE = "hris_acting_org";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ActingOrganizationOption {
  id: string;
  name: string;
  code: string;
  isSystem: boolean;
  /** Authenticated logo URL (null when the tenant has no custom logo). */
  logoUrl: string | null;
}

/** Whether `userId` holds SUPERADMIN inside `homeOrganizationId`. */
export async function holdsSuperAdminRole(
  userId: string,
  homeOrganizationId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: roles.id })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(roles.organizationId, homeOrganizationId),
        eq(roles.code, SUPERADMIN_ROLE_CODE)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** Organizations a Super Administrator may act in (active tenants + SYSTEM). */
export async function listActingOrganizationOptions(): Promise<
  ActingOrganizationOption[]
> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      code: organizations.code,
      status: organizations.status,
    })
    .from(organizations)
    .orderBy(asc(organizations.name));
  const eligible = rows.filter(
    (row) => row.status === "active" || row.code === SYSTEM_ORGANIZATION_CODE
  );
  return Promise.all(
    eligible.map(async (row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      isSystem: row.code === SYSTEM_ORGANIZATION_CODE,
      logoUrl: await organizationLogoUrl(row.id),
    }))
  );
}

/** Whether `organizationId` is a valid acting target. */
export async function isValidActingOrganization(
  organizationId: string
): Promise<boolean> {
  if (!UUID_PATTERN.test(organizationId)) return false;
  const rows = await db
    .select({ code: organizations.code, status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  return row.status === "active" || row.code === SYSTEM_ORGANIZATION_CODE;
}

/** First active tenant (non-SYSTEM) organization by name, if any. */
async function defaultTenantOrganizationId(): Promise<string | null> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.status, "active"),
        ne(organizations.code, SYSTEM_ORGANIZATION_CODE)
      )
    )
    .orderBy(asc(organizations.name))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function readActingCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    const value = store.get(ACTING_ORGANIZATION_COOKIE)?.value?.trim();
    return value && UUID_PATTERN.test(value) ? value : null;
  } catch {
    // Outside a request scope (scripts/tests): no context.
    return null;
  }
}

/**
 * Resolve the organization a user operates in for this request.
 *
 * Returns the home organization for everyone except a Super Administrator,
 * who gets the cookie-selected organization (validated) or, without a valid
 * selection, the first active tenant so tenant modules are never empty.
 */
export async function resolveActingOrganizationId(
  userId: string,
  homeOrganizationId: string | null
): Promise<{ organizationId: string | null; isSuperAdmin: boolean }> {
  if (!homeOrganizationId) {
    return { organizationId: null, isSuperAdmin: false };
  }
  if (!(await holdsSuperAdminRole(userId, homeOrganizationId))) {
    return { organizationId: homeOrganizationId, isSuperAdmin: false };
  }

  const requested = await readActingCookie();
  if (requested && (await isValidActingOrganization(requested))) {
    return { organizationId: requested, isSuperAdmin: true };
  }

  const fallback = await defaultTenantOrganizationId();
  return { organizationId: fallback ?? homeOrganizationId, isSuperAdmin: true };
}

/** Persist the Super Administrator's acting organization choice. */
export async function setActingOrganizationCookie(
  organizationId: string
): Promise<void> {
  const store = await cookies();
  store.set(ACTING_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
