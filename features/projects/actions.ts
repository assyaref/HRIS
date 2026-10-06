"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requirePermission } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  createProjectSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
} from "./schemas";

type ActionResult = {
  success: boolean;
  message: string;
  projectId?: string;
};

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function normalizeName(name: string) {
  return name.trim();
}

export async function createProjectAction(
  _previousState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PROJECTS_MANAGE);

  const organizationId = user.organizationId;

  if (!organizationId) {
    return {
      success: false,
      message: "User is not associated with an organization.",
    };
  }

  const parsed = createProjectSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    status: formData.get("status") || "active",
    startDate: formData.get("startDate") || undefined,
    endDate: formData.get("endDate") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid project data.",
    };
  }

  const code = normalizeCode(parsed.data.code);
  const name = normalizeName(parsed.data.name);

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.code, code)
      )
    )
    .limit(1);

  if (existing) {
    return {
      success: false,
      message: "Project code already exists in this organization.",
    };
  }

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

  await writeAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "project.created",
    entityType: "project",
    entityId: project.id,
    metadata: {
      code,
      name,
      status: parsed.data.status,
    },
  });

  return {
    success: true,
    message: "Project created successfully.",
    projectId: project.id,
  };
}

export async function updateProjectAction(
  projectId: string,
  input: unknown
): Promise<ActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PROJECTS_MANAGE);

  const organizationId = user.organizationId;

  if (!organizationId) {
    return {
      success: false,
      message: "User is not associated with an organization.",
    };
  }

  const parsed = updateProjectSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid project data.",
    };
  }

  const [existing] = await db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      status: projects.status,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!existing) {
    return {
      success: false,
      message: "Project not found.",
    };
  }

  const values: Partial<typeof projects.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (parsed.data.code !== undefined) {
    const code = normalizeCode(parsed.data.code);

    const [duplicate] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, organizationId),
          eq(projects.code, code)
        )
      )
      .limit(1);

    if (duplicate && duplicate.id !== projectId) {
      return {
        success: false,
        message: "Project code already exists in this organization.",
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

  const [updated] = await db
    .update(projects)
    .set(values)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      )
    )
    .returning({
      id: projects.id,
    });

  if (!updated) {
    return {
      success: false,
      message: "Failed to update project.",
    };
  }

  await writeAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "project.updated",
    entityType: "project",
    entityId: projectId,
    metadata: {
      before: existing,
      after: parsed.data,
    },
  });

  return {
    success: true,
    message: "Project updated successfully.",
    projectId,
  };
}

export async function updateProjectStatusAction(
  projectId: string,
  input: unknown
): Promise<ActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PROJECTS_MANAGE);

  const organizationId = user.organizationId;

  if (!organizationId) {
    return {
      success: false,
      message: "User is not associated with an organization.",
    };
  }

  const parsed = updateProjectStatusSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid project status.",
    };
  }

  const [existing] = await db
    .select({
      id: projects.id,
      code: projects.code,
      status: projects.status,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      )
    )
    .limit(1);

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
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      )
    )
    .returning({
      id: projects.id,
    });

  if (!updated) {
    return {
      success: false,
      message: "Failed to update project status.",
    };
  }

  await writeAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "project.status_changed",
    entityType: "project",
    entityId: projectId,
    metadata: {
      code: existing.code,
      from: existing.status,
      to: parsed.data.status,
    },
  });

  return {
    success: true,
    message: "Project status updated successfully.",
    projectId,
  };
}
