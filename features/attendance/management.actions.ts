"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  attendanceEvents,
  attendancePhotos,
  attendanceRecords,
  employees,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { isSuperAdmin } from "@/lib/auth/rbac";

/**
 * Attendance management — Super Administrator deletes.
 *
 * Deleting an attendance record removes its photo evidence and its event
 * trail; nothing else references the record. The organization is the acting
 * session organization; a foreign id is reported as not found.
 */

export interface AttendanceManagementResult {
  ok: boolean;
  message: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteAttendanceRecordAction(
  attendanceId: string
): Promise<AttendanceManagementResult> {
  const user = await requireUser();
  if (!(await isSuperAdmin(user.id))) {
    return {
      ok: false,
      message: "Hanya Super Administrator yang dapat menghapus data absensi.",
    };
  }
  if (!user.organizationId) {
    return { ok: false, message: "Your account is not assigned to an organization." };
  }
  const organizationId = user.organizationId;
  if (!UUID_PATTERN.test(attendanceId)) {
    return { ok: false, message: "Invalid attendance identifier." };
  }

  const rows = await db
    .select({
      id: attendanceRecords.id,
      attendanceDate: attendanceRecords.attendanceDate,
      employeeId: attendanceRecords.employeeId,
      employeeNumber: employees.employeeNumber,
    })
    .from(attendanceRecords)
    .leftJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .where(
      and(
        eq(attendanceRecords.id, attendanceId),
        eq(attendanceRecords.organizationId, organizationId)
      )
    )
    .limit(1);
  const record = rows[0];
  if (!record) return { ok: false, message: "Attendance record not found." };

  let eventCount = 0;
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(attendancePhotos)
        .where(
          and(
            eq(attendancePhotos.organizationId, organizationId),
            eq(attendancePhotos.attendanceId, attendanceId)
          )
        );
      const removedEvents = await tx
        .delete(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.organizationId, organizationId),
            eq(attendanceEvents.attendanceId, attendanceId)
          )
        )
        .returning({ id: attendanceEvents.id });
      eventCount = removedEvents.length;
      await tx
        .delete(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.id, attendanceId),
            eq(attendanceRecords.organizationId, organizationId)
          )
        );
    });
  } catch (error) {
    console.error("[attendance] record delete failed", error);
    return { ok: false, message: "Data absensi tidak dapat dihapus. Coba lagi." };
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "attendance.record.deleted",
      entityType: "attendance_record",
      entityId: attendanceId,
      metadata: {
        attendanceDate: record.attendanceDate,
        employeeId: record.employeeId,
        employeeNumber: record.employeeNumber,
        eventCount,
      },
    });
  } catch {
    // Audit is best-effort.
  }

  revalidatePath("/attendance");
  revalidatePath("/attendance/management");
  revalidatePath("/attendance/recap");
  revalidatePath("/dashboard");
  return { ok: true, message: "Data absensi dihapus." };
}
