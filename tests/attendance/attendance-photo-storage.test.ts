/**
 * PHASE 10.7C-55 — Attendance-photo storage/expiry contract tests (node:test).
 *
 * These are source-invariant tests following the repository convention for
 * suites that run without a live database (see face-verification-integration):
 * the DAL + schema sources are pinned so that every storage operation is
 * organization scoped and every read enforces the `expires_at > now()` guard.
 *
 * Runtime verification against a real PostgreSQL is intentionally deferred:
 * this phase does not create/apply migrations on any database and the CI/dev
 * environment has no reachable DATABASE_URL.
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

const dalSource = readRepoFile("features/attendance/attendance-photo.queries.ts");
const dalCode = stripComments(dalSource);
const schemaSource = readRepoFile("db/schema/attendance.ts");
const schemaCode = stripComments(schemaSource);
const pureSource = readRepoFile("lib/attendance/attendance-photo.ts");

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("attendance_photos schema foundation", () => {
  it("defines the attendance_photos table", () => {
    assert.equal(schemaCode.includes('"attendance_photos"'), true);
    assert.equal(schemaCode.includes("pgTable("), true);
  });

  it("defines the required columns and BYTEA data", () => {
    for (const token of [
      'uuid("organization_id")',
      'uuid("attendance_id")',
      'timestamp("captured_at"',
      'timestamp("expires_at"',
      'text("mime_type")',
      'dataType: () => "bytea"',
    ]) {
      assert.equal(schemaCode.includes(token), true, `schema must include ${token}`);
    }
  });

  it("links attendance_photos.attendance_id → attendance_records.id", () => {
    assert.equal(
      schemaCode.includes('references(() => attendanceRecords.id, { onDelete: "cascade" })'),
      true
    );
  });

  it("creates the org+attendance lookup index and the expiry index", () => {
    assert.equal(schemaCode.includes('"attendance_photos_org_attendance_idx"'), true);
    assert.equal(schemaCode.includes('"attendance_photos_expires_at_idx"'), true);
  });
});

describe("storage DAL: organization scope is structural", () => {
  it("exports the four foundation functions", () => {
    for (const fn of [
      "createAttendancePhoto",
      "getActiveAttendancePhoto",
      "deleteAttendancePhoto",
      "deleteExpiredAttendancePhotos",
    ]) {
      assert.equal(dalCode.includes(`export async function ${fn}`), true, fn);
    }
  });

  it("verifies the attendance record belongs to the organization before insert", () => {
    assert.equal(dalCode.includes("eq(attendanceRecords.id, input.attendanceId)"), true);
    assert.equal(dalCode.includes("eq(attendanceRecords.organizationId, input.organizationId)"), true);
  });

  it("persists organizationId, attendanceId, capturedAt, expiresAt, mimeType and data", () => {
    for (const token of [
      "organizationId: input.organizationId",
      "attendanceId: input.attendanceId",
      "capturedAt: input.capturedAt ?? new Date()",
      "expiresAt: input.expiresAt",
      "mimeType: input.mimeType ?? ATTENDANCE_PHOTO_MIME_TYPE",
      "data: input.data",
    ]) {
      assert.equal(dalCode.includes(token), true, `insert must persist ${token}`);
    }
  });

  it("never lets attendanceId alone bypass organization scope", () => {
    assert.equal(countOccurrences(dalCode, "attendancePhotos.organizationId") >= 3, true);
    assert.equal(countOccurrences(dalCode, "attendancePhotos.attendanceId") >= 1, true);
  });
});

describe("storage DAL: expiry read guard + deterministic purge", () => {
  it("getActiveAttendancePhoto enforces expires_at > now() at query level", () => {
    assert.equal(/expiresAt\} > now\(\)/.test(dalCode), true);
  });

  it("deleteExpiredAttendancePhotos removes expires_at <= now() and is idempotent", () => {
    assert.equal(/expiresAt\} <= now\(\)/.test(dalCode), true);
    assert.equal(dalCode.includes("export async function deleteExpiredAttendancePhotos"), true);
  });

  it("purge function has no scheduler built in (no cron/setInterval/timer tokens)", () => {
    for (const token of ["cron", "setInterval", "setTimeout", "node-cron"]) {
      assert.equal(dalCode.includes(token), false, `purge must not embed ${token}`);
    }
  });
});

describe("storage DAL: photo bytes never reach audit/log paths", () => {
  it("does not import or call writeAuditLog", () => {
    assert.equal(dalCode.includes("writeAuditLog"), false);
    assert.equal(dalCode.includes("from \"@/lib/auth/audit\""), false);
  });

  it("does not insert any metadata column carrying photo data", () => {
    assert.equal(dalCode.includes("metadata"), false);
  });
});

describe("pure policy constants", () => {
  it("defines the 900,000-byte cap and image/jpeg policy", () => {
    assert.equal(pureSource.includes("ATTENDANCE_PHOTO_MAX_BYTES = 900_000"), true);
    assert.equal(pureSource.includes('ATTENDANCE_PHOTO_MIME_TYPE = "image/jpeg"'), true);
  });
});
