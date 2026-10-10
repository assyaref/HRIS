/**
 * Employee Excel Import Wizard — option-source contract (node:test).
 *
 * Regression guard for the production bug where a SUPERADMIN opening the
 * wizard could not see another tenant's projects/work locations/roles:
 *
 * - The wizard is a single in-place dialog, so for a SUPERADMIN the server
 *   must hand it the option lists for every active tenant (each option carries
 *   its `organizationId`); the client narrows them to the selected
 *   organization. A tenant user only receives their own organization.
 * - The cross-tenant option queries must NOT be organization-scoped — the
 *   wizard does the per-tenant filtering client-side. Tenant-scoped queries
 *   stay organization-scoped.
 * - The dialog seeds `organizationId` from `userOrganizationId` for tenant
 *   users (the hidden field never fires onChange), otherwise every dropdown
 *   stays empty.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const pageSource = readRepoFile("app/(dashboard)/employees/page.tsx");
const dialogSource = readRepoFile(
  "features/employees/excel/import-dialog.tsx"
);
const projectQueriesSource = readRepoFile("features/projects/queries.ts");
const workLocationQueriesSource = readRepoFile(
  "features/work-locations/queries.ts"
);
const rbacQueriesSource = readRepoFile("features/rbac/queries.ts");

describe("employees page: wizard option sourcing", () => {
  it("loads cross-tenant options for SUPERADMIN and scoped options otherwise", () => {
    for (const fn of [
      "listActiveProjectOptionsForSuperAdmin()",
      "listActiveWorkLocationOptionsForSuperAdmin()",
      "listRoleOptionsForSuperAdmin()",
    ]) {
      assert.equal(pageSource.includes(fn), true, `${fn} must be used`);
    }
    for (const fn of [
      "listProjectOptionsByOrganization(organizationId)",
      "listWorkLocationOptions(organizationId)",
      "listRoleOptionsByOrganization(organizationId)",
    ]) {
      assert.equal(pageSource.includes(fn), true, `${fn} must stay for tenants`);
    }
  });
});

describe("cross-tenant option queries are not organization-scoped", () => {
  const cases: Array<[string, string]> = [
    ["listActiveProjectOptionsForSuperAdmin", projectQueriesSource],
    [
      "listActiveWorkLocationOptionsForSuperAdmin",
      workLocationQueriesSource,
    ],
    ["listRoleOptionsForSuperAdmin", rbacQueriesSource],
  ];

  for (const [name, source] of cases) {
    it(`${name} lists across organizations`, () => {
      const start = source.indexOf(`export async function ${name}(`);
      assert.notEqual(start, -1, `${name} must exist`);
      const next = source.indexOf("export async function", start + 1);
      const body = source.slice(start, next === -1 ? undefined : next);
      assert.equal(
        body.includes("eq(projects.organizationId, organizationId)"),
        false,
        `${name} must not filter to a single organization`
      );
      assert.equal(
        body.includes("eq(workLocations.organizationId, organizationId)"),
        false,
        `${name} must not filter to a single organization`
      );
      assert.equal(
        body.includes("eq(roles.organizationId, organizationId)"),
        false,
        `${name} must not filter to a single organization`
      );
      assert.equal(
        body.includes("organizationId: projects.organizationId") ||
          body.includes("organizationId: workLocations.organizationId") ||
          body.includes("organizationId: roles.organizationId"),
        true,
        `${name} must return the owning organizationId per option`
      );
    });
  }

  it("tenant-scoped option queries stay organization-scoped", () => {
    const scoped: Array<[string, string, string]> = [
      [
        "listProjectOptionsByOrganization",
        projectQueriesSource,
        "eq(projects.organizationId, organizationId)",
      ],
      [
        "listWorkLocationOptions",
        workLocationQueriesSource,
        "eq(workLocations.organizationId, organizationId)",
      ],
      [
        "listRoleOptionsByOrganization",
        rbacQueriesSource,
        "eq(roles.organizationId, organizationId)",
      ],
    ];
    for (const [name, source, predicate] of scoped) {
      const start = source.indexOf(`export async function ${name}(`);
      assert.notEqual(start, -1, `${name} must exist`);
      const next = source.indexOf("export async function", start + 1);
      const body = source.slice(start, next === -1 ? undefined : next);
      assert.equal(body.includes(predicate), true, `${name} must stay scoped`);
    }
  });
});

describe("import dialog: default organization", () => {
  it("seeds organizationId from the tenant user's organization", () => {
    assert.equal(
      dialogSource.includes(
        'organizationId: isSuperAdmin ? "" : userOrganizationId ?? ""'
      ),
      true,
      "non-SUPERADMIN must start bound to their own organization"
    );
  });
});
