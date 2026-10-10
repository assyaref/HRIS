"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations, projects, roles, users, workLocations, employeeProjectAssignments, userRoles, employees } from "@/db/schema";
import { getUserAuthorization, requirePermission } from "@/lib/auth/rbac";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/auth";
import { hashPassword } from "@/lib/auth/password";
import { ORGANIZATION_ROLE_CODES, ROLE_CATALOG } from "@/lib/auth/roles";

/**
 * Import settings validated on the server.
 */
export interface ImportSettings {
  organizationId: string;
  projectId: string;
  workLocationId: string | null;
  roleId: string;
  provisionAccounts: boolean;
}

/**
 * Validate import settings against the database.
 * Returns error message if invalid, null if valid.
 */
export async function validateImportSettings(
  settings: ImportSettings
): Promise<string | null> {
  const user = await requireUser();
  const authorization = await getUserAuthorization(user.id);
  const isSuperAdmin = authorization.isSuperAdmin;

  // Check if user has permission to import
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_IMPORT);

  // For non-superadmin, enforce their own organization
  if (!isSuperAdmin) {
    if (!user.organizationId) {
      return "Your account is not assigned to an organization.";
    }
    if (settings.organizationId !== user.organizationId) {
      return "You can only import into your own organization.";
    }
  }

  // Validate organization exists and is active
  const org = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(eq(organizations.id, settings.organizationId), eq(organizations.status, "active"))
    )
    .limit(1);
  if (!org[0]) {
    return "Selected organization is not available.";
  }

  // Validate project belongs to organization and is active
  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, settings.projectId),
        eq(projects.organizationId, settings.organizationId),
        eq(projects.status, "active")
      )
    )
    .limit(1);
  if (!project[0]) {
    return "Project tidak termasuk dalam Organization yang dipilih.";
  }

  // Validate work location if provided
  if (settings.workLocationId) {
    const wl = await db
      .select({ id: workLocations.id })
      .from(workLocations)
      .where(
        and(
          eq(workLocations.id, settings.workLocationId),
          eq(workLocations.organizationId, settings.organizationId),
          eq(workLocations.status, "active")
        )
      )
      .limit(1);
    if (!wl[0]) {
      return "Work Location tidak termasuk dalam Organization yang dipilih.";
    }
    // If work location has a projectId, it must match the selected project
    const wlWithProject = await db
      .select({ projectId: workLocations.projectId })
      .from(workLocations)
      .where(eq(workLocations.id, settings.workLocationId))
      .limit(1);
    if (wlWithProject[0]?.projectId && wlWithProject[0].projectId !== settings.projectId) {
      return "Work Location tidak sesuai dengan Project yang dipilih.";
    }
  }

  // Validate role belongs to organization
  const role = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        eq(roles.id, settings.roleId),
        eq(roles.organizationId, settings.organizationId)
      )
    )
    .limit(1);
  if (!role[0]) {
    return "Role tidak termasuk dalam Organization yang dipilih.";
  }

  // For non-superadmin, check if they can assign this role
  if (!isSuperAdmin) {
    const userAuth = authorization;
    const roleCodes = userAuth.roleCodes;
    // Check if user has users.create permission (required to assign arbitrary roles)
    const canAssignRoles = roleCodes.includes("SUPERADMIN") ||
      userAuth.permissionCodes.includes(PERMISSIONS.USERS_CREATE);
    if (!canAssignRoles) {
      // Non-superadmin without users.create can only assign EMPLOYEE role
      const selectedRole = await db
        .select({ code: roles.code })
        .from(roles)
        .where(eq(roles.id, settings.roleId))
        .limit(1);
      if (selectedRole[0]?.code !== "EMPLOYEE") {
        return "Anda hanya dapat menetapkan role Employee.";
      }
    }
  }

  return null;
}

/**
 * Result of account provisioning for a single employee.
 */
export interface AccountProvisionResult {
  employeeNumber: string;
  operation: "created" | "existing" | "skipped_no_email" | "skipped_inactive" | "failed";
  userId: string | null;
  error: string | null;
}

/**
 * Result of assignment provisioning for a single employee.
 */
export interface AssignmentProvisionResult {
  employeeNumber: string;
  operation: "created" | "existing" | "failed";
  error: string | null;
}

/**
 * Provision user accounts for employees created/updated during import.
 * Runs inside the same transaction as employee creation.
 */
