"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import type { z } from "zod";

import { db } from "@/db";
import { employeeCustomFieldDefinitions } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";
import { BUILTIN_FIELD_SECTIONS } from "./validation";

import {
  CUSTOM_FIELD_STATUSES,
  CUSTOM_FIELD_TYPES,
  validateCustomFieldDefinition,
} from "./validation";
import { getFieldDefinition } from "./queries";
import { listRolesByOrganization } from "@/features/rbac/queries";

/**
 * Employee custom field definition server actions (Employee Master Data 2.0).
 *
 * Fields are organization-scoped: the organization always comes from the
 * authenticated session (never the form body), and a field id that belongs to
 * another organization is treated as forbidden. Element checks follow the
 * seed matrix: ADMIN/HR hold `employee_fields.*`; everyone else cannot touch
 * definitions. Archived/soft-deleted fields keep their historical values
 * (`employee_custom_field_values.field_definition_id` is RESTRICT).
 */

export interface EmployeeFieldActionState {
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
): EmployeeFieldActionState {
  return { status: "error", message, fieldErrors };
}

function value(formData: FormData, name: string): string {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry.trim() : "";
}

function optionalValue(formData: FormData, name: string): string | null {
  const entry = value(formData, name);
  return entry === "" ? null : entry;
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function parseIntValue(formData: FormData, name: string): number {
  const parsed = Number.parseInt(value(formData, name), 10);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

function parseOptions(formData: FormData): string[] {
  const raw = value(formData, "options");
  if (!raw) return [];
  return raw
    .split("\n")
    .map((option) => option.trim())
    .filter((option) => option.length > 0)
    .slice(0, 100);
}

function statusFromField(
  formData: FormData,
  fallback: string
): "active" | "inactive" | "archived" {
  const raw = value(formData, "status");
  if ((CUSTOM_FIELD_STATUSES as readonly string[]).includes(raw)) {
    return raw as "active" | "inactive" | "archived";
  }
  return fallback as "active" | "inactive" | "archived";
}

/**
 * Read a role-code list from the form. Accepts either repeated entries with
 * the same name (checkboxes) or a single comma/newline-separated field, and
 * keeps only codes present in the role catalog.
 */
function roleCodesFromField(
  formData: FormData,
  name: string,
  allowedCodes: readonly string[]
): { codes: string[]; invalid: string[] } {
  const allowed = new Set(allowedCodes);
  const raw: string[] = [];
  for (const entry of formData.getAll(name)) {
    if (typeof entry === "string") raw.push(entry);
  }
  const result = new Set<string>();
  const invalid = new Set<string>();
  for (const token of raw) {
    for (const piece of token.split(/[\n,]/)) {
      const code = piece.trim().toUpperCase();
      if (!code) continue;
      if (allowed.has(code)) result.add(code);
      else invalid.add(code);
    }
  }
  return { codes: [...result].slice(0, 10), invalid: [...invalid] };
}

function sectionFromField(formData: FormData): string {
  const section = optionalValue(formData, "section") ?? "Other";
  const trimmed = section.trim();
  if (!trimmed) return "Other";
  // Free-form sections are allowed but capped; built-ins are used as-is.
  return trimmed.slice(0, 40);
}

type DefinitionInput =
  | { error: string[] }
  | {
      data: {
        fieldKey: string;
        label: string;
        description: string | null;
        fieldType: string;
        section: string;
        isRequired: boolean;
        displayOrder: number;
        options: string[];
      };
    };

function loadDefinitionInput(formData: FormData): DefinitionInput {
  const fieldKey = value(formData, "fieldKey").toLowerCase();
  const fieldType = value(formData, "fieldType");
  const isRequired = checked(formData, "isRequired");
  const displayOrder = parseIntValue(formData, "displayOrder");

  const definition = validateCustomFieldDefinition({
    fieldKey,
    label: value(formData, "label"),
    description: optionalValue(formData, "description"),
    fieldType: fieldType as (typeof CUSTOM_FIELD_TYPES)[number],
    section: sectionFromField(formData),
    isRequired,
    displayOrder,
    options: parseOptions(formData),
  });

  if (!definition.ok) {
    return { error: definition.errors as string[] };
  }

  return {
    data: {
      fieldKey,
      label: value(formData, "label"),
      description: optionalValue(formData, "description"),
      fieldType,
      section: sectionFromField(formData),
      isRequired,
      displayOrder,
      options: parseOptions(formData),
    },
  };
}

/** Create a new employee custom field definition. */
export async function createEmployeeFieldAction(
  _prevState: EmployeeFieldActionState,
  formData: FormData
): Promise<EmployeeFieldActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_CREATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;
  const allowedRoleCodes = (await listRolesByOrganization(organizationId)).map(
    (role) => role.code
  );

  const input = loadDefinitionInput(formData);
  if ("error" in input) {
    return { status: "error", fieldErrors: { form: input.error.join(" ") } };
  }
  const visibilityRoles = roleCodesFromField(
    formData,
    "visibilityRoles",
    allowedRoleCodes
  );
  const editableRoles = roleCodesFromField(
    formData,
    "editableRoles",
    allowedRoleCodes
  );
  if (visibilityRoles.invalid.length > 0 || editableRoles.invalid.length > 0) {
    return toStateError(undefined, {
      form: "One or more selected roles do not exist in this organization.",
    });
  }

  let fieldId: string;
  try {
    const inserted = await db
      .insert(employeeCustomFieldDefinitions)
      .values({
        organizationId,
        fieldKey: input.data.fieldKey,
        label: input.data.label,
        description: input.data.description,
        fieldType: input.data.fieldType,
        section: input.data.section,
        isRequired: input.data.isRequired,
        displayOrder: input.data.displayOrder,
        options: input.data.options,
        visibilityConfig: visibilityRoles.codes,
        editableByConfig: editableRoles.codes,
        status: "active",
        createdBy: user.id,
      })
      .returning({ id: employeeCustomFieldDefinitions.id });
    const row = inserted[0];
    if (!row) throw new Error("Field insert returned no row.");
    fieldId = row.id;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === DB_UNIQUE_VIOLATION
    ) {
      return toStateError(undefined, {
        fieldKey: `Field key "${input.data.fieldKey}" already exists.`,
      });
    }
    console.error("[employee-fields] create failed", error);
    return toStateError("Could not create the field. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee_field.created",
      entityType: "employee_field",
      entityId: fieldId,
      metadata: {
        fieldKey: input.data.fieldKey,
        label: input.data.label,
        fieldType: input.data.fieldType,
        section: input.data.section,
      },
    });
  } catch (error) {
    console.error("[employee-fields] audit failed after create", error);
  }

  revalidatePath("/settings/employee-fields");
  revalidatePath("/employees");
  return { status: "success", message: "Field created." };
}

