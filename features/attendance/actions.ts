"use server";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db";
import { attendanceEvents, attendanceRecords } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { evaluateGeofence } from "@/lib/attendance/geofence";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";
import { verifyAttendanceIdentity } from "@/lib/attendance/verification";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";
import type { CurrentUser } from "@/lib/auth/types";

import type { AttendanceEventType } from "./constants";
import {
  checkInSchema,
  checkOutSchema,
  type CheckInInput,
  type CheckOutInput,
} from "./schemas";
import {
  getEligibleAssignmentLocation,
  getEmployeeForUser,
  getWorkLocationInOrganization,
} from "./queries";
import type { AttendanceEmployee } from "./queries";

/**
 * Attendance server actions (Phase 6).
 *
 * Security rules:
 * - Authenticate + authorize (`attendance.check_in` / `attendance.check_out`).
 * - The employee is ALWAYS resolved from the authenticated user's linked
 *   employee record; employee_id is never accepted from the client.
 * - Organization comes from the session. project/work location ownership is
 *   re-validated server-side against the employee's ACTIVE assignments.
 * - Geofence decisions are recomputed on the server (client GPS is only
 *   latitude/longitude/accuracy; "insideGeofence" style fields are never
 *   accepted).
 * - Attendance date and timestamps come from the server.
 * - Successful mutations create an immutable `attendance_events` row and an
 *   audit entry; rejected attempts append a rejected event + audit too.
 */

export interface AttendanceActionResult {
  ok: boolean;
  message: string;
}

interface AttendanceContext {
  organizationId: string;
  employee: AttendanceEmployee;
}

async function resolveAttendanceContext(
  user: CurrentUser
): Promise<
  | { ok: true; context: AttendanceContext }
  | { ok: false; result: AttendanceActionResult }
> {
  if (!user.organizationId) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "Your account is not assigned to an organization.",
      },
    };
  }
  const employee = await getEmployeeForUser(user.id, user.organizationId);
  if (!employee) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "No employee profile is linked to your account.",
      },
    };
  }
  return { ok: true, context: { organizationId: user.organizationId, employee } };
}

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "The request could not be validated.";
}

async function appendAttendanceEvent(input: {
  organizationId: string;
  employeeId: string;
  eventType: AttendanceEventType;
  attendanceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  distanceMeters?: number | null;
  verificationMethod?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await db.insert(attendanceEvents).values({
    organizationId: input.organizationId,
    employeeId: input.employeeId,
    attendanceId: input.attendanceId ?? null,
    eventType: input.eventType,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    accuracyMeters: input.accuracyMeters ?? null,
    distanceMeters: input.distanceMeters ?? null,
    verificationMethod: input.verificationMethod ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  });
}

async function auditAttendance(
  input: {
    organizationId: string;
    actorUserId: string;
    action: "attendance.check_in" | "attendance.check_in_rejected" | "attendance.check_out" | "attendance.check_out_rejected";
    entityId?: string | null;
    employeeNumber: string;
    eventType: string;
    reason?: string | null;
  }
): Promise<void> {
  try {
    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: "attendance",
      entityId: input.entityId ?? null,
      metadata: {
        eventType: input.eventType,
        employeeNumber: input.employeeNumber,
        reason: input.reason ?? null,
      },
    });
  } catch (error) {
    console.error("[attendance] audit failed", error);
  }
}

