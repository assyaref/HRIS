"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import type { z } from "zod";

import { db } from "@/db";
import {
  employeeCustomFieldValues,
  employeeEmploymentHistory,
  employees,
  users,
  roles,
  userRoles,
} from "@/db/schema";
import {
  listActiveFieldDefinitions,
} from "@/features/employee-fields/queries";
import {
  parseCustomFieldValue,
  type NormalizedCustomFieldValue,
} from "@/features/employee-fields/validation";
import { isFieldWritableByRoles } from "@/features/employee-fields/filtering";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { deleteEmployeeDocumentStorage } from "@/lib/employee-documents/storage";
import { hashPassword } from "@/lib/auth/password";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization, requirePermission } from "@/lib/auth/rbac";
import { ORGANIZATION_ROLE_CODES, ROLE_CATALOG, displayRoleLabel } from "@/lib/auth/roles";

import type { EmployeeStatus } from "./constants";
import { evaluateEmployeeDeletion } from "./delete-policy";
import {
  buildPermanentDeleteDependencyMessage,
  canPermanentlyDeleteEmployees,
  buildPermanentDeleteProtectedMessage,
  EMPLOYEE_PERMANENT_DELETE_ACKNOWLEDGEMENT_MESSAGE,
  EMPLOYEE_PERMANENT_DELETE_CONFIRMATION_MESSAGE,
  EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE,
  EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE,
  EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE,
  evaluatePermanentEmployeeDeletion,
  hasProtectedEmployeeDependencies,
  matchesEmployeeNumberConfirmation,
  presentEmployeeDeleteDependencies,
  presentEmployeeDependenciesByDisposition,
  resolveEmployeePermanentDeleteScope,
  totalEmployeeDeleteDependencyCount,
  type EmployeeDeleteDependency,
} from "./permanent-delete-policy";
import {
  countEmployeeDirectReports,
  deleteEmployeeDeletableRecords,
  getEmployeeById,
  getEmployeeInOrganization,
  listEmployeeDeletionDependencies,
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
 *   the actor's organization is treated as not found (no existence leak).
 * - Related records (linked user) must belong to the same organization.
 * - Removal lifecycle — two separate capabilities with DIFFERENT permissions:
 *   1. DEACTIVATE (`deleteEmployeeAction`, `employees.delete`):
 *      `active → inactive`, reversible, and every dependent record
 *      (attendance, payroll, leave, documents, master data, employment
 *      history) is preserved. Available to Admin / HR / Management.
 *   2. PERMANENT DELETE (`permanentlyDeleteEmployeeAction`,
 *      `employees.permanent_delete`): removes the `employees` row plus the
 *      related records classified as DELETABLE, in ONE transaction. Reserved
 *      for the system-level SUPERADMIN role — see the RBAC note below.
 * - Permanent deletion never removes PROTECTED historical records. Attendance,
 *   leave, permission, payroll, payslip and employment-history rows are
 *   retention-bound: their presence blocks the deletion with `409`, and their
 *   `RESTRICT` foreign keys back that up at the database level, so no role —
 *   not even SUPERADMIN — can override it.
 * - An employee linked to the actor's own user account cannot be removed
 *   through employee management.
 *
 * PERMANENT DELETE RBAC
 *
 * Two independent checks must both pass, and both are evaluated from the
 * database-backed authorization of the session (never from the form):
 *   1. `employees.permanent_delete` — the explicit capability code.
 *   2. the system-level SUPERADMIN role (`getUserAuthorization().isSuperAdmin`).
 *
 * Check (2) is deliberately redundant. Check (1) is what makes the capability
 * expressible, auditable and assignable in the permission matrix; check (2) is
 * the structural guarantee that a tenant — which can otherwise create custom
 * roles and grant them permissions — can never reach permanent deletion even if
 * the code were granted to one of its roles by mistake. This mirrors the
 * existing `organizations.*` SUPERADMIN-only permissions
 * (`lib/auth/permissions.ts`) and is enforced identically in the RBAC seed,
 * which refuses to write the grant into any organization-level role.
 */

export interface EmployeeActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

const DB_UNIQUE_VIOLATION = "23505";
const DB_FOREIGN_KEY_VIOLATION = "23503";

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

/** PostgreSQL `foreign_key_violation`: a dependent row refused the statement. */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === DB_FOREIGN_KEY_VIOLATION
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
  // Dynamic custom field values (Employee Master Data 2.0). The create
  // dialog renders every ACTIVE definition (keyed `cf:<fieldKey>`,
  // multiselect as `cf:<fieldKey>[]`), so newly created admin fields flow
  // through here with no source change. The employee + its values commit in
  // ONE transaction; a rejected value rolls the whole create back.
  const [authorization, allDefinitions] = await Promise.all([
    getUserAuthorization(user.id),
    listActiveFieldDefinitions(organizationId),
  ]);
  const canAccessCustomData =
    authorization.isSuperAdmin ||
    (authorization.permissionCodes.includes(PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW) &&
      authorization.permissionCodes.includes(
        PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE
      ));
  const definitions = canAccessCustomData
    ? allDefinitions.filter((definition) =>
        isFieldWritableByRoles(
          definition.visibilityConfig,
          definition.editableByConfig,
          authorization.roleCodes
        )
      )
    : [];
  const writableKeys = new Set(definitions.map((definition) => definition.fieldKey));
  const inaccessibleRequiredField = allDefinitions.some(
    (definition) => definition.isRequired && !writableKeys.has(definition.fieldKey)
  );
  if (inaccessibleRequiredField) {
    return toStateError(
      "A required custom field is unavailable to your current roles. Employee creation was not performed."
    );
  }
  const unauthorizedSubmitted = allDefinitions.some(
    (definition) =>
      !writableKeys.has(definition.fieldKey) &&
      (formData.has(`cf:${definition.fieldKey}`) ||
        formData.has(`cf:${definition.fieldKey}[]`))
  );
  if (unauthorizedSubmitted) {
    return toStateError(
      "You are not authorized to set one or more submitted custom fields."
    );
  }
  type CustomWrite = {
    definitionId: string;
    label: string;
    value: NormalizedCustomFieldValue;
  };
  const customWrites: CustomWrite[] = [];
  const customFieldErrors: Record<string, string> = {};
  for (const definition of definitions) {
    let raw: string;
    if (definition.fieldType === "multiselect") {
      const values = formData
        .getAll(`cf:${definition.fieldKey}[]`)
        .filter((entry): entry is string => typeof entry === "string");
      raw = values.join(", ");
    } else if (definition.fieldType === "checkbox") {
      raw = formData.get(`cf:${definition.fieldKey}`) ? "true" : "";
    } else {
      const entry = formData.get(`cf:${definition.fieldKey}`);
      raw = typeof entry === "string" ? entry.trim() : "";
    }
    if (!raw) {
      if (definition.isRequired) {
        customFieldErrors[`cf:${definition.fieldKey}`] = `${definition.label} is required.`;
      }
      continue;
    }
    const parsedValue = parseCustomFieldValue(
      definition.fieldType,
      raw,
      definition.options
    );
    if (!parsedValue.ok) {
      customFieldErrors[`cf:${definition.fieldKey}`] = parsedValue.error;
      continue;
    }
    customWrites.push({
      definitionId: definition.id,
      label: definition.label,
      value: parsedValue.value,
    });
  }
  if (Object.keys(customFieldErrors).length > 0) {
    return { status: "error", fieldErrors: customFieldErrors };
  }
  try {
    employeeId = await db.transaction(async (tx) => {
      const inserted = await tx
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
      for (const write of customWrites) {
        await tx.insert(employeeCustomFieldValues).values({
          organizationId,
          employeeId: row.id,
          fieldDefinitionId: write.definitionId,
          valueText: write.value.valueText,
          valueNumber: write.value.valueNumber,
          valueDate: write.value.valueDate,
          valueBoolean: write.value.valueBoolean,
          valueJson: write.value.valueJson,
        });
      }
      return row.id;
    });
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
 *   requires `employees.delete` (ADMIN). This action only writes the status;
 *   removing the row is the separate `permanentlyDeleteEmployeeAction`.
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
    await db.transaction(async (tx) => {
      let employmentSnapshot:
        | {
            position: string | null;
            department: string | null;
            division: string | null;
            managerId: string | null;
            workLocationId: string | null;
            employmentType: string | null;
          }
        | undefined;
      if (statusChanged) {
        const rows = await tx
          .select({
            position: employees.position,
            department: employees.department,
            division: employees.division,
            managerId: employees.managerId,
            workLocationId: employees.workLocationId,
            employmentType: employees.employmentType,
          })
          .from(employees)
          .where(
            and(
              eq(employees.id, employeeId),
              eq(employees.organizationId, organizationId)
            )
          )
          .limit(1);
        employmentSnapshot = rows[0];
        if (!employmentSnapshot) {
          throw new Error("EMPLOYEE_NOT_FOUND");
        }
      }
      const effectiveFrom = new Date();
      await tx
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
          updatedAt: effectiveFrom,
        })
        .where(
          and(
            eq(employees.id, employeeId),
            eq(employees.organizationId, organizationId)
          )
        );
      if (statusChanged && employmentSnapshot) {
        await tx.insert(employeeEmploymentHistory).values({
          organizationId,
          employeeId,
          ...employmentSnapshot,
          employmentStatus: nextValues.employmentStatus,
          effectiveFrom,
          notes: "Status changed through employee profile",
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
      return toStateError("The employee no longer exists in your organization.");
    }
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

/**
 * State returned by the permanent-deletion flow.
 *
 * `code` carries the HTTP-equivalent outcome so the dialog can distinguish a
 * permission problem (403) from a missing record (404), a wrong confirmation
 * (400), protected historical records (409) and an unexpected failure (500)
 * without parsing the message.
 */
export interface EmployeePermanentDeleteState {
  status: "idle" | "error" | "success";
  message?: string;
  code?:
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFIRMATION_MISMATCH"
    | "PROTECTED_RECORDS"
    | "DEPENDENCIES"
    | "SELF_LINKED"
    | "FAILED";
  /** Non-zero dependency counts, for the structured summary in the dialog. */
  dependencies?: EmployeeDeleteDependency[];
  /**
   * Dependents that will be removed by this operation (documents, face ID,
   * project assignments, master data). Empty when nothing is removed.
   */
  deletableDependencies?: EmployeeDeleteDependency[];
  /** Rows removed per category, present on success for the audit summary. */
  removedSummary?: Record<string, number>;
}

type PermanentDeleteAuditResult = "SUCCESS" | "DENIED" | "FAILED";

/**
 * Append one `EMPLOYEE_PERMANENT_DELETE` audit record.
 *
 * The row deliberately depends on NOTHING that the deletion removes:
 * `audit_logs.entity_id` is a plain uuid column with no foreign key, and the
 * employee identity is stored as a snapshot (`employeeId` / `employeeNumber` /
 * `employeeName`). The trail therefore survives the employee row — which is the
 * whole point of auditing a destructive operation.
 *
 * Records the actor (id, email, role), the organization, the employee snapshot,
 * the per-category count of removed related records, and how the attempt ended.
 * Never secrets, never master-data payloads. Audit failures are logged and
 * swallowed: a lost audit row must not turn a committed deletion into a
 * reported failure, nor mask the real error the operator needs to see.
 */
async function auditPermanentEmployeeDelete(input: {
  organizationId: string | null;
  actorUserId: string;
  actorEmail: string | null;
  actorRole: string | null;
  employeeId: string;
  employeeNumber: string | null;
  employeeName: string | null;
  result: PermanentDeleteAuditResult;
  reason?: string;
  deletedRelatedRecords?: Record<string, number>;
}): Promise<void> {
  try {
    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "employee.permanently_deleted",
      entityType: "employee",
      entityId: input.employeeId,
      metadata: {
        operation: "EMPLOYEE_PERMANENT_DELETE",
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        actorRole: input.actorRole,
        employeeId: input.employeeId,
        employeeNumber: input.employeeNumber,
        employeeName: input.employeeName,
        result: input.result,
        deletedRelatedRecords: input.deletedRelatedRecords ?? {},
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
  } catch (error) {
    console.error("[employees] permanent delete audit failed", error);
  }
}

function toPermanentDeleteError(
  code: EmployeePermanentDeleteState["code"],
  message: string,
  dependencies?: EmployeeDeleteDependency[]
): EmployeePermanentDeleteState {
  return { status: "error", code, message, dependencies };
}

/**
 * Second confirmation layer: the operator must have ticked
 * "I understand that this action cannot be undone."
 *
 * Re-validated server-side because the UI gate is a convenience, not a control:
 * a request crafted by hand can omit the field, and the operation must still be
 * refused. A missing field and an explicit `false` are both a refusal.
 */
function isAcknowledgedPermanentDelete(formData: FormData): boolean {
  const raw = formData.get("acknowledgedPermanentDelete");
  return raw === "true" || raw === "on" || raw === "1";
}

/** Re-read the dependency summary on its own snapshot (after a rollback). */
async function readEmployeeDeletionDependencies(
  employeeId: string,
  organizationId: string
): Promise<{
  dependencies: EmployeeDeleteDependency[];
  directReportCount: number;
}> {
  return db.transaction(async (tx) => ({
    dependencies: await listEmployeeDeletionDependencies(tx, employeeId, organizationId),
    directReportCount: await countEmployeeDirectReports(tx, employeeId, organizationId),
  }));
}

/**
 * Permanently delete one employee record.
 *
 * Requires BOTH `employees.permanent_delete` and the system-level SUPERADMIN
 * role (see the module doc). This action is the ONLY writer: it is a distinct
 * operation from `deleteEmployeeAction` (deactivate) and from any REST route.
 *
 * Guards, in order — the first failure wins and nothing is written:
 * 1. `requireUser` (authenticate + verify session) → `401`/redirect otherwise.
 * 2. Authorization from the database-backed RBAC of the session: the
 *    `employees.permanent_delete` code AND `isSuperAdmin`. The dialog hiding
 *    its button is a convenience only; a direct server-action call from a
 *    non-SUPERADMIN actor is refused here with `FORBIDDEN` (403).
 * 3. Organization scoping: the employee is loaded by id and its OWNING
 *    organization (read from the database) is authoritative. A Super
 *    Administrator may therefore permanently delete an employee of the tenant
 *    they explicitly selected (e.g. SUPRACO from a System session) without the
 *    record being resolved against the session organization. An explicit
 *    organization context that does not match the record's owner is refused,
 *    and an id that belongs outside a non-SUPERADMIN's organization resolves
 *    like an unknown id, so existence never leaks → 404.
 * 4. Employee-number confirmation, compared against the number loaded from
 *    the database — the browser value is only the typed confirmation → 400.
 * 5. PROTECTED historical records (attendance, leave, permission, payroll,
 *    payslip, employment history) → 409, nothing deleted.
 * 6. ONE transaction: lock the row, re-check the confirmation, re-scan and
 *    re-decide on the locked snapshot, delete the DELETABLE related records
 *    table by table, then delete the employee row.
 *
 * ATOMICITY: every statement above runs inside a single `db.transaction`. Any
 * throw — a failed dependent delete, a racing insert that trips a `RESTRICT`
 * foreign key, a lock timeout — rolls the whole operation back, so there is no
 * state in which the employee row is gone while history survives, or vice
 * versa. On rollback nothing is reported as deleted.
 *
 * The database remains the final authority: every employee-scoped foreign key
 * is `RESTRICT`/`SET NULL` (never `CASCADE`, migration 0017), so the explicit
 * delete plan is bounded by the same integrity rules as before — protected
 * rows cannot be reached by any role, including SUPERADMIN.
 */
export async function permanentlyDeleteEmployeeAction(
  employeeId: string,
  requestedOrganizationId: string | null,
  _prevState: EmployeePermanentDeleteState,
  formData: FormData
): Promise<EmployeePermanentDeleteState> {
  const user = await requireUser();
  const sessionOrganizationId = user.organizationId ?? null;

  // Authorization is decided here, from the session — never from the form.
  // One authorization read serves both the gate and the audit context.
  const authorization = await getUserAuthorization(user.id);
  const canPermanentlyDelete = canPermanentlyDeleteEmployees(authorization);
  const actorRole = displayRoleLabel(authorization.roleCodes);
  const auditContext = {
    organizationId: sessionOrganizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole,
    employeeId,
    employeeNumber: null as string | null,
    employeeName: null as string | null,
  };

  if (!canPermanentlyDelete) {
    await auditPermanentEmployeeDelete({
      ...auditContext,
      result: "DENIED",
      reason: "PERMISSION_DENIED",
    });
    return toPermanentDeleteError(
      "FORBIDDEN",
      EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE
    );
  }

  if (!sessionOrganizationId) {
    await auditPermanentEmployeeDelete({
      ...auditContext,
      organizationId: null,
      result: "DENIED",
      reason: "NO_ORGANIZATION",
    });
    return toPermanentDeleteError(
      "FORBIDDEN",
      "Your account is not assigned to an organization."
    );
  }
  // The employee's OWNING organization is read from the database and is
  // authoritative — `requestedOrganizationId` (the listing's selected tenant)
  // is only a consistency assertion, never a lookup key. This is what lets a
  // System-session Super Administrator permanently delete a SUPRACO employee:
  // the row is found by id, its owner is SUPRACO, and every statement below is
  // scoped to SUPRACO rather than the System organization. Unknown ids, a
  // mismatched context, and a non-SUPERADMIN's foreign id all resolve as
  // "not found" so cross-tenant existence never leaks.
  const employee = await getEmployeeById(employeeId);
  const scope = employee
    ? resolveEmployeePermanentDeleteScope({
        employeeOrganizationId: employee.organizationId,
        userOrganizationId: sessionOrganizationId,
        isSuperAdmin: authorization.isSuperAdmin,
        requestedOrganizationId,
      })
    : null;
  if (!employee || !scope) {
    await auditPermanentEmployeeDelete({
      ...auditContext,
      organizationId: sessionOrganizationId,
      result: "DENIED",
      reason: "NOT_FOUND",
    });
    return toPermanentDeleteError(
      "NOT_FOUND",
      EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE
    );
  }
  const scopedOrganizationId = scope.organizationId;

  const employeeName = `${employee.firstName} ${employee.lastName}`;
  const employeeContext = {
    ...auditContext,
    organizationId: scopedOrganizationId,
    employeeNumber: employee.employeeNumber,
    employeeName,
  };

  // Confirmation is matched against the stored employee number.
  const confirmation = field(formData, "confirmEmployeeNumber");
  if (!matchesEmployeeNumberConfirmation(employee.employeeNumber, confirmation)) {
    await auditPermanentEmployeeDelete({
      ...employeeContext,
      result: "DENIED",
      reason: "CONFIRMATION_MISMATCH",
    });
    return toPermanentDeleteError(
      "CONFIRMATION_MISMATCH",
      EMPLOYEE_PERMANENT_DELETE_CONFIRMATION_MESSAGE
    );
  }

  // The second confirmation layer. The typed employee number proves the
  // operator read the record; this checkbox proves they accepted the
  // irreversibility. Both are re-validated server-side, so a hand-rolled
  // request cannot skip either one.
  if (!isAcknowledgedPermanentDelete(formData)) {
    await auditPermanentEmployeeDelete({
      ...employeeContext,
      result: "DENIED",
      reason: "ACKNOWLEDGEMENT_MISSING",
    });
    return toPermanentDeleteError(
      "CONFIRMATION_MISMATCH",
      EMPLOYEE_PERMANENT_DELETE_ACKNOWLEDGEMENT_MESSAGE
    );
  }

  type DeletionOutcome =
    | { code: "SUCCESS"; removedSummary: Record<string, number> }
    | { code: "NOT_FOUND" | "CONFIRMATION_MISMATCH" }
    | {
        code: "DENIED";
        stateCode: "PROTECTED_RECORDS" | "SELF_LINKED" | "DEPENDENCIES";
        reason:
          | "SELF_LINKED"
          | "PROTECTED_HISTORICAL_RECORDS"
          | "RELATED_RECORDS_EXIST";
        message: string;
        dependencies: EmployeeDeleteDependency[];
        deletableDependencies: EmployeeDeleteDependency[];
      };

  let outcome: DeletionOutcome;
  try {
    outcome = await db.transaction(async (tx) => {
      // Re-read and lock the row so a concurrent status change cannot slip
      // between the checks and the DELETE.
      const locked = await tx
        .select({
          id: employees.id,
          employeeNumber: employees.employeeNumber,
          userId: employees.userId,
        })
        .from(employees)
        .where(
          and(
            eq(employees.id, employeeId),
            eq(employees.organizationId, scopedOrganizationId)
          )
        )
        .for("update")
        .limit(1);
      const current = locked[0];
      if (!current) {
        return { code: "NOT_FOUND" } as const;
      }
      if (
        !matchesEmployeeNumberConfirmation(current.employeeNumber, confirmation)
      ) {
        return { code: "CONFIRMATION_MISMATCH" } as const;
      }

      const dependencies = await listEmployeeDeletionDependencies(
        tx,
        current.id,
        scopedOrganizationId
      );
      const decision = evaluatePermanentEmployeeDeletion({
        actorUserId: user.id,
        employeeNumber: current.employeeNumber,
        linkedUserId: current.userId,
        dependencies,
      });
      if (!decision.allowed) {
        const stateCode =
          decision.code === "SELF_LINKED"
            ? "SELF_LINKED"
            : decision.code === "PROTECTED_RECORDS"
              ? "PROTECTED_RECORDS"
              : "DEPENDENCIES";
        return {
          code: "DENIED",
          stateCode,
          reason:
            decision.code === "SELF_LINKED"
              ? "SELF_LINKED"
              : decision.code === "PROTECTED_RECORDS"
                ? "PROTECTED_HISTORICAL_RECORDS"
                : "RELATED_RECORDS_EXIST",
          message: decision.message,
          dependencies:
            decision.code === "PROTECTED_RECORDS"
              ? decision.dependencies
              : presentEmployeeDeleteDependencies(dependencies),
          deletableDependencies: presentEmployeeDependenciesByDisposition(
            dependencies,
            "deletable"
          ),
        } as const;
      }

      // Explicit, table-by-table removal of the DELETABLE related records,
      // immediately before the employee row so the two stay atomic. No
      // CASCADE is relied upon, and every statement is org-scoped.
      const removedSummary = await deleteEmployeeDeletableRecords(
        tx,
        current.id,
        scopedOrganizationId
      );

      // Scoped delete of exactly this one employee row.
      const removed = await tx
        .delete(employees)
        .where(
          and(
            eq(employees.id, current.id),
            eq(employees.organizationId, scopedOrganizationId)
          )
        )
        .returning({ id: employees.id });
      if (removed.length === 0) {
        return { code: "NOT_FOUND" } as const;
      }
      return { code: "SUCCESS", removedSummary } as const;
    });
  } catch (error) {
    // Any throw above rolls the transaction back — nothing was committed.
    if (isForeignKeyViolation(error)) {
      // A dependent row appeared after the scan; report it like any other
      // related-record rejection instead of a generic failure.
      const dependencies = await readEmployeeDeletionDependencies(
        employeeId,
        scopedOrganizationId
      ).catch((summaryError) => {
        // The refusal stands either way: the foreign key already rejected the
        // statement. Only the per-module breakdown is lost, so keep the reason
        // in the server log instead of failing the request.
        console.error(
          "[employees] could not re-read dependencies after a foreign-key rejection",
          summaryError
        );
        return { dependencies: [], directReportCount: 0 };
      }).then((summary) => summary.dependencies);
      await auditPermanentEmployeeDelete({
        ...employeeContext,
        result: "DENIED",
        reason: "RELATED_RECORDS_EXIST",
      });
      return toPermanentDeleteError(
        hasProtectedEmployeeDependencies(dependencies)
          ? "PROTECTED_RECORDS"
          : "DEPENDENCIES",
        hasProtectedEmployeeDependencies(dependencies)
          ? buildPermanentDeleteProtectedMessage(
              employee.employeeNumber,
              dependencies
            )
          : buildPermanentDeleteDependencyMessage(
              employee.employeeNumber,
              dependencies
            ),
        presentEmployeeDeleteDependencies(dependencies)
      );
    }

    console.error("[employees] permanent delete failed", error);
    await auditPermanentEmployeeDelete({
      ...employeeContext,
      result: "FAILED",
      // Machine-readable reason only: the driver message can name columns or
      // values, and audit rows are readable by admins. Detail stays in the log
      // line above.
      reason: "UNEXPECTED_ERROR",
    });
    return toPermanentDeleteError(
      "FAILED",
      EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE
    );
  }

  if (outcome.code === "SUCCESS") {
    await auditPermanentEmployeeDelete({
      ...employeeContext,
      result: "SUCCESS",
      deletedRelatedRecords: outcome.removedSummary,
    });
    // The employee's private document folder is the only artifact outside the
    // transaction. Remove it after the commit so a rolled-back delete can never
    // lose files, and never before it so a committed delete never leaves them
    // orphaned.
    await deleteEmployeeDocumentStorage(scopedOrganizationId, employeeId);
    revalidatePath("/employees");
    revalidatePath(`/employees/${employeeId}`);
    return {
      status: "success",
      message: "Employee permanently deleted successfully.",
      removedSummary: outcome.removedSummary,
    };
  }

  if (outcome.code === "DENIED") {
    await auditPermanentEmployeeDelete({
      ...employeeContext,
      result: "DENIED",
      reason: outcome.reason,
    });
    return {
      status: "error",
      code: outcome.stateCode,
      message: outcome.message,
      dependencies: outcome.dependencies,
      deletableDependencies: outcome.deletableDependencies,
    };
  }

  await auditPermanentEmployeeDelete({
    ...employeeContext,
    result: "DENIED",
    reason: outcome.code,
  });
  return toPermanentDeleteError(
    outcome.code,
    outcome.code === "NOT_FOUND"
      ? EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE
      : EMPLOYEE_PERMANENT_DELETE_CONFIRMATION_MESSAGE
  );
}

/** Read-only dependency report used to enable/disable the confirm button. */
export interface EmployeePermanentDeleteDependencyReport {
  status: "success" | "error";
  message?: string;
  /** Non-zero dependency categories, display order preserved. */
  dependencies: EmployeeDeleteDependency[];
  /** Non-zero PROTECTED categories — their presence blocks the deletion. */
  protectedDependencies: EmployeeDeleteDependency[];
  /** Non-zero DELETABLE categories — these will be removed by the operation. */
  deletableDependencies: EmployeeDeleteDependency[];
  /** Sum of every non-zero category. */
  totalRelatedRecords: number;
  /**
   * Direct reports, which are RETAINED and only lose their manager.
   *
   * Kept out of `totalRelatedRecords` and `deletableDependencies` on purpose:
   * those describe rows the operation removes, and a direct report is not one.
   */
  directReportCount: number;
  /** True when a PROTECTED record blocks the deletion (409). */
  blocked: boolean;
}

/** Empty report for every refusal path — never reports a usable delete. */
function deniedDependencyReport(
  message: string
): EmployeePermanentDeleteDependencyReport {
  return {
    status: "error",
    message,
    dependencies: [],
    protectedDependencies: [],
    deletableDependencies: [],
    totalRelatedRecords: 0,
    directReportCount: 0,
    blocked: true,
  };
}

/**
 * Read-only pre-flight for the permanent-delete dialog.
 *
 * Requires the same authorization as the delete itself (`employees.permanent_delete`
 * AND the system-level SUPERADMIN role), so the dialog cannot even ask about
 * dependency counts without being entitled to the operation.
 *
 * It performs NO write, NO audit row and NO delete: it only counts and
 * classifies dependents so the dialog can show the real figures and keep its
 * confirm button disabled when a PROTECTED record exists. The server-side
 * enforcement inside `permanentlyDeleteEmployeeAction` (permission,
 * organization scope, confirmation, dependency scan inside the transaction,
 * foreign-key backstop) is unchanged and remains authoritative — this report is
 * a UX affordance, never the guard.
 *
 * Scoped exactly like the delete itself: the employee's OWNING organization is
 * read from the database (SUPERADMIN may therefore pre-flight another tenant's
 * record), the requested organization context is only a consistency assertion,
 * and a foreign/mismatched `employeeId` resolves as "not found" — it cannot
 * reveal another organization's dependency counts.
 */
export async function checkEmployeeDeletionDependenciesAction(
  employeeId: string,
  requestedOrganizationId: string | null
): Promise<EmployeePermanentDeleteDependencyReport> {
  const user = await requireUser();
  const sessionOrganizationId = user.organizationId ?? null;

  const authorization = await getUserAuthorization(user.id);
  const canPermanentlyDelete = canPermanentlyDeleteEmployees(authorization);
  if (!canPermanentlyDelete) {
    return deniedDependencyReport(
      EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE
    );
  }

  if (!sessionOrganizationId) {
    return deniedDependencyReport(
      "Your account is not assigned to an organization."
    );
  }

  const employee = await getEmployeeById(employeeId);
  const scope = employee
    ? resolveEmployeePermanentDeleteScope({
        employeeOrganizationId: employee.organizationId,
        userOrganizationId: sessionOrganizationId,
        isSuperAdmin: authorization.isSuperAdmin,
        requestedOrganizationId,
      })
    : null;
  if (!employee || !scope) {
    return deniedDependencyReport(EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE);
  }

  try {
    const { dependencies, directReportCount } = await readEmployeeDeletionDependencies(
      employee.id,
      scope.organizationId
    );
    return {
      status: "success",
      dependencies,
      protectedDependencies: presentEmployeeDependenciesByDisposition(
        dependencies,
        "protected"
      ),
      deletableDependencies: presentEmployeeDependenciesByDisposition(
        dependencies,
        "deletable"
      ),
      totalRelatedRecords: totalEmployeeDeleteDependencyCount(dependencies),
      directReportCount,
      // Only PROTECTED records block: deletable records are removed by the
      // operation itself, which is exactly what the operator is confirming.
      blocked: hasProtectedEmployeeDependencies(dependencies),
    };
  } catch (error) {
    // Fail closed: an unreadable dependency report must never enable a delete.
    console.error("[employees] permanent delete dependency check failed", error);
    return deniedDependencyReport(EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE);
  }
}

/**
 * Deactivate an employee record (requires `employees.delete`).
 *
 * The action updates the employee and appends employment history in one
 * transaction. It never deletes the employee or any dependent master-data,
 * document, custom-value, payroll, attendance, or leave record. Permanent
 * deletion is the separate `permanentlyDeleteEmployeeAction` flow.
 */
export async function deleteEmployeeAction(
  employeeId: string
): Promise<EmployeeActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DELETE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;
  const employee = await getEmployeeInOrganization(employeeId, organizationId);
  if (!employee) forbidden();

  const decision = evaluateEmployeeDeletion({
    actorUserId: user.id,
    employeeId: employee.id,
    linkedUserId: employee.userId,
    protectedCategories: [],
  });
  if (!decision.allowed && decision.code === "SELF_LINKED") {
    return toStateError(decision.message);
  }

  let changed = false;
  try {
    changed = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: employees.id,
          employeeNumber: employees.employeeNumber,
          status: employees.employmentStatus,
          position: employees.position,
          department: employees.department,
          division: employees.division,
          managerId: employees.managerId,
          workLocationId: employees.workLocationId,
          employmentType: employees.employmentType,
        })
        .from(employees)
        .where(
          and(
            eq(employees.id, employee.id),
            eq(employees.organizationId, organizationId)
          )
        )
        .limit(1);
      const current = rows[0];
      if (!current) {
        throw new Error("EMPLOYEE_NOT_FOUND");
      }
      if (current.status === "inactive") return false;

      const effectiveFrom = new Date();
      const updated = await tx
        .update(employees)
        .set({ employmentStatus: "inactive", updatedAt: effectiveFrom })
        .where(
          and(
            eq(employees.id, current.id),
            eq(employees.organizationId, organizationId)
          )
        )
        .returning({ id: employees.id });
      if (updated.length === 0) {
        throw new Error("EMPLOYEE_NOT_FOUND");
      }
      await tx.insert(employeeEmploymentHistory).values({
        organizationId,
        employeeId: current.id,
        position: current.position,
        department: current.department,
        division: current.division,
        managerId: current.managerId,
        workLocationId: current.workLocationId,
        employmentType: current.employmentType,
        employmentStatus: "inactive",
        effectiveFrom,
        notes: "Employee deactivated",
      });
      return true;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
      return toStateError("The employee no longer exists in your organization.");
    }
    console.error("[employees] deactivate failed", error);
    return toStateError("Could not deactivate the employee. Please try again.");
  }

  if (!changed) {
    return { status: "success", message: "Employee is already inactive." };
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee.status_changed",
      entityType: "employee",
      entityId: employee.id,
      metadata: {
        employeeNumber: employee.employeeNumber,
        from: employee.employmentStatus,
        to: "inactive",
      },
    });
  } catch (error) {
    console.error("[employees] audit failed after deactivate", error);
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${employee.id}`);
  return { status: "success", message: "Employee deactivated successfully." };
}
