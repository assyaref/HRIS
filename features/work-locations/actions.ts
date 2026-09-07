"use server";

import { and, eq, exists } from "drizzle-orm";
import { db } from "@/db";
import { workLocations, projects, employeeProjectAssignments, attendanceRecords } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { requirePermission } from "@/lib/auth/rbac";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createWorkLocationSchema, updateWorkLocationSchema, type CreateWorkLocationInput, type UpdateWorkLocationInput } from "./schemas";
import {
  evaluateWorkLocationProjectEligibility,
  missingActiveWorkLocationFields,
  parseWorkLocationNumber,
  workLocationZodFieldErrors,
  type WorkLocationConfigSnapshot,
} from "./guardrails";
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
  /** Status of the bound project (`null` when unbound / legacy). */
  projectStatus: string | null;
  /** True when at least one employee has an ACTIVE assignment to the project. */
  hasActiveAssignments: boolean;
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
        projectStatus: projects.status,
        hasActiveAssignments: exists(
          db
            .select({ id: employeeProjectAssignments.id })
            .from(employeeProjectAssignments)
            .where(
              and(
                eq(employeeProjectAssignments.organizationId, user.organizationId),
                eq(employeeProjectAssignments.projectId, workLocations.projectId),
                eq(employeeProjectAssignments.active, true)
              )
            )
        ),
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
        projectStatus: projects.status,
        hasActiveAssignments: exists(
          db
            .select({ id: employeeProjectAssignments.id })
            .from(employeeProjectAssignments)
            .where(
              and(
                eq(employeeProjectAssignments.organizationId, user.organizationId),
                eq(employeeProjectAssignments.projectId, workLocations.projectId),
                eq(employeeProjectAssignments.active, true)
              )
            )
        ),
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
      latitude: parseWorkLocationNumber(formData.get("latitude")),
      longitude: parseWorkLocationNumber(formData.get("longitude")),
      radiusMeters: parseWorkLocationNumber(formData.get("radiusMeters")),
      maxGpsAccuracyMeters: parseWorkLocationNumber(formData.get("maxGpsAccuracyMeters")),
      timezone: formData.get("timezone")?.toString(),
      status: formData.get("status")?.toString(),
    };

    const parsed = createWorkLocationSchema.safeParse(input);
    if (!parsed.success) {
      // Extract field errors from Zod (shared mapper in ./guardrails)
      const fieldErrors = workLocationZodFieldErrors(parsed.error.issues);
      return {
        status: "error",
        message: "Please correct the errors below.",
        fieldErrors,
      };
    }

    const data = parsed.data as CreateWorkLocationInput;

    // Validate the project belongs to the caller's organization AND is still
    // eligible (ACTIVE). The client's projectId alone is never trusted;
    // organizationId always comes from the session. Rejecting here also blocks
    // cross-organization project binding and binding to inactive/completed
    // projects (only ACTIVE projects resolve through employee assignments).
    const project = await getProjectInOrganization(
      data.projectId,
      user.organizationId
    );
    const projectDecision = evaluateWorkLocationProjectEligibility({
      actorOrganizationId: user.organizationId,
      project,
      projectIsUnchanged: false,
    });
    if (!projectDecision.ok) {
      return {
        status: "error",
        message: projectDecision.message,
      };
    }
    if (!project) {
      // Unreachable: the guard above rejects a missing project. Kept for TS.
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
      latitude: parseWorkLocationNumber(formData.get("latitude")),
      longitude: parseWorkLocationNumber(formData.get("longitude")),
      radiusMeters: parseWorkLocationNumber(formData.get("radiusMeters")),
      maxGpsAccuracyMeters: parseWorkLocationNumber(formData.get("maxGpsAccuracyMeters")),
      timezone: formData.get("timezone")?.toString(),
      status: formData.get("status")?.toString(),
    };

    const parsed = updateWorkLocationSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = workLocationZodFieldErrors(parsed.error.issues);
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
        latitude: workLocations.latitude,
        longitude: workLocations.longitude,
        radiusMeters: workLocations.radiusMeters,
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
    const existingLocation = existing[0];

    // Validate the project belongs to the caller's organization before binding
    // it to this location. Cross-organization project IDs are rejected with a
    // safe, generic error. A work location can never be moved to another org.
    // Binding to a NEW project additionally requires the project to be ACTIVE.
    // Keeping the location's current project is allowed even when that project
    // was deactivated later (preserves existing valid configuration).
    const project = await getProjectInOrganization(
      data.projectId,
      user.organizationId
    );
    const projectDecision = evaluateWorkLocationProjectEligibility({
      actorOrganizationId: user.organizationId,
      project,
      projectIsUnchanged: existingLocation.projectId === data.projectId,
    });
    if (!projectDecision.ok) {
      return {
        status: "error",
        message: projectDecision.message,
      };
    }
    if (!project) {
      // Unreachable: the guard above rejects a missing project. Kept for TS.
      return {
        status: "error",
        message: "The selected project is not available.",
      };
    }

    // Active-completeness (Phase 9.5 step 3): the resulting location must stay
    // complete whenever the saved status is ACTIVE. When the request does not
    // include a status/field, the current database value is preserved.
    const effectiveConfig: WorkLocationConfigSnapshot = {
      status: data.status ?? existingLocation.status,
      projectId: data.projectId ?? existingLocation.projectId,
      latitude: data.latitude ?? existingLocation.latitude,
      longitude: data.longitude ?? existingLocation.longitude,
      radiusMeters: data.radiusMeters ?? existingLocation.radiusMeters,
    };
    const missingActiveFields = missingActiveWorkLocationFields(
      effectiveConfig
    );
    if (missingActiveFields.length > 0) {
      const missingLabels = missingActiveFields
        .map((field) => field.label)
        .join(", ");
      return {
        status: "error",
        message: `Cannot save an active work location without: ${missingLabels}. Deactivate it first or complete the configuration.`,
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
      .select({
        id: workLocations.id,
        name: workLocations.name,
        status: workLocations.status,
        projectId: workLocations.projectId,
        latitude: workLocations.latitude,
        longitude: workLocations.longitude,
        radiusMeters: workLocations.radiusMeters,
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

    // Activation guardrail (Phase 9.5 step 3): prevent activating an
    // incomplete location — employees could select it for check-in but the
    // geofence could never resolve.
    if (newStatus === "active") {
      const missingActiveFields = missingActiveWorkLocationFields({
        status: "active",
        projectId: existing[0].projectId,
        latitude: existing[0].latitude,
        longitude: existing[0].longitude,
        radiusMeters: existing[0].radiusMeters,
      });
      if (missingActiveFields.length > 0) {
        const missingLabels = missingActiveFields
          .map((field) => field.label)
          .join(", ");
        return {
          status: "error",
          ok: false,
          message: `Cannot activate an incomplete work location. Complete the following first: ${missingLabels}.`,
        };
      }
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