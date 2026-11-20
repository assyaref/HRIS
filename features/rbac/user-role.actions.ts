"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { roles, userRoles, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireSuperAdmin } from "@/lib/auth/rbac";
import { SUPERADMIN_ROLE_CODE } from "@/lib/auth/roles";

export interface UserRoleActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

function error(message: string): UserRoleActionState {
  return {
    status: "error",
    message,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/**
 * SUPERADMIN assigns an organization role to a tenant user.
 */
export async function assignRoleForSuperAdminAction(
  _prevState: UserRoleActionState,
  formData: FormData
): Promise<UserRoleActionState> {
  const actor = await requireUser();
  await requireSuperAdmin(actor.id);

  const targetUserId = String(formData.get("userId") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "").trim();
  const organizationId = String(
    formData.get("organizationId") ?? ""
  ).trim();

  if (!isUuid(targetUserId) || !isUuid(roleId) || !isUuid(organizationId)) {
    return error("Pengguna, peran, atau organisasi tidak valid.");
  }

  try {
    const result = await db.transaction(async (tx) => {
      const targetUserRows = await tx
        .select({
          id: users.id,
          email: users.email,
          organizationId: users.organizationId,
          status: users.status,
        })
        .from(users)
        .where(
          and(
            eq(users.id, targetUserId),
            eq(users.organizationId, organizationId)
          )
        )
        .limit(1);

      const targetUser = targetUserRows[0];

      if (!targetUser) {
        throw new Error("TARGET_USER_NOT_FOUND");
      }

      const roleRows = await tx
        .select({
          id: roles.id,
          code: roles.code,
          name: roles.name,
          organizationId: roles.organizationId,
          isSystem: roles.isSystem,
        })
        .from(roles)
        .where(
          and(
            eq(roles.id, roleId),
            eq(roles.organizationId, organizationId)
          )
        )
        .limit(1);

      const role = roleRows[0];

      if (!role) {
        throw new Error("TARGET_ROLE_NOT_FOUND");
      }

      if (role.code === SUPERADMIN_ROLE_CODE) {
        throw new Error("SUPERADMIN_ROLE_PROTECTED");
      }

      const existingRows = await tx
        .select({
          id: userRoles.id,
        })
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, targetUser.id),
            eq(userRoles.roleId, role.id),
            eq(userRoles.scope, "organization"),
            eq(userRoles.scopeId, organizationId)
          )
        )
        .limit(1);

      if (existingRows[0]) {
        throw new Error("ROLE_ALREADY_ASSIGNED");
      }

      const inserted = await tx
        .insert(userRoles)
        .values({
          userId: targetUser.id,
          roleId: role.id,
          scope: "organization",
          scopeId: organizationId,
          grantedBy: actor.id,
        })
        .returning({
          id: userRoles.id,
        });

      const assignment = inserted[0];

      if (!assignment) {
        throw new Error("ASSIGNMENT_FAILED");
      }

      return {
        assignmentId: assignment.id,
        userId: targetUser.id,
        email: targetUser.email,
        roleId: role.id,
        roleCode: role.code,
        roleName: role.name,
      };
    });

    try {
      await writeAuditLog({
        organizationId,
        actorUserId: actor.id,
        action: "rbac.user.role.assigned",
        entityType: "user_role",
        entityId: result.assignmentId,
        metadata: {
          userId: result.userId,
          email: result.email,
          roleId: result.roleId,
          roleCode: result.roleCode,
          roleName: result.roleName,
          scope: "organization",
          scopeId: organizationId,
          delegatedBy: "SUPERADMIN",
        },
      });
    } catch (auditError) {
      console.error(
        "[rbac] audit failed after SUPERADMIN role assignment",
        auditError
      );
    }

    revalidatePath("/employees");
    revalidatePath("/settings/roles");

    return {
      status: "success",
      message: `Role ${result.roleCode} assigned successfully.`,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "TIDAK DIKETAHUI";

    switch (message) {
      case "TARGET_USER_NOT_FOUND":
        return error("Pengguna tujuan tidak ditemukan di organisasi yang dipilih.");
      case "TARGET_ROLE_NOT_FOUND":
        return error("Peran tujuan tidak ditemukan di organisasi yang dipilih.");
      case "SUPERADMIN_ROLE_PROTECTED":
        return error("Peran SUPERADMIN tidak dapat didelegasikan.");
      case "ROLE_ALREADY_ASSIGNED":
        return error("Peran ini sudah ditetapkan ke pengguna tersebut.");
      default:
        console.error(
          "[rbac] SUPERADMIN role assignment failed",
          caught
        );
        return error("Peran gagal ditetapkan. Silakan coba lagi.");
    }
  }
}

