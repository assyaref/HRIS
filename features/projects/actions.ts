"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireSuperAdmin } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  createProjectSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
} from "./schemas";
import {
  isDuplicateProjectError,
  isForeignKeyViolation,
  isUuid,
  evaluateProjectDelete,
  evaluateProjectOrganizationChange,
  summarizeProjectDependencies,
  PROJECT_DEPENDENCY_CATEGORY_LABELS,
} from "./policy";
import {
  detectProjectDependencies,
  getActiveOrganization,
  getProjectWithOrganization,
  isProjectCodeTaken,
} from "./queries";

export type ActionResult = {
  success: boolean;
  message: string;
  projectId?: string;
};

/**
 * Projects CRUD — server actions (Super Administrator only).
 *
 * Security rulebook (same contract as features/organizations/actions.ts):
 * 1. Re-authenticate (`requireUser`) — never trust the request body.
 * 2. Re-authorize with `requireSuperAdmin`: the system-level SUPERADMIN role
 *    is resolved from PostgreSQL on EVERY call. The `projects.*` permission
 *    codes are catalog expressibility only — they are never sufficient, so
 *    no tenant role can manage projects even by direct action invocation.
 * 3. The target project and organization are loaded from the database BY ID;
 *    ids and organization scopes sent by the client are never trusted.
 * 4. Pure policy (`./policy.ts`) rejects: deletion while ANY dependent record
 *    exists (assignments, attendance, work locations — history protected),
 *    and organization moves that would break the same-organization invariant
 *    of employee↔project assignments.
 * 5. Every mutation audits actor, target and outcome — never secrets.
 */

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function normalizeName(name: string) {
  return name.trim();
}

async function requireSuperAdminActor() {
  const user = await requireUser();
  await requireSuperAdmin(user.id);
  return user;
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
      entityType: "project",
      entityId,
      metadata,
    });
  } catch (auditError) {
    // The mutation already committed; never fail the UX for a lost audit row.
    console.error(`[projects] audit failed after ${action}`, auditError);
  }
}

