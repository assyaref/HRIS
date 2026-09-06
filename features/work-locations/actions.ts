"use server";

import { and, eq, exists } from "drizzle-orm";
import { db } from "@/db";
import { workLocations, projects, employeeProjectAssignments, attendanceRecords } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { requirePermission } from "@/lib/auth/rbac";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createWorkLocationSchema, updateWorkLocationSchema, type CreateWorkLocationInput, type UpdateWorkLocationInput } from "./schemas";
import { getProjectInOrganization } from "./queries";

// Action state type matching project's pattern (useActionState)
export type WorkLocationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

export interface WorkLocationListItem {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  maxGpsAccuracyMeters: number | null;
  timezone: string | null;
  status: string;
  projectId: string | null;
  projectName: string | null;
  createdAt: Date;
  updatedAt: Date;
}



/**
 * List all work locations for the current user's organization
 * Requires work_locations.view permission
 */
export async function listWorkLocationsAction(): Promise<{
  ok: boolean;
  message: string;
  locations: WorkLocationListItem[];
}> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.WORK_LOCATIONS_VIEW);

    if (!user.organizationId) {
      return {
        ok: false,
        message: "Your account is not assigned to an organization.",
        locations: [],
      };
    }

    // Query with organization scope ALWAYS enforced
    const locations = await db
      .select({
        id: workLocations.id,
        name: workLocations.name,
        latitude: workLocations.latitude,
        longitude: workLocations.longitude,
        radiusMeters: workLocations.radiusMeters,
        maxGpsAccuracyMeters: workLocations.maxGpsAccuracyMeters,
        timezone: workLocations.timezone,
        status: workLocations.status,
        projectId: workLocations.projectId,
        projectName: projects.name,
        createdAt: workLocations.createdAt,
        updatedAt: workLocations.updatedAt,
      })
      .from(workLocations)
      .leftJoin(
        projects,
        and(
          eq(projects.id, workLocations.projectId),
          eq(projects.organizationId, user.organizationId)
        )
      )
      .where(eq(workLocations.organizationId, user.organizationId))
      .orderBy(workLocations.name);

    return {
      ok: true,
      message: "Work locations loaded successfully.",
      locations: locations as WorkLocationListItem[],
    };
  } catch (error) {
    console.error("[work-locations] list error:", error);
    return {
      ok: false,
      message: "Failed to load work locations.",
      locations: [],
    };
  }
}

/**
 * Get a single work location by ID, with organization scope
 * Requires work_locations.view permission
 */
export async function getWorkLocationAction(locationId: string): Promise<{
  ok: boolean;
  message: string;
  location: WorkLocationListItem | null;
}> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.WORK_LOCATIONS_VIEW);

    if (!user.organizationId) {
      return {
        ok: false,
        message: "Your account is not assigned to an organization.",
        location: null,
      };
    }

    const locations = await db
      .select({
        id: workLocations.id,
        name: workLocations.name,
        latitude: workLocations.latitude,
        longitude: workLocations.longitude,
        radiusMeters: workLocations.radiusMeters,
        maxGpsAccuracyMeters: workLocations.maxGpsAccuracyMeters,
        timezone: workLocations.timezone,
        status: workLocations.status,
        projectId: workLocations.projectId,
        projectName: projects.name,
        createdAt: workLocations.createdAt,
        updatedAt: workLocations.updatedAt,
      })
      .from(workLocations)
      .leftJoin(
        projects,
        and(
          eq(projects.id, workLocations.projectId),
          eq(projects.organizationId, user.organizationId)
        )
      )
      .where(
        and(
          eq(workLocations.id, locationId),
          eq(workLocations.organizationId, user.organizationId)
        )
      )
      .limit(1);

    const location = locations[0];
    if (!location) {
      return {
        ok: false,
        message: "Work location not found.",
        location: null,
      };
    }

    return {
      ok: true,
      message: "Work location loaded successfully.",
      location: location as WorkLocationListItem,
    };
  } catch (error) {
    console.error("[work-locations] get error:", error);
    return {
      ok: false,
      message: "Failed to load work location.",
      location: null,
    };
  }
}

/**
 * Create a new work location
 * Requires work_locations.manage permission
 * OrganizationId is ALWAYS taken from session, never from client
 */
