/**
 * Employee Organization + Project filters — contract tests (node:test).
 *
 * Mixes two layers:
 *  - PURE schema assertions (`employeeListSearchSchema` gains an optional,
 *    UUID-shaped `projectId`).
 *  - Source-invariant assertions pinning the cross-tenant rules: the filters
 *    are applied server-side with an organization-scoped EXISTS (never a JOIN
 *    that duplicates rows), the page/route resolve the effective organization
 *    through the shared `scope` helpers, and the export path mirrors the list.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { employeeListSearchSchema } from "../../features/employees/schemas.ts";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const queriesSource = readRepoFile("features/employees/queries.ts");
const pageSource = readRepoFile("app/(dashboard)/employees/page.tsx");
const routeSource = readRepoFile("app/api/employees/export/route.ts");
const filtersSource = readRepoFile("features/employees/employee-filters.tsx");
const csvButtonSource = readRepoFile(
  "features/employees/export/export-button.tsx"
);
const excelButtonsSource = readRepoFile(
  "features/employees/export/excel-buttons.tsx"
);

const PROJECT = "2d15af09-8876-4a80-aef7-566cfa698d41";

describe("employeeListSearchSchema: projectId filter", () => {
  it("accepts a uuid project id", () => {
    const parsed = employeeListSearchSchema.safeParse({ projectId: PROJECT });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.projectId, PROJECT);
  });

  it("rejects a malformed project id", () => {
    const parsed = employeeListSearchSchema.safeParse({
      projectId: "not-a-uuid",
    });
    assert.equal(parsed.success, false);
  });

  it("accepts no project id at all", () => {
    const parsed = employeeListSearchSchema.safeParse({ q: "dasril" });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.projectId, undefined);
  });
});

describe("queries: project filter is an organization-scoped EXISTS", () => {
  it("exports a shared condition builder", () => {
    assert.equal(
      queriesSource.includes("export function buildEmployeeSearchConditions"),
      true
    );
  });

  it("filters by project with EXISTS pinned to organization + employee + active", () => {
    const start = queriesSource.indexOf(
      "export function buildProjectAssignmentCondition"
    );
    assert.notEqual(start, -1);
    const block = queriesSource.slice(start, start + 900);
    assert.match(block, /EXISTS \(SELECT 1 FROM/);
    assert.equal(
      block.includes("employeeProjectAssignments.organizationId"),
      true
    );
    assert.equal(block.includes("employeeProjectAssignments.employeeId"), true);
    assert.equal(block.includes("employeeProjectAssignments.projectId"), true);
    assert.equal(block.includes("employeeProjectAssignments.active, true"), true);
  });

  it("never inner-joins the assignment table (no duplicated employee rows)", () => {
    assert.equal(queriesSource.includes("innerJoin(employeeProjectAssignments"), false);
    assert.equal(queriesSource.includes(".leftJoin(employeeProjectAssignments"), false);
  });

  it("applies the project condition from the parsed input", () => {
    assert.equal(queriesSource.includes("if (input.projectId)"), true);
    assert.equal(
      queriesSource.includes(
        "buildProjectAssignmentCondition(organizationId, input.projectId)"
      ),
      true
    );
  });
});

describe("employees page: organization + project scope resolution", () => {
  it("resolves the effective organization through the shared pure helper", () => {
    assert.equal(pageSource.includes("resolveEmployeeScope("), true);
    assert.equal(pageSource.includes("resolveSelectedProjectId("), true);
  });

  it("validates the requested organization against active organizations", () => {
    assert.equal(pageSource.includes("getActiveOrganization("), true);
    assert.equal(pageSource.includes("isSuperAdmin"), true);
  });

  it("validates the requested project against the effective organization", () => {
    assert.equal(
      pageSource.includes("getProjectById(organizationId, requestedProjectId)"),
      true
    );
  });

  it("loads project options for the effective organization", () => {
    assert.equal(
      pageSource.includes(
        "await listProjectOptionsByOrganization(organizationId)"
      ),
      true
    );
  });

  it("passes the organization and project controls to the filter bar", () => {
    assert.match(pageSource, /organizations=\{organizationOptions\}/);
    assert.match(pageSource, /projects=\{projectOptions\}/);
    assert.match(pageSource, /canSwitchOrganization=\{authorization\.isSuperAdmin\}/);
  });

  it("carries organization + project into pagination", () => {
    const calls = pageSource.match(/filterQuery\(/g) ?? [];
    assert.ok(calls.length >= 2);
    assert.match(pageSource, /viewedOrganizationId \?\? undefined,\s*projectId/);
  });

  it("renders a Super Administrator organization badge", () => {
    assert.match(pageSource, /authorization\.isSuperAdmin && activeOrganizationName/);
    assert.equal(pageSource.includes("<Badge"), true);
  });

  it("passes organization + project to every export control", () => {
    const orgPropCount = (
      pageSource.match(/organizationId=\{viewedOrganizationId \?\? undefined\}/g) ??
      []
    ).length;
    assert.ok(orgPropCount >= 2, "CSV and Excel buttons get the organization");
    assert.match(pageSource, /projectId=\{projectId\}/);
  });
});

describe("employee filter bar: organization + project selects", () => {
  it("renders both selects", () => {
    assert.equal(filtersSource.includes('id="employee-org-filter"'), true);
    assert.equal(filtersSource.includes('id="employee-project-filter"'), true);
    assert.equal(filtersSource.includes("All projects"), true);
  });

  it("only offers organization switching to a Super Administrator", () => {
    assert.equal(filtersSource.includes("canSwitchOrganization"), true);
    assert.match(filtersSource, /canSwitchOrganization \? \(/);
  });

  it("resets the project selection when the organization changes", () => {
    const start = filtersSource.indexOf("function onOrganizationChange");
    const block = filtersSource.slice(start, start + 400);
    assert.equal(block.includes('params.delete("projectId")'), true);
    assert.equal(block.includes('params.set("org", value)'), true);
  });

  it("keeps the scope when only the project changes", () => {
    const start = filtersSource.indexOf("function onProjectChange");
    const block = filtersSource.slice(start, start + 400);
    assert.equal(block.includes('params.set("projectId", value)'), true);
    assert.equal(block.includes('params.delete("org")'), false);
  });
});

describe("export route: organization + project scope", () => {
  it("rejects the organizationId authority parameter", () => {
    assert.equal(
      routeSource.includes('const FORBIDDEN_QUERY_KEYS = ["organizationId", "employeeId"]'),
      true
    );
  });

  it("resolves the effective organization with the shared scope helper", () => {
    assert.equal(routeSource.includes("resolveEmployeeScope("), true);
    assert.equal(routeSource.includes("resolveSelectedProjectId("), true);
    assert.equal(routeSource.includes("getActiveOrganization("), true);
    assert.equal(routeSource.includes("getProjectById("), true);
  });

  it("threads projectId into the filters used by every export path", () => {
    assert.match(routeSource, /const filters = \{ \.\.\.\(parsed\.success \? parsed\.data : \{\}\), projectId \}/);
    assert.equal(routeSource.includes("filters.projectId ||"), true);
  });

  it("passes the effective organization to the template export", () => {
    assert.equal(routeSource.includes("handleTemplateExport(user.id, organizationId)"), true);
  });
});

describe("export buttons carry the active scope", () => {
  it("CSV button includes org and projectId", () => {
    assert.equal(csvButtonSource.includes('searchParams.set("org", organizationId)'), true);
    assert.equal(csvButtonSource.includes('searchParams.set("projectId", projectId)'), true);
  });

  it("Excel buttons include org, projectId and status", () => {
    assert.equal(excelButtonsSource.includes('params.set("org", organizationId)'), true);
    assert.equal(excelButtonsSource.includes('params.set("projectId", projectId)'), true);
    assert.equal(excelButtonsSource.includes('params.set("status", status)'), true);
  });
});
