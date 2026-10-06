"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";

import { db } from "@/db";
import { employeeCustomTabs } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import { getCustomTab } from "./queries";
import {
  CUSTOM_TAB_STATUSES,
  normalizeTabKey,
  RESERVED_TAB_KEYS,
  TAB_KEY_PATTERN,
  TAB_LIMITS,
  validateCustomTabDefinition,
} from "./validation";
import { listRolesByOrganization } from "@/features/rbac/queries";

/**
 * Employee custom tab server actions (Employee Custom Tabs 2.0).
 *
 * Tabs reuse the existing `employee_fields.*` permission family — a role
 * that may manage custom field definitions may also manage the tabs that
 * group them (HR/Superadmin policy; no new RBAC model is introduced).
 *
 * Security rules (identical to features/employee-fields/actions.ts):
 *  - Every action re-authenticates and re-authorizes server-side.
 *  - The organization ALWAYS comes from the authenticated session, never
 *    from the form body; a tab id from another organization is forbidden.
 *  - Tab keys are unique per organization and reserved keys are rejected.
 *  - There is no tab deletion: deactivation retires a tab while every field
 *    definition and stored value stays untouched (fields fall back to the
 *    built-in Custom Fields tab).
 */

export interface EmployeeTabActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

const DB_UNIQUE_VIOLATION = "23505";

function toStateError(
  message: string | undefined,
  fieldErrors?: Record<string, string>
): EmployeeTabActionState {
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

function parseIntValue(formData: FormData, name: string): number {
  const parsed = Number.parseInt(value(formData, name), 10);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

/** Read role codes from the form (repeated entries or separated strings). */
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

interface TabInput {
  tabKey: string;
  name: string;
  description: string | null;
  icon: string | null;
  displayOrder: number;
}

function loadTabInput(formData: FormData): TabInput | { errors: string[] } {
  const rawKey = value(formData, "tabKey");
  const tabKey = rawKey ? normalizeTabKey(rawKey) : rawKey.toLowerCase();
  const name = value(formData, "name").slice(0, TAB_LIMITS.name + 1);
  const description = optionalValue(formData, "description");
  const icon = optionalValue(formData, "icon");
  const displayOrder = parseIntValue(formData, "displayOrder");

  const validation = validateCustomTabDefinition({
    tabKey,
    name,
    description,
    icon,
    displayOrder,
  });
  if (!validation.ok) return { errors: validation.errors };
  return { tabKey, name, description, icon, displayOrder };
}

/** Create a custom tab for the caller's organization. */
export async function createCustomTabAction(
  _prevState: EmployeeTabActionState,
  formData: FormData
): Promise<EmployeeTabActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_CREATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;
  const allowedRoleCodes = (await listRolesByOrganization(organizationId)).map(
    (role) => role.code
  );

  const input = loadTabInput(formData);
  if ("errors" in input) {
    return { status: "error", fieldErrors: { form: input.errors.join(" ") } };
  }
  const visibilityRoles = roleCodesFromField(
    formData,
    "visibilityRoles",
    allowedRoleCodes
  );
  if (visibilityRoles.invalid.length > 0) {
    return toStateError(undefined, {
      form: "One or more selected roles do not exist in this organization.",
    });
  }
  const status = value(formData, "status");
  const active =
    status === "" || (CUSTOM_TAB_STATUSES as readonly string[]).includes(status)
      ? (status === "" ? "active" : status)
      : "active";

  // Organization-scoped key uniqueness (pre-check; the DB unique index is
  // the final authority and also covers concurrent creates).
  const existingByKey = await db
    .select({ id: employeeCustomTabs.id })
    .from(employeeCustomTabs)
    .where(
      and(
        eq(employeeCustomTabs.organizationId, organizationId),
        eq(employeeCustomTabs.tabKey, input.tabKey)
      )
    )
    .limit(1);
  if (existingByKey.length > 0) {
    return toStateError(undefined, {
      tabKey: `Tab key "${input.tabKey}" already exists.`,
    });
  }

  let tabId: string;
  try {
    const inserted = await db
      .insert(employeeCustomTabs)
      .values({
        organizationId,
        tabKey: input.tabKey,
        name: input.name,
        description: input.description,
        icon: input.icon,
        displayOrder: input.displayOrder,
        status: active,
        visibilityConfig: visibilityRoles.codes,
        createdBy: user.id,
      })
      .returning({ id: employeeCustomTabs.id });
    const row = inserted[0];
    if (!row) throw new Error("Tab insert returned no row.");
    tabId = row.id;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === DB_UNIQUE_VIOLATION
    ) {
      return toStateError(undefined, {
        tabKey: `Tab key "${input.tabKey}" already exists.`,
      });
    }
    console.error("[employee-tabs] create failed", error);
    return toStateError("Could not create the tab. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee_tab.created",
      entityType: "employee_tab",
      entityId: tabId,
      metadata: {
        tabKey: input.tabKey,
        name: input.name,
        displayOrder: input.displayOrder,
        status: active,
      },
    });
  } catch (error) {
    console.error("[employee-tabs] audit failed after create", error);
  }

  revalidatePath("/settings/employee-fields");
  revalidatePath("/employees");
  return { status: "success", message: "Tab created." };
}

