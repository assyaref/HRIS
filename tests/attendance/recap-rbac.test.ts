/**
 * Attendance Recap — RBAC + scoping contract tests (node:test).
 *
 * Source-invariant assertions, mirroring
 * tests/employees/employee-import-export-rbac.test.ts and
 * tests/employees/employee-delete-rbac.test.ts. The recap page and the
 * export route must stay gated on `attendance.manage`, always resolve the
 * organization from the authenticated session, never accept a client-
 * supplied organization id, and audit exports.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const recapPageSource = readRepoFile(
  "app/(dashboard)/attendance/recap/page.tsx"
);
const detailPageSource = readRepoFile(
  "app/(dashboard)/attendance/recap/[employeeId]/page.tsx"
);
const exportRouteSource = readRepoFile(
  "app/api/attendance/recap/export/route.ts"
);
const queriesSource = readRepoFile("features/attendance/recap.queries.ts");
const auditSource = readRepoFile("lib/auth/audit.ts");
const navigationSource = readRepoFile("components/layout/navigation.ts");

describe("recap list page: RBAC + scoping", () => {
  it("requires the authenticated user", () => {
    assert.equal(recapPageSource.includes("requireUser()"), true);
  });

  it("requires the attendance.manage capability", () => {
    assert.equal(
      recapPageSource.includes(
        "await requirePermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE)"
      ),
      true
    );
  });

  it("scopes every query to the session organization", () => {
    assert.equal(recapPageSource.includes("organizationId = user.organizationId"), true);
    assert.equal(recapPageSource.includes("organizationId"), true);
    // Queries receive the session org — never a client-supplied value.
    assert.equal(recapPageSource.includes('params.organizationId'), false);
  });
});

describe("recap detail page: RBAC + scoping", () => {
  it("requires the attendance.manage capability", () => {
    assert.equal(
      detailPageSource.includes(
        "await requirePermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE)"
      ),
      true
    );
  });

  it("loads the employee through the org-scoped detail query", () => {
    assert.equal(
      detailPageSource.includes("getEmployeeAttendanceRecapDetail("),
      true
    );
  });
});

describe("recap export route: RBAC + scoping + audit", () => {
  it("requires attendance.manage", () => {
    assert.equal(
      exportRouteSource.includes(
        "hasPermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE)"
      ),
      true
    );
  });

  it("rejects client-supplied tenant/authority identifiers", () => {
    assert.equal(exportRouteSource.includes("FORBIDDEN_QUERY_KEYS"), true);
    assert.equal(exportRouteSource.includes('"organizationId"'), true);
    assert.equal(exportRouteSource.includes('"employeeId"'), true);
    assert.equal(exportRouteSource.includes("Bad Request"), true);
  });

  it("writes the attendance.recap.exported audit event", () => {
    assert.equal(
      exportRouteSource.includes('action: "attendance.recap.exported"'),
      true
    );
    assert.equal(auditSource.includes('"attendance.recap.exported"'), true);
  });
});

describe("recap query layer", () => {
  it("scopes every statement to the organization", () => {
    assert.ok(
      (queriesSource.match(/e\.organization_id = \$\{organizationId\}::uuid/g) ?? [])
        .length >= 1
    );
    assert.ok(
      (queriesSource.match(
        /lr\.organization_id = \$\{organizationId\}::uuid/g
      ) ?? []).length >= 1
    );
    assert.ok(
      (queriesSource.match(
        /ar\.organization_id = \$\{organizationId\}::uuid/g
      ) ?? []).length >= 1
    );
  });

  it("expands expected working days via a calendar CTE", () => {
    assert.equal(queriesSource.includes("calendar AS"), true);
    assert.equal(queriesSource.includes("EXTRACT(ISODOW FROM d) < 6"), true);
  });

  it("classifies days in one place, with accepted attendance first", () => {
    assert.equal(queriesSource.includes("WHEN df.attendance_id IS NOT NULL THEN 'present'"), true);
    assert.equal(queriesSource.includes("WHEN df.has_leave AND df.is_sick_leave THEN 'sick'"), true);
    assert.equal(queriesSource.includes("WHEN df.has_permission THEN 'permission'"), true);
    assert.equal(queriesSource.includes("ELSE 'absent'"), true);
  });

  it("imports the shared recap constants instead of duplicating them", () => {
    assert.equal(queriesSource.includes("LATE_CHECK_IN_LOCAL_CUTOFF"), true);
    assert.equal(queriesSource.includes("SICK_LEAVE_TYPE_CODE_PATTERN"), true);
    assert.equal(queriesSource.includes('from "./recap"'), true);
  });
});

describe("navigation", () => {
  it("exposes the recap entry when the user holds attendance.manage", () => {
    assert.equal(navigationSource.includes('href: "/attendance/recap"'), true);
    assert.equal(
      navigationSource.includes("permission: PERMISSIONS.ATTENDANCE_MANAGE"),
      true
    );
  });
});
