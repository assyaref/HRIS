/**
 * Employee DETAIL cross-organization authorization — contract tests.
 *
 * Two layers:
 *  - PURE unit tests for `resolveEmployeeDetailScope`, the single rule that
 *    decides whether one employee record may be read and in which tenant
 *    scope. The employee's owning organization is authoritative; a URL `org`
 *    context is only a consistency assertion.
 *  - SOURCE-invariant tests pinning the detail page to that rule: it loads the
 *    employee by id (unscoped), resolves the scope server-side, keeps
 *    non-superadmins on their own tenant, renders cross-tenant views read-only,
 *    and preserves the org/project context on the way back to the list.
 *
 * The write paths are audited here too: every employee server action must keep
 * scoping to the SESSION organization, so the page change cannot open a
 * cross-tenant write bypass.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveEmployeeDetailScope } from "../../features/employees/scope.ts";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const SYSTEM = "3f66da05-2817-4ea8-98db-5b3094c09626";
const SUPRACO = "651cc79b-8ff5-4f5a-bbae-22a7d05f0b50";
const OTHER_ORG = "11111111-2222-3333-4444-555555555555";

const pageSource = readRepoFile(
  "app/(dashboard)/employees/[employeeId]/page.tsx"
);
const listPageSource = readRepoFile("app/(dashboard)/employees/page.tsx");
const tableSource = readRepoFile("features/employees/employee-table.tsx");
const actionsSource = readRepoFile("features/employees/actions.ts");
const masterDataActionsSource = readRepoFile(
  "features/employees/master-data/actions.ts"
);

describe("resolveEmployeeDetailScope", () => {
  it("lets a Super Administrator resolve an employee of another organization", () => {
    const scope = resolveEmployeeDetailScope({
      employeeOrganizationId: SUPRACO,
      userOrganizationId: SYSTEM,
      isSuperAdmin: true,
    });
    assert.deepEqual(scope, {
      organizationId: SUPRACO,
      viewingOtherOrganization: true,
    });
  });

  it("resolves a Super Administrator's own-organization employee as non-cross", () => {
    const scope = resolveEmployeeDetailScope({
      employeeOrganizationId: SYSTEM,
      userOrganizationId: SYSTEM,
      isSuperAdmin: true,
    });
    assert.deepEqual(scope, {
      organizationId: SYSTEM,
      viewingOtherOrganization: false,
    });
  });

  it("lets a tenant user read an employee of its own organization", () => {
    const scope = resolveEmployeeDetailScope({
      employeeOrganizationId: SUPRACO,
      userOrganizationId: SUPRACO,
      isSuperAdmin: false,
    });
    assert.deepEqual(scope, {
      organizationId: SUPRACO,
      viewingOtherOrganization: false,
    });
  });

  it("refuses a tenant user reading another tenant's employee", () => {
    assert.equal(
      resolveEmployeeDetailScope({
        employeeOrganizationId: SUPRACO,
        userOrganizationId: SYSTEM,
        isSuperAdmin: false,
      }),
      null
    );
  });

  it("refuses when the session has no organization", () => {
    assert.equal(
      resolveEmployeeDetailScope({
        employeeOrganizationId: SUPRACO,
        userOrganizationId: null,
        isSuperAdmin: true,
      }),
      null
    );
  });

  it("accepts a URL organization context that matches the record's owner", () => {
    assert.deepEqual(
      resolveEmployeeDetailScope({
        employeeOrganizationId: SUPRACO,
        userOrganizationId: SYSTEM,
        isSuperAdmin: true,
        requestedOrganizationId: SUPRACO,
      }),
      { organizationId: SUPRACO, viewingOtherOrganization: true }
    );
  });

  it("refuses a URL organization context that does not match the owner (superadmin)", () => {
    assert.equal(
      resolveEmployeeDetailScope({
        employeeOrganizationId: SUPRACO,
        userOrganizationId: SYSTEM,
        isSuperAdmin: true,
        requestedOrganizationId: OTHER_ORG,
      }),
      null
    );
  });

  it("refuses a mismatched URL organization context even for the caller's own employee", () => {
    assert.equal(
      resolveEmployeeDetailScope({
        employeeOrganizationId: SYSTEM,
        userOrganizationId: SYSTEM,
        isSuperAdmin: true,
        requestedOrganizationId: OTHER_ORG,
      }),
      null
    );
  });

  it("refuses a malformed URL organization context", () => {
    assert.equal(
      resolveEmployeeDetailScope({
        employeeOrganizationId: SUPRACO,
        userOrganizationId: SYSTEM,
        isSuperAdmin: true,
        requestedOrganizationId: "'; DROP TABLE employees;--",
      }),
      null
    );
  });

  it("ignores an absent/blank URL organization context", () => {
    assert.deepEqual(
      resolveEmployeeDetailScope({
        employeeOrganizationId: SUPRACO,
        userOrganizationId: SYSTEM,
        isSuperAdmin: true,
        requestedOrganizationId: "   ",
      }),
      { organizationId: SUPRACO, viewingOtherOrganization: true }
    );
  });
});

describe("employee detail page — cross-organization read", () => {
  it("loads the employee by id so its owning organization comes from the DB", () => {
    assert.equal(pageSource.includes("await getEmployeeById(employeeId)"), true);
  });

  it("resolves access through the shared pure helper and forbids on null", () => {
    assert.equal(pageSource.includes("resolveEmployeeDetailScope("), true);
    assert.equal(pageSource.includes("if (!scope) forbidden();"), true);
  });

  it("uses the resolved organization (not the session organization) for reads", () => {
    assert.equal(
      pageSource.includes("const organizationId = scope.organizationId;"),
      true
    );
  });

  it("re-validates a cross-tenant target against active organizations", () => {
    assert.equal(pageSource.includes("getActiveOrganization(scope.organizationId)"), true);
    assert.equal(pageSource.includes("scope.viewingOtherOrganization"), true);
  });

  it("treats a cross-tenant view as read-only", () => {
    assert.equal(
      pageSource.includes("const canWrite = !viewingOtherOrganization;"),
      true
    );
    assert.equal(pageSource.includes("canEditInScope("), true);
  });

  it("keeps the superadmin-only destructive action off cross-tenant views", () => {
    assert.match(
      pageSource,
      /canWrite && canPermanentlyDeleteEmployees\(authorization\)/
    );
  });

  it("preserves the active organization + project context on the back link", () => {
    assert.match(pageSource, /backParams\.set\("org", organizationId\)/);
    assert.match(pageSource, /backParams\.set\("projectId", requestedProjectId\)/);
    assert.equal(pageSource.includes("href={backHref}"), true);
  });

  it("threads the organization context into the detail export link", () => {
    assert.match(pageSource, /viewingOtherOrganization \? `&org=\$\{organizationId\}` : ""/);
  });
});

describe("employee list → detail context handoff", () => {
  it("carries the validated org + project onto each row's link", () => {
    assert.match(tableSource, /detailContext/);
    assert.match(tableSource, /`\/employees\/\$\{employee\.id\}\?\$\{detailContext\}`/);
  });

  it("passes only the validated values from the list page", () => {
    assert.match(listPageSource, /detailContextParams\.set\("org", viewedOrganizationId\)/);
    assert.match(listPageSource, /detailContextParams\.set\("projectId", projectId\)/);
    assert.match(listPageSource, /detailContext={employeeDetailContext}/);
  });
});

describe("employee write actions stay session-organization scoped (no bypass)", () => {
  it("updateEmployeeAction scopes to the session organization", () => {
    const start = actionsSource.indexOf("export async function updateEmployeeAction");
    assert.notEqual(start, -1);
    const block = actionsSource.slice(start, start + 1400);
    assert.equal(block.includes("const organizationId = user.organizationId;"), true);
    assert.equal(
      block.includes("getEmployeeInOrganization(") &&
        block.includes("employeeId,") &&
        block.includes("organizationId"),
      true
    );
  });

  it("createEmployeeAccountAction stays org-scoped", () => {
    const start = actionsSource.indexOf(
      "export async function createEmployeeAccountAction"
    );
    const block = actionsSource.slice(start, start + 1200);
    assert.equal(block.includes("getEmployeeInOrganization(employeeId, organizationId)"), true);
  });

  it("permanentlyDeleteEmployeeAction uses the session organization", () => {
    assert.equal(
      actionsSource.includes("const sessionOrganizationId = user.organizationId ?? null;"),
      true
    );
    assert.match(
      actionsSource,
      /getEmployeeInOrganization\(employeeId, organizationId\)/
    );
  });

  it("master-data actions resolve the organization from the session", () => {
    assert.match(
      masterDataActionsSource,
      /const organizationId = user\.organizationId;/
    );
    assert.match(
      masterDataActionsSource,
      /getEmployeeInOrganization\(employeeId, organizationId\)/
    );
  });

  it("no employee action accepts an organization id from the form body", () => {
    assert.equal(actionsSource.includes('field(formData, "organizationId")'), false);
    assert.equal(actionsSource.includes('formData.get("organizationId")'), false);
  });
});
