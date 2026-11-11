"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import type { z } from "zod";

import { db } from "@/db";
import { randomUUID } from "node:crypto";
import { UUID_PATTERN } from "./schemas";
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
  buildPermanentDeleteRetainedCompletionMessage,
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
  DELETION_ACTIVE_REQUEST_MESSAGE,
  DELETION_LEGAL_HOLD_MESSAGE,
  DELETION_REASON_REQUIRED_MESSAGE,
  isValidDeletionReason,
} from "./deletion-control-policy";
import {
  collectEmployeePayslipFileKeys,
  countEmployeeDirectReports,
  deleteEmployeeDeletableRecords,
  getEmployeeById,
  getEmployeeDeletionControlState,
  getEmployeeInOrganization,
  getEmployeesByIds,
  listEmployeeDeletionDependencies,
  listLinkableUsers,
  snapshotEmployeeRetainedRecords,
  type EmployeeDeletionControlState,
} from "./queries";
import {
  purgeStoredPayslipPdfs,
  type PayslipFilePurgeResult,
} from "@/lib/payroll/payslip-file-purge";
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
 *   leave, permission and employment-history rows are retention-bound: they
 *   are RETAINED, and — under the approved detach schema (migration 0022, see
 *   docs/employee-deletion-payroll-scope-decision-record.md) — their employee
 *   reference is atomically cleared (`ON DELETE SET NULL`) while their
 *   immutable identity snapshots keep them reportable. Where migration 0022
 *   has NOT been applied, the pre-0022 `RESTRICT` foreign keys still refuse
 *   the DELETE (`23503`), the transaction rolls back and the retained-
 *   completion error is returned: the feature fails closed until both the
 *   migration and this code are deployed, so no role — not even SUPERADMIN —
 *   can delete retained history.
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
const DB_CHECK_VIOLATION = "23514";

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

/** PostgreSQL `check_violation`: a control-plane invariant refused the statement. */
function isCheckViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === DB_CHECK_VIOLATION
  );
}

/** Constraint name from a PostgreSQL error, when the driver exposes it. */
function constraintNameOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("constraint" in error)) {
    return null;
  }
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === "string" ? constraint : null;
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
    lastName: formData.has("lastName")
      ? field(formData, "lastName")
      : undefined,
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
    // When Last Name is not submitted (empty), preserve the existing value so
    // an import or edit that omits the column never wipes an existing lastName.
    lastName: parsed.data.lastName || existing.lastName,
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
    | "REASON_REQUIRED"
    | "PROTECTED_RECORDS"
    | "DEPENDENCIES"
    | "SELF_LINKED"
    | "LEGAL_HOLD"
    | "ACTIVE_DELETION_REQUEST"
    | "FAILED";
  /** Non-zero dependency counts, for the structured summary in the dialog. */
  dependencies?: EmployeeDeleteDependency[];
  /**
   * Dependents that will be removed by this operation (documents, face ID,
   * project assignments, master data). Empty when nothing is removed.
   */
  deletableDependencies?: EmployeeDeleteDependency[];
  /**
   * PROTECTED dependents that are retained by policy (never deleted). Under
   * the Super Administrator override and the approved detach schema
   * (migration 0022) the deletion COMPLETES while they exist: they are
   * detached (`employee_id` cleared by the SET NULL foreign keys) with their
   * immutable identity snapshots frozen. Present on the success state and on
   * the compatibility error returned when the schema change is not applied.
   */
  retainedDependencies?: EmployeeDeleteDependency[];
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
  /**
   * The operator-supplied justification for the deletion attempt (audit
   * policy): mandatory, validated by `isValidDeletionReason`, and recorded
   * alongside the machine-readable `reason` on every attempt that got past
   * the confirmation layers.
   */
  deletionReason?: string | null;
  deletedRelatedRecords?: Record<string, number>;
  /**
   * PROTECTED records the deletion RETAINED, per category. On SUCCESS these
   * are the rows that were detached with their identity snapshots
   * (migration 0022); on a foreign-key refusal they are the rows whose
   * pre-0022 RESTRICT constraint blocked the completion.
   */
  retainedRecords?: Record<string, number>;
  /**
   * Retained rows whose immutable identity snapshot was frozen by this
   * deletion, per table (migration 0022). Present on SUCCESS only.
   */
  snapshottedRetainedRecords?: Record<string, number>;
  /**
   * Stored payslip PDF keys orphaned by this deletion (owner-approved
   * payroll scope), collected inside the transaction. Present on SUCCESS
   * only; the post-commit purge and the operator sweep script both use this
   * list as their exact file scope.
   */
  payslipFileKeys?: string[];
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
        ...(input.retainedRecords
          ? { retainedRecords: input.retainedRecords }
          : {}),
        ...(input.snapshottedRetainedRecords
          ? { snapshottedRetainedRecords: input.snapshottedRetainedRecords }
          : {}),
        ...(input.payslipFileKeys
          ? { payslipFileKeys: input.payslipFileKeys }
          : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.deletionReason
          ? { deletionReason: input.deletionReason }
          : {}),
      },
    });
  } catch (error) {
    console.error("[employees] permanent delete audit failed", error);
  }
}

