import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { attendancePhotos, attendanceRecords } from "@/db/schema";
import { ATTENDANCE_PHOTO_MIME_TYPE } from "@/lib/attendance/attendance-photo";

/**
 * Attendance photo data access (Phase 10.7C-55 foundation) — server-only.
 *
 * Security contract (mirrors every other attendance DAL in this repository):
 * - Every read/write/delete is organization scoped. An `attendanceId` alone is
 *   never sufficient — it must always be paired with the authenticated
 *   organization id.
 * - `organizationId` is ALWAYS the caller-supplied authenticated session
 *   organization. It is never derived from a client payload.
 * - `createAttendancePhoto` refuses to write when the target attendance record
 *   does not belong to the authenticated organization (transactional check).
 * - The expiry read guard (`expires_at > now()`) is enforced at the QUERY
 *   level, so an expired row is reported as absent even if it still exists
 *   physically.
 * - Photo bytes are never logged and never written to audit metadata.
 *
 * This phase only builds the isolated foundation: nothing in the check-in /
 * check-out flow calls these functions yet.
 */

export interface AttendancePhotoMeta {
  id: string;
  organizationId: string;
  attendanceId: string;
  capturedAt: Date;
  expiresAt: Date;
  mimeType: string;
  createdAt: Date;
}

export interface StoredAttendancePhoto extends AttendancePhotoMeta {
  data: Buffer;
}

export interface CreateAttendancePhotoInput {
  /** Authenticated session organization — never a client value. */
  organizationId: string;
  /** Must belong to `organizationId` (verified before insert). */
  attendanceId: string;
  /** First instant of the next local attendance day (see endOfAttendanceDay). */
  expiresAt: Date;
  /** Server capture instant. Defaults to now when omitted. */
  capturedAt?: Date;
  /** Only `image/jpeg` is accepted at this phase. */
  mimeType?: string;
  data: Buffer;
}

/**
 * Store one transient attendance photo for an attendance record that belongs
 * to `organizationId`.
 *
 * Returns the stored row metadata, or `null` when the attendance record does
 * not exist in that organization (fail closed — nothing is written).
 */
export async function createAttendancePhoto(
  input: CreateAttendancePhotoInput
): Promise<AttendancePhotoMeta | null> {
  return db.transaction(async (tx) => {
    const attendanceRows = await tx
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.id, input.attendanceId),
          eq(attendanceRecords.organizationId, input.organizationId)
        )
      )
      .limit(1);

    if (!attendanceRows[0]) {
      // Cross-organization or unknown attendance: refuse without revealing why.
      return null;
    }

    const inserted = await tx
      .insert(attendancePhotos)
      .values({
        organizationId: input.organizationId,
        attendanceId: input.attendanceId,
        capturedAt: input.capturedAt ?? new Date(),
        expiresAt: input.expiresAt,
        mimeType: input.mimeType ?? ATTENDANCE_PHOTO_MIME_TYPE,
        data: input.data,
      })
      .returning({
        id: attendancePhotos.id,
        organizationId: attendancePhotos.organizationId,
        attendanceId: attendancePhotos.attendanceId,
        capturedAt: attendancePhotos.capturedAt,
        expiresAt: attendancePhotos.expiresAt,
        mimeType: attendancePhotos.mimeType,
        createdAt: attendancePhotos.createdAt,
      });

    return inserted[0] ?? null;
  });
}

/**
 * Fetch the most recent ACTIVE (not-yet-expired) photo for an attendance
 * record inside `organizationId`.
 *
 * The expiry guard is part of the SQL (`expires_at > now()`): an expired row
 * that has not been purged yet is still reported as ABSENT.
 */
export async function getActiveAttendancePhoto(
  organizationId: string,
  attendanceId: string
): Promise<StoredAttendancePhoto | null> {
  const rows = await db
    .select()
    .from(attendancePhotos)
    .where(
      and(
        eq(attendancePhotos.organizationId, organizationId),
        eq(attendancePhotos.attendanceId, attendanceId),
        sql`${attendancePhotos.expiresAt} > now()`
      )
    )
    .orderBy(desc(attendancePhotos.capturedAt))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Delete one attendance photo by its id, scoped to `organizationId`.
 * Idempotent: deleting an unknown/already-deleted id returns 0.
 */
export async function deleteAttendancePhoto(
  organizationId: string,
  attendancePhotoId: string
): Promise<number> {
  const deleted = await db
    .delete(attendancePhotos)
    .where(
      and(
        eq(attendancePhotos.organizationId, organizationId),
        eq(attendancePhotos.id, attendancePhotoId)
      )
    )
    .returning({ id: attendancePhotos.id });

  return deleted.length;
}

/**
 * Deterministic purge of all expired attendance photos across every
 * organization: `DELETE WHERE expires_at <= now()`.
 *
 * Idempotent and safe to run repeatedly. Scheduling (cron/worker/timer) is
 * intentionally NOT wired in this phase — this function is the reusable
 * primitive a later phase will invoke.
 */
export async function deleteExpiredAttendancePhotos(): Promise<number> {
  const deleted = await db
    .delete(attendancePhotos)
    .where(sql`${attendancePhotos.expiresAt} <= now()`)
    .returning({ id: attendancePhotos.id });

  return deleted.length;
}
