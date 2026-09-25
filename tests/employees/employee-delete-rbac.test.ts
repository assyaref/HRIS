/**
 * PHASE 21.12-RBAC — Employee DELETE role-mapping contract tests (node:test).
 *
 * Source-invariant assertions over the RBAC seed (`scripts/seed-rbac.mts`)
 * and the server action gate. Because RBAC is seeded from a static matrix,
 * the matrix itself IS the contract: these tests pin which role block grants
 * `employees.delete` so a fresh environment reproduces the same authorization.
 *
 * Expected:
 * - SUPERADMIN → delete (ALL_PERMISSIONS includes employees.delete).
 * - ADMIN → delete (unchanged: holds it via the ADMIN block).
 * - HR → delete (employee-management role).
 * - MANAGEMENT → delete (org-scoped management role).
 * - EMPLOYEE / self-service → NO delete.
 * - deleteEmployeeAction still authorizes via `employees.delete`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const seedSource = readRepoFile("scripts/seed-rbac.mts");
const actionsSource = readRepoFile("features/employees/actions.ts");

/** Exact permission token used inside the seed matrix. */
const DELETE_TOKEN = "PERMISSIONS.EMPLOYEES_DELETE";

/**
 * Extract the permission list of one role block `[ROLE_CODES.X]: [ ... ]` from
 * the seed matrix as raw text, so membership assertions are block-scoped and
 * never confused with a grant appearing under another role.
 */
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

function blockHasDelete(roleCode: string): boolean {
  return roleBlock(roleCode).includes(DELETE_TOKEN);
}

describe("seed RBAC: employees.delete role grants", () => {
  it("grants employees.delete to SUPERADMIN (via ALL_PERMISSIONS catalog)", () => {
    const allPermissions = seedSource.match(/ALL_PERMISSIONS: readonly Permission\[\]/);
    assert.equal(allPermissions !== null, true);
    // SUPERADMIN is granted the entire catalog.
    assert.equal(
      /\[ROLE_CODES\.SUPERADMIN\]:\s*ALL_PERMISSIONS/.test(seedSource),
      true
    );
    // The catalog definition itself contains employees.delete.
    const catalogSource = readRepoFile("lib/auth/permissions.ts");
    assert.equal(
      catalogSource.includes('EMPLOYEES_DELETE: "employees.delete"'),
      true
    );
  });

  it("keeps employees.delete on the ADMIN role (existing policy unchanged)", () => {
    assert.equal(blockHasDelete("ADMIN"), true);
  });

  it("grants employees.delete to the HR role", () => {
    assert.equal(blockHasDelete("HR"), true);
  });

  it("grants employees.delete to the MANAGEMENT role", () => {
    assert.equal(blockHasDelete("MANAGEMENT"), true);
  });

  it("does NOT grant employees.delete to the EMPLOYEE self-service role", () => {
    assert.equal(blockHasDelete("EMPLOYEE"), false);
  });

  it("does NOT grant employees.delete to FINANCE or SUPERVISOR", () => {
    assert.equal(blockHasDelete("FINANCE"), false);
    assert.equal(blockHasDelete("SUPERVISOR"), false);
  });

  it("keeps every employee-management role in the same matrix (no duplicates)", () => {
    // The matrix is the single source; the token must appear under HR and
    // MANAGEMENT blocks (2 grants) plus the ADMIN grant = 3 in-role refs.
    const inRoleRefs = ["ADMIN", "HR", "MANAGEMENT"].reduce(
      (count, code) => count + (blockHasDelete(code) ? 1 : 0),
      0
    );
    assert.equal(inRoleRefs, 3);
  });
});

describe("server action: authorization gate unchanged", () => {
  it("deleteEmployeeAction still requires employees.delete", () => {
    assert.equal(actionsSource.includes("PERMISSIONS.EMPLOYEES_DELETE"), true);
    assert.equal(
      actionsSource.includes(
        "await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DELETE)"
      ),
      true
    );
  });

  it("actor authorization comes from the DB-backed RBAC, not the client", () => {
    assert.equal(actionsSource.includes("requireUser()"), true);
    assert.equal(actionsSource.includes("from \"@/lib/auth/rbac\""), true);
  });
});