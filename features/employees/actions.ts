"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import type { z } from "zod";

import { db } from "@/db";
import { employees, users, roles, userRoles } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { hashPassword } from "@/lib/auth/password";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";
import { ORGANIZATION_ROLE_CODES, ROLE_CATALOG } from "@/lib/auth/roles";

import type { EmployeeStatus } from "./constants";
import {
  getEmployeeInOrganization,
  listLinkableUsers,
} from "./queries";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "./schemas";

/**
 * Employee management server actions (Phase 5).
 *
 * Security rules enforced here:
 * - Every action re-authenticates (`requireUser`) and re-authorizes against
 *   PostgreSQL. Nothing about the caller is trusted from the form body.
 * - The organization always comes from the authenticated user's session; an
 *   `organization_id` is never accepted from the browser.
 * - All reads/writes are org-scoped. An employee id that does not belong to
 *   the actor's organization is treated as forbidden (no existence leak).
 * - Related records (linked user) must belong to the same organization.
 * - Physical deletion is intentionally NOT implemented for Phase 5. The
 *   removal lifecycle is a status change to `inactive`, which additionally
 *   requires `employees.delete` (ADMIN). HRIS person records are retained
 *   because later modules reference them.
 */

export interface EmployeeActionState {
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

function toStateError(
  message: string | undefined,
  fieldErrors?: Record<string, string>
): EmployeeActionState {
  return { status: "error", message, fieldErrors };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === DB_UNIQUE_VIOLATION
  );
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Optional text: empty strings are normalized to `undefined`. */
function optionalField(formData: FormData, name: string): string | undefined {
  const value = field(formData, name);
  return value === "" ? undefined : value;
}

/** Date string (YYYY-MM-DD) → UTC Date, or null. */
function toDateValue(value: string | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

/**
 * Validate that a user link target exists, belongs to `organizationId`, and is
 * not already linked to another employee in that organization.
 * Returns an error message, or null when the link is safe.
 */
async function validateUserLink(
  userId: string | undefined,
  organizationId: string,
  excludeEmployeeId?: string
): Promise<string | null> {
  if (!userId) return null;

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)))
    .limit(1);
  if (!userRows[0]) {
    return "The selected user account does not exist in your organization.";
  }

  const linkable = await listLinkableUsers(organizationId, excludeEmployeeId);
  if (!linkable.some((user) => user.id === userId)) {
    return "That user account is already linked to another employee.";
  }
  return null;
}

/** Create a new employee in the authenticated user's organization. */
export async function createEmployeeAction(
  _prevState: EmployeeActionState,
  formData: FormData
): Promise<EmployeeActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_CREATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;

  const parsed = createEmployeeSchema.safeParse({
    employeeNumber: field(formData, "employeeNumber"),
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    email: optionalField(formData, "email"),
    phone: optionalField(formData, "phone"),
    hireDate: optionalField(formData, "hireDate"),
    userId: optionalField(formData, "userId"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const { employeeNumber, firstName, lastName } = parsed.data;

  const linkError = await validateUserLink(
    parsed.data.userId,
    organizationId
  );
  if (linkError) {
    return toStateError(linkError);
  }

  let employeeId: string;
  try {
    const inserted = await db
      .insert(employees)
      .values({
        organizationId,
        userId: parsed.data.userId ?? null,
        employeeNumber,
        firstName,
        lastName,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        employmentStatus: "active",
        hireDate: toDateValue(parsed.data.hireDate),
      })
      .returning({ id: employees.id });
    const row = inserted[0];
    if (!row) throw new Error("Employee insert returned no row.");
    employeeId = row.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return toStateError(undefined, {
        employeeNumber: `Employee number "${employeeNumber}" already exists in this organization.`,
      });
    }
    console.error("[employees] create failed", error);
    return toStateError("Could not create the employee. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee.created",
      entityType: "employee",
      entityId: employeeId,
      metadata: {
        employeeNumber,
        linkedUser: parsed.data.userId ? true : false,
      },
    });
  } catch (error) {
    // The employee is committed; never report failure for a lost audit row.
    console.error("[employees] audit failed after create", error);
  }

  redirect(`/employees/${employeeId}`);
}