export async function createWorkLocationAction(
  _prevState: WorkLocationActionState,
  formData: FormData
): Promise<WorkLocationActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.WORK_LOCATIONS_MANAGE);

    if (!user.organizationId) {
      return {
        status: "error",
        message: "Your account is not assigned to an organization.",
      };
    }

    // Parse FormData into input object
    const input: Record<string, unknown> = {
      name: formData.get("name")?.toString(),
      projectId: formData.get("projectId")?.toString() || null,
      latitude: formData.get("latitude") ? parseFloat(formData.get("latitude") as string) : undefined,
      longitude: formData.get("longitude") ? parseFloat(formData.get("longitude") as string) : undefined,
      radiusMeters: formData.get("radiusMeters") ? parseInt(formData.get("radiusMeters") as string) : undefined,
      maxGpsAccuracyMeters: formData.get("maxGpsAccuracyMeters") ? parseInt(formData.get("maxGpsAccuracyMeters") as string) : undefined,
      timezone: formData.get("timezone")?.toString(),
      status: formData.get("status")?.toString(),
    };

    const parsed = createWorkLocationSchema.safeParse(input);
    if (!parsed.success) {
      // Extract field errors from Zod
      const fieldErrors: Record<string, string> = {};
      const errors = parsed.error.issues;
      errors.forEach((issue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      return {
        status: "error",
        message: "Please correct the errors below.",
        fieldErrors,
      };
    }

    const data = parsed.data as CreateWorkLocationInput;

    // Validate the project belongs to the caller's organization. The client's
    // projectId alone is never trusted; organizationId always comes from the
    // session. Rejecting here also blocks cross-organization project binding.
    const project = await getProjectInOrganization(
      data.projectId,
      user.organizationId
    );
    if (!project) {
      return {
        status: "error",
        message: "The selected project is not available.",
      };
    }

    // Insert with organizationId from session - NEVER trust client
    const [newLocation] = await db
      .insert(workLocations)
      .values({
        organizationId: user.organizationId,
        name: data.name,
        projectId: project.id,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        radiusMeters: data.radiusMeters ?? null,
        maxGpsAccuracyMeters: data.maxGpsAccuracyMeters ?? null,
        timezone: data.timezone ?? null,
        status: data.status,
      })
      .returning({ id: workLocations.id, name: workLocations.name });

    // Audit logging
    await writeAuditLog({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "work_location.created",
      entityType: "work_location",
      entityId: newLocation.id,
      metadata: {
        locationName: newLocation.name,
        projectId: project.id,
        projectName: project.name,
      },
    });

    return {
      status: "success",
      message: "Work location created successfully.",
    };
  } catch (error) {
    console.error("[work-locations] create error:", error);
    return {
      status: "error",
      message: "Failed to create work location. Please try again.",
    };
  }
}

/**
 * Update an existing work location
 * Requires work_locations.manage permission
 * Organization scope enforced
 */
export async function updateWorkLocationAction(
  locationId: string,
  _prevState: WorkLocationActionState,
  formData: FormData
): Promise<WorkLocationActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.WORK_LOCATIONS_MANAGE);

    if (!user.organizationId) {
      return {
        status: "error",
        message: "Your account is not assigned to an organization.",
      };
    }

    // Parse FormData
    const input: Record<string, unknown> = {
      name: formData.get("name")?.toString(),
      projectId: formData.get("projectId")?.toString() || null,
      latitude: formData.get("latitude") ? parseFloat(formData.get("latitude") as string) : undefined,
      longitude: formData.get("longitude") ? parseFloat(formData.get("longitude") as string) : undefined,
      radiusMeters: formData.get("radiusMeters") ? parseInt(formData.get("radiusMeters") as string) : undefined,
      maxGpsAccuracyMeters: formData.get("maxGpsAccuracyMeters") ? parseInt(formData.get("maxGpsAccuracyMeters") as string) : undefined,
      timezone: formData.get("timezone")?.toString(),
      status: formData.get("status")?.toString(),
    };

    const parsed = updateWorkLocationSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      const errors = parsed.error.issues;
      errors.forEach((issue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      return {
        status: "error",
        message: "Please correct the errors below.",
        fieldErrors,
      };
    }

    // First verify location belongs to user's organization
    const existing = await db
      .select({
        id: workLocations.id,
        name: workLocations.name,
        status: workLocations.status,
        projectId: workLocations.projectId,
      })
      .from(workLocations)
      .where(
        and(
          eq(workLocations.id, locationId),
          eq(workLocations.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!existing[0]) {
      return {
        status: "error",
        message: "Work location not found.",
      };
    }

    const data = parsed.data as UpdateWorkLocationInput;

    // Validate the project belongs to the caller's organization before binding
    // it to this location. Cross-organization project IDs are rejected with a
    // safe, generic error. A work location can never be moved to another org.
    const project = await getProjectInOrganization(
      data.projectId,
      user.organizationId
    );
    if (!project) {
      return {
        status: "error",
        message: "The selected project is not available.",
      };
    }

    // Update with only provided fields
    await db
      .update(workLocations)
      .set({
        ...(data.name && { name: data.name }),
        projectId: project.id,
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
        ...(data.radiusMeters !== undefined && { radiusMeters: data.radiusMeters }),
        ...(data.maxGpsAccuracyMeters !== undefined && { maxGpsAccuracyMeters: data.maxGpsAccuracyMeters }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.status && { status: data.status }),
      })
      .where(
        and(
          eq(workLocations.id, locationId),
          eq(workLocations.organizationId, user.organizationId)
        )
      );

    // Audit logging
    await writeAuditLog({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "work_location.updated",
      entityType: "work_location",
      entityId: locationId,
      metadata: {
        locationName: data.name ?? existing[0].name,
        changedFields: Object.keys(data),
        previousProjectId: existing[0].projectId,
        newProjectId: project.id,
      },
    });

    return {
      status: "success",
      message: "Work location updated successfully.",
    };
  } catch (error) {
    console.error("[work-locations] update error:", error);
    return {
      status: "error",
      message: "Failed to update work location. Please try again.",
    };
  }
}

/**
 * Toggle work location status (active/inactive)
 * Requires work_locations.manage permission
 */
export async function toggleWorkLocationStatusAction(
  locationId: string,
  requestedStatus: string
): Promise<WorkLocationActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.WORK_LOCATIONS_MANAGE);

    if (!user.organizationId) {
      return {
        status: "error",
        ok: false,
        message: "Your account is not assigned to an organization.",
      };
    }

    // Validate the requested status server-side (never trust the client).
    const newStatus =
      requestedStatus === "active"
        ? "active"
        : requestedStatus === "inactive"
          ? "inactive"
          : null;
    if (!newStatus) {
      return {
        status: "error",
        ok: false,
        message: "Invalid status value.",
      };
    }

    // Verify location exists and belongs to org
    const existing = await db
      .select({ id: workLocations.id, name: workLocations.name, status: workLocations.status })
      .from(workLocations)
      .where(
        and(
          eq(workLocations.id, locationId),
          eq(workLocations.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!existing[0]) {
      return {
        status: "error",
        ok: false,
        message: "Work location not found.",
      };
    }

    const previousStatus = existing[0].status;
    if (previousStatus === newStatus) {
      return {
        status: "success",
        ok: true,
        message: `Location is already ${newStatus}.`,
      };
    }

    await db
      .update(workLocations)
      .set({ status: newStatus })
      .where(
        and(
          eq(workLocations.id, locationId),
          eq(workLocations.organizationId, user.organizationId)
        )
      );

    // Audit logging
    await writeAuditLog({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "work_location.status_changed",
      entityType: "work_location",
      entityId: locationId,
      metadata: {
        locationName: existing[0].name,
        previousStatus,
        newStatus,
      },
    });

    return {
      status: "success",
      ok: true,
      message: `Work location ${newStatus === "active" ? "activated" : "deactivated"} successfully.`,
    };
  } catch (error) {
    console.error("[work-locations] status toggle error:", error);
    return {
      status: "error",
      ok: false,
      message: "Failed to update location status.",
    };
  }
}

