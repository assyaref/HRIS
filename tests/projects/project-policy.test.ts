/**
 * Projects — CRUD safety policy (Node built-in `node:test`).
 *
 * Exercises the PURE decision module `features/projects/policy.ts`:
 * - Project administration is SUPERADMIN-only (delete + organization move).
 * - Deletion is rejected while ANY dependent record exists — assignments
 *   (active or ended), attendance records, work locations — protected
 *   history included.
 * - Organization moves are blocked while the project is referenced, because
 *   assignments require employee and project to share one organization.
 * - Duplicate-code (23505) and FK-violation (23503) errors are recognized so
 *   they can be mapped to safe messages.
 *
 * These pure functions are the server actions' safety layer; the actions also
 * re-authenticate, re-authorize with the system SUPERADMIN role and load the
 * target by id from PostgreSQL, which is not exercised here (no DB, no
 * browser, no network).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateProjectDelete,
  evaluateProjectOrganizationChange,
  isDuplicateProjectError,
  isForeignKeyViolation,
  isUuid,
  PROJECT_DECISION_MESSAGES,
  summarizeProjectDependencies,
} from "../../features/projects/policy.ts";

describe("project actions: SUPERADMIN-only policy", () => {
  it("allows deletion for a Super Administrator with no dependencies", () => {
    const decision = evaluateProjectDelete({
      actorIsSuperAdmin: true,
      dependencyCounts: {},
    });
    assert.deepEqual(decision, { allowed: true });
  });

  it("rejects deletion for a non-Super Administrator even without dependencies", () => {
    const decision = evaluateProjectDelete({
      actorIsSuperAdmin: false,
      dependencyCounts: {},
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "superadmin.required");
      assert.equal(
        decision.message,
        PROJECT_DECISION_MESSAGES["superadmin.required"]
      );
    }
  });

  it("rejects an organization move for a non-Super Administrator", () => {
    const decision = evaluateProjectOrganizationChange({
      actorIsSuperAdmin: false,
      dependencyCounts: {},
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "superadmin.required");
    }
  });
});

describe("project deletion: dependent records policy", () => {
  it("rejects deletion while employee assignments exist", () => {
    const decision = evaluateProjectDelete({
      actorIsSuperAdmin: true,
      dependencyCounts: { assignments: 3 },
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "dependent.records");
      assert.equal(
        decision.message,
        PROJECT_DECISION_MESSAGES["dependent.records"]
      );
    }
  });

  it("rejects deletion while attendance records exist", () => {
    const decision = evaluateProjectDelete({
      actorIsSuperAdmin: true,
      dependencyCounts: { attendance: 1 },
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "dependent.records");
    }
  });

  it("rejects deletion while work locations reference the project", () => {
    const decision = evaluateProjectDelete({
      actorIsSuperAdmin: true,
      dependencyCounts: { work_locations: 2 },
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "dependent.records");
    }
  });

  it("allows deletion only when the project has zero dependencies", () => {
    const decision = evaluateProjectDelete({
      actorIsSuperAdmin: true,
      dependencyCounts: { assignments: 0, attendance: 0, work_locations: 0 },
    });
    assert.deepEqual(decision, { allowed: true });
  });
});

describe("project organization move: dependent records policy", () => {
  it("allows a move when the project holds no references", () => {
    const decision = evaluateProjectOrganizationChange({
      actorIsSuperAdmin: true,
      dependencyCounts: {},
    });
    assert.deepEqual(decision, { allowed: true });
  });

  it("blocks a move while ended (historical) assignments exist", () => {
    // Ended assignments are still rows pointing at the project; the move
    // must be blocked so history keeps its same-organization invariant.
    const decision = evaluateProjectOrganizationChange({
      actorIsSuperAdmin: true,
      dependencyCounts: { assignments: 1 },
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "organization.change.blocked");
      assert.equal(
        decision.message,
        PROJECT_DECISION_MESSAGES["organization.change.blocked"]
      );
    }
  });

  it("blocks a move while attendance or work-location references exist", () => {
    for (const dependencyCounts of [
      { attendance: 1 },
      { work_locations: 1 },
    ] as const) {
      const decision = evaluateProjectOrganizationChange({
        actorIsSuperAdmin: true,
        dependencyCounts,
      });
      assert.equal(decision.allowed, false);
    }
  });
});

describe("project dependency summary", () => {
  it("aggregates non-zero categories in display order", () => {
    const summary = summarizeProjectDependencies({
      work_locations: 2,
      assignments: 5,
      attendance: 3,
    });
    assert.equal(summary.hasAny, true);
    assert.equal(summary.total, 10);
    assert.deepEqual(
      summary.categories.map((entry) => entry.category),
      ["assignments", "attendance", "work_locations"]
    );
    assert.deepEqual(
      summary.categories.map((entry) => entry.count),
      [5, 3, 2]
    );
  });

  it("reports zero when no dependencies exist", () => {
    const summary = summarizeProjectDependencies({});
    assert.equal(summary.hasAny, false);
    assert.equal(summary.total, 0);
    assert.deepEqual(summary.categories, []);
  });

  it("ignores unknown/undefined category keys", () => {
    const summary = summarizeProjectDependencies({ nope: 7 } as never);
    assert.equal(summary.hasAny, false);
    assert.equal(summary.total, 0);
  });
});

describe("duplicate / FK-violation / uuid detection", () => {
  it("recognizes PostgreSQL unique-violation errors (23505)", () => {
    assert.equal(isDuplicateProjectError({ code: "23505" }), true);
    assert.equal(isDuplicateProjectError({ code: "23503" }), false);
    assert.equal(isDuplicateProjectError(null), false);
    assert.equal(isDuplicateProjectError("boom"), false);
  });

  it("recognizes PostgreSQL FK-violation errors (23503)", () => {
    assert.equal(isForeignKeyViolation({ code: "23503" }), true);
    assert.equal(isForeignKeyViolation({ code: "23505" }), false);
    assert.equal(isForeignKeyViolation(null), false);
  });

  it("validates uuid-shaped identifiers from clients", () => {
    assert.equal(
      isUuid("fe6a6807-551f-4481-a033-c8d816e3d4ce"),
      true
    );
    assert.equal(isUuid("not-a-uuid"), false);
    assert.equal(isUuid(""), false);
    assert.equal(
      isUuid("'; DROP TABLE projects; --"),
      false
    );
  });
});