/** Update a definition (key stays immutable once created). */
export async function updateEmployeeFieldAction(
  fieldId: string,
  _prevState: EmployeeFieldActionState,
  formData: FormData
): Promise<EmployeeFieldActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_UPDATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;
  const organizationRoleCodes = (
    await listRolesByOrganization(organizationId)
  ).map((role) => role.code);

  const existing = await getFieldDefinition(fieldId, organizationId);
  if (!existing) forbidden();
  const allowedRoleCodes = [
    ...new Set([
      ...organizationRoleCodes,
      ...existing.visibilityConfig,
      ...existing.editableByConfig,
    ]),
  ];

  const input = loadDefinitionInput(formData);
  if ("error" in input) {
    return { status: "error", fieldErrors: { form: input.error.join(" ") } };
  }
  const visibilityRoles = roleCodesFromField(
    formData,
    "visibilityRoles",
    allowedRoleCodes
  );
  const editableRoles = roleCodesFromField(
    formData,
    "editableRoles",
    allowedRoleCodes
  );
  if (visibilityRoles.invalid.length > 0 || editableRoles.invalid.length > 0) {
    return toStateError(undefined, {
      form: "One or more selected roles do not exist in this organization.",
    });
  }

  const status = statusFromField(formData, existing.status);

  try {
    await db
      .update(employeeCustomFieldDefinitions)
      .set({
        label: input.data.label,
        description: input.data.description,
        fieldType: input.data.fieldType,
        section: input.data.section,
        isRequired: input.data.isRequired,
        displayOrder: input.data.displayOrder,
        options: input.data.options,
        visibilityConfig: visibilityRoles.codes,
        editableByConfig: editableRoles.codes,
        status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(employeeCustomFieldDefinitions.id, fieldId),
          eq(employeeCustomFieldDefinitions.organizationId, organizationId)
        )
      );
  } catch (error) {
    console.error("[employee-fields] update failed", error);
    return toStateError("Could not update the field. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee_field.updated",
      entityType: "employee_field",
      entityId: fieldId,
      metadata: {
        fieldKey: existing.fieldKey,
        status,
      },
    });
  } catch (error) {
    console.error("[employee-fields] audit failed after update", error);
  }

  revalidatePath("/settings/employee-fields");
  revalidatePath("/employees");
  return { status: "success", message: "Field updated." };
}