/**
 * Update an employee's profile fields, account link and — for authorized
 * callers — employment status.
 *
 * Permission rules:
 * - All profile edits require `employees.update`.
 * - Changing status to `inactive` (deactivation/removal) additionally
 *   requires `employees.delete` (ADMIN). Physical deletion is never performed.
 */
export async function updateEmployeeAction(
  employeeId: string,
  _prevState: EmployeeActionState,
  formData: FormData
): Promise<EmployeeActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_UPDATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;

  // Org-scoped load: employees of another organization are unreachable.
  const existing = await getEmployeeInOrganization(
    employeeId,
    organizationId
  );
  if (!existing) forbidden();

  const statusRaw = formData.has("employmentStatus")
    ? optionalField(formData, "employmentStatus")
    : existing.employmentStatus;

  const parsed = updateEmployeeSchema.safeParse({
    employeeNumber: field(formData, "employeeNumber"),
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    email: optionalField(formData, "email"),
    phone: optionalField(formData, "phone"),
    hireDate: optionalField(formData, "hireDate"),
    employmentStatus: statusRaw,
    userId: formData.has("userId")
      ? optionalField(formData, "userId")
      : existing.userId ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const nextStatus =
    parsed.data.employmentStatus ?? existing.employmentStatus;

  // Deactivation is the only destructive lifecycle transition and is guarded
  // by employees.delete. Reactivation (`inactive` → `active`) requires
  // employees.update, which the caller already has.
  if (
    nextStatus !== existing.employmentStatus &&
    nextStatus === "inactive"
  ) {
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DELETE);
  }

  const userIdProvided = formData.has("userId");
  const nextUserId = userIdProvided
    ? (parsed.data.userId ?? null)
    : existing.userId;

  const linkError = await validateUserLink(
    nextUserId ?? undefined,
    organizationId,
    employeeId
  );
  if (linkError) {
    return toStateError(linkError);
  }

  const nextValues = {
    employeeNumber: parsed.data.employeeNumber,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    hireDate: toDateValue(parsed.data.hireDate),
    userId: nextUserId,
    employmentStatus: nextStatus,
  };

  const changedFields: string[] = [];
  if (nextValues.employeeNumber !== existing.employeeNumber) {
    changedFields.push("employeeNumber");
  }
  if (nextValues.firstName !== existing.firstName) {
    changedFields.push("firstName");
  }
  if (nextValues.lastName !== existing.lastName) {
    changedFields.push("lastName");
  }
  if ((nextValues.email ?? "") !== (existing.email ?? "")) {
    changedFields.push("email");
  }
  if ((nextValues.phone ?? "") !== (existing.phone ?? "")) {
    changedFields.push("phone");
  }
  if (
    nextValues.hireDate?.getTime() !== existing.hireDate?.getTime()
  ) {
    changedFields.push("hireDate");
  }
  if (nextValues.userId !== existing.userId) {
    changedFields.push("userId");
  }

  const statusChanged = nextValues.employmentStatus !== existing.employmentStatus;

  if (changedFields.length === 0 && !statusChanged) {
    return { status: "success", message: "No changes were made." };
  }

  try {
    await db
      .update(employees)
      .set({
        employeeNumber: nextValues.employeeNumber,
        firstName: nextValues.firstName,
        lastName: nextValues.lastName,
        email: nextValues.email,
        phone: nextValues.phone,
        hireDate: nextValues.hireDate,
        userId: nextValues.userId,
        employmentStatus: nextValues.employmentStatus,
      })
      .where(
        and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId))
      );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return toStateError(undefined, {
        employeeNumber: `Employee number "${nextValues.employeeNumber}" already exists in this organization.`,
      });
    }
    console.error("[employees] update failed", error);
    return toStateError("Could not update the employee. Please try again.");
  }

  try {
    if (changedFields.length > 0) {
      await writeAuditLog({
        organizationId,
        actorUserId: user.id,
        action: "employee.updated",
        entityType: "employee",
        entityId: employeeId,
        metadata: {
          employeeNumber: nextValues.employeeNumber,
          changedFields,
        },
      });
    }
    if (statusChanged) {
      await writeAuditLog({
        organizationId,
        actorUserId: user.id,
        action: "employee.status_changed",
        entityType: "employee",
        entityId: employeeId,
        metadata: {
          employeeNumber: nextValues.employeeNumber,
          from: existing.employmentStatus,
          to: nextValues.employmentStatus as EmployeeStatus,
        },
      });
    }
  } catch (error) {
    // The employee is committed; never report failure for a lost audit row.
    console.error("[employees] audit failed after update", error);
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  return { status: "success", message: "Employee updated." };
}

