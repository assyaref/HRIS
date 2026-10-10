/**
 * Projects — CRUD authorization contract (Node built-in `node:test`).
 *
 * Source-invariant assertions pinning the authorization surface:
 * - Every project server action re-verifies `requireUser` +
 *   `requireSuperAdmin` (system-level role resolved from PostgreSQL), so a
 *   direct server-action call is 403 for any non-superadmin — hiding the
 *   button is never the enforcement.
 * - Both Projects pages call `isSuperAdmin` and `forbidden()`, so a manually
 *   typed URL is 403 for non-superadmins.
 * - The Projects menu item is `superadminOnly` (decided by the system-level
 *   role, not a permission code) and the list/detail pages validate the ids
 *   they receive.
 * - The organization selected by the client is re-validated server-side
 *   against the `organizations` table before any write.
 * - Audit events exist for create/update/status change/delete.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const actionsSource = readRepoFile("features/projects/actions.ts");
const queriesSource = readRepoFile("features/projects/queries.ts");
const listPageSource = readRepoFile("app/(dashboard)/projects/page.tsx");
const detailPageSource = readRepoFile(
  "app/(dashboard)/projects/[projectId]/page.tsx"
);
const navigationSource = readRepoFile("components/layout/navigation.ts");
const authorizedNavigationSource = readRepoFile(
  "components/layout/authorized-navigation.ts"
);
const auditSource = readRepoFile("lib/auth/audit.ts");

describe("server actions: authorization is verified server-side", () => {
  it("is a server module that imports the SUPERADMIN guard", () => {
    assert.equal(actionsSource.includes('"use server"'), true);
    assert.equal(
      actionsSource.includes('requireSuperAdmin } from "@/lib/auth/rbac"'),
      true
    );
    assert.equal(
      actionsSource.includes('requireUser } from "@/lib/auth/auth"'),
      true
    );
  });

  it("every CRUD/status action re-runs requireUser + requireSuperAdmin", () => {
    const actionNames = [
      "createProjectAction",
      "updateProjectAction",
      "updateProjectStatusAction",
      "deleteProjectAction",
    ] as const;
    for (const action of actionNames) {
      const signature = `export async function ${action}(`;
      const start = actionsSource.indexOf(signature);
      assert.notEqual(start, -1, `${action} must be exported`);
      const body = actionsSource.slice(start, start + 4000);
      assert.equal(
        body.includes("requireSuperAdminActor()"),
        true,
        `${action} must re-verify the system SUPERADMIN role`
      );
    }
  });

  it("the shared guard resolves the actor from the session and forbids others", () => {
    assert.equal(
      actionsSource.includes("await requireSuperAdmin(user.id)"),
      true
    );
    assert.equal(
      actionsSource.includes("async function requireSuperAdminActor()"),
      true
    );
  });

  it("never authorizes from a client-supplied role or scope", () => {
    assert.equal(
      actionsSource.includes('role === "SUPERADMIN"'),
      false
    );
    assert.equal(
      actionsSource.includes("user.organizationId;"),
      false,
      "actions must not scope by the actor's own organization anymore"
    );
  });

  it("loads the target project from the database by id before mutating", () => {
    assert.equal(
      actionsSource.includes("getProjectWithOrganization(projectId)"),
      true
    );
  });

  it("validates the selected organization against the database before create", () => {
    const createStart = actionsSource.indexOf(
      "export async function createProjectAction("
    );
    const createBody = actionsSource.slice(createStart, createStart + 5000);
    assert.equal(
      createBody.includes("getActiveOrganization("),
      true,
      "create must reject unknown or inactive organizations"
    );
  });

  it("validates the target organization before an organization move", () => {
    const updateStart = actionsSource.indexOf(
      "export async function updateProjectAction("
    );
    const updateBody = actionsSource.slice(updateStart, updateStart + 9000);
    assert.equal(
      updateBody.includes("evaluateProjectOrganizationChange("),
      true,
      "update must run the dependency-aware organization-move policy"
    );
    assert.equal(
      updateBody.includes("getActiveOrganization("),
      true,
      "update must reject unknown or inactive target organizations"
    );
  });

  it("checks project-code uniqueness inside the organization", () => {
    assert.equal(actionsSource.includes("isProjectCodeTaken("), true);
  });

  it("maps duplicate-code and FK errors to safe messages", () => {
    assert.equal(actionsSource.includes("isDuplicateProjectError"), true);
    assert.equal(actionsSource.includes("isForeignKeyViolation"), true);
  });

  it("audit metadata never carries secrets", () => {
    assert.equal(actionsSource.includes("passwordHash"), false);
    assert.equal(actionsSource.includes("token"), false);
  });
});

describe("pages: direct URL access is denied for non-superadmins", () => {
  it("the list page authenticates and forbids non-superadmins", () => {
    assert.equal(listPageSource.includes("await requireUser()"), true);
    assert.equal(listPageSource.includes("await isSuperAdmin(user.id)"), true);
    assert.equal(listPageSource.includes("forbidden()"), true);
  });

  it("the detail page authenticates and forbids non-superadmins", () => {
    assert.equal(detailPageSource.includes("await requireUser()"), true);
    assert.equal(
      detailPageSource.includes("await isSuperAdmin(user.id)"),
      true
    );
    assert.equal(detailPageSource.includes("forbidden()"), true);
  });

  it("guards the detail URL against id spoofing with a UUID check", () => {
    assert.equal(
      detailPageSource.includes("UUID_PATTERN.test(projectId)"),
      true
    );
    assert.equal(detailPageSource.includes("notFound()"), true);
  });

  it("the list page validates the organization filter shape", () => {
    assert.equal(
      listPageSource.includes("UUID_PATTERN.test(organizationId"),
      true
    );
  });
});

describe("navigation: Projects menu is SUPERADMIN-only", () => {
  it("marks the Projects item superadminOnly (role, not permission)", () => {
    const itemStart = navigationSource.indexOf('title: "Projects"');
    assert.notEqual(itemStart, -1, "navigation must contain the Projects item");
    const itemEnd = navigationSource.indexOf("\n  },", itemStart);
    assert.notEqual(itemEnd, -1);
    const item = navigationSource.slice(itemStart, itemEnd);
    assert.equal(item.includes("superadminOnly: true"), true);
    assert.equal(
      item.includes("permission:"),
      false,
      "the item must not be gated by a tenant-grantable permission code"
    );
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

describe("audit log: project events exist and are wired", () => {
  const expected = [
    "project.created",
    "project.updated",
    "project.status_changed",
    "project.deleted",
  ];

  it("the audit action union defines all project events", () => {
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

  it("the delete audit commits atomically with the deletion", () => {
    const deleteStart = actionsSource.indexOf(
      "export async function deleteProjectAction("
    );
    const deleteBody = actionsSource.slice(deleteStart);
    assert.equal(deleteBody.includes("db.transaction"), true);
    assert.equal(deleteBody.includes('"project.deleted"'), true);
  });
});

describe("cross-tenant read isolation (superadmin surface)", () => {
  it("the cross-tenant list join keeps the organization identity explicit", () => {
    const listFnStart = queriesSource.indexOf(
      "export async function listProjectsWithOrganization("
    );
    assert.notEqual(listFnStart, -1);
    const listFn = queriesSource.slice(listFnStart, listFnStart + 3000);
    assert.equal(
      listFn.includes("innerJoin(organizations"),
      true,
      "rows must carry their owning organization"
    );
    assert.equal(
      listFn.includes("eq(projects.organizationId, input.organizationId)"),
      true,
      "the organization filter must narrow to exactly one tenant"
    );
  });

  it("tenant-scoped queries used by other modules stay organization-scoped", () => {
    const orgScoped = [
      "export async function getProjectById(",
      "export async function listOrganizationProjects(",
      "export async function listActiveOrganizationProjects(",
      "export async function listProjectOptionsByOrganization(",
    ];
    for (const signature of orgScoped) {
      const start = queriesSource.indexOf(signature);
      assert.notEqual(start, -1, `${signature} must keep existing`);
      const body = queriesSource.slice(start, start + 2500);
      assert.equal(
        body.includes("eq(projects.organizationId, organizationId)"),
        true,
        `${signature} must stay organization-scoped`
      );
    }
  });
});