function revalidateProjects(projectId?: string) {
  revalidatePath("/projects");
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Create a project inside the Super Administrator's chosen organization. */
export async function createProjectAction(
  _previousState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSuperAdminActor();

  const parsed = createProjectSchema.safeParse({
    organizationId: field(formData, "organizationId"),
    code: field(formData, "code"),
    name: field(formData, "name"),
    status: field(formData, "status") || "active",
    startDate: field(formData, "startDate") || undefined,
    endDate: field(formData, "endDate") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid project data.",
    };
  }

  const { organizationId } = parsed.data;
  const code = normalizeCode(parsed.data.code);
  const name = normalizeName(parsed.data.name);

  // Never trust the client's organization id: it must be a real, ACTIVE
  // tenant organization.
  const organization = await getActiveOrganization(organizationId);
  if (!organization) {
    return {
      success: false,
      message:
        "Organization not found or inactive. Select an active organization.",
    };
  }

  if (await isProjectCodeTaken(organizationId, code)) {
    return {
      success: false,
      message: `Project code "${code}" already exists in organization "${organization.name}".`,
    };
  }

  let projectId: string;

  try {
    const [project] = await db
      .insert(projects)
      .values({
        organizationId,
        code,
        name,
        status: parsed.data.status,
        startDate: parsed.data.startDate
          ? new Date(`${parsed.data.startDate}T00:00:00.000Z`)
          : null,
        endDate: parsed.data.endDate
          ? new Date(`${parsed.data.endDate}T00:00:00.000Z`)
          : null,
      })
      .returning({
        id: projects.id,
      });

    if (!project) {
      return {
        success: false,
        message: "Failed to create project.",
      };
    }

    projectId = project.id;
  } catch (unknownError) {
    if (isDuplicateProjectError(unknownError)) {
      return {
        success: false,
        message: `Project code "${code}" already exists in organization "${organization.name}".`,
      };
    }
    console.error("[projects] create failed", unknownError);
    return {
      success: false,
      message: "The project could not be created. Please try again.",
    };
  }

  await audit(organizationId, user.id, "project.created", projectId, {
    code,
    name,
    status: parsed.data.status,
    organizationCode: organization.code,
    organizationName: organization.name,
  });
  revalidateProjects(projectId);

  return {
    success: true,
    message: `Project "${name}" created in organization "${organization.name}".`,
    projectId,
  };
}

/**
 * Update a project's profile/lifecycle, including its organization.
 *
 * An organization move is only accepted while the project holds no dependent
 * rows (assignments, attendance records, work locations): the invariant
 * "employee and project belong to the same organization" would otherwise
 * break silently for Employee/Attendance/Work Location data.
 */
export async function updateProjectAction(
  projectId: string,
  input: unknown
): Promise<ActionResult> {
  const user = await requireSuperAdminActor();

  if (!isUuid(projectId)) {
    return {
      success: false,
      message: "Invalid project.",
    };
  }

  const parsed = updateProjectSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid project data.",
    };
  }

  const existing = await getProjectWithOrganization(projectId);

  if (!existing) {
    return {
      success: false,
      message: "Project not found.",
    };
  }

  const values: Partial<typeof projects.$inferInsert> = {
    updatedAt: new Date(),
  };

  const organizationChange =
    parsed.data.organizationId !== undefined &&
    parsed.data.organizationId !== existing.organizationId;

  let targetOrganization: { id: string; name: string; code: string } | null =
    null;

  if (organizationChange) {
    const dependencyCounts = await detectProjectDependencies(projectId);
    const decision = evaluateProjectOrganizationChange({
      actorIsSuperAdmin: true,
      dependencyCounts,
    });

    if (!decision.allowed) {
      const summary = summarizeProjectDependencies(dependencyCounts);
      const details = summary.categories
        .map(
          ({ category, count }) =>
            `${PROJECT_DEPENDENCY_CATEGORY_LABELS[category]}: ${count}`
        )
        .join(", ");
      return {
        success: false,
        message: `${decision.message} Dependent records: ${details}. Remove those references first, or keep the project in its current organization.`,
      };
    }

    targetOrganization = await getActiveOrganization(
      parsed.data.organizationId!
    );

    if (!targetOrganization) {
      return {
        success: false,
        message:
          "Target organization not found or inactive. Select an active organization.",
      };
    }

    values.organizationId = parsed.data.organizationId;
  }

  // Code uniqueness is evaluated within the organization the project will
  // belong to after this update.
  const effectiveOrganizationId =
    values.organizationId ?? existing.organizationId;

  if (parsed.data.code !== undefined) {
    const code = normalizeCode(parsed.data.code);

    if (
      await isProjectCodeTaken(effectiveOrganizationId, code, projectId)
    ) {
      return {
        success: false,
        message: `Project code "${code}" already exists in this organization.`,
      };
    }

    values.code = code;
  }

  if (parsed.data.name !== undefined) {
    values.name = normalizeName(parsed.data.name);
  }

  if (parsed.data.status !== undefined) {
    values.status = parsed.data.status;
  }

  if (parsed.data.startDate !== undefined) {
    values.startDate = new Date(
      `${parsed.data.startDate}T00:00:00.000Z`
    );
  }

  if (parsed.data.endDate !== undefined) {
    values.endDate = new Date(
      `${parsed.data.endDate}T00:00:00.000Z`
    );
  }

  try {
    const [updated] = await db
      .update(projects)
      .set(values)
      .where(eq(projects.id, projectId))
      .returning({
        id: projects.id,
      });

    if (!updated) {
      return {
        success: false,
        message: "Project not found.",
      };
    }
  } catch (unknownError) {
    if (isDuplicateProjectError(unknownError)) {
      return {
        success: false,
        message: "Project code already exists in this organization.",
      };
    }
    console.error("[projects] update failed", unknownError);
    return {
      success: false,
      message: "The project could not be updated. Please try again.",
    };
  }

  await audit(existing.organizationId, user.id, "project.updated", projectId, {
    code: values.code ?? existing.code,
    name: values.name ?? existing.name,
    status: values.status ?? existing.status,
    ...(organizationChange && targetOrganization
      ? {
          organizationChanged: true,
          fromOrganization: existing.organizationName,
          toOrganization: targetOrganization.name,
        }
      : {}),
  });
  revalidateProjects(projectId);

  return {
    success: true,
    message: organizationChange
      ? `Project moved to organization "${targetOrganization?.name}".`
      : "Project updated successfully.",
    projectId,
  };
}