/** Toggle a definition between active/inactive/archived. */
export async function setEmployeeFieldStatusAction(
  fieldId: string,
  status: "active" | "inactive" | "archived"
): Promise<EmployeeFieldActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_UPDATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;

  const existing = await getFieldDefinition(fieldId, organizationId);
  if (!existing) forbidden();

  try {
    await db
      .update(employeeCustomFieldDefinitions)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(employeeCustomFieldDefinitions.id, fieldId),
          eq(employeeCustomFieldDefinitions.organizationId, organizationId)
        )
      );
  } catch (error) {
    console.error("[employee-fields] status change failed", error);
    return toStateError("Could not update the field status. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee_field.status_changed",
      entityType: "employee_field",
      entityId: fieldId,
      metadata: {
        fieldKey: existing.fieldKey,
        from: existing.status,
        to: status,
      },
    });
  } catch (error) {
    console.error("[employee-fields] audit failed after status change", error);
  }

  revalidatePath("/settings/employee-fields");
  revalidatePath("/employees");
  return {
    status: "success",
    message: `Field ${status === "archived" ? "archived" : status === "inactive" ? "deactivated" : "activated"}.`,
  };
}

/**
 * Archive (soft-delete) a definition. Historical values stay readable because
 * `employee_custom_field_values.field_definition_id` is RESTRICT — the row is
 * never physically removed.
 */
export async function deleteEmployeeFieldAction(
  fieldId: string
): Promise<EmployeeFieldActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_DELETE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;

  const existing = await getFieldDefinition(fieldId, organizationId);
  if (!existing) forbidden();

  try {
    await db
      .update(employeeCustomFieldDefinitions)
      .set({
        status: "archived",
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(employeeCustomFieldDefinitions.id, fieldId),
          eq(employeeCustomFieldDefinitions.organizationId, organizationId)
        )
      );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === DB_FOREIGN_KEY_VIOLATION
    ) {
      return toStateError(
        "This field cannot be archived because it is still referenced."
      );
    }
    console.error("[employee-fields] delete failed", error);
    return toStateError("Could not archive the field. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee_field.deleted",
      entityType: "employee_field",
      entityId: fieldId,
      metadata: {
        fieldKey: existing.fieldKey,
        label: existing.label,
      },
    });
  } catch (error) {
    console.error("[employee-fields] audit failed after delete", error);
  }

  revalidatePath("/settings/employee-fields");
  revalidatePath("/employees");
  return { status: "success", message: "Field archived." };
}

/**
 * Duplicate a field definition under a fresh, unique field key. The copy
 * inherits type/section/options/required/display settings and starts ACTIVE;
 * values are never copied.
 */