/**
 * Create a login account for an existing employee.
 *
 * This action creates a new user record, links it to the employee, assigns
 * the EMPLOYEE role, and writes an audit log. All operations run in a
 * transaction to ensure atomicity.
 */
export async function createEmployeeAccountAction(
  employeeId: string,
  _prevState: EmployeeActionState,
  formData: FormData
): Promise<EmployeeActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.USERS_CREATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;

  // Load the employee and ensure it belongs to the caller's organization
  const employee = await getEmployeeInOrganization(employeeId, organizationId);
  if (!employee) forbidden();

  // Check if employee already has a login account
  if (employee.userId) {
    return toStateError("Employee already has a login account.");
  }

  // Extract and validate form fields
  const email = field(formData, "email");
  const password = field(formData, "password");
  const confirmPassword = field(formData, "confirmPassword");

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return toStateError(undefined, { email: "Please enter a valid email address." });
  }

  // Validate passwords match
  if (password !== confirmPassword) {
    return toStateError(undefined, { confirmPassword: "Passwords do not match." });
  }

  // Validate password strength (minimum 8 characters)
  if (password.length < 8) {
    return toStateError(undefined, { password: "Password must be at least 8 characters long." });
  }

  try {
    // Use a transaction to ensure all operations succeed or fail together
    const result = await db.transaction(async (tx) => {
      // Check if email already exists
      const existingUser = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new Error("DUPLICATE_EMAIL");
      }

      // Hash the password
      const passwordHash = await hashPassword(password);

      // Insert new user
      const insertedUser = await tx
        .insert(users)
        .values({
          organizationId,
          email,
          status: "active",
          passwordHash,
        })
        .returning({ id: users.id });

      const newUserId = insertedUser[0]?.id;
      if (!newUserId) throw new Error("Failed to create user account.");

      // Ensure all organization-level roles are provisioned (idempotent)
      for (const roleCode of ORGANIZATION_ROLE_CODES) {
        const existingRole = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(and(eq(roles.organizationId, organizationId), eq(roles.code, roleCode)))
          .limit(1);

        if (!existingRole[0]) {
          await tx.insert(roles).values({
            organizationId,
            code: roleCode,
            name: ROLE_CATALOG[roleCode].name,
            description: ROLE_CATALOG[roleCode].description,
            isSystem: true,
          });
        }
      }

      // Find the EMPLOYEE role in this organization
      const employeeRole = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.organizationId, organizationId),
            eq(roles.code, "EMPLOYEE")
          )
        )
        .limit(1);

      const roleId = employeeRole[0]?.id;
      if (!roleId) throw new Error("EMPLOYEE role not found in your organization.");

      // Insert user_role mapping
      await tx.insert(userRoles).values({
        userId: newUserId,
        roleId,
        scope: "organization",
        scopeId: organizationId,
        grantedBy: user.id,
      });

      // Update employee to link the new user
      await tx
        .update(employees)
        .set({ userId: newUserId })
        .where(
          and(
            eq(employees.id, employeeId),
            eq(employees.organizationId, organizationId)
          )
        );

      return { newUserId };
    });

    // Write audit log after successful transaction
    try {
      await writeAuditLog({
        organizationId,
        actorUserId: user.id,
        action: "employee.account.created",
        entityType: "employee",
        entityId: employeeId,
        metadata: {
          employeeId,
          employeeNumber: employee.employeeNumber,
          userId: result.newUserId,
          role: "EMPLOYEE",
          email,
        },
      });
    } catch (auditError) {
      console.error("[employees] audit failed after account creation", auditError);
    }

    revalidatePath("/employees");
    revalidatePath(`/employees/${employeeId}`);
    return { status: "success", message: "Login account created successfully." };
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_EMAIL") {
      return toStateError(undefined, { email: "This email address is already in use." });
    }
    console.error("[employees] account creation failed", error);
    return toStateError(
      error instanceof Error ? error.message : "Could not create the account. Please try again."
    );
  }
}