/** Explicit lifecycle transition. */
export async function updateProjectStatusAction(
  projectId: string,
  input: unknown
): Promise<ActionResult> {
  const user = await requireSuperAdminActor();

  if (!isUuid(projectId)) {
    return {
      success: false,
      message: "Invalid project.",
    };
  }

  const parsed = updateProjectStatusSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid project status.",
    };
  }

  const existing = await getProjectWithOrganization(projectId);

  if (!existing) {
    return {
      success: false,
      message: "Project not found.",
    };
  }

  if (existing.status === parsed.data.status) {
    return {
      success: true,
      message: "Project status is already set to the requested value.",
      projectId,
    };
  }

  const [updated] = await db
    .update(projects)
    .set({
      status: parsed.data.status,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning({
      id: projects.id,
    });

  if (!updated) {
    return {
      success: false,
      message: "Failed to update project status.",
    };
  }

  await audit(existing.organizationId, user.id, "project.status_changed", projectId, {
    code: existing.code,
    from: existing.status,
    to: parsed.data.status,
  });
  revalidateProjects(projectId);

  return {
    success: true,
    message: "Project status updated successfully.",
    projectId,
  };
}

/**
 * Hard-delete a project. Rejected whenever ANY dependent record exists
 * (assignments — active or ended, attendance records, work locations):
 * the schema would cascade assignments and null out attendance/work-location
 * history, which this application treats as protected data. Deactivating the
 * project (status change) is the sanctioned alternative.
 */
export async function deleteProjectAction(
  projectId: string
): Promise<ActionResult> {
  const user = await requireSuperAdminActor();

  if (!isUuid(projectId)) {
    return {
      success: false,
      message: "Invalid project.",
    };
  }

  const existing = await getProjectWithOrganization(projectId);

  if (!existing) {
    return {
      success: false,
      message: "Project not found.",
    };
  }

  const dependencyCounts = await detectProjectDependencies(projectId);
  const decision = evaluateProjectDelete({
    actorIsSuperAdmin: true,
    dependencyCounts,
  });

  if (!decision.allowed) {
    const summary = summarizeProjectDependencies(dependencyCounts);
    if (decision.reason === "dependent.records" && summary.hasAny) {
      const details = summary.categories
        .map(
          ({ category, count }) =>
            `${PROJECT_DEPENDENCY_CATEGORY_LABELS[category]}: ${count}`
        )
        .join(", ");
      return {
        success: false,
        message: `${decision.message} Dependent records: ${details}. Set the project to Inactive instead of deleting it.`,
      };
    }
    return {
      success: false,
      message: decision.message ?? "Operation not allowed.",
    };
  }

  try {
    // Destructive: the delete and its audit row commit atomically.
    await db.transaction(async (tx) => {
      await tx
        .delete(projects)
        .where(eq(projects.id, projectId));

      await writeAuditLog(
        {
          organizationId: existing.organizationId,
          actorUserId: user.id,
          action: "project.deleted",
          entityType: "project",
          entityId: projectId,
          metadata: {
            code: existing.code,
            name: existing.name,
            organizationCode: existing.organizationCode,
            organizationName: existing.organizationName,
          },
        },
        tx
      );
    });
  } catch (unknownError) {
    // A dependent row appeared between the scan and the delete — refuse
    // with the same message; never cascade.
    if (isForeignKeyViolation(unknownError)) {
      return {
        success: false,
        message:
          "Project cannot be deleted because it is still referenced by other records. Set it to Inactive instead.",
      };
    }
    console.error("[projects] delete failed", unknownError);
    return {
      success: false,
      message: "The project could not be deleted. Please try again.",
    };
  }

  revalidateProjects(projectId);

  return {
    success: true,
    message: `Project "${existing.name}" deleted.`,
    projectId,
  };
}
