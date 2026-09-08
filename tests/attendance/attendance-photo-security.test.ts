/**
 * PHASE 10.7C-55 — Attendance-photo anti-regression security tests (node:test).
 *
 * Pins that the temporary attendance-photo foundation does NOT reintroduce
 * the Radiant Lucky Draw architecture:
 *
 *   ✗ toDataURL / data:image / base64 JSON transport
 *   ✗ browser storage (localStorage / sessionStorage / IndexedDB)
 *   ✗ filesystem image storage / object URLs / public URLs / HTTP route
 *   ✓ server-side PostgreSQL BYTEA is the INTENDED mechanism (not banned)
 *
 * Camera components are also re-scanned so this phase leaves them
 * preview-only and capture-free.
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

const attendanceClientFiles = [
  "features/attendance/attendance-panel.tsx",
  "features/attendance/attendance-camera.tsx",
  "features/attendance/attendance-photo-capture.tsx",
  "features/attendance/location-capture.tsx",
  "features/employees/face-enrollment-camera.tsx",
];

const attendanceServerFiles = [
  "features/attendance/attendance-photo.queries.ts",
  "lib/attendance/attendance-photo.ts",
  "lib/attendance/time.ts",
  "db/schema/attendance.ts",
];

const BANNED_CLIENT_TOKENS = [
  "toDataURL",
  "data:image",
  "createObjectURL",
  "localStorage",
  "sessionStorage",
  "indexedDB",
];

const BANNED_STORAGE_TOKENS = [
  "writeFileSync",
  "appendFileSync",
  "createWriteStream",
  "node:crypto",
  "from \"node:fs\"",
];

describe("no Lucky Draw client transport pattern", () => {
  for (const file of attendanceClientFiles) {
    const code = stripComments(readRepoFile(file));
    for (const token of BANNED_CLIENT_TOKENS) {
      it(`${file} contains no ${token}`, () => {
        assert.equal(code.includes(token), false, `${file} must not contain ${token}`);
      });
    }
  }
});

describe("server modules stay pure storage primitives (no filesystem/route/browser APIs)", () => {
  for (const file of attendanceServerFiles) {
    const code = stripComments(readRepoFile(file));
    for (const token of [...BANNED_STORAGE_TOKENS, ...BANNED_CLIENT_TOKENS]) {
      it(`${file} contains no ${token}`, () => {
        assert.equal(code.includes(token), false, `${file} must not contain ${token}`);
      });
    }
    it(`${file} defines no public HTTP route handler`, () => {
      for (const token of ["NextResponse", "export async function GET", "export async function POST"]) {
        assert.equal(code.includes(token), false, `${file} must not define ${token}`);
      }
    });
  }
});

describe("attendance photo code never transports Base64 in app payloads", () => {
  for (const file of [
    "features/attendance/attendance-photo.queries.ts",
    "lib/attendance/attendance-photo.ts",
    "db/schema/attendance.ts",
  ]) {
    const code = stripComments(readRepoFile(file));
    it(`${file} contains no base64 usage`, () => {
      assert.equal(code.includes("base64"), false, `${file} must not use base64`);
    });
  }
});

describe("PostgreSQL BYTEA is the intended temporary mechanism (positive guard)", () => {
  it("schema stores photo bytes as bytea via the repository customType convention", () => {
    const schemaCode = stripComments(readRepoFile("db/schema/attendance.ts"));
    assert.equal(schemaCode.includes('dataType: () => "bytea"'), true);
    assert.equal(schemaCode.includes("Buffer"), true);
  });

  it("DAL writes photo bytes as a Buffer through drizzle insert values", () => {
    const dalCode = stripComments(readRepoFile("features/attendance/attendance-photo.queries.ts"));
    assert.equal(dalCode.includes("data: input.data"), true);
    assert.equal(dalCode.includes("Buffer"), true);
  });
});

describe("no attendance photo upload directories are introduced", () => {
  for (const directory of ["uploads", "media", "tmp", "storage", "public/uploads"]) {
    it(`has no ${directory}/ directory reference in attendance code`, () => {
      const attendanceCode =
        stripComments(readRepoFile("features/attendance/attendance-photo.queries.ts")) +
        stripComments(readRepoFile("lib/attendance/attendance-photo.ts"));
      assert.equal(attendanceCode.includes(`${directory}/`), false);
    });
  }
});
