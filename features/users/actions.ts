"use server";

import { and, eq, ilike, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import type { z } from "zod";

import { db } from "@/db";
import {
  employees,
  organizations,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { hashPassword } from "@/lib/auth/password";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  isSuperAdmin,
  requirePermission,
} from "@/lib/auth/rbac";
import { SUPERADMIN_ROLE_CODE } from "@/lib/auth/roles";

import {
  evaluateManageScope,
  evaluateUserDeactivation,
  evaluateUserDeletion,
  sameOrganization,
} from "./policy";
import {
  countActiveSuperAdminAccounts,
  getPrimaryRoleCode,
  hasProtectedHistory,
  isSuperAdminAccount,
  listGrantsForUser,
  listLinkableEmployees,
} from "./queries";
import { createUserSchema, updateUserSchema } from "./schemas";

/**
 * USER ACCOUNT CRUD — server actions (Phase 12).
 *
 * Every mutation follows the same security rulebook the rest of the HRIS uses:
 * 1. Re-authenticate (`requireUser`) — never trust anything about the caller
 *    from the request body.
 * 2. Re-authorize against PostgreSQL using the existing permission catalog
 *    (`users.create` / `users.update` / `users.delete`).
 * 3. Organization-scope every read/write. Tenant actors operate in exactly
 *    their own organization; SUPERADMIN may operate across organizations.
 * 4. Enforce the pure safety policy (`features/users/policy.ts`): self
 *    deletion/deactivation, last active Super Administrator, protected
 *    history, and cross-organization / SUPERADMIN privilege guards.
 * 5. Audit every mutation (`user.created` / `user.updated` / `user.deleted`)
 *    without ever logging credentials.
 */

export interface UserActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

const DB_UNIQUE_VIOLATION = "23505";

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

function error(message: string): UserActionState {
  return { status: "error", message };
}

function isUniqueViolation(unknownError: unknown): boolean {
  return (
    typeof unknownError === "object" &&
    unknownError !== null &&
    "code" in unknownError &&
    (unknownError as { code?: unknown }).code === DB_UNIQUE_VIOLATION
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalField(formData: FormData, name: string): string | undefined {
  const value = field(formData, name);
  return value === "" ? undefined : value;
}

/** Scope applied to a role grant (SUPERADMIN is system/global; others org). */
function roleGrantScope(roleCode: string, organizationId: string) {
  return roleCode === SUPERADMIN_ROLE_CODE
    ? { scope: "global", scopeId: null }
    : { scope: "organization", scopeId: organizationId };
}

interface ActorContext {
  userId: string;
  organizationId: string | null;
  isSuperAdmin: boolean;
}

async function resolveActor(): Promise<ActorContext> {
  const actor = await requireUser();
  const actorIsSuperAdmin = await isSuperAdmin(actor.id);
  return {
    userId: actor.id,
    organizationId: actor.organizationId,
    isSuperAdmin: actorIsSuperAdmin,
  };
}

async function roleInOrganization(
  roleId: string,
  organizationId: string
): Promise<{ id: string; code: string; name: string } | null> {
  const rows = await db
    .select({
      id: roles.id,
      code: roles.code,
      name: roles.name,
    })
    .from(roles)
    .where(
      and(eq(roles.id, roleId), eq(roles.organizationId, organizationId))
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Whether an email is already used by a *different* account. */
async function emailInUse(
  email: string,
  excludeUserId?: string
): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      excludeUserId
        ? and(ilike(users.email, email), ne(users.id, excludeUserId))
        : ilike(users.email, email)
    )
    .limit(1);
  return rows.length > 0;
}

/** Validate an employee link target for `organizationId`. */
async function validateEmployeeLink(
  employeeId: string | null | undefined,
  organizationId: string,
  currentUserId?: string
): Promise<string | null> {
  if (!employeeId) return null;

  const linkable = await listLinkableEmployees(
    organizationId,
    currentUserId
  );
  if (!linkable.some((employee) => employee.id === employeeId)) {
    return "The selected employee does not exist in this organization or is already linked to another user account.";
  }
  return null;
}

/** Write an audit event, never failing the operation. */
async function audit(
  action: "user.created" | "user.updated" | "user.deleted",
  input: {
    organizationId: string | null;
    actorUserId: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action,
      entityType: "user",
      entityId: input.entityId,
      metadata: input.metadata,
    });
  } catch (auditError) {
    console.error(`[users] audit failed after ${action}`, auditError);
  }
}

/**
 * CREATE — an authorized administrator creates a management, administrator or
 * Super Administrator account in a target organization.
 */
export async function createUserAction(
  _prevState: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const actor = await resolveActor();
  await requirePermission(actor.userId, PERMISSIONS.USERS_CREATE);

  // SUPERADMIN may choose the target organization; tenant actors are always
  // bound to their own organization (ignored even if a foreign id is posted).
  const organizationId = actor.isSuperAdmin
    ? optionalField(formData, "organizationId")
    : actor.organizationId ?? undefined;

  if (!organizationId || !isUuid(organizationId)) {
    return error("Your account is not assigned to an organization.");
  }

  const parsed = createUserSchema.safeParse({
    name: optionalField(formData, "name"),
    email: field(formData, "email"),
    organizationId,
    roleId: optionalField(formData, "roleId"),
    employeeId: optionalField(formData, "employeeId"),
    status: field(formData, "status"),
    password: optionalField(formData, "password"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const { name, email, roleId, employeeId, status, password } = parsed.data;

  const orgRows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.status, "active")
      )
    )
    .limit(1);
  if (!orgRows[0]) {
    return error("Selected organization is not available.");
  }

  const role = await roleInOrganization(roleId, organizationId);
  if (!role) {
    return error("Selected role is not available in this organization.");
  }

  const scopeDecision = evaluateManageScope({
    actorIsSuperAdmin: actor.isSuperAdmin,
    actorOrganizationId: actor.organizationId,
    targetOrganizationId: organizationId,
    targetRoleCode: role.code,
  });
  if (!scopeDecision.allowed) {
    return error(scopeDecision.message);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await emailInUse(normalizedEmail)) {
    return {
      status: "error",
      fieldErrors: {
        email: "This email address is already in use.",
      },
    };
  }

  const linkError = await validateEmployeeLink(
    employeeId,
    organizationId
  );
  if (linkError) {
    return error(linkError);
  }

  const passwordHash = password ? await hashPassword(password) : null;

  try {
    const created = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(users)
        .values({
          organizationId,
          name: name ?? null,
          email: normalizedEmail,
          status,
          passwordHash,
        })
        .returning({ id: users.id });
      const newUserId = inserted[0];
      if (!newUserId) {
        throw new Error("INSERT_FAILED");
      }

      const grantScope = roleGrantScope(role.code, organizationId);
      await tx.insert(userRoles).values({
        userId: newUserId.id,
        roleId: role.id,
        scope: grantScope.scope,
        scopeId: grantScope.scopeId,
        grantedBy: actor.userId,
      });

      if (employeeId) {
        const linked = await tx
          .update(employees)
          .set({ userId: newUserId.id })
          .where(
            and(
              eq(employees.id, employeeId),
              eq(employees.organizationId, organizationId)
            )
          )
          .returning({ id: employees.id });
        if (!linked[0]) {
          throw new Error("EMPLOYEE_LINK_FAILED");
        }
      }

      return { id: newUserId.id };
    });

    await audit("user.created", {
      organizationId,
      actorUserId: actor.userId,
      entityId: created.id,
      metadata: {
        userId: created.id,
        email: normalizedEmail,
        roleId: role.id,
        roleCode: role.code,
        roleName: role.name,
        organizationId,
        status,
        linkedEmployee: employeeId ?? null,
      },
    });

    revalidatePath("/settings/users");
    return {
      status: "success",
      message: `User account created with the ${role.name} role.`,
    };
  } catch (caught) {
    if (isUniqueViolation(caught)) {
      return {
        status: "error",
        fieldErrors: {
          email: "This email address is already in use.",
        },
      };
    }
    console.error("[users] create failed", caught);
    return error("Could not create the user account. Please try again.");
  }
}