/**
 * SUPERADMIN removes an organization role from a tenant user.
 *
 * The base EMPLOYEE role is protected.
 */
export async function removeRoleForSuperAdminAction(
  formData: FormData
): Promise<UserRoleActionState> {
  const actor = await requireUser();
  await requireSuperAdmin(actor.id);

  const userId = String(formData.get("userId") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "").trim();
  const organizationId = String(
    formData.get("organizationId") ?? ""
  ).trim();

  if (!isUuid(userId) || !isUuid(roleId) || !isUuid(organizationId)) {
    return error("Pengguna, peran, atau organisasi tidak valid.");
  }

  try {
    const result = await db.transaction(async (tx) => {
      const targetUserRows = await tx
        .select({
          id: users.id,
          email: users.email,
        })
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.organizationId, organizationId)
          )
        )
        .limit(1);

      const targetUser = targetUserRows[0];

      if (!targetUser) {
        throw new Error("TARGET_USER_NOT_FOUND");
      }

      const assignmentRows = await tx
        .select({
          assignmentId: userRoles.id,
          roleId: roles.id,
          roleCode: roles.code,
          roleName: roles.name,
        })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(userRoles.userId, targetUser.id),
            eq(userRoles.roleId, roleId),
            eq(userRoles.scope, "organization"),
            eq(userRoles.scopeId, organizationId),
            eq(roles.organizationId, organizationId)
          )
        )
        .limit(1);

      const assignment = assignmentRows[0];

      if (!assignment) {
        throw new Error("ASSIGNMENT_NOT_FOUND");
      }

      if (assignment.roleCode === SUPERADMIN_ROLE_CODE) {
        throw new Error("SUPERADMIN_ROLE_PROTECTED");
      }

      if (assignment.roleCode === "EMPLOYEE") {
        throw new Error("EMPLOYEE_ROLE_PROTECTED");
      }

      await tx
        .delete(userRoles)
        .where(eq(userRoles.id, assignment.assignmentId));

      return {
        assignmentId: assignment.assignmentId,
        userId: targetUser.id,
        email: targetUser.email,
        roleId: assignment.roleId,
        roleCode: assignment.roleCode,
        roleName: assignment.roleName,
      };
    });

    try {
      await writeAuditLog({
        organizationId,
        actorUserId: actor.id,
        action: "rbac.user.role.removed",
        entityType: "user_role",
        entityId: result.assignmentId,
        metadata: {
          userId: result.userId,
          email: result.email,
          roleId: result.roleId,
          roleCode: result.roleCode,
          roleName: result.roleName,
          scope: "organization",
          scopeId: organizationId,
          removedBy: "SUPERADMIN",
        },
      });
    } catch (auditError) {
      console.error(
        "[rbac] audit failed after SUPERADMIN role removal",
        auditError
      );
    }

    revalidatePath("/employees");
    revalidatePath("/settings/roles");

    return {
      status: "success",
      message: `Role ${result.roleCode} removed successfully.`,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "TIDAK DIKETAHUI";

    switch (message) {
      case "TARGET_USER_NOT_FOUND":
        return error("Pengguna tujuan tidak ditemukan di organisasi yang dipilih.");
      case "ASSIGNMENT_NOT_FOUND":
        return error("Penetapan peran tidak ditemukan.");
      case "SUPERADMIN_ROLE_PROTECTED":
        return error("Peran SUPERADMIN tidak dapat didelegasikan atau dihapus.");
      case "EMPLOYEE_ROLE_PROTECTED":
        return error("Peran dasar EMPLOYEE tidak dapat dihapus.");
      default:
        console.error(
          "[rbac] SUPERADMIN role removal failed",
          caught
        );
        return error("Peran gagal dicabut. Silakan coba lagi.");
    }
  }
}