/**
 * Delete a work location ONLY if it's not in use
 * Requires work_locations.manage permission
 * Delete safety: check for active usage before allowing deletion
 */
export async function deleteWorkLocationAction(
  locationId: string,
  _prevState: WorkLocationActionState,
  _formData: FormData
): Promise<WorkLocationActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.WORK_LOCATIONS_MANAGE);

    if (!user.organizationId) {
      return {
        status: "error",
        message: "Your account is not assigned to an organization.",
      };
    }

    // Verify location exists and belongs to org
    const existing = await db
      .select({ id: workLocations.id, name: workLocations.name })
      .from(workLocations)
      .where(
        and(
          eq(workLocations.id, locationId),
          eq(workLocations.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!existing[0]) {
      return {
        status: "error",
        message: "Work location not found.",
      };
    }

    // DELETE SAFETY: block deletion while the location is still in use.
    // Direct usage: attendance records reference the location.
    // Indirect usage: the location is bound to a project that still has ACTIVE
    // employee assignments (employees may check in here via that assignment).
    const [usage] = await db
      .select({
        hasAttendance: exists(
          db
            .select()
            .from(attendanceRecords)
            .where(eq(attendanceRecords.workLocationId, locationId))
        ),
        hasActiveAssignments: exists(
          db
            .select()
            .from(employeeProjectAssignments)
            .where(
              and(
                eq(employeeProjectAssignments.projectId, workLocations.projectId),
                eq(employeeProjectAssignments.active, true)
              )
            )
        ),
      })
      .from(workLocations)
      .where(
        and(
          eq(workLocations.id, locationId),
          eq(workLocations.organizationId, user.organizationId)
        )
      )
      .limit(1);

    const locationInUse = usage?.hasAttendance || usage?.hasActiveAssignments;
    if (locationInUse) {
      return {
        status: "error",
        message: "Cannot delete location that is still used by employees or attendance records. Deactivate it instead.",
      };
    }

    // Safe to delete
    await db
      .delete(workLocations)
      .where(
        and(
          eq(workLocations.id, locationId),
          eq(workLocations.organizationId, user.organizationId)
        )
      );

    // Audit logging
    await writeAuditLog({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "work_location.deleted",
      entityType: "work_location",
      entityId: locationId,
      metadata: {
        locationName: existing[0].name,
      },
    });

    return {
      status: "success",
      message: "Work location deleted successfully.",
    };
  } catch (error) {
    console.error("[work-locations] delete error:", error);
    return {
      status: "error",
      message: "Failed to delete work location.",
    };
  }
}