/**
 * UPDATE — an authorized administrator edits an account: name, email, role,
 * linked employee and status. Organization is immutable after creation because
 * it anchors RBAC grants and audit scope; reassigning it would require
 * rewriting grants, un-linking employees and re-scoping history.
 */
export async function updateUserAction(
  userId: string,
  _prevState: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const actor = await resolveActor();
  await requirePermission(actor.userId, PERMISSIONS.USERS_UPDATE);

  if (!isUuid(userId)) {
    return error("Invalid user account.");
  }

  const targetRows = await db
    .select({
      id: users.id,
      organizationId: users.organizationId,
      email: users.email,
      name: users.name,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const target = targetRows[0];
  if (!target || !target.organizationId) {
    return error("The user account was not found.");
  }
  const organizationId = target.organizationId;

  const targetIsSuperAdmin = await isSuperAdminAccount(userId);

  const scopeDecision = evaluateManageScope({
    actorIsSuperAdmin: actor.isSuperAdmin,
    actorOrganizationId: actor.organizationId,
    targetOrganizationId: organizationId,
    targetIsSuperAdmin,
  });
  if (!scopeDecision.allowed) {
    return error(scopeDecision.message);
  }

  const parsed = updateUserSchema.safeParse({
    name: optionalField(formData, "name"),
    email: field(formData, "email"),
    roleId: optionalField(formData, "roleId"),
    employeeId: optionalField(formData, "employeeId"),
    status: field(formData, "status"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const { name, email, roleId: nextRoleId, status } = parsed.data;

  // The employee select always posts, so a missing/empty value means unlink.
  const employeeId = formData.has("employeeId")
    ? (parsed.data.employeeId ?? null)
    : undefined;

  const currentGrants = await listGrantsForUser(userId);
  const currentRoleCodes = currentGrants.map((grant) => grant.roleCode);
  const previousPrimaryCode =
    currentRoleCodes.find((code) => code === SUPERADMIN_ROLE_CODE) ??
    currentRoleCodes[0] ??
    null;

  let nextRole: { id: string; code: string; name: string } | null = null;
  const isNewRoleId =
    nextRoleId !== undefined &&
    !currentGrants.some((grant) => grant.roleId === nextRoleId);

  if (isNewRoleId && nextRoleId) {
    nextRole = await roleInOrganization(nextRoleId, organizationId);
    if (!nextRole) {
      return error("Selected role is not available in this organization.");
    }

    const roleDecision = evaluateManageScope({
      actorIsSuperAdmin: actor.isSuperAdmin,
      actorOrganizationId: actor.organizationId,
      targetOrganizationId: organizationId,
      targetRoleCode: nextRole.code,
    });
    if (!roleDecision.allowed) {
      return error(roleDecision.message);
    }

    // The SUPERADMIN grant is provisioned system-level and cannot be removed
    // through editing — deactivation is the supported lifecycle transition.
    if (targetIsSuperAdmin && nextRole.code !== SUPERADMIN_ROLE_CODE) {
      return error(
        "The SUPERADMIN role cannot be removed through editing. Deactivate the account instead."
      );
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (
    normalizedEmail !== target.email &&
    (await emailInUse(normalizedEmail, target.id))
  ) {
    return {
      status: "error",
      fieldErrors: {
        email: "This email address is already in use.",
      },
    };
  }

  const deactivating = target.status === "active" && status !== "active";
  if (deactivating) {
    const activeSuperAdminCount = await countActiveSuperAdminAccounts();
    const deactivationDecision = evaluateUserDeactivation({
      actorUserId: actor.userId,
      targetUserId: target.id,
      targetIsSuperAdmin,
      activeSuperAdminCount,
    });
    if (!deactivationDecision.allowed) {
      return error(deactivationDecision.message);
    }
  }

  const linkError = await validateEmployeeLink(
    employeeId,
    organizationId,
    target.id
  );
  if (linkError) {
    return error(linkError);
  }

  const changedFields: string[] = [];
  if ((name ?? "") !== (target.name ?? "")) changedFields.push("name");
  if (normalizedEmail !== target.email) changedFields.push("email");
  if (status !== target.status) changedFields.push("status");
  if (nextRole && previousPrimaryCode !== nextRole.code) {
    changedFields.push("role");
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          name: name ?? null,
          email: normalizedEmail,
          status,
        })
        .where(eq(users.id, userId));

      if (employeeId !== undefined) {
        if (employeeId) {
          const linked = await tx
            .update(employees)
            .set({ userId })
            .where(
              and(
                eq(employees.id, employeeId),
                eq(employees.organizationId, organizationId)
              )
            )
            .returning({ id: employees.id });
          if (!linked[0]) {
            throw new Error("EMPLOYEE_LINK_FAILED");
          }
        } else {
          await tx
            .update(employees)
            .set({ userId: null })
            .where(
              and(
                eq(employees.userId, userId),
                eq(employees.organizationId, organizationId)
              )
            );
        }
      }

      if (nextRole) {
        // Replace the current primary role grant; the EMPLOYEE base grant is
        // protected (self-service) and never removed.
        for (const grant of currentGrants) {
          if (grant.roleCode === "EMPLOYEE") continue;
          if (grant.roleCode === previousPrimaryCode) {
            await tx.delete(userRoles).where(eq(userRoles.id, grant.id));
          }
        }
        const alreadyGranted = currentGrants.some(
          (grant) => grant.roleId === nextRole!.id
        );
        if (!alreadyGranted) {
          const grantScope = roleGrantScope(nextRole.code, organizationId);
          await tx.insert(userRoles).values({
            userId,
            roleId: nextRole.id,
            scope: grantScope.scope,
            scopeId: grantScope.scopeId,
            grantedBy: actor.userId,
          });
        }
      }
    });
  } catch (caught) {
    if (isUniqueViolation(caught)) {
      return {
        status: "error",
        fieldErrors: {
          email: "This email address is already in use.",
        },
      };
    }
    console.error("[users] update failed", caught);
    return error("Could not update the user account. Please try again.");
  }

  await audit("user.updated", {
    organizationId,
    actorUserId: actor.userId,
    entityId: userId,
    metadata: {
      userId,
      email: normalizedEmail,
      changedFields,
      status,
      roleTo: nextRole ? nextRole.code : null,
      organizationId,
    },
  });

  revalidatePath("/settings/users");
  if (changedFields.length === 0) {
    return { status: "success", message: "No changes were made." };
  }
  return { status: "success", message: "User account updated." };
}

/**
 * DELETE — authorized administrators may delete eligible accounts.
 *
 * Server-side safety (independent of the UI hiding buttons): self-deletion is
 * rejected, the last active Super Administrator cannot be deleted, and
 * accounts referenced by protected historical records cannot be deleted (they
 * must be deactivated instead). All reads run org-scoped.
 */
export async function deleteUserAction(
  userId: string
): Promise<UserActionState> {
  const actor = await resolveActor();
  await requirePermission(actor.userId, PERMISSIONS.USERS_DELETE);

  if (!isUuid(userId)) {
    return error("Invalid user account.");
  }

  const targetRows = await db
    .select({
      id: users.id,
      organizationId: users.organizationId,
      email: users.email,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const target = targetRows[0];
  if (!target || !target.organizationId) {
    return error("The user account was not found.");
  }
  const organizationId = target.organizationId;

  if (
    !actor.isSuperAdmin &&
    !sameOrganization(actor.organizationId, organizationId)
  ) {
    forbidden();
  }

  const targetIsSuperAdmin = await isSuperAdminAccount(userId);
  const activeSuperAdminCount = await countActiveSuperAdminAccounts();
  const protectedHistory = await hasProtectedHistory(userId);

  const decision = evaluateUserDeletion({
    actorUserId: actor.userId,
    targetUserId: userId,
    targetIsSuperAdmin,
    activeSuperAdminCount,
    hasProtectedHistory: protectedHistory,
  });
  if (!decision.allowed) {
    return error(decision.message);
  }

  const primaryRoleCode = await getPrimaryRoleCode(userId);

  try {
    await db.delete(users).where(eq(users.id, userId));
  } catch (caught) {
    console.error("[users] delete failed", caught);
    return error("Could not delete the user account. Please try again.");
  }

  await audit("user.deleted", {
    organizationId,
    actorUserId: actor.userId,
    entityId: userId,
    metadata: {
      userId,
      email: target.email,
      role: primaryRoleCode,
      organizationId,
      outcome: "deleted",
    },
  });

  revalidatePath("/settings/users");
  return { status: "success", message: "User account deleted." };
}