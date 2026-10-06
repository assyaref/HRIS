/**
 * R19 — Organization CRUD authorization contract (Node built-in `node:test`).
 *
 * Source-invariant assertions pinning the authorization surface:
 * - The permission catalog defines exactly the four `organizations.*` codes.
 * - The RBAC seed grants them to SUPERADMIN (via ALL_PERMISSIONS) and to NO
 *   other role block (ADMIN / MANAGEMENT / HR / FINANCE / SUPERVISOR /
 *   EMPLOYEE) — the requirement is "Super Administrator only".
 * - Every server action re-verifies `requireUser` + `requireSuperAdmin`, so a
 *   direct server-action call is 403 for any non-superadmin.
 * - Both Organizations pages call `isSuperAdmin` and `forbidden()`, so a
 *   manually typed URL is 403 for non-superadmins.
 * - The Settings → Organizations menu item is `superadminOnly` and filtered by
 *   the SUPERADMIN role (not a permission code) in `getAuthorizedSections`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const permissionsSource = readRepoFile("lib/auth/permissions.ts");
const seedSource = readRepoFile("scripts/seed-rbac.mts");
const actionsSource = readRepoFile("features/organizations/actions.ts");
const listPageSource = readRepoFile("app/(dashboard)/settings/organizations/page.tsx");
const detailPageSource = readRepoFile(
  "app/(dashboard)/settings/organizations/[organizationId]/page.tsx"
);
const navigationSource = readRepoFile("components/layout/navigation.ts");
const authorizedNavigationSource = readRepoFile(
  "components/layout/authorized-navigation.ts"
);
const auditSource = readRepoFile("lib/auth/audit.ts");

const ORGANIZATION_CODES = [
  "ORGANIZATIONS_VIEW",
  "ORGANIZATIONS_CREATE",
  "ORGANIZATIONS_UPDATE",
  "ORGANIZATIONS_DELETE",
] as const;

/** Extract one role block `[ROLE_CODES.X]: [ ... ]` as raw text. */
function roleBlock(roleCode: string): string {
  const header = `[ROLE_CODES.${roleCode}]:`;
  const start = seedSource.indexOf(header);
  assert.notEqual(start, -1, `seed must define ROLE_${roleCode} block`);
  const listStart = seedSource.indexOf("[", start + header.length);
  const listEnd = seedSource.indexOf("]", listStart);
  assert.notEqual(listStart, -1);
  assert.notEqual(listEnd, -1);
  return seedSource.slice(listStart, listEnd + 1);
}

function blockHasAnyOrganizationGrant(roleCode: string): boolean {
  const block = roleBlock(roleCode);
  return ORGANIZATION_CODES.some((code) => block.includes(`PERMISSIONS.${code}`));
}

describe("permission catalog: organizations.* codes", () => {
  it("defines exactly the four organizations.* permission codes", () => {
    assert.equal(permissionsSource.includes('ORGANIZATIONS_VIEW: "organizations.view"'), true);
    assert.equal(permissionsSource.includes('ORGANIZATIONS_CREATE: "organizations.create"'), true);
    assert.equal(permissionsSource.includes('ORGANIZATIONS_UPDATE: "organizations.update"'), true);
    assert.equal(permissionsSource.includes('ORGANIZATIONS_DELETE: "organizations.delete"'), true);
  });

  it("catalog describes them as Super Administrator only", () => {
    for (const code of ORGANIZATION_CODES) {
      const definitionStart = permissionsSource.indexOf(
        `code: PERMISSIONS.${code}`
      );
      assert.notEqual(
        definitionStart,
        -1,
        `catalog must define ${code}`
      );
      const blockStart = permissionsSource.lastIndexOf("  {\n", definitionStart);
      const block = permissionsSource.slice(blockStart, definitionStart + 400);
      assert.equal(
        /Super Administrator only/.test(block),
        true,
        `${code} description must say Super Administrator only`
      );
    }
  });
});

describe("seed RBAC: organizations.* are SUPERADMIN-only", () => {
  it("grants SUPERADMIN the full catalog (which includes organizations.*)", () => {
    assert.equal(
      /\[ROLE_CODES\.SUPERADMIN\]:\s*ALL_PERMISSIONS/.test(seedSource),
      true
    );
  });

  it("grants NO tenant role block any organizations.* permission", () => {
    for (const role of ["ADMIN", "MANAGEMENT", "HR", "FINANCE", "SUPERVISOR", "EMPLOYEE"]) {
      assert.equal(
        blockHasAnyOrganizationGrant(role),
        false,
        `${role} must NOT be granted any organizations.* permission`
      );
    }
  });
});

