/**
 * R19 — Deletion safety coverage and organization isolation (Node `node:test`).
 *
 * Source-invariant assertions over `features/organizations/queries.ts`:
 * - The dependency scan covers EVERY table that references `organizations.id`
 *   across the tenant graph, including protected historical/event and audit
 *   records, so hard deletion can never cascade.
 * - Every count and aggregate is scoped by `organizationId` — one tenant's
 *   numbers can never leak into another's (organization isolation).
 * - The delete server action refuses on foreign-key violations instead of
 *   ever cascading.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const queriesSource = readFileSync(
  path.join(process.cwd(), "features/organizations/queries.ts"),
  "utf8"
);
const actionsSource = readFileSync(
  path.join(process.cwd(), "features/organizations/actions.ts"),
  "utf8"
);

describe("dependency scan: protected tables", () => {
  const protectedTables = [
    "users",
    "employees",
    "roles",
    "attendanceRecords",
    "attendanceEvents",
    "attendancePhotos",
    "leaveTypes",
    "leaveBalances",
    "leaveRequests",
    "leaveRequestEvents",
    "permissionRequests",
    "permissionRequestEvents",
    "payrollPeriods",
    "payrollRuns",
    "payrollItems",
    "payrollEvents",
    "payslips",
    "payslipDocuments",
    "payslipDocumentVersions",
    "announcements",
    "announcementRecipients",
    "announcementAttachments",
    "workLocations",
    "projects",
    "employeeProjectAssignments",
    "employeeFaceEnrollments",
    "faceEnrollmentTemplates",
    "auditLogs",
  ];

  it("imports every table that references organizations.id", () => {
    for (const table of protectedTables) {
      assert.equal(
        queriesSource.includes(table),
        true,
        `queries.ts must reference ${table}`
      );
    }
  });

  it("reports every protected category in the delete scan result", () => {
    const categories = [
      "users: usersCount",
      "employees: employeesCount",
      "roles: rolesCount",
      "attendance: attendanceCount",
      "leave: leaveCount",
      "permission_requests: permissionRequestsCount",
      "payroll: payrollCount",
      "payslips: payslipsCount",
      "payslip_documents: payslipDocumentsCount",
      "announcements: announcementsCount",
      "work_locations: workLocationsCount",
      "projects: projectsCount",
      "assignments: assignmentsCount",
      "face_enrollments: faceEnrollmentsCount",
      "audit: auditCount",
    ] as const;
    const returnBlock = queriesSource.slice(
      queriesSource.indexOf("return {", queriesSource.indexOf("detectOrganizationDependencies"))
    );
    for (const category of categories) {
      assert.equal(
        returnBlock.includes(category),
        true,
        `delete scan must return ${category}`
      );
    }
  });
});

describe("delete safety: no cascade path", () => {
  it("the action refuses with the standard message when any dependency exists", () => {
    assert.equal(
      actionsSource.includes(
        "Organization cannot be deleted because it still contains dependent records"
      ),
      true
    );
    assert.equal(actionsSource.includes("Deactivate the organization instead"), true);
  });

  it("maps a foreign-key violation (23503) to the same refusal (never cascades)", () => {
    assert.equal(
      actionsSource.includes('.code === "23503"'),
      true
    );
  });

  it("only calls db.delete after the dependency policy passes", () => {
    const deleteStart = actionsSource.indexOf(
      "export async function deleteOrganizationAction("
    );
    const body = actionsSource.slice(deleteStart, deleteStart + 6000);
    const deleteCall = body.indexOf(".delete(organizations)");
    const policyCall = body.indexOf("evaluateOrganizationAction");
    assert.notEqual(deleteCall, -1);
    assert.notEqual(policyCall, -1);
    assert.equal(policyCall < deleteCall, true);
  });
});

describe("organization isolation (org-scoped reads)", () => {
  it("the list counts are grouped per organization id", () => {
    assert.equal(
      queriesSource.includes("inArray(employees.organizationId, orgIds)"),
      true
    );
    assert.equal(
      queriesSource.includes("inArray(users.organizationId, orgIds)"),
      true
    );
    assert.equal(
      queriesSource.includes("groupBy(employees.organizationId)"),
      true
    );
    assert.equal(
      queriesSource.includes("groupBy(users.organizationId)"),
      true
    );
  });

  it("the detail statistics are filtered to one organization only", () => {
    assert.equal(
      queriesSource.includes("eq(employees.organizationId, organizationId)"),
      true
    );
    assert.equal(
      queriesSource.includes("eq(users.organizationId, organizationId)"),
      true
    );
  });

  it("the delete dependency scan is scoped by organizationId everywhere", () => {
    // countWhere/sumCounts take the org id and the *organizationId* column.
    assert.equal(
      queriesSource.includes("countWhere(users.organizationId, organizationId)"),
      true
    );
    assert.equal(
      queriesSource.includes("countWhere(auditLogs.organizationId, organizationId)"),
      true
    );
    assert.equal(
      queriesSource.includes(".where(eq(column, organizationId))"),
      true
    );
  });
});

describe("client bypass cannot change the SYSTEM organization", () => {
  it("the update action refuses reserved code/status changes for SYSTEM", () => {
    assert.equal(
      actionsSource.includes(
        'code: "The reserved system organization code cannot be changed."'
      ),
      true
    );
    assert.equal(
      actionsSource.includes("The SYSTEM organization must remain active."),
      true
    );
  });

  it("the create action refuses the reserved SYSTEM code", () => {
    assert.equal(
      actionsSource.includes("is the reserved system organization code."),
      true
    );
  });
});