export async function provisionEmployeeAccounts(
  tx: typeof db,
  employeeList: Array<{
    id: string;
    employeeNumber: string;
    email: string | null;
    employmentStatus: string;
    userId: string | null;
  }>,
  settings: ImportSettings,
  actorUserId: string
): Promise<AccountProvisionResult[]> {
  const results: AccountProvisionResult[] = [];

  for (const emp of employeeList) {
    // Skip if employee is inactive
    if (emp.employmentStatus !== "active") {
      results.push({
        employeeNumber: emp.employeeNumber,
        operation: "skipped_inactive",
        userId: null,
        error: "Employee is inactive",
      });
      continue;
    }

    // Skip if no email (required for user account)
    if (!emp.email) {
      results.push({
        employeeNumber: emp.employeeNumber,
        operation: "skipped_no_email",
        userId: null,
        error: "No email provided",
      });
      continue;
    }

    // Skip if already has user account
    if (emp.userId) {
      results.push({
        employeeNumber: emp.employeeNumber,
        operation: "existing",
        userId: emp.userId,
        error: null,
      });
      continue;
    }

    if (!settings.provisionAccounts) {
      results.push({
        employeeNumber: emp.employeeNumber,
        operation: "skipped_no_email",
        userId: null,
        error: "Account provisioning not enabled",
      });
      continue;
    }

    // Check if email already exists in users table
    const existingUser = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, emp.email.toLowerCase()))
      .limit(1);

    if (existingUser.length > 0) {
      results.push({
        employeeNumber: emp.employeeNumber,
        operation: "failed",
        userId: null,
        error: "Email already exists in users table",
      });
      continue;
    }

    // Hash initial password (Employee Number)
    const passwordHash = await hashPassword(emp.employeeNumber);

    // Insert new user
    const insertedUser = await tx
      .insert(users)
      .values({
        organizationId: settings.organizationId,
        email: emp.email.toLowerCase(),
        status: "active",
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: null,
      })
      .returning({ id: users.id });

    const newUserId = insertedUser[0]?.id;
    if (!newUserId) {
      results.push({
        employeeNumber: emp.employeeNumber,
        operation: "failed",
        userId: null,
        error: "Failed to create user",
      });
      continue;
    }

    // Ensure organization roles exist (idempotent)
    // This mirrors createEmployeeAccountAction logic
    for (const roleCode of ORGANIZATION_ROLE_CODES) {
      const existingRole = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.organizationId, settings.organizationId), eq(roles.code, roleCode)))
        .limit(1);

      if (!existingRole[0]) {
        await tx.insert(roles).values({
          organizationId: settings.organizationId,
          code: roleCode,
          name: ROLE_CATALOG[roleCode].name,
          description: ROLE_CATALOG[roleCode].description,
          isSystem: true,
        });
      }
    }

    // Find the selected role
    const selectedRole = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, settings.organizationId),
          eq(roles.id, settings.roleId)
        )
      )
      .limit(1);

    if (!selectedRole[0]) {
      results.push({
        employeeNumber: emp.employeeNumber,
        operation: "failed",
        userId: null,
        error: "Selected role not found",
      });
      continue;
    }

    // Insert user_role mapping
    await tx.insert(userRoles).values({
      userId: newUserId,
      roleId: selectedRole[0].id,
      scope: "organization",
      scopeId: settings.organizationId,
      grantedBy: actorUserId,
    });

    // Update employee to link the new user
    await tx
      .update(employees)
      .set({ userId: newUserId })
      .where(
        and(
          eq(employees.id, emp.id),
          eq(employees.organizationId, settings.organizationId)
        )
      );

    results.push({
      employeeNumber: emp.employeeNumber,
      operation: "created",
      userId: newUserId,
      error: null,
    });
  }

  return results;
}

/**
 * Create employee project assignments for imported employees.
 */
export async function provisionEmployeeAssignments(
  tx: typeof db,
  employeeList: Array<{
    id: string;
    employeeNumber: string;
  }>,
  settings: ImportSettings
): Promise<AssignmentProvisionResult[]> {
  const results: AssignmentProvisionResult[] = [];

  for (const emp of employeeList) {
    try {
      // Check if active assignment already exists
      const existing = await tx
        .select({ id: employeeProjectAssignments.id })
        .from(employeeProjectAssignments)
        .where(
          and(
            eq(employeeProjectAssignments.organizationId, settings.organizationId),
            eq(employeeProjectAssignments.employeeId, emp.id),
            eq(employeeProjectAssignments.projectId, settings.projectId),
            eq(employeeProjectAssignments.active, true)
          )
        )
        .limit(1);

      if (existing[0]) {
        results.push({
          employeeNumber: emp.employeeNumber,
          operation: "existing",
          error: null,
        });
        continue;
      }

      // Insert new assignment
      await tx.insert(employeeProjectAssignments).values({
        organizationId: settings.organizationId,
        employeeId: emp.id,
        projectId: settings.projectId,
        active: true,
      });

      results.push({
        employeeNumber: emp.employeeNumber,
        operation: "created",
        error: null,
      });
    } catch (error) {
      results.push({
        employeeNumber: emp.employeeNumber,
        operation: "failed",
        error: error instanceof Error ? error.message : "Failed to create assignment",
      });
    }
  }

  return results;
}

/**
 * Complete import result for detailed logging / the wizard Result step.
 *
 * SECURITY: this payload never carries password material — only the
 * non-reversible status of the initial credential (see `passwordNote`).
 */
export interface ImportResultDetail {
  row: number;
  employeeNumber: string;
  employeeName: string;
  email: string | null;
  operation: "create" | "update" | "skipped" | "failed";
  account: "created" | "existing" | "skipped_no_email" | "skipped_inactive" | "skipped_not_enabled" | "failed";
  assignment: "created" | "existing" | "failed";
  error: string | null;
  /** Assignment context from the validated import settings. */
  organization: string | null;
  project: string | null;
  workLocation: string | null;
  role: string | null;
  /** True only for accounts whose credential must be changed on first login. */
  mustChangePassword: boolean;
  /**
   * Credential status for newly provisioned accounts. Contains NO password —
   * it only states which value was configured as the initial password.
   */
  passwordNote: string | null;
}