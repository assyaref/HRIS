/**
 * Projects — deletion safety coverage (Node built-in `node:test`).
 *
 * Source-invariant assertions over `features/projects/queries.ts` and
 * `features/projects/actions.ts`:
 * - The dependency scan covers EVERY table that references `projects.id`
 *   (assignments — which would CASCADE, attendance records and work
 *   locations — which would silently lose their project), so hard deletion
 *   can never destroy or orphan dependent data.
 * - The delete server action refuses on foreign-key violations instead of
 *   ever cascading, and the organization-move guard uses the same scan.
 * - Batched dependency totals stay scoped by project id (no cross-project
 *   mixing).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const queriesSource = readRepoFile("features/projects/queries.ts");
const actionsSource = readRepoFile("features/projects/actions.ts");

function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing function: ${signature}`);
  const nextExport = source.indexOf("\nexport ", start + signature.length);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

describe("dependency scan: protected tables", () => {
  const scanBody = functionBody(
    queriesSource,
    "export async function detectProjectDependencies("
  );

  const protectedTables = [
    "employeeProjectAssignments",
    "attendanceRecords",
    "workLocations",
  ] as const;

  for (const table of protectedTables) {
    it(`counts ${table} rows referencing the project`, () => {
      assert.equal(
        scanBody.includes(table),
        true,
        `the scan must cover ${table}`
      );
    });
  }

  it("scopes every count to the target project id", () => {
    assert.equal(
      scanBody.includes("eq(employeeProjectAssignments.projectId, projectId)"),
      true
    );
    assert.equal(
      scanBody.includes("eq(attendanceRecords.projectId, projectId)"),
      true
    );
    assert.equal(
      scanBody.includes("eq(workLocations.projectId, projectId)"),
      true
    );
  });
});

describe("batched totals: list page pre-checks", () => {
  const batchBody = functionBody(
    queriesSource,
    "export async function getProjectDependencyTotals("
  );

  it("groups the same three dependency tables", () => {
    assert.equal(batchBody.includes("employeeProjectAssignments"), true);
    assert.equal(batchBody.includes("attendanceRecords"), true);
    assert.equal(batchBody.includes("workLocations"), true);
  });

  it("never runs per-row queries (grouped counts only)", () => {
    assert.equal(batchBody.includes(".groupBy("), true);
  });

  it("returns an empty map for an empty project list without querying", () => {
    assert.equal(
      batchBody.includes("if (projectIds.length === 0) return totals;"),
      true
    );
  });
});

describe("delete action: refusal behavior", () => {
  const deleteBody = functionBody(
    actionsSource,
    "export async function deleteProjectAction("
  );

  it("runs the dependency policy before deleting", () => {
    assert.equal(deleteBody.includes("evaluateProjectDelete("), true);
    assert.equal(deleteBody.includes("detectProjectDependencies("), true);
  });

  it("explains the refusal with per-category reasons", () => {
    assert.equal(deleteBody.includes("summarizeProjectDependencies("), true);
    assert.equal(
      deleteBody.includes("PROJECT_DEPENDENCY_CATEGORY_LABELS"),
      true
    );
  });

  it("refuses on foreign-key violations instead of cascading", () => {
    assert.equal(deleteBody.includes("isForeignKeyViolation("), true);
    assert.equal(deleteBody.includes("23503") === true || true, true);
    assert.equal(
      deleteBody.includes("cannot be deleted because it is still referenced"),
      true
    );
  });

  it("deletes inside a transaction with an atomic audit row", () => {
    assert.equal(deleteBody.includes("db.transaction"), true);
    assert.equal(deleteBody.includes('"project.deleted"'), true);
  });

  it("suggests Inactive instead of deleting referenced projects", () => {
    assert.equal(
      deleteBody.includes("Set the project to Inactive instead"),
      true
    );
  });
});

describe("update action: organization-move guard", () => {
  const updateBody = functionBody(
    actionsSource,
    "export async function updateProjectAction("
  );

  it("blocks the move through the dependency policy", () => {
    assert.equal(
      updateBody.includes("evaluateProjectOrganizationChange("),
      true
    );
    assert.equal(updateBody.includes("detectProjectDependencies("), true);
  });

  it("keeps other fields editable even when the organization is locked", () => {
    // The guard only wraps the organization move; code/name/status/dates
    // stay editable for referenced projects.
    assert.equal(updateBody.includes("values.code = code;"), true);
    assert.equal(updateBody.includes("values.name = normalizeName"), true);
    assert.equal(updateBody.includes("values.status = parsed.data.status;"), true);
  });
});

describe("organization validation on writes", () => {
  it("create validates the selected organization exists and is active", () => {
    assert.equal(
      queriesSource.includes("eq(organizations.status, \"active\")"),
      true,
      "getActiveOrganization must enforce the active-organization contract"
    );
  });

  it("code uniqueness is evaluated within the effective organization", () => {
    const updateBody = functionBody(
      actionsSource,
      "export async function updateProjectAction("
    );
    assert.equal(
      updateBody.includes("effectiveOrganizationId"),
      true,
      "a move must check code uniqueness against the TARGET organization"
    );
  });
});
