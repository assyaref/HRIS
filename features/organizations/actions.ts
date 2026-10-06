"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireSuperAdmin } from "@/lib/auth/rbac";
import { SYSTEM_ORGANIZATION_CODE } from "@/lib/auth/roles";

import {
  evaluateOrganizationAction,
  isDuplicateOrganizationError,
  summarizeDependencies,
  type OrganizationDependencyCounts,
} from "./policy";
import {
  detectOrganizationDependencies,
  isOrganizationCodeTaken,
  isOrganizationNameTaken,
} from "./queries";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "./schemas";
import type { OrganizationStatus } from "./constants";

/**
 * Organization CRUD — server actions (R19, SUPERADMIN ONLY).
 *
 * Security rulebook (same contract as users/rbac modules):
 * 1. Re-authenticate (`requireUser`) — never trust the request body.
 * 2. Re-authorize with `requireSuperAdmin`: the system-level SUPERADMIN role
 *    is checked against PostgreSQL on EVERY call. The `organizations.*`
 *    permission codes exist for catalog/audit expressibility only — they are
 *    never sufficient on their own, so no tenant role can ever manage
 *    organizations (direct action calls included).
 * 3. The target organization is loaded from the database BY ID; the client
 *    never supplies an organization scope that is trusted.
 * 4. Pure policy (`./policy.ts`) rejects: mutations by non-superadmins,
 *    deletion/deactivation of the reserved SYSTEM tenant, and deletion while
 *    ANY dependent records exist (protected history included).
 * 5. Every mutation audits actor, target organization and outcome — never
 *    secrets.
 */

export interface OrganizationActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

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

function errorState(message: string): OrganizationActionState {
  return { status: "error", message };
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

async function audit(
  organizationId: string | null,
  actorUserId: string,
  action: Parameters<typeof writeAuditLog>[0]["action"],
  entityId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await writeAuditLog({
      organizationId,
      actorUserId,
      action,
      entityType: "organization",
      entityId,
      metadata,
    });
  } catch (auditError) {
    console.error(`[organizations] audit failed after ${action}`, auditError);
  }
}

function revalidateOrganizations(): void {
  revalidatePath("/settings/organizations");
}

async function requireSuperAdminActor(): Promise<{ userId: string }> {
  const user = await requireUser();
  await requireSuperAdmin(user.id);
  return { userId: user.id };
}