/**
 * Best-effort audit row for the POST-COMMIT file purge of a permanently
 * deleted employee (owner-approved payroll scope): which stored payslip PDFs
 * were removed / already missing / failed, and whether the employee's private
 * document folder was removed. Written only after the deletion transaction
 * has committed; a lost audit row is logged, never fatal — the deletion
 * result was already returned to the operator by then.
 */
async function auditPermanentEmployeeDeleteFilePurge(input: {
  organizationId: string | null;
  actorUserId: string;
  actorEmail: string | null;
  actorRole: string | null;
  employeeId: string;
  employeeNumber: string | null;
  employeeName: string | null;
  payslipFileKeys: string[];
  payslipFilePurge: PayslipFilePurgeResult;
  documentFolderRemoval: { removed: boolean; error: string | null };
}): Promise<void> {
  try {
    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "employee.permanently_deleted_files",
      entityType: "employee",
      entityId: input.employeeId,
      metadata: {
        operation: "EMPLOYEE_PERMANENT_DELETE_FILE_PURGE",
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        actorRole: input.actorRole,
        employeeId: input.employeeId,
        employeeNumber: input.employeeNumber,
        employeeName: input.employeeName,
        payslipFileScopeCount: input.payslipFileKeys.length,
        payslipFilesPurged: input.payslipFilePurge.purged,
        payslipFilesMissing: input.payslipFilePurge.missing,
        payslipFileFailures: input.payslipFilePurge.failed,
        documentFolderRemoved: input.documentFolderRemoval.removed,
        documentFolderError: input.documentFolderRemoval.error,
        result:
          input.payslipFilePurge.failed.length === 0 &&
          input.documentFolderRemoval.error === null
            ? "SUCCESS"
            : "PARTIAL",
      },
    });
  } catch (error) {
    console.error(
      "[employees] permanent delete file-purge audit failed",
      error
    );
  }
}

