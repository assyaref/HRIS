/**
 * Attendance photo validation + expiry policy (Phase 10.7C-55 foundation).
 *
 * PURE module — no database, no server-only, no browser APIs. It defines the
 * policy boundary for a TRANSIENT, presence-evidence-only attendance photo:
 *
 * - JPEG only (server-side check of both the declared MIME and the binary
 *   signature — the client's `type` field is never trusted alone).
 * - Size cap 900,000 bytes (mirrors the existing face-capture ceiling and the
 *   Next.js Server Action body limit).
 * - Half-open expiry: photo is ACTIVE while `now < expiresAt` and EXPIRED at
 *   `now >= expiresAt`. `expiresAt` = first instant of the next local
 *   attendance day (see `endOfAttendanceDay` in `lib/attendance/time.ts`).
 *
 * This module NEVER contains image bytes in logs, errors, or return values,
 * and it is deliberately unrelated to face templates/embeddings/verification.
 */

export const ATTENDANCE_PHOTO_MIME_TYPE = "image/jpeg";

/** Upper bound for one attendance photo (900 KB), matching FACE_CAPTURE_MAX_BYTES. */
export const ATTENDANCE_PHOTO_MAX_BYTES = 900_000;

/** Reasons an attendance-photo payload is rejected at the policy boundary. */
export const ATTENDANCE_PHOTO_REJECTION_REASONS = [
  "invalid_input",
  "empty",
  "unsupported_mime",
  "too_large",
  "not_jpeg",
] as const;
export type AttendancePhotoRejectionReason =
  (typeof ATTENDANCE_PHOTO_REJECTION_REASONS)[number];

/** Safe Indonesian user-facing messages (never leak image bytes or internals). */
export const ATTENDANCE_PHOTO_REJECTION_MESSAGES: Record<
  AttendancePhotoRejectionReason,
  string
> = {
  invalid_input: "Foto kehadiran tidak valid. Silakan coba lagi.",
  empty: "Foto kehadiran kosong. Silakan ambil ulang foto Anda.",
  unsupported_mime: "Foto kehadiran harus berformat JPEG.",
  too_large:
    "Foto kehadiran terlalu besar. Silakan ambil ulang dengan ukuran lebih kecil.",
  not_jpeg:
    "Foto kehadiran tidak valid. Silakan ambil ulang dengan kamera.",
};

/** Map a photo rejection reason to a safe user-facing Indonesian message. */
export function attendancePhotoRejectionMessage(
  reason: AttendancePhotoRejectionReason
): string {
  return ATTENDANCE_PHOTO_REJECTION_MESSAGES[reason];
}

export interface AttendancePhotoInput {
  /** Declared MIME type (normalized lower-case before comparison). */
  mimeType: string;
  /** Raw photo bytes (Buffer or any Uint8Array). */
  data: Uint8Array;
}

export type AttendancePhotoValidationResult =
  | { ok: true }
  | { ok: false; reason: AttendancePhotoRejectionReason };

/**
 * True when `data` begins with the JPEG magic bytes FF D8 FF.
 * A cheap structural guard only — full JPEG decode is a later hardening phase.
 */
export function hasJpegSignature(data: Uint8Array): boolean {
  return (
    data.byteLength >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  );
}

/**
 * Validate an attendance-photo payload at the server policy boundary.
 *
 * Rules:
 * - MIME must be exactly `image/jpeg` (case-insensitive, trimmed).
 * - Data must be a non-empty Uint8Array/Buffer with byteLength ≤ 900,000.
 * - The binary payload must carry the JPEG signature (FF D8 FF).
 *
 * The current foundation validates MIME + size + signature. Deeper JPEG
 * decoding/transcoding is intentionally deferred to a later hardening phase
 * and no image-processing dependency is introduced here.
 */
export function validateAttendancePhoto(
  input: AttendancePhotoInput
): AttendancePhotoValidationResult {
  if (
    !input ||
    typeof input.mimeType !== "string" ||
    !(input.data instanceof Uint8Array)
  ) {
    return { ok: false, reason: "invalid_input" };
  }

  const mimeType = input.mimeType.trim().toLowerCase();
  if (mimeType !== ATTENDANCE_PHOTO_MIME_TYPE) {
    return { ok: false, reason: "unsupported_mime" };
  }

  const byteLength = input.data.byteLength;
  if (byteLength <= 0) {
    return { ok: false, reason: "empty" };
  }
  if (byteLength > ATTENDANCE_PHOTO_MAX_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  if (!hasJpegSignature(input.data)) {
    return { ok: false, reason: "not_jpeg" };
  }

  return { ok: true };
}

/**
 * Half-open interval semantics — the expiry instant itself is EXPIRED.
 *
 *   photo is ACTIVE when:  now <  expiresAt
 *   photo is EXPIRED when: now >= expiresAt
 *
 * @param now Reference instant (tests pass fixed dates; production passes `new Date()`).
 */
export function isAttendancePhotoExpired(
  expiresAt: Date,
  now: Date
): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/** Inverse of {@link isAttendancePhotoExpired}. */
export function isAttendancePhotoActive(
  expiresAt: Date,
  now: Date
): boolean {
  return now.getTime() < expiresAt.getTime();
}
