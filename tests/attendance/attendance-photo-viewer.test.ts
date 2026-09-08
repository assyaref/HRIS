/**
 * PHASE 10.7C-57 — Management/HR attendance photo viewer tests (node:test).
 *
 * Source-invariant tests (repository convention for suites without a live
 * database/server) that pin the authenticated viewer boundary:
 * - route handler: session auth + ATTENDANCE_MANAGE + session-org scope +
 *   org-scoped active-photo lookup; returns raw image/jpeg bytes with
 *   private,no-store + nosniff headers; never Base64/data URL; no public or
 *   client-authority inputs.
 * - client: ephemeral object URL only (fetch no-store → blob →
 *   createObjectURL → <img> → revokeObjectURL); no persistence, no download.
 * - detail page: viewer is rendered only under the management branch.
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

const routeSource = readRepoFile(
  "app/api/attendance/[attendanceId]/photo/route.ts"
);
const routeCode = stripComments(routeSource);
const viewerSource = readRepoFile("features/attendance/attendance-photo-view.tsx");
const viewerCode = stripComments(viewerSource);
const detailPageSource = readRepoFile(
  "app/(dashboard)/attendance/[attendanceId]/page.tsx"
);

describe("photo route: authorization is mandatory and server-authoritative", () => {
  it("authenticates via the session and checks ATTENDANCE_MANAGE", () => {
    assert.match(routeCode, /getCurrentUser\(\)/);
    assert.match(
      routeCode,
      /hasPermission\(user\.id,\s*PERMISSIONS\.ATTENDANCE_MANAGE\)/
    );
    assert.equal(routeCode.includes('status: 401'), true);
    assert.equal(routeCode.includes('status: 403'), true);
  });

  it("never trusts a client-supplied organization/employee/photoId", () => {
    for (const key of ["organizationId", "employeeId", "photoId", "expiresAt"]) {
      assert.equal(
        routeCode.includes(`"${key}"`),
        true,
        `route must reject ${key} query param`
      );
    }
    assert.equal(routeCode.includes("search.has(key)"), true);
  });

  it("derives the organization from the session and scopes the lookup", () => {
    assert.match(
      routeCode,
      /getActiveAttendancePhoto\(user\.organizationId,\s*attendanceId\)/
    );
    assert.equal(routeCode.includes('if (!user.organizationId)'), true);
  });

  it("validates the attendance id shape and hides existence with 404", () => {
    assert.match(routeCode, /ATTENDANCE_ID_PATTERN/);
    assert.equal(routeCode.includes('status: 404'), true);
  });
});

describe("photo route: raw JPEG bytes, secure headers, no text transport", () => {
  it("returns Content-Type image/jpeg", () => {
    assert.match(routeCode, /"Content-Type": "image\/jpeg"/);
  });

  it("sets Cache-Control private,no-store", () => {
    assert.match(routeCode, /"Cache-Control": "private, no-store"/);
  });

  it("sets X-Content-Type-Options nosniff", () => {
    assert.match(routeCode, /"X-Content-Type-Options": "nosniff"/);
  });

  it("returns raw bytes and never Base64/data URL", () => {
    assert.match(routeCode, /new Uint8Array\(photo\.data\)/);
    assert.equal(routeCode.includes("base64"), false);
    assert.equal(routeCode.includes("data:image"), false);
    assert.equal(routeCode.includes("toDataURL"), false);
  });
});

describe("photo viewer client: ephemeral object URL only", () => {
  it("fetches with no-store and renders from response.blob()", () => {
    assert.match(viewerCode, /fetch\(/);
    assert.equal(viewerCode.includes('cache: "no-store"'), true);
    assert.match(viewerCode, /response\.blob\(\)/);
    assert.match(viewerCode, /URL\.createObjectURL\(blob\)/);
  });

  it("revokes the object URL (unmount/replacement) and never persists it", () => {
    assert.match(viewerCode, /URL\.revokeObjectURL\(/);
    assert.equal(viewerCode.includes("localStorage"), false);
    assert.equal(viewerCode.includes("sessionStorage"), false);
    assert.equal(viewerCode.includes("indexedDB"), false);
  });

  it("uses no toDataURL/data URL/Base64 and no download", () => {
    assert.equal(viewerCode.includes("toDataURL"), false);
    assert.equal(viewerCode.includes("data:image"), false);
    assert.equal(viewerCode.includes("base64"), false);
    assert.equal(viewerCode.includes("download="), false);
  });

  it("asks only for the attendanceId resource", () => {
    assert.equal(viewerCode.includes("organizationId"), false);
    assert.equal(viewerCode.includes("employeeId"), false);
  });
});

describe("attendance detail page shows the viewer only for managers", () => {
  it("renders AttendancePhotoView inside the isManager branch", () => {
    assert.equal(detailPageSource.includes("{isManager ? ("), true);
    assert.equal(detailPageSource.includes("AttendancePhotoView"), true);
    const guardIndex = detailPageSource.indexOf("{isManager ? (");
    const lastUsage = detailPageSource.lastIndexOf("AttendancePhotoView");
    assert.equal(lastUsage > guardIndex, true);
  });

  it("adds no photo data to the page payload", () => {
    assert.equal(detailPageSource.includes("base64"), false);
    assert.equal(detailPageSource.includes("data:image"), false);
  });
});