async function loadOrganization(organizationId: string) {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

/** Create a tenant organization (code normalized to uppercase, uniqueness enforced). */
export async function createOrganizationAction(
  _prevState: OrganizationActionState,
  formData: FormData
): Promise<OrganizationActionState> {
  const actor = await requireSuperAdminActor();

  const parsed = createOrganizationSchema.safeParse({
    name: field(formData, "name"),
    code: field(formData, "code"),
    status: field(formData, "status") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const { name, code, status } = parsed.data;

  if (code === SYSTEM_ORGANIZATION_CODE) {
    return {
      status: "error",
      fieldErrors: {
        code: `"${SYSTEM_ORGANIZATION_CODE}" is the reserved system organization code.`,
      },
    };
  }

  if (await isOrganizationCodeTaken(code)) {
    return {
      status: "error",
      fieldErrors: { code: `An organization with code "${code}" already exists.` },
    };
  }
  if (await isOrganizationNameTaken(name)) {
    return {
      status: "error",
      fieldErrors: { name: `An organization named "${name}" already exists.` },
    };
  }

  let organizationId: string;
  try {
    const inserted = await db
      .insert(organizations)
      .values({ name, code, status })
      .returning({ id: organizations.id });
    const row = inserted[0];
    if (!row) throw new Error("Organization insert returned no row.");
    organizationId = row.id;
  } catch (unknownError) {
    if (isDuplicateOrganizationError(unknownError)) {
      return errorState(
        "An organization with that code already exists."
      );
    }
    console.error("[organizations] create failed", unknownError);
    return errorState("The organization could not be created. Please try again.");
  }

  await audit(organizationId, actor.userId, "organization.created", organizationId, {
    name,
    code,
    status,
  });
  revalidateOrganizations();

  return {
    status: "success",
    message: `Organization "${name}" created.`,
  };
}

/** Update an organization's metadata / status. SYSTEM code+status are frozen. */
export async function updateOrganizationAction(
  organizationId: string,
  _prevState: OrganizationActionState,
  formData: FormData
): Promise<OrganizationActionState> {
  const actor = await requireSuperAdminActor();

  if (!isUuid(organizationId)) {
    return errorState("Invalid organization.");
  }

  const existing = await loadOrganization(organizationId);
  if (!existing) {
    return errorState("Organization not found.");
  }

  const parsed = updateOrganizationSchema.safeParse({
    name: formData.has("name") ? field(formData, "name") : undefined,
    code: formData.has("code") ? field(formData, "code") : undefined,
    status: formData.has("status")
      ? field(formData, "status")
      : undefined,
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const updates = parsed.data;

  const decision = evaluateOrganizationAction({
    operation: "update",
    targetCode: existing.code,
    actorIsSuperAdmin: true,
  });
  if (!decision.allowed) {
    return errorState(decision.message ?? "Operation not allowed.");
  }

  /*
   * SYSTEM reservations: the reserved code and the always-active status of
   * the system organization are immutable, even for a SUPERADMIN. A display
   * name correction is the only metadata change allowed.
   */
  if (existing.code === SYSTEM_ORGANIZATION_CODE) {
    if (updates.code && updates.code !== existing.code) {
      return {
        status: "error",
        fieldErrors: {
          code: "The reserved system organization code cannot be changed.",
        },
      };
    }
    if (updates.status && updates.status !== "active") {
      return {
        status: "error",
        fieldErrors: {
          status: "The SYSTEM organization must remain active.",
        },
      };
    }
  }

  if (updates.code && updates.code !== existing.code) {
    if (await isOrganizationCodeTaken(updates.code, organizationId)) {
      return {
        status: "error",
        fieldErrors: {
          code: `An organization with code "${updates.code}" already exists.`,
        },
      };
    }
  }
  if (updates.name && updates.name !== existing.name) {
    if (await isOrganizationNameTaken(updates.name, organizationId)) {
      return {
        status: "error",
        fieldErrors: {
          name: `An organization named "${updates.name}" already exists.`,
        },
      };
    }
  }

  const wasActive = existing.status === "active";

  try {
    await db
      .update(organizations)
      .set({
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.code !== undefined ? { code: updates.code } : {}),
        ...(updates.status !== undefined ? { status: updates.status } : {}),
      })
      .where(eq(organizations.id, organizationId));
  } catch (unknownError) {
    if (isDuplicateOrganizationError(unknownError)) {
      return errorState("An organization with that code already exists.");
    }
    console.error("[organizations] update failed", unknownError);
    return errorState("The organization could not be updated. Please try again.");
  }

  const nextStatus: OrganizationStatus | string =
    updates.status ?? existing.status;
  const changedStatus = nextStatus !== existing.status;
  if (changedStatus) {
    await audit(
      organizationId,
      actor.userId,
      nextStatus === "active"
        ? wasActive
          ? "organization.updated"
          : "organization.activated"
        : "organization.deactivated",
      organizationId,
      { code: updates.code ?? existing.code, from: existing.status, to: nextStatus }
    );
  } else {
    await audit(organizationId, actor.userId, "organization.updated", organizationId, {
      name: updates.name ?? existing.name,
      code: updates.code ?? existing.code,
    });
  }
  revalidateOrganizations();

  return { status: "success", message: "Organization updated." };
}

/** Deactivate an organization (the sanctioned alternative to deletion). */
export async function deactivateOrganizationAction(
  organizationId: string
): Promise<OrganizationActionState> {
  const actor = await requireSuperAdminActor();

  if (!isUuid(organizationId)) {
    return errorState("Invalid organization.");
  }
  const existing = await loadOrganization(organizationId);
  if (!existing) {
    return errorState("Organization not found.");
  }

  const decision = evaluateOrganizationAction({
    operation: "deactivate",
    targetCode: existing.code,
    actorIsSuperAdmin: true,
  });
  if (!decision.allowed) {
    return errorState(decision.message ?? "Operation not allowed.");
  }

  await db
    .update(organizations)
    .set({ status: "inactive" })
    .where(eq(organizations.id, organizationId));

  await audit(organizationId, actor.userId, "organization.deactivated", organizationId, {
    code: existing.code,
    name: existing.name,
  });
  revalidateOrganizations();
  return { status: "success", message: "Organization deactivated." };
}

/** Reactivate a previously deactivated organization. */
export async function activateOrganizationAction(
  organizationId: string
): Promise<OrganizationActionState> {
  const actor = await requireSuperAdminActor();

  if (!isUuid(organizationId)) {
    return errorState("Invalid organization.");
  }
  const existing = await loadOrganization(organizationId);
  if (!existing) {
    return errorState("Organization not found.");
  }

  const decision = evaluateOrganizationAction({
    operation: "activate",
    targetCode: existing.code,
    actorIsSuperAdmin: true,
  });
  if (!decision.allowed) {
    return errorState(decision.message ?? "Operation not allowed.");
  }

  await db
    .update(organizations)
    .set({ status: "active" })
    .where(eq(organizations.id, organizationId));

  await audit(organizationId, actor.userId, "organization.activated", organizationId, {
    code: existing.code,
    name: existing.name,
  });
  revalidateOrganizations();
  return { status: "success", message: "Organization activated." };
}

/**
 * Hard-delete an organization. Rejected whenever ANY dependent record exists
 * (users, employees, business data, protected history, audit trails) — and
 * structurally impossible for the reserved SYSTEM tenant. FK violations are
 * mapped to the same refusal so the DB constraint can never surface raw.
 */
export async function deleteOrganizationAction(
  organizationId: string
): Promise<OrganizationActionState> {
  const actor = await requireSuperAdminActor();

  if (!isUuid(organizationId)) {
    return errorState("Invalid organization.");
  }

  const existing = await loadOrganization(organizationId);
  if (!existing) {
    return errorState("Organization not found.");
  }

  const dependencyCounts: OrganizationDependencyCounts =
    await detectOrganizationDependencies(organizationId);

  const decision = evaluateOrganizationAction({
    operation: "delete",
    targetCode: existing.code,
    actorIsSuperAdmin: true,
    dependencyCounts,
  });
  if (!decision.allowed) {
    const summary = summarizeDependencies(dependencyCounts);
    if (decision.reason === "dependent.records" && summary.hasAny) {
      return errorState(
        `${decision.message} It still contains ${summary.total} dependent record(s) (${summary.categories
          .map(({ category, count: value }) => `${category}: ${value}`)
          .join(", ")}). Deactivate the organization instead.`
      );
    }
    return errorState(decision.message ?? "Operation not allowed.");
  }

  try {
    await db
      .delete(organizations)
      .where(eq(organizations.id, organizationId));
  } catch (unknownError) {
    // Foreign-key violation means a dependent row appeared between the scan
    // and the delete (or a table not covered by the scan references the
    // organization). Refuse with the same message; never cascade.
    if (
      typeof unknownError === "object" &&
      unknownError !== null &&
      "code" in unknownError &&
      (unknownError as { code?: unknown }).code === "23503"
    ) {
      return errorState(
        "Organization cannot be deleted because it still contains dependent records."
      );
    }
    console.error("[organizations] delete failed", unknownError);
    return errorState("The organization could not be deleted. Please try again.");
  }

  await audit(organizationId, actor.userId, "organization.deleted", organizationId, {
    code: existing.code,
    name: existing.name,
  });
  revalidateOrganizations();
  return { status: "success", message: "Organization deleted." };
}
