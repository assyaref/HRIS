/**
 * PHASE 10.7C-58 — Attendance photo purge tests (node:test).
 *
 * Source-invariant + pure tests (repository convention for suites without a
 * live database). They pin:
 * - expiry eligibility is half-open and deterministic (expired at
 *   `expires_at <= now()`);
 * - the purge script deletes ONLY `attendance_photos` expired rows, is
 *   idempotent, reports a deterministic deleted count, fails non-zero on
 *   errors, and never logs image bytes;
 * - the DAL predicate and the script predicate cannot drift;
 * - the Phase-57 viewer read guard stays server-authoritative even when the
 *   purge has not run.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isAttendancePhotoActive,
  isAttendancePhotoExpired,
} from "../../lib/attendance/attendance-photo.ts";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const script = stripComments(readRepoFile("scripts/attendance-photo-purge.mjs"));
const dal = stripComments(
  readRepoFile("features/attendance/attendance-photo.queries.ts")
);

describe("purge eligibility is half-open and deterministic", () => {
  const expiresAt = new Date("2026-09-08T17:00:00.000Z");

  it("expired row (expiresAt + 1ms) is a deletion candidate", () => {
    assert.equal(isAttendancePhotoExpired(expiresAt, new Date(expiresAt.getTime() + 1)), true);
    assert.equal(isAttendancePhotoActive(expiresAt, new Date(expiresAt.getTime() + 1)), false);
  });

  it("unexpired row (expiresAt - 1ms) is never a deletion candidate", () => {
    assert.equal(isAttendancePhotoExpired(expiresAt, new Date(expiresAt.getTime() - 1)), false);
    assert.equal(isAttendancePhotoActive(expiresAt, new Date(expiresAt.getTime() - 1)), true);
  });

  it("exactly-at-expiry row (expiresAt) is a deletion candidate", () => {
    assert.equal(isAttendancePhotoExpired(expiresAt, expiresAt), true);
  });
});

describe("purge script targets ONLY expired attendance_photos rows", () => {
  it("executes exactly one DELETE on attendance_photos", () => {
    assert.equal(countOccurrences(script, "DELETE FROM"), 1);
    assert.equal(script.includes('DELETE FROM "attendance_photos"'), true);
  });

  it("applies the expires_at <= now() predicate", () => {
    assert.equal(script.includes('"expires_at" <= now()'), true);
  });

  it("never deletes or mutates other tables", () => {
    for (const token of [
      'DELETE FROM "attendance_records"',
      'DELETE FROM "employees"',
      'DELETE FROM "face',
      "INSERT INTO",
      "UPDATE ",
    ]) {
      assert.equal(script.includes(token), false, `script must not ${token}`);
    }
    assert.equal(script.includes("attendance_records"), false);
    assert.equal(script.includes("face_enrollment"), false);
  });

  it("parity: script and DAL use the same <= now() expiry predicate", () => {
    assert.equal(script.includes("<= now()"), true);
    assert.equal(dal.includes("<= now()"), true);
  });
});

describe("purge is idempotent and reports a deterministic count", () => {
  it("reports deleted_count from the database rowCount", () => {
    assert.equal(script.includes("result.rowCount"), true);
    assert.equal(script.includes("deleted_count="), true);
  });

  it("DAL deleteExpiredAttendancePhotos returns the deleted count", () => {
    assert.equal(dal.includes("export async function deleteExpiredAttendancePhotos"), true);
    assert.equal(dal.includes("return deleted.length;"), true);
  });

  it("is a run-once maintenance operation (no embedded scheduler)", () => {
    for (const token of ["setInterval", "setTimeout", "cron", "node-cron", "systemd"]) {
      assert.equal(script.includes(token), false, `script must not embed ${token}`);
    }
  });
});

describe("purge failure behavior is loud, never swallowed", () => {
  it("exits non-zero when DATABASE_URL is missing or the query fails", () => {
    assert.equal(script.includes("process.exit(1)"), true);
    assert.equal(script.includes("process.exitCode = 1"), true);
    assert.equal(script.includes("failed_reason="), true);
  });
});

describe("no image bytes ever leave the purge path", () => {
  it("logs only operational scalars, never bytes/Base64/data URLs", () => {
    assert.equal(script.includes("base64"), false);
    assert.equal(script.includes("data:image"), false);
    assert.equal(script.includes("toString('base64')"), false);
    assert.equal(script.includes("SELECT"), false);
  });
});

describe("viewer stays server-authoritative even when purge has not run", () => {
  it("getActiveAttendancePhoto still filters expires_at > now()", () => {
    assert.equal(dal.includes("> now()"), true);
  });

  it("the phase-57 route headers remain private,no-store + nosniff", () => {
    const route = readRepoFile("app/api/attendance/[attendanceId]/photo/route.ts");
    assert.equal(route.includes("private, no-store"), true);
    assert.equal(route.includes("nosniff"), true);
  });
});
