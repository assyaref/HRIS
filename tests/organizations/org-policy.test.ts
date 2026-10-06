/**
 * R19 — Organization CRUD safety policy (Node built-in `node:test`).
 *
 * Exercises the PURE decision module `features/organizations/policy.ts`:
 * - Organization administration is SUPERADMIN-only (every operation).
 * - The reserved SYSTEM organization cannot be deleted or deactivated and its
 *   code/status are frozen.
 * - Hard deletion is rejected while ANY dependent record exists — users,
 *   employees, business data, protected historical records and audit trails.
 * - Deactivation remains the sanctioned alternative for orgs with records.
 *
 * These pure functions are the server actions' safety layer; the actions also
 * re-authenticate, re-authorize and org-scope every DB read, which is not
 * exercised here (no DB, no browser, no network).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowsSystemFieldChange,
  evaluateOrganizationAction,
  isDuplicateOrganizationError,
  summarizeDependencies,
  ORGANIZATION_DECISION_MESSAGES,
} from "../../features/organizations/policy.ts";
import { SYSTEM_ORGANIZATION_CODE } from "../../lib/auth/roles.ts";

describe("organization actions: SUPERADMIN-only policy", () => {
  it("allows every mutation for a Super Administrator", () => {
    for (const operation of ["update", "delete", "activate", "deactivate"] as const) {
      const decision = evaluateOrganizationAction({
        operation,
        targetCode: "ACME",
        actorIsSuperAdmin: true,
        dependencyCounts: {},
      });
      assert.deepEqual(decision, { allowed: true }, `operation ${operation}`);
    }
  });

  it("rejects every mutation for a non-Super Administrator", () => {
    for (const operation of ["update", "delete", "activate", "deactivate"] as const) {
      const decision = evaluateOrganizationAction({
        operation,
        targetCode: "ACME",
        actorIsSuperAdmin: false,
        dependencyCounts: { users: 1 },
      });
      assert.equal(decision.allowed, false, `operation ${operation}`);
      if (decision.allowed === false) {
        assert.equal(decision.reason, "superadmin.required");
        assert.equal(
          decision.message,
          ORGANIZATION_DECISION_MESSAGES["superadmin.required"]
        );
      }
    }
  });

  it("rejects mutations when the actor is not a Super Administrator even without dependencies", () => {
    const decision = evaluateOrganizationAction({
      operation: "update",
      targetCode: "ACME",
      actorIsSuperAdmin: false,
    });
    assert.deepEqual(decision, {
      allowed: false,
      reason: "superadmin.required",
      message: ORGANIZATION_DECISION_MESSAGES["superadmin.required"],
    });
  });
});

describe("SYSTEM organization protection", () => {
  it("rejects deleting the reserved SYSTEM organization", () => {
    const decision = evaluateOrganizationAction({
      operation: "delete",
      targetCode: SYSTEM_ORGANIZATION_CODE,
      actorIsSuperAdmin: true,
      dependencyCounts: {},
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "system.reserved");
    }
  });

  it("rejects deactivating the reserved SYSTEM organization", () => {
    const decision = evaluateOrganizationAction({
      operation: "deactivate",
      targetCode: SYSTEM_ORGANIZATION_CODE,
      actorIsSuperAdmin: true,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "system.reserved");
    }
  });

  it("keeps the SYSTEM code and status frozen, name allowed", () => {
    assert.equal(allowsSystemFieldChange("code", SYSTEM_ORGANIZATION_CODE), false);
    assert.equal(allowsSystemFieldChange("status", SYSTEM_ORGANIZATION_CODE), false);
    assert.equal(allowsSystemFieldChange("name", SYSTEM_ORGANIZATION_CODE), true);
  });

  it("does not freeze metadata on real tenant organizations", () => {
    assert.equal(allowsSystemFieldChange("code", "ACME"), true);
    assert.equal(allowsSystemFieldChange("status", "ACME"), true);
    assert.equal(allowsSystemFieldChange("name", "ACME"), true);
  });

  it("identifies the SYSTEM code centrally rather than by magic string", () => {
    assert.equal(SYSTEM_ORGANIZATION_CODE, "SYSTEM");
  });
});

describe("organization deletion: dependent records policy", () => {
  it("rejects deletion when the organization still has employees", () => {
    const decision = evaluateOrganizationAction({
      operation: "delete",
      targetCode: "ACME",
      actorIsSuperAdmin: true,
      dependencyCounts: { employees: 12 },
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "dependent.records");
      assert.equal(
        decision.message,
        ORGANIZATION_DECISION_MESSAGES["dependent.records"]
      );
    }
  });

  it("rejects deletion when the organization still has users", () => {
    const decision = evaluateOrganizationAction({
      operation: "delete",
      targetCode: "ACME",
      actorIsSuperAdmin: true,
      dependencyCounts: { users: 1 },
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "dependent.records");
    }
  });

  it("rejects deletion when protected historical records exist (payroll/payslips)", () => {
    const decision = evaluateOrganizationAction({
      operation: "delete",
      targetCode: "ACME",
      actorIsSuperAdmin: true,
      dependencyCounts: { payroll: 4, payslips: 40 },
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "dependent.records");
    }
  });

  it("rejects deletion when audit or attendance history exists", () => {
    const decision = evaluateOrganizationAction({
      operation: "delete",
      targetCode: "ACME",
      actorIsSuperAdmin: true,
      dependencyCounts: { audit: 1 },
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.reason, "dependent.records");
    }
  });

  it("allows deletion only when the organization is completely empty", () => {
    const decision = evaluateOrganizationAction({
      operation: "delete",
      targetCode: "ACME",
      actorIsSuperAdmin: true,
      dependencyCounts: {},
    });
    assert.deepEqual(decision, { allowed: true });
  });

  it("allows deactivation even when the organization still holds records", () => {
    const decision = evaluateOrganizationAction({
      operation: "deactivate",
      targetCode: "ACME",
      actorIsSuperAdmin: true,
      dependencyCounts: { employees: 12, payroll: 4 },
    });
    assert.deepEqual(decision, { allowed: true });
  });
});

describe("dependency summary", () => {
  it("aggregates non-zero categories in display order", () => {
    const summary = summarizeDependencies({
      audit: 1,
      employees: 5,
      payroll: 3,
      users: 2,
    });
    assert.equal(summary.hasAny, true);
    assert.equal(summary.total, 11);
    assert.deepEqual(
      summary.categories.map((entry) => entry.category),
      ["users", "employees", "payroll", "audit"]
    );
    assert.deepEqual(
      summary.categories.map((entry) => entry.count),
      [2, 5, 3, 1]
    );
  });

  it("reports zero when no dependencies exist", () => {
    const summary = summarizeDependencies({});
    assert.equal(summary.hasAny, false);
    assert.equal(summary.total, 0);
    assert.deepEqual(summary.categories, []);
  });

  it("ignores unknown/undefined category keys", () => {
    const summary = summarizeDependencies({ nope: 5 } as never);
    assert.equal(summary.hasAny, false);
    assert.equal(summary.total, 0);
  });
});

describe("duplicate / unique-violation detection", () => {
  it("recognizes PostgreSQL unique-violation errors (23505)", () => {
    assert.equal(isDuplicateOrganizationError({ code: "23505" }), true);
    assert.equal(isDuplicateOrganizationError({ code: "P0001" }), false);
    assert.equal(isDuplicateOrganizationError(null), false);
    assert.equal(isDuplicateOrganizationError("boom"), false);
  });
});