/** Update a tab (key stays immutable once created, mirroring field keys). */
export async function updateCustomTabAction(
  tabId: string,
  _prevState: EmployeeTabActionState,
  formData: FormData
): Promise<EmployeeTabActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_UPDATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;

  const existing = await getCustomTab(tabId, organizationId);
  if (!existing) forbidden();
  const allowedRoleCodes = [
    ...new Set([
      ...(await listRolesByOrganization(organizationId)).map((role) => role.code),
      ...existing.visibilityConfig,
    ]),
  ];

  const input = loadTabInput(formData);
  if ("errors" in input) {
    return { status: "error", fieldErrors: { form: input.errors.join(" ") } };
  }
  if (input.tabKey !== existing.tabKey) {
    return toStateError(undefined, {
      tabKey: "The tab key is immutable so assigned fields stay linked.",
    });
  }
  const visibilityRoles = roleCodesFromField(
    formData,
    "visibilityRoles",
    allowedRoleCodes
  );
  if (visibilityRoles.invalid.length > 0) {
    return toStateError(undefined, {
      form: "One or more selected roles do not exist in this organization.",
    });
  }
  const rawStatus = value(formData, "status");
  const status = (CUSTOM_TAB_STATUSES as readonly string[]).includes(rawStatus)
    ? rawStatus
    : existing.status;

  try {
    await db
      .update(employeeCustomTabs)
      .set({
        name: input.name,
        description: input.description,
        icon: input.icon,
        displayOrder: input.displayOrder,
        status,
        visibilityConfig: visibilityRoles.codes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(employeeCustomTabs.id, tabId),
          eq(employeeCustomTabs.organizationId, organizationId)
        )
      );
  } catch (error) {
    console.error("[employee-tabs] update failed", error);
    return toStateError("Could not update the tab. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee_tab.updated",
      entityType: "employee_tab",
      entityId: tabId,
      metadata: {
        tabKey: existing.tabKey,
        name: input.name,
        status,
        displayOrder: input.displayOrder,
      },
    });
  } catch (error) {
    console.error("[employee-tabs] audit failed after update", error);
  }

  revalidatePath("/settings/employee-fields");
  revalidatePath("/employees");
  return { status: "success", message: "Tab updated." };
}

/** Activate / deactivate a tab (no deletion path exists by design). */
export async function setCustomTabStatusAction(
  tabId: string,
  status: "active" | "inactive"
): Promise<EmployeeTabActionState> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_UPDATE);

  if (!user.organizationId) {
    return toStateError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;

  const existing = await getCustomTab(tabId, organizationId);
  if (!existing) forbidden();
  if (existing.status === status) {
    return { status: "success", message: `Tab is already ${status}.` };
  }

  try {
    await db
      .update(employeeCustomTabs)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(employeeCustomTabs.id, tabId),
          eq(employeeCustomTabs.organizationId, organizationId)
        )
      );
  } catch (error) {
    console.error("[employee-tabs] status change failed", error);
    return toStateError("Could not update the tab status. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee_tab.status_changed",
      entityType: "employee_tab",
      entityId: tabId,
      metadata: {
        tabKey: existing.tabKey,
        name: existing.name,
        from: existing.status,
        to: status,
      },
    });
  } catch (error) {
    console.error("[employee-tabs] audit failed after status change", error);
  }

  revalidatePath("/settings/employee-fields");
  revalidatePath("/employees");
  return {
    status: "success",
    message: `Tab ${status === "active" ? "activated" : "deactivated"}.`,
  };
}

/**
 * Reorder tabs by assigning displayOrder from the supplied id order. Only
 * tabs in the caller's organization are touched; unknown ids are forbidden.
 */
export async function reorderCustomTabsAction(
  _prevState: EmployeeTabActionState,
  formData: FormData
): Promise<EmployeeTabActionState> {
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
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
    return toStateError("Invalid reorder payload.");
  }
  const tabIds = ids.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.length > 0 && entry.length <= 64
  );
  if (tabIds.length !== ids.length) {
    return toStateError("Invalid reorder payload.");
  }

  const owned = await db
    .select({ id: employeeCustomTabs.id })
    .from(employeeCustomTabs)
    .where(
      and(
        eq(employeeCustomTabs.organizationId, organizationId),
        inArray(employeeCustomTabs.id, tabIds)
      )
    );
  if (owned.length !== tabIds.length) {
    forbidden();
  }

  try {
    await db.transaction(async (tx) => {
      for (let index = 0; index < tabIds.length; index += 1) {
        await tx
          .update(employeeCustomTabs)
          .set({ displayOrder: 70 + index * 10, updatedAt: new Date() })
          .where(
            and(
              eq(employeeCustomTabs.id, tabIds[index]),
              eq(employeeCustomTabs.organizationId, organizationId)
            )
          );
      }
    });
  } catch (error) {
    console.error("[employee-tabs] reorder failed", error);
    return toStateError("Could not reorder the tabs. Please try again.");
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "employee_tab.reordered",
      entityType: "employee_tab",
      entityId: "reorder",
      metadata: { count: tabIds.length, operation: "reorder" },
    });
  } catch (error) {
    console.error("[employee-tabs] audit failed after reorder", error);
  }

  revalidatePath("/settings/employee-fields");
  revalidatePath("/employees");
  return { status: "success", message: "Tab order saved." };
}