describe("server actions: authorization is verified server-side", () => {
  it("is a server module and requires the SUPERADMIN role check import", () => {
    assert.equal(actionsSource.includes('"use server"'), true);
    assert.equal(
      actionsSource.includes('import { requireSuperAdmin } from "@/lib/auth/rbac"'),
      true
    );
    assert.equal(actionsSource.includes("requireUser()"), true);
  });

  it("every CRUD/status action re-runs requireUser + requireSuperAdmin", () => {
    const actionNames = [
      "createOrganizationAction",
      "updateOrganizationAction",
      "deleteOrganizationAction",
      "activateOrganizationAction",
      "deactivateOrganizationAction",
    ] as const;
    for (const action of actionNames) {
      const signature = `export async function ${action}(`;
      const start = actionsSource.indexOf(signature);
      assert.notEqual(start, -1, `${action} must be exported`);
      const body = actionsSource.slice(start, start + 6000);
      assert.equal(
        body.includes("requireSuperAdminActor()"),
        true,
        `${action} must re-verify the system SUPERADMIN role`
      );
    }
  });

  it("never trusts a client-supplied organization scope for authorization", () => {
    assert.equal(actionsSource.includes("requireSuperAdminActor"), true);
    // The actor is resolved from the session, the target organization is
    // loaded by id, and policy is evaluated server-side.
    assert.equal(actionsSource.includes('if (role === "SUPERADMIN")'), false);
    assert.equal(actionsSource.includes("evaluateOrganizationAction"), true);
  });

  it("direct calls from non-superadmins are refused (403) before any DB write", () => {
    // `requireSuperAdminActor` calls `requireSuperAdmin`, which throws the
    // forbidden() signal before the mutation payload is processed.
    assert.equal(actionsSource.includes("await requireSuperAdmin(user.id)"), true);
    assert.equal(
      actionsSource.includes("requireSuperAdminActor():"),
      true
    );
  });

  it("checks the target organization from the database, not from the request body", () => {
    assert.equal(
      actionsSource.includes("const existing = await loadOrganization("),
      true
    );
  });
});

describe("pages: direct URL access is denied for non-superadmins", () => {
  it("the list page authenticates and forbids non-superadmins", () => {
    assert.equal(listPageSource.includes("await requireUser()"), true);
    assert.equal(listPageSource.includes("await isSuperAdmin(user.id)"), true);
    assert.equal(listPageSource.includes("forbidden()"), true);
    assert.equal(
      listPageSource.includes('forbidden" from "next/navigation"') ||
        listPageSource.includes('forbidden } from "next/navigation"'),
      true
    );
  });

  it("the detail page authenticates and forbids non-superadmins", () => {
    assert.equal(detailPageSource.includes("await requireUser()"), true);
    assert.equal(detailPageSource.includes("await isSuperAdmin(user.id)"), true);
    assert.equal(detailPageSource.includes("forbidden()"), true);
  });

  it("guards the direct URL against organization-id spoofing with a UUID check", () => {
    assert.equal(
      detailPageSource.includes("UUID_PATTERN.test(organizationId)"),
      true
    );
    assert.equal(detailPageSource.includes("notFound()"), true);
  });
});

describe("navigation: Settings → Organizations is SUPERADMIN-only", () => {
  it("declares the Organizations item in the settings section", () => {
    const settingsSectionStart = navigationSource.indexOf("settingsNavigation");
    assert.notEqual(settingsSectionStart, -1);
    const section = navigationSource.slice(settingsSectionStart);
    assert.equal(section.includes('href: "/settings/organizations"'), true);
    assert.equal(section.includes('title: "Organizations"'), true);
    assert.equal(section.includes('icon: "organizations"'), true);
  });

  it("marks it superadminOnly (decided by the role, not a permission code)", () => {
    const settingsSectionStart = navigationSource.indexOf("settingsNavigation");
    const section = navigationSource.slice(settingsSectionStart);
    const itemStart = section.indexOf('href: "/settings/organizations"');
    const item = section.slice(itemStart, itemStart + 400);
    assert.equal(item.includes("superadminOnly: true"), true);
  });

  it("getAuthorizedSections hides superadminOnly items from non-superadmins", () => {
    assert.equal(
      authorizedNavigationSource.includes(
        "(!item.superadminOnly || authorization.isSuperAdmin)"
      ),
      true
    );
  });
});

describe("audit log: organization events exist and are wired", () => {
  const expected = [
    "organization.created",
    "organization.updated",
    "organization.deleted",
    "organization.activated",
    "organization.deactivated",
  ];

  it("the audit action union defines all five organization events", () => {
    for (const action of expected) {
      assert.equal(
        auditSource.includes(`"${action}"`),
        true,
        `audit union must define ${action}`
      );
    }
  });

  it("the actions write every event through writeAuditLog", () => {
    for (const action of expected) {
      assert.equal(
        actionsSource.includes(`"${action}"`),
        true,
        `actions must emit ${action}`
      );
    }
    assert.equal(actionsSource.includes("writeAuditLog"), true);
  });

  it("audit metadata never carries secrets", () => {
    // The only metadata emitted for organizations is name/code/status.
    assert.equal(actionsSource.includes("passwordHash"), false);
    assert.equal(actionsSource.includes("token"), false);
  });
});