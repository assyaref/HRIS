/**
 * PHASE 10.7C-57 — Viewer expiry boundary, tenant isolation and allowed roles.
 *
 * - Deterministic half-open expiry tests (no system clock).
 * - Role matrix: ADMIN/MANAGEMENT/HR hold ATTENDANCE_MANAGE; SUPERVISOR and
 *   EMPLOYEE must not (so the viewer's ATTENDANCE_MANAGE gate denies them).
 * - The DAL read guard and the route's generic not-found behavior are pinned
 *   at the source level.
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

describe("expiry boundary is deterministic and half-open (server semantics)", () => {
  // 2026-09-09 00:00 Asia/Jakarta
  const expiresAt = new Date("2026-09-08T17:00:00.000Z");

  it("is available at expiresAt − 1ms", () => {
    const now = new Date(expiresAt.getTime() - 1);
    assert.equal(isAttendancePhotoActive(expiresAt, now), true);
    assert.equal(isAttendancePhotoExpired(expiresAt, now), false);
  });

  it("is unavailable exactly at expiresAt", () => {
    assert.equal(isAttendancePhotoActive(expiresAt, expiresAt), false);
    assert.equal(isAttendancePhotoExpired(expiresAt, expiresAt), true);
  });

  it("is unavailable at expiresAt + 1ms", () => {
    const now = new Date(expiresAt.getTime() + 1);
    assert.equal(isAttendancePhotoActive(expiresAt, now), false);
    assert.equal(isAttendancePhotoExpired(expiresAt, now), true);
  });
});

describe("server enforces expiry at the query layer, not by cleanup", () => {
  it("DAL getActiveAttendancePhoto filters expires_at > now()", () => {
    const dal = stripComments(
      readRepoFile("features/attendance/attendance-photo.queries.ts")
    );
    assert.match(dal, /expiresAt\} > now\(\)/);
  });
});

describe("role matrix allows ADMIN/MANAGEMENT/HR and denies SUPERVISOR/EMPLOYEE", () => {
  const seed = readRepoFile("scripts/seed-rbac.mts");

  function roleBlock(roleCode: string): string {
    const startMarker = `[ROLE_CODES.${roleCode}]: [`;
    const start = seed.indexOf(startMarker);
    assert.ok(start >= 0, `role ${roleCode} must exist`);
    const nextRole = seed.indexOf("[ROLE_CODES.", start + startMarker.length);
    const end = nextRole >= 0 ? nextRole : seed.indexOf("};", start);
    return seed.slice(start, end);
  }

  for (const allowed of ["ADMIN", "MANAGEMENT", "HR"]) {
    it(`allows ATTENDANCE_MANAGE for ${allowed}`, () => {
      assert.equal(
        roleBlock(allowed).includes("PERMISSIONS.ATTENDANCE_MANAGE"),
        true
      );
    });
  }

  for (const denied of ["SUPERVISOR", "EMPLOYEE"]) {
    it(`denies ATTENDANCE_MANAGE for ${denied}`, () => {
      assert.equal(
        roleBlock(denied).includes("PERMISSIONS.ATTENDANCE_MANAGE"),
        false
      );
    });
  }
});

describe("tenant isolation never reveals foreign attendance", () => {
  it("route returns the same generic Not Found for missing/foreign/expired photos", () => {
    const route = stripComments(
      readRepoFile("app/api/attendance/[attendanceId]/photo/route.ts")
    );
    assert.equal(route.includes('"Not Found"'), true);
    // No message differentiates "exists in another organization".
    for (const leak of [
      "belongs to another organization",
      "exists in another organization",
      "cross-organization",
    ]) {
      assert.equal(route.includes(leak), false, `must not reveal: ${leak}`);
    }
  });
});
