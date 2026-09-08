/**
 * PHASE 10.7C-56 — Check-in + attendance photo integration tests (node:test).
 *
 * Source-invariant tests (repository convention for suites without a live
 * database) that pin the check-in photo boundary:
 * - the check-in action receives FormData and only ever reads whitelisted
 *   metadata + one optional `photo` Blob (no client authority fields);
 * - photo bytes are validated server-side through the pure boundary;
 * - the photo is inserted inside the SAME transaction as the server-created
 *   attendance record, AFTER geofence/duplicate checks, so failed geofence,
 *   authorization, or duplicate check-in can never leave an orphan photo;
 * - expiresAt derives from endOfAttendanceDay(attendanceDate,
 *   workLocation.timezone) — never capturedAt + 24h;
 * - photo bytes never appear in attendance list/detail DTOs or UI pages.
 *
 * Policy (documented): photo is OPTIONAL at the server in this phase to
 * preserve the existing product behavior; the Check-In UI requires a capture.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

/** Remove comments so assertions target real code, not explanatory text. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const actionSource = readRepoFile("features/attendance/actions.ts");
const actionCode = stripComments(actionSource);
const panelSource = readRepoFile("features/attendance/attendance-panel.tsx");
const panelCode = stripComments(panelSource);

function indexOfCode(needle: string): number {
  return actionCode.indexOf(needle);
}

describe("check-in FormData boundary (server authoritative)", () => {
  it("check-in action accepts FormData and never a metadata object", () => {
    assert.equal(actionSource.includes("export async function checkInAction("), true);
    assert.equal(actionSource.includes("formData: FormData"), true);
    assert.match(actionSource, /function parseCheckInFormData\(/);
  });

  it("check-in UI sends FormData with only whitelisted fields", () => {
    for (const token of [
      'formData.append("projectId"',
      'formData.append("workLocationId"',
      'formData.append("location"',
      'formData.append("photo"',
    ]) {
      assert.equal(panelCode.includes(token), true, `panel must append ${token}`);
    }
  });

  it("panel never appends client authority fields", () => {
    for (const token of [
      'append("employeeId"',
      'append("organizationId"',
      'append("attendanceId"',
      'append("expiresAt"',
      'append("attendanceDate"',
      'append("timezone"',
      'append("geofencePassed"',
      'append("faceVerified"',
    ]) {
      assert.equal(panelCode.includes(token), false, `panel must not append ${token}`);
    }
  });

  it("the server whitelist contains only metadata + photo", () => {
    const match = actionCode.match(/CHECK_IN_FORM_FIELDS = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(match, "CHECK_IN_FORM_FIELDS must exist");
    const setBody = match[1];
    for (const allowed of ["projectId", "workLocationId", "location", "notes", "photo"]) {
      assert.equal(setBody.includes(`"${allowed}"`), true, `whitelist must allow ${allowed}`);
    }
    for (const forbidden of ["employeeId", "organizationId", "attendanceId", "expiresAt", "attendanceDate", "timezone"]) {
      assert.equal(setBody.includes(`"${forbidden}"`), false, `whitelist must reject ${forbidden}`);
    }
  });

  it("the action never reads a client authority field from FormData", () => {
    for (const token of [
      'formData.get("employeeId")',
      'formData.get("organizationId")',
      'formData.get("attendanceId")',
      'formData.get("expiresAt")',
      'formData.get("attendanceDate")',
      'formData.get("timezone")',
    ]) {
      assert.equal(actionCode.includes(token), false, `action must not read ${token}`);
    }
  });
});

describe("server-side photo validation reuses the pure boundary", () => {
  it("validates MIME + size + JPEG signature through validateAttendancePhoto", () => {
    assert.match(actionCode, /validateAttendancePhoto\(\{ mimeType: file\.type, data \}\)/);
    assert.match(actionCode, /attendancePhotoRejectionMessage\(/);
    assert.match(actionCode, /ATTENDANCE_PHOTO_MIME_TYPE/);
  });

  it("rejects a photo part that is not a Blob-like file", () => {
    assert.match(actionCode, /typeof candidate\.arrayBuffer !== "function"/);
  });

  it("treats an absent photo as optional (policy documented)", () => {
    assert.match(actionCode, /if \(part === null\)/);
    assert.match(actionCode, /photo: null/);
  });
});

describe("attendance + photo atomicity and expiry", () => {
  const recordInsertAt = indexOfCode("insert(attendanceRecords)");
  const recordIdAt = indexOfCode("const recordId");
  const photoInsertAt = indexOfCode("insert(attendancePhotos)");

  it("photo insert happens strictly after the server attendance record insert", () => {
    assert.ok(recordInsertAt >= 0 && recordIdAt >= 0 && photoInsertAt >= 0);
    assert.equal(recordIdAt > recordInsertAt, true);
    assert.equal(photoInsertAt > recordIdAt, true);
  });

  it("geofence and duplicate checks happen before any photo write", () => {
    const geofenceAt = indexOfCode("evaluateGeofence(");
    const duplicateMessageAt = indexOfCode("You already have an open check-in.");
    const dayDuplicateAt = indexOfCode("You have already checked in for this day.");
    assert.ok(geofenceAt >= 0 && duplicateMessageAt >= 0 && dayDuplicateAt >= 0);
    assert.equal(geofenceAt < photoInsertAt, true);
    assert.equal(duplicateMessageAt < photoInsertAt, true);
    assert.equal(dayDuplicateAt < photoInsertAt, true);
  });

  it("expiresAt derives from endOfAttendanceDay(attendanceDate, workLocation.timezone)", () => {
    assert.match(
      actionCode,
      /expiresAt: endOfAttendanceDay\(attendanceDate, workLocation\.timezone\)/
    );
    assert.match(actionCode, /dateStringInTimeZone\(now, workLocation\.timezone\)/);
    assert.match(actionCode, /capturedAt: now/);
    assert.match(actionCode, /attendanceId: recordId/);
    assert.match(actionCode, /data: attendancePhoto\.data/);
  });

  it("never computes capturedAt + 24h or a 23:59:59 expiry", () => {
    assert.equal(actionCode.includes("setHours(23, 59, 59"), false);
    assert.equal(actionCode.includes("24 * 60 * 60 * 1000"), false);
    assert.equal(actionCode.includes("capturedAt.getTime() +"), false);
  });
});

describe("photo never leaks into attendance DTOs or UI pages", () => {
  it("queries DTOs (AttendanceRow/Detail) carry no photo fields", () => {
    const queries = readRepoFile("features/attendance/queries.ts");
    assert.equal(queries.includes("photoData"), false);
    assert.equal(queries.includes("photoUrl"), false);
    assert.equal(queries.includes("attendancePhotos"), false);
  });

  it("management and detail pages render no photo image or viewer", () => {
    const management = readRepoFile("app/(dashboard)/attendance/management/page.tsx");
    const detail = readRepoFile("app/(dashboard)/attendance/[attendanceId]/page.tsx");
    for (const source of [management, detail]) {
      assert.equal(source.includes("<img"), false);
      assert.equal(source.includes("createObjectURL"), false);
    }
  });

  it("photo persistence is bound to the transaction, not to audit metadata", () => {
    assert.equal(actionCode.includes("writeAuditLog"), true); // existing audit call is kept
    const photoBlockStart = indexOfCode("if (attendancePhoto) {");
    const photoBlockEnd = indexOfCode("return { duplicate: false, message: null, id: recordId };");
    const block = actionCode.slice(photoBlockStart, photoBlockEnd);
    assert.equal(block.includes("writeAuditLog"), false);
    assert.equal(block.includes("metadata"), false);
  });
});