/** Check the authenticated employee in to attendance. */
export async function checkInAction(
  input: CheckInInput
): Promise<AttendanceActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_CHECK_IN);

  const resolved = await resolveAttendanceContext(user);
  if (!resolved.ok) return resolved.result;
  const { organizationId, employee } = resolved.context;

  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error.issues) };
  }

  if (employee.employmentStatus !== "active") {
    await appendAttendanceEvent({
      organizationId,
      employeeId: employee.id,
      eventType: "check_in_rejected",
      reason: "employee_inactive",
    });
    await auditAttendance({
      organizationId,
      actorUserId: user.id,
      action: "attendance.check_in_rejected",
      employeeNumber: employee.employeeNumber,
      eventType: "check_in_rejected",
      reason: "employee_inactive",
    });
    return { ok: false, message: "Inactive employees cannot check in." };
  }

  const { projectId, workLocationId, notes } = parsed.data;
  const location = parsed.data.location;
  const coords =
    location.status === "obtained"
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyMeters: location.accuracyMeters,
        }
      : null;

  await appendAttendanceEvent({
    organizationId,
    employeeId: employee.id,
    eventType: "check_in_attempt",
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    accuracyMeters: coords?.accuracyMeters ?? null,
    metadata: {
      projectId,
      workLocationId,
      clientLocationStatus: location.status,
    },
  });

  if (location.status !== "obtained") {
    const reason =
      location.status === "denied"
        ? "location_permission_denied"
        : "location_unavailable";
    await appendAttendanceEvent({
      organizationId,
      employeeId: employee.id,
      eventType: "check_in_rejected",
      reason,
      metadata: { projectId, workLocationId, clientLocationStatus: location.status },
    });
    await auditAttendance({
      organizationId,
      actorUserId: user.id,
      action: "attendance.check_in_rejected",
      employeeNumber: employee.employeeNumber,
      eventType: "check_in_rejected",
      reason,
    });
    return {
      ok: false,
      message:
        location.status === "denied"
          ? "Location access was denied. Enable location access and try again."
          : "Unable to determine your location. Try again.",
    };
  }

  // TS narrowing guard (unreachable given the check above).
  if (!coords) {
    return { ok: false, message: "Location data is missing." };
  }

  // Re-validate project/work-location ownership against ACTIVE assignments.
  const workLocation = await getEligibleAssignmentLocation(
    organizationId,
    employee.id,
    projectId,
    workLocationId
  );
  if (!workLocation) {
    await appendAttendanceEvent({
      organizationId,
      employeeId: employee.id,
      eventType: "check_in_rejected",
      reason: "project_or_location_not_eligible",
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracyMeters: coords.accuracyMeters,
      metadata: { projectId, workLocationId },
    });
    await auditAttendance({
      organizationId,
      actorUserId: user.id,
      action: "attendance.check_in_rejected",
      employeeNumber: employee.employeeNumber,
      eventType: "check_in_rejected",
      reason: "project_or_location_not_eligible",
    });
    return {
      ok: false,
      message: "This project or work location is not available to you.",
    };
  }

  // Server-side geofence decision.
  const evaluation = evaluateGeofence({
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMeters: coords.accuracyMeters,
    centerLatitude: workLocation.latitude,
    centerLongitude: workLocation.longitude,
    radiusMeters: workLocation.radiusMeters,
    maxAccuracyMeters: workLocation.maxGpsAccuracyMeters,
  });

  if (evaluation.status !== "valid") {
    const reason = evaluation.status;
    await appendAttendanceEvent({
      organizationId,
      employeeId: employee.id,
      eventType: "location_rejected",
      reason,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracyMeters: coords.accuracyMeters,
      distanceMeters:
        evaluation.status === "outside_geofence"
          ? evaluation.distanceMeters
          : null,
      metadata: {
        projectId,
        workLocationId,
        geofenceRadiusMeters: workLocation.radiusMeters,
      },
    });
    await auditAttendance({
      organizationId,
      actorUserId: user.id,
      action: "attendance.check_in_rejected",
      employeeNumber: employee.employeeNumber,
      eventType: "location_rejected",
      reason,
    });
    return {
      ok: false,
      message:
        evaluation.status === "outside_geofence"
          ? "You are outside the geofenced work location."
          : "Your location could not be verified. Move closer and check your GPS accuracy.",
    };
  }

  // Identity verification policy (Phase 6: no biometric engine configured).
  const verification = await verifyAttendanceIdentity({
    userId: user.id,
    employeeId: employee.id,
  });
  if (verification.status === "failed") {
    await appendAttendanceEvent({
      organizationId,
      employeeId: employee.id,
      eventType: "verification_failed",
      reason: verification.reason ?? "identity_verification_failed",
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracyMeters: coords.accuracyMeters,
    });
    await auditAttendance({
      organizationId,
      actorUserId: user.id,
      action: "attendance.check_in_rejected",
      employeeNumber: employee.employeeNumber,
      eventType: "verification_failed",
      reason: verification.reason,
    });
    return { ok: false, message: "Identity verification failed." };
  }

  // Server time + work-location timezone date.
  const now = new Date();
  const dateString = dateStringInTimeZone(now, workLocation.timezone);
  const attendanceDate = parseAttendanceDate(dateString);

  try {
    const outcome = await db.transaction(
      async (tx): Promise<{ duplicate: boolean; message: string | null; id: string | null }> => {
      const openRecord = await tx
        .select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.employeeId, employee.id),
            isNotNull(attendanceRecords.checkInAt),
            isNull(attendanceRecords.checkOutAt)
          )
        )
        .limit(1);
      if (openRecord[0]) {
        return {
          duplicate: true,
          message: "You already have an open check-in.",
          id: null,
        };
      }

      const dayRecord = await tx
        .select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.employeeId, employee.id),
            eq(attendanceRecords.attendanceDate, attendanceDate)
          )
        )
        .limit(1);
      if (dayRecord[0]) {
        return {
          duplicate: true,
          message: "You have already checked in for this day.",
          id: null,
        };
      }

      const inserted = await tx
        .insert(attendanceRecords)
        .values({
          organizationId,
          employeeId: employee.id,
          projectId,
          workLocationId,
          attendanceDate,
          checkInAt: now,
          checkInLatitude: coords.latitude,
          checkInLongitude: coords.longitude,
          checkInAccuracyMeters: coords.accuracyMeters,
          checkInDistanceMeters: evaluation.distanceMeters,
          checkInLocationStatus: "valid",
          checkInVerificationStatus: verification.persistedStatus,
          checkInMethod: verification.method,
          status: "present",
          notes: notes ?? null,
        })
        .returning({ id: attendanceRecords.id });

      const recordId = inserted[0]?.id;
      if (!recordId) throw new Error("Attendance insert returned no row.");

      await tx.insert(attendanceEvents).values({
        organizationId,
        employeeId: employee.id,
        attendanceId: recordId,
        eventType: "check_in_success",
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters: coords.accuracyMeters,
        distanceMeters: evaluation.distanceMeters,
        verificationMethod: verification.method,
        reason: null,
        metadata: {
          projectId,
          workLocationId,
          identityVerification: verification.status,
          geofenceRadiusMeters: workLocation.radiusMeters,
        },
      });

      return { duplicate: false, message: null, id: recordId };
    }
    );

    if (outcome.duplicate) {
      await appendAttendanceEvent({
        organizationId,
        employeeId: employee.id,
        eventType: "check_in_rejected",
        reason: "duplicate_check_in",
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters: coords.accuracyMeters,
      });
      await auditAttendance({
        organizationId,
        actorUserId: user.id,
        action: "attendance.check_in_rejected",
        employeeNumber: employee.employeeNumber,
        eventType: "check_in_rejected",
        reason: "duplicate_check_in",
      });
      return { ok: false, message: outcome.message ?? "Check-in was not recorded." };
    }

    await auditAttendance({
      organizationId,
      actorUserId: user.id,
      action: "attendance.check_in",
      entityId: outcome.id,
      employeeNumber: employee.employeeNumber,
      eventType: "check_in_success",
    });
    return { ok: true, message: "Checked in successfully." };
  } catch (error) {
    console.error("[attendance] check-in failed", error);
    return {
      ok: false,
      message: "Check-in could not be completed. Please try again.",
    };
  }
}




