/**
 * PHASE 10.7C-55 — Attendance-photo validation tests (node:test).
 *
 * Pins the pure JPEG policy boundary: image/jpeg only, ≤ 900,000 bytes,
 * non-empty, with the JPEG magic-byte signature (FF D8 FF). No image bytes
 * are ever exposed through assertions/messages.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ATTENDANCE_PHOTO_MAX_BYTES,
  ATTENDANCE_PHOTO_MIME_TYPE,
  hasJpegSignature,
  validateAttendancePhoto,
} from "../../lib/attendance/attendance-photo.ts";

/** Minimal valid JPEG-prefixed payload (3 magic bytes + 0xE0 marker byte). */
function jpegBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (length >= 3) {
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
  }
  if (length >= 4) {
    bytes[3] = 0xe0;
  }
  return bytes;
}

describe("attendance photo validation: PASS cases", () => {
  it("accepts a small JPEG under 900 KB", () => {
    const result = validateAttendancePhoto({
      mimeType: ATTENDANCE_PHOTO_MIME_TYPE,
      data: jpegBytes(64),
    });
    assert.equal(result.ok, true);
  });

  it("accepts exactly 900,000 bytes (boundary)", () => {
    const result = validateAttendancePhoto({
      mimeType: ATTENDANCE_PHOTO_MIME_TYPE,
      data: jpegBytes(ATTENDANCE_PHOTO_MAX_BYTES),
    });
    assert.equal(result.ok, true);
  });

  it("normalizes MIME case and surrounding whitespace", () => {
    const result = validateAttendancePhoto({
      mimeType: "  IMAGE/JPEG  ",
      data: jpegBytes(64),
    });
    assert.equal(result.ok, true);
  });

  it("accepts a Buffer (Buffer extends Uint8Array)", () => {
    const buffer = Buffer.from(jpegBytes(64));
    const result = validateAttendancePhoto({
      mimeType: ATTENDANCE_PHOTO_MIME_TYPE,
      data: buffer,
    });
    assert.equal(result.ok, true);
  });

  it("hasJpegSignature detects the FF D8 FF prefix", () => {
    assert.equal(hasJpegSignature(jpegBytes(4)), true);
    assert.equal(hasJpegSignature(new Uint8Array([0x00, 0x01, 0x02])), false);
    assert.equal(hasJpegSignature(new Uint8Array(0)), false);
  });
});

describe("attendance photo validation: FAIL cases", () => {
  it("rejects empty data", () => {
    const result = validateAttendancePhoto({
      mimeType: ATTENDANCE_PHOTO_MIME_TYPE,
      data: new Uint8Array(0),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "empty");
  });

  it("rejects data over 900,000 bytes", () => {
    const result = validateAttendancePhoto({
      mimeType: ATTENDANCE_PHOTO_MIME_TYPE,
      data: jpegBytes(ATTENDANCE_PHOTO_MAX_BYTES + 1),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "too_large");
  });

  it("rejects image/png", () => {
    const result = validateAttendancePhoto({ mimeType: "image/png", data: jpegBytes(64) });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unsupported_mime");
  });

  it("rejects image/webp", () => {
    const result = validateAttendancePhoto({ mimeType: "image/webp", data: jpegBytes(64) });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unsupported_mime");
  });

  it("rejects text/plain", () => {
    const result = validateAttendancePhoto({ mimeType: "text/plain", data: jpegBytes(64) });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unsupported_mime");
  });

  it("rejects arbitrary binary that lacks the JPEG signature even when MIME says image/jpeg", () => {
    const result = validateAttendancePhoto({
      mimeType: ATTENDANCE_PHOTO_MIME_TYPE,
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_jpeg");
  });

  it("rejects non-Uint8Array input", () => {
    const result = validateAttendancePhoto({
      mimeType: ATTENDANCE_PHOTO_MIME_TYPE,
      data: { not: "bytes" } as unknown as Uint8Array,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_input");
  });

  it("rejects a missing/empty MIME type", () => {
    const result = validateAttendancePhoto({ mimeType: "", data: jpegBytes(64) });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unsupported_mime");
  });
});