function toPermanentDeleteError(
  code: EmployeePermanentDeleteState["code"],
  message: string,
  dependencies?: EmployeeDeleteDependency[],
  retainedDependencies?: EmployeeDeleteDependency[]
): EmployeePermanentDeleteState {
  return { status: "error", code, message, dependencies, retainedDependencies };
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
  controlState: EmployeeDeletionControlState;
}> {
  return db.transaction(async (tx) => ({
    dependencies: await listEmployeeDeletionDependencies(tx, employeeId, organizationId),
    directReportCount: await countEmployeeDirectReports(tx, employeeId, organizationId),
    controlState: await getEmployeeDeletionControlState(tx, employeeId, organizationId),
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
 *    The irreversibility acknowledgement and the audit-policy deletion REASON
 *    (`deletionReason`, shared `isValidDeletionReason` validator, 10–2000
 *    characters) are re-validated server-side the same way → 400. The
 *    operator-supplied reason is recorded on every subsequent audit row.
 * 5. PROTECTED historical records (attendance, leave, permission, employment
 *    history) are RETAINED, never deleted. Under the revised policy they no
 *    longer fail the Super Administrator's APPLICATION-level eligibility
 *    (`superAdminOverride`). With the approved detach schema (migration 0022)
 *    the deletion then COMPLETES: the retained rows' identity snapshots are
 *    frozen and their employee references are atomically cleared by the
 *    tables' ON DELETE SET NULL foreign keys — inside the same transaction.
 *    Payroll history (payroll components, payroll items, payslips and the
 *    payslip document chain) is owner-approved DELETABLE and is removed
 *    explicitly, children first, before the employee row. Against a pre-0022
 *    schema the same attempt fails closed: the old RESTRICT foreign keys
 *    refuse the employee DELETE (23503), the transaction rolls back and the
 *    retained-completion error is returned.
 * 6. ONE transaction: lock the row, re-check the confirmation, re-scan and
 *    re-decide on the locked snapshot, freeze the retained-identity
 *    snapshots, delete the DELETABLE related records table by table, then
 *    delete the employee row (which detaches the retained rows).
 *
 * ATOMICITY: every statement above runs inside a single `db.transaction`. Any
 * throw — a failed dependent delete, a racing insert that trips a `RESTRICT`
 * foreign key on a DELETABLE table, a lock timeout, a schema that does not
 * have the snapshot columns — rolls the whole operation back, so there is no
 * state in which the employee row is gone while history survives, or vice
 * versa. On rollback nothing is reported as deleted.
 *
 * The database remains the final authority: no employee-scoped foreign key is
 * ever `CASCADE`. DELETABLE tables keep the migration-0017 `RESTRICT`
 * backstop, and the PROTECTED tables' `SET NULL` action preserves their rows
 * while the `<table>_retained_identity_check` CHECK constraints guarantee a
 * detached row always carries its historical identity — nothing is reachable
 * by any role, including SUPERADMIN, that the policy does not allow.
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

  // Third confirmation layer — the audit-policy reason. The operator must
  // justify the irreversible deletion; the same shared validator as the
  // control plane decides (non-empty, 10–2000 characters). Re-validated
  // server-side so a hand-rolled request cannot skip it, and recorded on
  // every subsequent audit row for this attempt.
  const deletionReason = field(formData, "deletionReason");
  if (!isValidDeletionReason(deletionReason)) {
    await auditPermanentEmployeeDelete({
      ...employeeContext,
      result: "DENIED",
      reason: "REASON_REQUIRED",
    });
    return toPermanentDeleteError(
      "REASON_REQUIRED",
      DELETION_REASON_REQUIRED_MESSAGE
    );
  }
  const operatorReason = deletionReason.trim();
  const deletionContext = { ...employeeContext, deletionReason: operatorReason };

  type DeletionOutcome =
    | {
        code: "SUCCESS";
        removedSummary: Record<string, number>;
        /**
         * PROTECTED categories retained by this deletion, with their
         * pre-deletion counts — reported to the operator and audited.
         */
        retainedDependencies: EmployeeDeleteDependency[];
        /** Retained rows whose identity snapshot was frozen, per table. */
        snapshottedRecords: Record<string, number>;
        /**
         * Stored payslip PDF keys orphaned by this deletion, collected inside
         * the transaction before the payroll rows were removed. The SUCCESS
         * audit carries them and the post-commit purge removes exactly these
         * files — nothing else.
         */
        payslipFileKeys: string[];
      }
    | { code: "NOT_FOUND" | "CONFIRMATION_MISMATCH" }
    | {
        code: "DENIED";
        stateCode:
          | "PROTECTED_RECORDS"
          | "SELF_LINKED"
          | "DEPENDENCIES"
          | "LEGAL_HOLD"
          | "ACTIVE_DELETION_REQUEST";
        reason:
          | "SELF_LINKED"
          | "PROTECTED_HISTORICAL_RECORDS"
          | "RELATED_RECORDS_EXIST"
          | "LEGAL_HOLD"
          | "ACTIVE_DELETION_REQUEST";
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

      // Control-plane integration (migration 0021). This is checked inside the
      // same transaction and after the employee row is locked, so it cannot be
      // raced by a hold/release or request decision that commits first.
      // An ACTIVE hold and a PENDING/APPROVED deletion request are absolute
      // refusals. RELEASED holds and terminal requests do NOT block: their
      // employee reference is detached by SET NULL with the identity snapshot.
      const controlState = await getEmployeeDeletionControlState(
        tx,
        current.id,
        scopedOrganizationId
      );
      if (controlState.activeLegalHoldCount > 0) {
        return {
          code: "DENIED",
          stateCode: "LEGAL_HOLD",
          reason: "LEGAL_HOLD",
          message: `${DELETION_LEGAL_HOLD_MESSAGE}\n\nCannot delete employee ${current.employeeNumber}.`,
          dependencies: [],
          deletableDependencies: [],
        } as const;
      }
      if (controlState.blockingDeletionRequestCount > 0) {
        return {
          code: "DENIED",
          stateCode: "ACTIVE_DELETION_REQUEST",
          reason: "ACTIVE_DELETION_REQUEST",
          message: `${DELETION_ACTIVE_REQUEST_MESSAGE}\n\nCannot delete employee ${current.employeeNumber}.`,
          dependencies: [],
          deletableDependencies: [],
        } as const;
      }

      const dependencies = await listEmployeeDeletionDependencies(
        tx,
        current.id,
        scopedOrganizationId
      );
      // Revised deletion policy: the Super Administrator's application-level
      // eligibility no longer fails on protected records. `canPermanentlyDelete`
      // is the SAME server-side gate that admitted the request (SUPERADMIN role
      // + system-only permission, from the session's database-backed RBAC), so
      // the override is never taken from the browser.
      const decision = evaluatePermanentEmployeeDeletion({
        actorUserId: user.id,
        employeeNumber: current.employeeNumber,
        linkedUserId: current.userId,
        dependencies,
        superAdminOverride: canPermanentlyDelete,
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

      // STEP 1 — freeze the employee's identity onto every retained
      // (PROTECTED) row, filling NULL snapshots only. Runs on the same
      // transaction handle, org-scoped, BEFORE the employee row is removed:
      // the subsequent DELETE then fires the protected tables' ON DELETE
      // SET NULL foreign keys and detaches the retained rows atomically.
      // The retained plan covers attendance, leave, permission and
      // employment history only — payroll history is DELETED (STEP 2), so
      // no payroll table is snapshotted. Where migration 0022 is NOT
      // applied the snapshot columns do not exist and this statement fails,
      // rolling the whole transaction back: the feature cannot complete
      // against a pre-0022 schema.
      const snapshottedRecords = await snapshotEmployeeRetainedRecords(
        tx,
        current.id,
        scopedOrganizationId,
        { employeeNumber: current.employeeNumber, employeeName }
      );

      // STEP 1.5 — collect the stored payslip PDF keys BEFORE the payroll rows
      // are deleted: once the rows are gone the keys can no longer be read
      // from the database, and the post-commit file purge needs the exact
      // list. Org+employee scoped like every other statement of the flow, and
      // recorded on the SUCCESS audit so the purge is attributable afterwards.
      const payslipFileKeys = await collectEmployeePayslipFileKeys(
        tx,
        current.id,
        scopedOrganizationId
      );

      // STEP 2 — explicit, table-by-table removal of the DELETABLE related
      // records, immediately before the employee row so the two stay atomic.
      // No CASCADE is relied upon, and every statement is org-scoped.
      const removedSummary = await deleteEmployeeDeletableRecords(
        tx,
        current.id,
        scopedOrganizationId
      );

      // STEP 3 — scoped delete of exactly this one employee row. The
      // protected tables' SET NULL foreign keys detach their retained rows
      // inside this same statement; the DELETABLE tables keep their RESTRICT
      // backstop for racing inserts.
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
      return {
        code: "SUCCESS",
        removedSummary,
        retainedDependencies: decision.retained,
        snapshottedRecords,
        payslipFileKeys,
      } as const;
    });
  } catch (error) {
    // Any throw above rolls the transaction back — nothing was committed.
    // A concurrent hold/request that appeared after the pre-flight is stopped
    // by the database CHECK once SET NULL clears the employee reference. Map
    // that race to the same precise refusal instead of a generic failure.
    if (isCheckViolation(error)) {
      const constraint = constraintNameOf(error);
      if (constraint === "employee_legal_holds_active_requires_employee") {
        await auditPermanentEmployeeDelete({
          ...deletionContext,
          result: "DENIED",
          reason: "LEGAL_HOLD",
        });
        return toPermanentDeleteError("LEGAL_HOLD", DELETION_LEGAL_HOLD_MESSAGE);
      }
      if (
        constraint === "employee_deletion_requests_active_requires_employee"
      ) {
        await auditPermanentEmployeeDelete({
          ...deletionContext,
          result: "DENIED",
          reason: "ACTIVE_DELETION_REQUEST",
        });
        return toPermanentDeleteError(
          "ACTIVE_DELETION_REQUEST",
          DELETION_ACTIVE_REQUEST_MESSAGE
        );
      }
    }
    if (isForeignKeyViolation(error)) {
      // The database refused to complete the deletion. This is the
      // compatibility fallback for a database where migration 0022 has NOT
      // been applied: protected records are retained (never deleted), their
      // pre-0022 `RESTRICT` foreign keys reject the employee `DELETE`, and
      // the whole transaction — snapshots, deletable-record removals and
      // all — rolls back. A dependent row that appeared after the scan
      // fails through the same path. Nothing was deleted.
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
      const protectedPresent = hasProtectedEmployeeDependencies(dependencies);
      const retainedDependencies = presentEmployeeDependenciesByDisposition(
        dependencies,
        "protected"
      );
      await auditPermanentEmployeeDelete({
        ...deletionContext,
        result: "DENIED",
        reason: protectedPresent
          ? "PROTECTED_RECORDS_RETAINED"
          : "RELATED_RECORDS_EXIST",
        // What the database kept, per category — the audit must show the
        // operator exactly which retained records refused the completion.
        retainedRecords: Object.fromEntries(
          retainedDependencies.map((dependency) => [
            dependency.label,
            dependency.count,
          ])
        ),
      });
      return toPermanentDeleteError(
        protectedPresent ? "PROTECTED_RECORDS" : "DEPENDENCIES",
        protectedPresent
          ? buildPermanentDeleteRetainedCompletionMessage(
              employee.employeeNumber,
              dependencies
            )
          : buildPermanentDeleteDependencyMessage(
              employee.employeeNumber,
              dependencies
            ),
        presentEmployeeDeleteDependencies(dependencies),
        retainedDependencies
      );
    }

    console.error("[employees] permanent delete failed", error);
    await auditPermanentEmployeeDelete({
      ...deletionContext,
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
      ...deletionContext,
      result: "SUCCESS",
      deletedRelatedRecords: outcome.removedSummary,
      // What the deletion RETAINED (per category) and how many retained
      // rows had their identity frozen (per table): the audit trail must
      // describe the full transaction outcome, not just the removals.
      retainedRecords: Object.fromEntries(
        outcome.retainedDependencies.map((dependency) => [
          dependency.label,
          dependency.count,
        ])
      ),
      snapshottedRetainedRecords: outcome.snapshottedRecords,
      // The exact stored payslip PDF keys orphaned by this deletion. The
      // post-commit purge removes exactly these files, and the operator
      // sweep script re-derives its safe scope from this list.
      payslipFileKeys: outcome.payslipFileKeys,
    });

    // POST-COMMIT STEP A — remove the employee's private document folder. It
    // is an artifact outside the transaction: only touched after the commit
    // (so a rolled-back delete can never lose files) and never before it (so
    // a committed delete never leaves them orphaned). The outcome is
    // captured for the file-purge audit below instead of being swallowed.
    const documentFolderRemoval = await deleteEmployeeDocumentStorage(
      scopedOrganizationId,
      employeeId
    );

    // POST-COMMIT STEP B — purge the stored payslip PDFs orphaned by the
    // committed payroll deletion, exactly the keys collected inside the
    // transaction. Best-effort and per-key: a failure never rolls anything
    // back (the deletion is committed) and is reported on the dedicated
    // file-purge audit row below, where the operator sweep script can find
    // and retry it. Files are NOT in the database backup: a purged file is
    // unrecoverable without a separate filesystem backup.
    let payslipFilePurge: PayslipFilePurgeResult = {
      purged: [],
      missing: [],
      failed: [],
    };
    try {
      payslipFilePurge = await purgeStoredPayslipPdfs(
        outcome.payslipFileKeys
      );
    } catch (error) {
      console.error(
        "[employees] payslip file purge failed after committed deletion",
        error
      );
      payslipFilePurge = {
        purged: [],
        missing: [],
        failed: outcome.payslipFileKeys.map((storageKey) => ({
          storageKey,
          error:
            error instanceof Error ? error.message : "purge did not complete",
        })),
      };
    }

    // POST-COMMIT STEP C — dedicated, best-effort audit row for the file
    // purge (the SUCCESS row above was written inside the transaction and
    // cannot know the post-commit outcome). A failure to WRITE this audit row
    // is logged but never changes the reported result; the console error and
    // the sweep script's dry-run inventory are the remaining traces.
    await auditPermanentEmployeeDeleteFilePurge({
      ...deletionContext,
      payslipFileKeys: outcome.payslipFileKeys,
      payslipFilePurge,
      documentFolderRemoval,
    });

    revalidatePath("/employees");
    revalidatePath(`/employees/${employeeId}`);
    return {
      status: "success",
      message: "Employee permanently deleted successfully.",
      removedSummary: outcome.removedSummary,
      retainedDependencies: outcome.retainedDependencies,
    };
  }

  if (outcome.code === "DENIED") {
    await auditPermanentEmployeeDelete({
      ...deletionContext,
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
    ...deletionContext,
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

/**
 * State returned by the bulk permanent-deletion flow.
 */
export interface EmployeeBulkPermanentDeleteState {
  status: "idle" | "error" | "success";
  message?: string;
  code?:
    | "FORBIDDEN"
    | "NO_ORGANIZATION"
    | "EMPTY_SELECTION"
    | "DUPLICATE_IDS"
    | "INVALID_IDS"
    | "NOT_FOUND"
    | "CONFIRMATION_MISMATCH"
    | "ACKNOWLEDGEMENT_MISSING"
    | "LEGAL_HOLD"
    | "ACTIVE_DELETION_REQUEST"
    | "SELF_LINKED"
    | "DEPENDENCIES"
    | "FAILED";
  /** How many employees the operator selected. */
  selectedCount?: number;
  /** How many employees were permanently deleted. */
  deletedCount?: number;
  /** How many employees could not be deleted and why. */
  failedCount?: number;
  /** Employee numbers that were deleted, for the result summary. */
  deletedEmployeeNumbers?: string[];
  /** Employees that could not be deleted, with the exact reason each. */
  failedEmployees?: Array<{
    id: string;
    employeeNumber: string;
    reason: string;
  }>;
  /** Aggregate count of deletable related records removed, per category. */
  removedSummary?: Record<string, number>;
}

/** The exact confirmation phrase the operator must type for a bulk deletion. */
function bulkConfirmationPhrase(selectedCount: number): string {
  return `DELETE ${selectedCount} EMPLOYEES`;
}

function isAcknowledgedBulkPermanentDelete(formData: FormData): boolean {
  const raw = formData.get("acknowledgedBulkPermanentDelete");
  return raw === "true" || raw === "on" || raw === "1";
}

/**
 * Permanently delete several selected employee records in one controlled,
 * all-or-nothing operation.
 *
 * Reserved for the system-level SUPERADMIN (the same gate as the single
 * permanent-delete action). All authorization, organization scoping and
 * dependency policy are re-checked server-side; nothing about the caller or
 * the selection is trusted from the form.
 *
 * Guards, in order — the first failure wins and nothing is written:
 * 1. `requireUser` → 401/redirect otherwise.
 * 2. `employees.permanent_delete` AND `isSuperAdmin` from the DB-backed RBAC → 403 otherwise.
 * 3. The caller must have an organization (session org).
 * 4. Input validation: a non-empty array of valid, unique employee ids → 400 otherwise.
 * 5. Every id must resolve to an employee owned by the listing's organization
 *    (the `organizationId` form field is only a consistency assertion, never a
 *    lookup key) → 404 otherwise; cross-tenant ids are refused without leaking
 *    existence.
 * 6. The typed confirmation must equal `DELETE <count> EMPLOYEES` exactly → 400 otherwise.
 * 7. The irreversibility acknowledgement must be ticked → 400 otherwise.
 * 8. ONE transaction: lock every selected row `FOR UPDATE`, re-verify each still
 *    exists and belongs to the organization, refuse any employee with an active
 *    legal hold or a pending/approved deletion request, then snapshot retained
 *    history, remove the deletable related records table-by-table, and delete
 *    each employee row. Any throw rolls the entire batch back — no partial
 *    deletion, no employee reported as deleted whose transaction failed.
 * 9. Audit record (SUCCESS / DENIED / FAILED) with the actor, organization,
 *    selected count, employee ids/numbers, result, failed ids+reasons and a
 *    correlation id; no secrets.
 *
 * Post-commit (best-effort, never rolls the deletion back): remove each
 * deleted employee's document folder and purge the orphaned payslip PDFs.
 */
export async function bulkPermanentlyDeleteEmployeesAction(
  organizationId: string,
  _prevState: EmployeeBulkPermanentDeleteState,
  formData: FormData
): Promise<EmployeeBulkPermanentDeleteState> {
  const user = await requireUser();
  const sessionOrganizationId = user.organizationId ?? null;

  const authorization = await getUserAuthorization(user.id);
  const canPermanentlyDelete = canPermanentlyDeleteEmployees(authorization);
  const actorRole = displayRoleLabel(authorization.roleCodes);
  const correlationId = randomUUID();

  // `organizationId` is the listing's selected tenant (a consistency assertion,
  // never a lookup key): every selected id is resolved against the database and
  // must be owned by this organization. This mirrors the single-employee
  // action, which receives the organization context as an action argument
  // rather than reading it from the form body.
  if (!UUID_PATTERN.test(organizationId)) {
    return {
      status: "error",
      code: "INVALID_IDS",
      message: "The organization context is invalid.",
    };
  }

  const auditDenied = async (result: "DENIED" | "FAILED", reason: string) => {
    try {
      await writeAuditLog({
        organizationId: sessionOrganizationId,
        actorUserId: user.id,
        action: "employee.bulk_permanently_deleted",
        entityType: "employee",
        entityId: null,
        metadata: {
          operation: "EMPLOYEE_BULK_PERMANENT_DELETE",
          correlationId,
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole,
          result,
          reason,
        },
      });
    } catch (error) {
      console.error("[employees] bulk permanent delete audit failed", error);
    }
  };

  if (!canPermanentlyDelete) {
    await auditDenied("DENIED", "PERMISSION_DENIED");
    return {
      status: "error",
      code: "FORBIDDEN",
      message: EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE,
    };
  }

  if (!sessionOrganizationId) {
    await auditDenied("DENIED", "NO_ORGANIZATION");
    return {
      status: "error",
      code: "NO_ORGANIZATION",
      message: "Your account is not assigned to an organization.",
    };
  }

  const confirmation = field(formData, "confirmation");
  const acknowledged = isAcknowledgedBulkPermanentDelete(formData);

  // --- Input validation ------------------------------------------------
  let employeeIds: string[];
  try {
    const parsed = JSON.parse(field(formData, "employeeIds"));
    if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== "string")) {
      throw new Error("not an array of strings");
    }
    employeeIds = parsed;
  } catch {
    return {
      status: "error",
      code: "INVALID_IDS",
      message: "The selection is invalid. Please refresh and try again.",
    };
  }

  if (employeeIds.length === 0) {
    return {
      status: "error",
      code: "EMPTY_SELECTION",
      message: "No employees were selected.",
    };
  }

  const duplicateIds = employeeIds.filter(
    (id, index) => employeeIds.indexOf(id) !== index
  );
  if (duplicateIds.length > 0) {
    return {
      status: "error",
      code: "DUPLICATE_IDS",
      message: "The selection contains duplicate employees.",
    };
  }

  const invalidIds = employeeIds.filter((id) => !UUID_PATTERN.test(id));
  if (invalidIds.length > 0) {
    return {
      status: "error",
      code: "INVALID_IDS",
      message: "One or more selected employee ids are invalid.",
    };
  }

  const expectedConfirmation = bulkConfirmationPhrase(employeeIds.length);
  if (confirmation !== expectedConfirmation) {
    return {
      status: "error",
      code: "CONFIRMATION_MISMATCH",
      message: `Type exactly “${expectedConfirmation}” to confirm.`,
    };
  }

  if (!acknowledged) {
    return {
      status: "error",
      code: "ACKNOWLEDGEMENT_MISSING",
      message: EMPLOYEE_PERMANENT_DELETE_ACKNOWLEDGEMENT_MESSAGE,
    };
  }

  // --- Organization scope: every selected employee must belong to the
  //     listing's organization. An id from another tenant (or unknown) is
  //     treated as not found — cross-tenant existence never leaks.
  const selected = await getEmployeesByIds(employeeIds, organizationId);
  if (selected.length !== employeeIds.length) {
    await auditDenied("DENIED", "NOT_FOUND");
    return {
      status: "error",
      code: "NOT_FOUND",
      message: EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE,
    };
  }

  const scopedOrganizationId = organizationId;

  const employeeContext = {
    organizationId: scopedOrganizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole,
    employeeIds,
    employeeNumbers: selected.map((e) => e.employeeNumber),
    selectedCount: selected.length,
    correlationId,
  };

  let outcome:
    | {
        code: "SUCCESS";
        deleted: Array<{
          id: string;
          employeeNumber: string;
          removedSummary: Record<string, number>;
          payslipFileKeys: string[];
        }>;
        removedSummary: Record<string, number>;
      }
    | {
        code: "DENIED";
        failed: Array<{ id: string; employeeNumber: string; reason: string }>;
      };

  try {
    outcome = await db.transaction(async (tx) => {
      // Phase A — lock and validate every selected row before any deletion.
      const locked: Array<{
        id: string;
        employeeNumber: string;
        userId: string | null;
        firstName: string;
        lastName: string;
      }> = [];
      for (const id of employeeIds) {
        const rows = await tx
          .select({
            id: employees.id,
            employeeNumber: employees.employeeNumber,
            userId: employees.userId,
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
          .from(employees)
          .where(
            and(
              eq(employees.id, id),
              eq(employees.organizationId, scopedOrganizationId)
            )
          )
          .for("update")
          .limit(1);
        const current = rows[0];
        if (!current) {
          return {
            code: "DENIED",
            failed: [{ id, employeeNumber: "", reason: "Employee not found." }],
          };
        }
        locked.push(current);
      }

      const failed: Array<{ id: string; employeeNumber: string; reason: string }> = [];
      const toDelete: Array<{
        id: string;
        employeeNumber: string;
        employeeName: string;
        userId: string | null;
      }> = [];

      for (const current of locked) {
        const controlState = await getEmployeeDeletionControlState(
          tx,
          current.id,
          scopedOrganizationId
        );
        if (controlState.activeLegalHoldCount > 0) {
          failed.push({
            id: current.id,
            employeeNumber: current.employeeNumber,
            reason: `${DELETION_LEGAL_HOLD_MESSAGE} Cannot delete employee ${current.employeeNumber}.`,
          });
          continue;
        }
        if (controlState.blockingDeletionRequestCount > 0) {
          failed.push({
            id: current.id,
            employeeNumber: current.employeeNumber,
            reason: `${DELETION_ACTIVE_REQUEST_MESSAGE} Cannot delete employee ${current.employeeNumber}.`,
          });
          continue;
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
          superAdminOverride: true,
        });
        if (!decision.allowed) {
          failed.push({
            id: current.id,
            employeeNumber: current.employeeNumber,
            reason: decision.message,
          });
          continue;
        }

        toDelete.push({
          id: current.id,
          employeeNumber: current.employeeNumber,
          employeeName: `${current.firstName} ${current.lastName}`,
          userId: current.userId,
        });
      }

      if (failed.length > 0) {
        return { code: "DENIED", failed } as const;
      }

      // Phase B — execute every deletion inside the same transaction.
      const removedSummary: Record<string, number> = {};
      const deleted: Array<{
        id: string;
        employeeNumber: string;
        removedSummary: Record<string, number>;
        payslipFileKeys: string[];
      }> = [];

      for (const current of toDelete) {
        // Freeze the retained history's identity before the employee row is
        // detached (migration 0022). Discarded here — the single-employee
        // flow reports per-table snapshots; the bulk audit records the
        // operation-level outcome instead.
        await snapshotEmployeeRetainedRecords(
          tx,
          current.id,
          scopedOrganizationId,
          {
            employeeNumber: current.employeeNumber,
            employeeName: current.employeeName,
          }
        );

        const payslipFileKeys = await collectEmployeePayslipFileKeys(
          tx,
          current.id,
          scopedOrganizationId
        );

        const categoryRemoved = await deleteEmployeeDeletableRecords(
          tx,
          current.id,
          scopedOrganizationId
        );
        for (const [label, count] of Object.entries(categoryRemoved)) {
          removedSummary[label] = (removedSummary[label] ?? 0) + count;
        }

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
          return {
            code: "DENIED",
            failed: [{ id: current.id, employeeNumber: current.employeeNumber, reason: "Employee no longer exists." }],
          };
        }

        deleted.push({
          id: current.id,
          employeeNumber: current.employeeNumber,
          removedSummary: categoryRemoved,
          payslipFileKeys,
        });
      }

      return {
        code: "SUCCESS",
        deleted,
        removedSummary,
      } as const;
    });
  } catch (error) {
    console.error("[employees] bulk permanent delete failed", error);
    await auditDenied("FAILED", "UNEXPECTED_ERROR");
    return {
      status: "error",
      code: "FAILED",
      message: EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE,
    };
  }

  if (outcome.code === "DENIED") {
    await writeAuditLog({
      organizationId: scopedOrganizationId,
      actorUserId: user.id,
      action: "employee.bulk_permanently_deleted",
      entityType: "employee",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_BULK_PERMANENT_DELETE",
        correlationId,
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole,
        result: "DENIED",
        reason: "BULK_REFUSED",
        selectedCount: employeeContext.selectedCount,
        employeeIds: employeeContext.employeeIds,
        employeeNumbers: employeeContext.employeeNumbers,
        failedEmployees: outcome.failed.map((f) => ({
          id: f.id,
          employeeNumber: f.employeeNumber,
          reason: f.reason,
        })),
      },
    });
    return {
      status: "error",
      code: "DEPENDENCIES",
      selectedCount: employeeContext.selectedCount,
      failedCount: outcome.failed.length,
      failedEmployees: outcome.failed,
      message: outcome.failed
        .map((f) => `Cannot delete ${f.employeeNumber}: ${f.reason}`)
        .join("\n"),
    };
  }

  // SUCCESS — commit has happened inside the transaction.
  const deletedEmployeeNumbers = outcome.deleted.map((d) => d.employeeNumber);
  const allPayslipFileKeys = outcome.deleted.flatMap((d) => d.payslipFileKeys);

  try {
    await writeAuditLog({
      organizationId: scopedOrganizationId,
      actorUserId: user.id,
      action: "employee.bulk_permanently_deleted",
      entityType: "employee",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_BULK_PERMANENT_DELETE",
        correlationId,
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole,
        result: "SUCCESS",
        selectedCount: employeeContext.selectedCount,
        deletedCount: outcome.deleted.length,
        employeeIds: employeeContext.employeeIds,
        employeeNumbers: employeeContext.employeeNumbers,
        deletedEmployeeNumbers,
        deletedRelatedRecords: outcome.removedSummary,
      },
    });
  } catch (error) {
    console.error("[employees] bulk permanent delete success audit failed", error);
  }

  // POST-COMMIT: document folders + payslip PDF purge (best-effort).
  const documentRemovals = await Promise.all(
    outcome.deleted.map((d) =>
      deleteEmployeeDocumentStorage(scopedOrganizationId, d.id)
    )
  );
  let payslipFilePurge = { purged: [] as string[], missing: [] as string[], failed: [] as { storageKey: string; error: string }[] };
  try {
    payslipFilePurge = await purgeStoredPayslipPdfs(allPayslipFileKeys);
  } catch (error) {
    console.error("[employees] bulk payslip file purge failed", error);
    payslipFilePurge.failed = allPayslipFileKeys.map((storageKey) => ({
      storageKey,
      error: error instanceof Error ? error.message : "purge did not complete",
    }));
  }

  try {
    await writeAuditLog({
      organizationId: scopedOrganizationId,
      actorUserId: user.id,
      action: "employee.bulk_permanently_deleted_files",
      entityType: "employee",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_BULK_PERMANENT_DELETE_FILES",
        correlationId,
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole,
        result: "SUCCESS",
        deletedEmployeeNumbers,
        payslipFileScopeCount: allPayslipFileKeys.length,
        payslipFilesPurged: payslipFilePurge.purged.length,
        payslipFilesMissing: payslipFilePurge.missing.length,
        payslipFileFailures: payslipFilePurge.failed.length,
        documentFolderRemovals: documentRemovals.length,
      },
    });
  } catch (error) {
    console.error("[employees] bulk file-purge audit failed", error);
  }

  revalidatePath("/employees");
  return {
    status: "success",
    message: `Permanently deleted ${outcome.deleted.length} employee(s).`,
    selectedCount: employeeContext.selectedCount,
    deletedCount: outcome.deleted.length,
    deletedEmployeeNumbers,
    removedSummary: outcome.removedSummary,
  };
}

/** Read-only dependency report used to enable/disable the confirm button. */
export interface EmployeePermanentDeleteDependencyReport {
  status: "success" | "error";
  message?: string;
  /** Non-zero dependency categories, display order preserved. */
  dependencies: EmployeeDeleteDependency[];
  /**
   * Non-zero PROTECTED categories — retained (never deleted) by the
   * operation, detached with identity snapshots under migration 0022.
   */
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
  /** An active legal hold applies: absolute refusal (migration 0021). */
  legalHoldActive: boolean;
  /** Pending/approved deletion requests: the live path must not bypass them. */
  blockingDeletionRequestCount: number;
  /**
   * True when a destructive request must not proceed: the pre-flight itself
   * failed (authorization, scope, unreadable counts) OR a live control-plane
   * block exists (active hold / in-flight request). FALSE for PROTECTED
   * historical records under the detach schema (migration 0022): they are
   * retained and detached, not blockers.
   */
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
    legalHoldActive: false,
    blockingDeletionRequestCount: 0,
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
 * classifies dependents so the dialog can show the real figures — the
 * deletable categories that would be removed and the PROTECTED categories
 * that are retained. Under the approved detach schema (migration 0022) the
 * retained categories are detached with identity snapshots, so they neither
 * disable the confirm button nor block completion; `blocked` is reserved for
 * the pre-flight's own failure paths. The server-side enforcement inside
 * `permanentlyDeleteEmployeeAction` (permission, organization scope,
 * confirmation, dependency scan inside the transaction, foreign-key
 * backstop) is unchanged and remains authoritative — this report is a UX
 * affordance, never the guard.
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
    const { dependencies, directReportCount, controlState } =
      await readEmployeeDeletionDependencies(employee.id, scope.organizationId);
    const legalHoldActive = controlState.activeLegalHoldCount > 0;
    const blockingDeletionRequestCount =
      controlState.blockingDeletionRequestCount;
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
      legalHoldActive,
      blockingDeletionRequestCount,
      // Under the approved detach schema (migration 0022) PROTECTED records
      // no longer block the completion: they are retained and detached with
      // their identity snapshots. `blocked` is therefore FALSE for those, but
      // TRUE for a live control-plane block (active hold / in-flight request)
      // and for the failure paths above.
      blocked: legalHoldActive || blockingDeletionRequestCount > 0,
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