/** Check the authenticated employee out of an open attendance. */
export async function checkOutAction(
  input: CheckOutInput
): Promise<AttendanceActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_CHECK_OUT);

  const resolved = await resolveAttendanceContext(user);
  if (!resolved.ok) return resolved.result;
  const { organizationId, employee } = resolved.context;

  const parsed = checkOutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error.issues) };
  }
  const { notes } = parsed.data;
  const location = parsed.data.location;
  const coords =
    location.status === "obtained"
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyMeters: location.accuracyMeters,
        }
      : null;

  try {
    const outcome = await db.transaction(async (tx) => {
      const openRows = await tx
        .select({
          id: attendanceRecords.id,
          workLocationId: attendanceRecords.workLocationId,
        })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.organizationId, organizationId),
            eq(attendanceRecords.employeeId, employee.id),
            isNotNull(attendanceRecords.checkInAt),
            isNull(attendanceRecords.checkOutAt)
          )
        )
        .orderBy(attendanceRecords.checkInAt)
        .limit(1);

      const openRecord = openRows[0];
      if (!openRecord) {
        return { outcome: "not_checked_in" as const };
      }

      await tx.insert(attendanceEvents).values({
        organizationId,
        employeeId: employee.id,
        attendanceId: openRecord.id,
        eventType: "check_out_attempt",
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        accuracyMeters: coords?.accuracyMeters ?? null,
        metadata: { clientLocationStatus: location.status },
      });

      if (location.status !== "obtained") {
        const reason =
          location.status === "denied"
            ? "location_permission_denied"
            : "location_unavailable";
        await tx.insert(attendanceEvents).values({
          organizationId,
          employeeId: employee.id,
          attendanceId: openRecord.id,
          eventType: "check_out_rejected",
          reason,
          metadata: { clientLocationStatus: location.status },
        });
        return { outcome: "location_failed" as const, reason };
      }

      const workLocation = openRecord.workLocationId
        ? await getWorkLocationInOrganization(
            organizationId,
            openRecord.workLocationId
          )
        : null;
      if (!workLocation) {
        await tx.insert(attendanceEvents).values({
          organizationId,
          employeeId: employee.id,
          attendanceId: openRecord.id,
          eventType: "check_out_rejected",
          reason: "work_location_missing",
        });
        return {
          outcome: "location_failed" as const,
          reason: "work_location_missing",
        };
      }

      const evaluation = evaluateGeofence({
        latitude: coords!.latitude,
        longitude: coords!.longitude,
        accuracyMeters: coords!.accuracyMeters,
        centerLatitude: workLocation.latitude,
        centerLongitude: workLocation.longitude,
        radiusMeters: workLocation.radiusMeters,
        maxAccuracyMeters: workLocation.maxGpsAccuracyMeters,
      });

      if (evaluation.status !== "valid") {
        await tx.insert(attendanceEvents).values({
          organizationId,
          employeeId: employee.id,
          attendanceId: openRecord.id,
          eventType: "location_rejected",
          reason: evaluation.status,
          latitude: coords!.latitude,
          longitude: coords!.longitude,
          accuracyMeters: coords!.accuracyMeters,
          distanceMeters:
            evaluation.status === "outside_geofence"
              ? evaluation.distanceMeters
              : null,
        });
        return { outcome: "location_failed" as const, reason: evaluation.status };
      }

      const verification = await verifyAttendanceIdentity({
        userId: user.id,
        employeeId: employee.id,
      });
      if (verification.status === "failed") {
        await tx.insert(attendanceEvents).values({
          organizationId,
          employeeId: employee.id,
          attendanceId: openRecord.id,
          eventType: "verification_failed",
          reason: verification.reason ?? "identity_verification_failed",
        });
        return { outcome: "verification_failed" as const };
      }

      const now = new Date();
      await tx
        .update(attendanceRecords)
        .set({
          checkOutAt: now,
          checkOutLatitude: coords!.latitude,
          checkOutLongitude: coords!.longitude,
          checkOutAccuracyMeters: coords!.accuracyMeters,
          checkOutDistanceMeters: evaluation.distanceMeters,
          checkOutLocationStatus: "valid",
          checkOutVerificationStatus: verification.persistedStatus,
          checkOutMethod: verification.method,
          status: "completed",
          notes: notes ?? null,
          updatedAt: now,
        })
        .where(eq(attendanceRecords.id, openRecord.id));

      await tx.insert(attendanceEvents).values({
        organizationId,
        employeeId: employee.id,
        attendanceId: openRecord.id,
        eventType: "check_out_success",
        latitude: coords!.latitude,
        longitude: coords!.longitude,
        accuracyMeters: coords!.accuracyMeters,
        distanceMeters: evaluation.distanceMeters,
        verificationMethod: verification.method,
        reason: null,
        metadata: { identityVerification: verification.status },
      });

      return { outcome: "success" as const, id: openRecord.id };
    });

    if (outcome.outcome === "not_checked_in") {
      return { ok: false, message: "You do not have an open check-in." };
    }
    if (outcome.outcome === "location_failed") {
      await auditAttendance({
        organizationId,
        actorUserId: user.id,
        action: "attendance.check_out_rejected",
        employeeNumber: employee.employeeNumber,
        eventType: "check_out_rejected",
        reason: outcome.reason,
      });
      return {
        ok: false,
        message:
          outcome.reason === "location_permission_denied"
            ? "Location access was denied. Enable location access and try again."
            : "Your location could not be verified against the work geofence.",
      };
    }
    if (outcome.outcome === "verification_failed") {
      await auditAttendance({
        organizationId,
        actorUserId: user.id,
        action: "attendance.check_out_rejected",
        employeeNumber: employee.employeeNumber,
        eventType: "verification_failed",
        reason: "identity_verification_failed",
      });
      return { ok: false, message: "Identity verification failed." };
    }

    await auditAttendance({
      organizationId,
      actorUserId: user.id,
      action: "attendance.check_out",
      entityId: outcome.id,
      employeeNumber: employee.employeeNumber,
      eventType: "check_out_success",
    });
    return { ok: true, message: "Checked out successfully." };
  } catch (error) {
    console.error("[attendance] check-out failed", error);
    return {
      ok: false,
      message: "Check-out could not be completed. Please try again.",
    };
  }
}