export async function duplicateEmployeeFieldAction(
  fieldId: string
): Promise<EmployeeFieldActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_CREATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;

  const existing = await getFieldDefinition(fieldId, organizationId);
  if (!existing) forbidden();

  // Derive a unique key: <base>_copy, <base>_copy_2, ... (32-char cap).
  const base = `${existing.fieldKey}_copy`.slice(0, 30);
  const siblings = await db
    .select({ fieldKey: employeeCustomFieldDefinitions.fieldKey })
    .from(employeeCustomFieldDefinitions)
    .where(eq(employeeCustomFieldDefinitions.organizationId, organizationId));
  const taken = new Set(siblings.map((row) => row.fieldKey));
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(candidate)) {
    return toStateError("The duplicated field key would be invalid.");
  }

  let newId: string;
  try {
    const inserted = await db
      .insert(employeeCustomFieldDefinitions)
      .values({
        organizationId,
        fieldKey: candidate,
        label: `${existing.label} (copy)`.slice(0, 80),
        description: existing.description,
        fieldType: existing.fieldType,
        section: existing.section,
        isRequired: existing.isRequired,
        displayOrder: existing.displayOrder,
        options: existing.options,
        visibilityConfig: existing.visibilityConfig,
        editableByConfig: existing.editableByConfig,
        status: "active",
        createdBy: user.id,
      })
      .returning({ id: employeeCustomFieldDefinitions.id });
    const row = inserted[0];
    if (!row) throw new Error("Field insert returned no row.");
    newId = row.id;
  } catch (error) {
    console.error("[employee-fields] duplicate failed", error);
    return toStateError("Could not duplicate the field. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee_field.created",
      entityType: "employee_field",
      entityId: newId,
      metadata: { fieldKey: candidate, duplicatedFrom: existing.fieldKey },
    });
  } catch (error) {
    console.error("[employee-fields] audit failed after duplicate", error);
  }

  revalidatePath("/settings/employee-fields");
  revalidatePath("/employees");
  return { status: "success", message: "Field duplicated." };
}

/**
 * Reorder fields by assigning displayOrder from the supplied key order.
 * Only definitions in the caller's organization are touched.
 */
export async function reorderEmployeeFieldsAction(
  _prevState: EmployeeFieldActionState,
  formData: FormData
): Promise<EmployeeFieldActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_UPDATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;

  const raw = formData.get("order");
  if (typeof raw !== "string" || raw.trim() === "") {
    return toStateError("Missing reorder payload.");
  }
  let ids: unknown;
  try {
    ids = JSON.parse(raw);
  } catch {
    return toStateError("Invalid reorder payload.");
  }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
    return toStateError("Invalid reorder payload.");
  }
  const fieldIds = ids.filter(
    (value): value is string =>
      typeof value === "string" && value.length > 0 && value.length <= 64
  );
  if (fieldIds.length !== ids.length) {
    return toStateError("Invalid reorder payload.");
  }

  const owned = await db
    .select({ id: employeeCustomFieldDefinitions.id })
    .from(employeeCustomFieldDefinitions)
    .where(
      and(
        eq(employeeCustomFieldDefinitions.organizationId, organizationId),
        inArray(employeeCustomFieldDefinitions.id, fieldIds)
      )
    );
  const ownedIds = new Set(owned.map((row) => row.id));
  if (ownedIds.size !== fieldIds.length) {
    forbidden();
  }

  try {
    await db.transaction(async (tx) => {
      for (let index = 0; index < fieldIds.length; index += 1) {
        await tx
          .update(employeeCustomFieldDefinitions)
          .set({ displayOrder: index, updatedAt: new Date() })
          .where(
            and(
              eq(employeeCustomFieldDefinitions.id, fieldIds[index]),
              eq(
                employeeCustomFieldDefinitions.organizationId,
                organizationId
              )
            )
          );
      }
    });
  } catch (error) {
    console.error("[employee-fields] reorder failed", error);
    return toStateError("Could not reorder the fields. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee_field.updated",
      entityType: "employee_field",
      entityId: "reorder",
      metadata: { count: fieldIds.length, operation: "reorder" },
    });
  } catch (error) {
    console.error("[employee-fields] audit failed after reorder", error);
  }

  revalidatePath("/settings/employee-fields");
  return { status: "success", message: "Field order saved." };
}
