/**
 * PHASE 10.7C-51 — Face verification integration boundaries (node:test).
 *
 * Focused source-invariant tests (this suite runs without a database/engine)
 * that pin the security boundaries where Face Verification meets HRIS flows:
 * - attendance check-in/check-out schemas and actions never accept a client
 *   "verified"/face/geofence claim — employee, org and every server decision
 *   stay server-side;
 * - attendance identity is produced ONLY by the server seam
 *   `verifyAttendanceIdentity` (today: not_configured → persisted as
 *   "unavailable"; it never fabricates "verified");
 * - verification template lookup is org-scoped + ACTIVE-enrollment only
 *   (revoked/cross-org enrollments can never be used);
 * - the management verification action remains RBAC-gated and org-scoped;
 * - the attendance camera component contributes no verification result.
 *
 * Engine/threshold behaviour itself is covered by the existing
 * face-verification, face-verification-security and attendance-presence suites.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

function readRepoFile(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

function assertAbsent(label: string, source: string, token: string): void {
  assert.equal(
    source.includes(token),
    false,
    `${label} must not contain ${JSON.stringify(token)}`
  );
}

/** Remove comments so assertions target real code, not explanatory text. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Extract one balanced function/action from a source file. */
function extractFunctionSource(source: string, marker: string): string {
  const startIndex = source.indexOf(marker);
  assert.ok(startIndex >= 0, `expected to find ${marker}`);
  const bodyStart = source.indexOf("{", startIndex);
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  throw new Error(`could not extract ${marker}`);
}

const attendanceActionSource = readRepoFile("features/attendance/actions.ts");
const attendanceSchemaSource = readRepoFile("features/attendance/schemas.ts");

describe("attendance client can never assert a verification claim", () => {
  const code = stripComments(attendanceActionSource);

  it("check-in/check-out input schemas accept no identity/verification fields", () => {
    for (const token of [
      "faceVerified",
      "verified",
      "similarity",
      "geofencePassed",
      "insideGeofence",
      "employeeId",
      "enrollmentId",
      "distanceMeters",
    ]) {
      assertAbsent("attendance schemas", attendanceSchemaSource, token);
    }
  });

  it("attendance actions never read a client-supplied verified claim or fence flag", () => {
    for (const token of [
      "faceVerified",
      "clientVerified",
      "verifiedFlag",
      "geofencePassed",
      "insideGeofence",
      "similarity",
      "enrollmentId",
    ]) {
      assertAbsent("attendance actions (code)", code, token);
    }
  });

  it("identity and geofence are produced only by the server", () => {
    assert.match(attendanceActionSource, /evaluateGeofence\(/);
    assert.match(attendanceActionSource, /verifyAttendanceIdentity\(/);
    // The persisted verification state always originates from the seam result,
    // never from the request payload.
    assert.match(
      attendanceActionSource,
      /checkInVerificationStatus: verification\.persistedStatus/
    );
    assert.match(
      attendanceActionSource,
      /checkOutVerificationStatus: verification\.persistedStatus/
    );
  });

  it("the attendance panel sends only metadata + a photo Blob, never a verification or identity claim", () => {
    const panel = readRepoFile("features/attendance/attendance-panel.tsx");
    // Check-in travels as FormData (Blob transport); check-out keeps its
    // scalar payload. Neither carries identity, org, date or expiry authority.
    assert.match(panel, /checkInAction\(buildCheckInFormData\(\)/);
    assert.match(panel, /checkOutAction\(\{/);
    assert.match(panel, /formData\.append\("photo"/);
    for (const token of [
      "faceVerified",
      "verified:",
      "similarity",
      'append("image"',
      'append("employeeId"',
      'append("attendanceId"',
      'append("organizationId"',
      'append("expiresAt"',
      'append("attendanceDate"',
      'append("timezone"',
    ]) {
      assertAbsent("attendance panel", panel, token);
    }
  });
});

describe("attendance identity seam never fabricates a verified result", () => {
  const seamFile = readRepoFile("lib/attendance/verification.ts");
  const seam = extractFunctionSource(
    seamFile,
    "export async function verifyAttendanceIdentity("
  );

  it("defaults to not_configured and persists as unavailable", () => {
    assert.match(seam, /status: "not_configured"/);
    assert.match(seam, /persistedStatus: "unavailable"/);
    assert.match(seam, /reason: "identity_verification_not_configured"/);
  });

  it("never returns a fabricated verified/face success from the seam", () => {
    assertAbsent("verification seam body", seam, 'persistedStatus: "verified"');
    assertAbsent("verification seam body", seam, 'status: "verified"');
    assertAbsent("verification seam body", seam, 'method: "face"');
  });
});

describe("verification enrollment boundary is ACTIVE-only and org-scoped", () => {
  const queries = readRepoFile(
    "features/employees/face-verification.queries.ts"
  );

  it("looks up the template for the server-resolved org + employee", () => {
    assert.match(queries, /eq\(employeeFaceEnrollments\.organizationId,\s*organizationId\)/);
    assert.match(queries, /eq\(employeeFaceEnrollments\.employeeId,\s*employeeId\)/);
  });

  it("only ever reads an ACTIVE enrollment (revoked rows are excluded)", () => {
    assert.match(queries, /eq\(employeeFaceEnrollments\.status,\s*"active"\)/);
    // When no ACTIVE row remains (never enrolled OR revoked-only) the query
    // reports the single safe `no_active_enrollment` outcome.
    assert.match(queries, /kind: "no_active_enrollment"/);
  });
});

describe("management verification action stays RBAC + org-scoped", () => {
  const actions = readRepoFile("features/employees/face-verification.actions.ts");

  it("authenticates and authorizes EMPLOYEES_UPDATE before anything else", () => {
    assert.match(actions, /await requireUser\(\)/);
    assert.match(
      actions,
      /await requirePermission\(user\.id,\s*PERMISSIONS\.EMPLOYEES_UPDATE\)/
    );
  });

  it("never accepts a client organizationId or threshold", () => {
    assertAbsent("verification action", actions, 'formData.get("organizationId")');
    assertAbsent("verification action", actions, 'formData.get("threshold")');
    assertAbsent("verification action", actions, 'formData.get("score")');
  });

  it("resolves the employee subject through the org-scoped lookup", () => {
    assert.match(
      actions,
      /getEmployeeInOrganization\(\s*parsed\.data\.employeeId,\s*organizationId\s*\)/
    );
  });
});

describe("attendance camera contributes no verification result", () => {
  const camera = readRepoFile("features/attendance/attendance-camera.tsx");

  it("is a display-only camera with no frame capture or submission", () => {
    for (const token of [
      "toBlob",
      "toDataURL",
      "createObjectURL",
      "checkInAction",
      "checkOutAction",
      "verifyFaceAction",
    ]) {
      assertAbsent("attendance camera", camera, token);
    }
  });
});
