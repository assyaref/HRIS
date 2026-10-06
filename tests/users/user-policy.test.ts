/**
 * Phase 12 — User account CRUD safety policy (Node built-in `node:test`).
 *
 * Exercises the PURE decision module `features/users/policy.ts`:
 * - Self-deletion / self-deactivation protection.
 * - Last active Super Administrator protection (deletion and deactivation).
 * - Protected historical-record dependency.
 * - Cross-organization isolation and SUPERADMIN privilege protection.
 *
 * These pure functions are the server actions' safety layer; the actions also
 * re-authenticate, re-authorize and org-scope every DB read, which is not
 * exercised here (no DB, no browser, no network).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEACTIVATION_REJECTION_MESSAGES,
  DELETE_REJECTION_MESSAGES,
  evaluateManageScope,
  evaluateUserDeactivation,
  evaluateUserDeletion,
  isDeactivationTransition,
  isDeleteRejectionCode,
  sameOrganization,
  USER_STATUSES,
} from "../../features/users/policy.ts";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("user deletion policy", () => {
  it("allows deleting an eligible account", () => {
    const decision = evaluateUserDeletion({
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      targetIsSuperAdmin: false,
      activeSuperAdminCount: 1,
      hasProtectedHistory: false,
    });
    assert.deepEqual(decision, { allowed: true });
  });

  it("rejects deleting your own account", () => {
    const decision = evaluateUserDeletion({
      actorUserId: ACTOR_ID,
      targetUserId: ACTOR_ID,
      targetIsSuperAdmin: false,
      activeSuperAdminCount: 1,
      hasProtectedHistory: false,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.code, "SELF_DELETE");
      assert.equal(
        decision.message,
        DELETE_REJECTION_MESSAGES.SELF_DELETE
      );
    }
  });

  it("rejects deleting the last active Super Administrator", () => {
    const decision = evaluateUserDeletion({
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      targetIsSuperAdmin: true,
      activeSuperAdminCount: 1,
      hasProtectedHistory: false,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.code, "LAST_SUPERADMIN");
      assert.equal(
        decision.message,
        DELETE_REJECTION_MESSAGES.LAST_SUPERADMIN
      );
    }
  });

  it("allows deleting a Super Administrator when another active one exists", () => {
    const decision = evaluateUserDeletion({
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      targetIsSuperAdmin: true,
      activeSuperAdminCount: 2,
      hasProtectedHistory: false,
    });
    assert.deepEqual(decision, { allowed: true });
  });

  it("rejects deleting an account with protected historical records", () => {
    const decision = evaluateUserDeletion({
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      targetIsSuperAdmin: false,
      activeSuperAdminCount: 1,
      hasProtectedHistory: true,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.code, "PROTECTED_HISTORY");
      assert.equal(
        decision.message,
        DELETE_REJECTION_MESSAGES.PROTECTED_HISTORY
      );
    }
  });

  it("prioritizes self-deletion over other rejection reasons", () => {
    const decision = evaluateUserDeletion({
      actorUserId: ACTOR_ID,
      targetUserId: ACTOR_ID,
      targetIsSuperAdmin: true,
      activeSuperAdminCount: 1,
      hasProtectedHistory: true,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.code, "SELF_DELETE");
    }
  });

  it("exposes a typed rejection-code predicate for callers", () => {
    assert.equal(isDeleteRejectionCode("SELF_DELETE"), true);
    assert.equal(isDeleteRejectionCode("LAST_SUPERADMIN"), true);
    assert.equal(isDeleteRejectionCode("PROTECTED_HISTORY"), true);
    assert.equal(isDeleteRejectionCode("nonsense"), false);
  });
});

describe("user deactivation policy", () => {
  it("allows deactivating an eligible account", () => {
    const decision = evaluateUserDeactivation({
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      targetIsSuperAdmin: false,
      activeSuperAdminCount: 1,
    });
    assert.deepEqual(decision, { allowed: true });
  });

  it("rejects deactivating your own account", () => {
    const decision = evaluateUserDeactivation({
      actorUserId: ACTOR_ID,
      targetUserId: ACTOR_ID,
      targetIsSuperAdmin: false,
      activeSuperAdminCount: 1,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.code, "SELF_LOCAL");
      assert.equal(
        decision.message,
        DEACTIVATION_REJECTION_MESSAGES.SELF_DEACTIVATION
      );
    }
  });

  it("rejects deactivating the last active Super Administrator", () => {
    const decision = evaluateUserDeactivation({
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      targetIsSuperAdmin: true,
      activeSuperAdminCount: 1,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.code, "LAST_SUPERADMIN");
      assert.equal(
        decision.message,
        DEACTIVATION_REJECTION_MESSAGES.LAST_SUPERADMIN
      );
    }
  });

  it("allows deactivating a Super Administrator when another active one exists", () => {
    const decision = evaluateUserDeactivation({
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      targetIsSuperAdmin: true,
      activeSuperAdminCount: 2,
    });
    assert.deepEqual(decision, { allowed: true });
  });
});

describe("management scope policy", () => {
  it("allows a tenant administrator to manage accounts in their own organization", () => {
    const decision = evaluateManageScope({
      actorIsSuperAdmin: false,
      actorOrganizationId: ORG_A,
      targetOrganizationId: ORG_A,
      targetRoleCode: "MANAGEMENT",
    });
    assert.deepEqual(decision, { allowed: true });
  });

  it("rejects a tenant administrator managing another organization (org isolation)", () => {
    const decision = evaluateManageScope({
      actorIsSuperAdmin: false,
      actorOrganizationId: ORG_A,
      targetOrganizationId: ORG_B,
      targetRoleCode: "MANAGEMENT",
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.code, "SCOPE_MISMATCH");
    }
  });

  it("rejects a tenant administrator assigning the SUPERADMIN role", () => {
    const decision = evaluateManageScope({
      actorIsSuperAdmin: false,
      actorOrganizationId: ORG_A,
      targetOrganizationId: ORG_A,
      targetRoleCode: "SUPERADMIN",
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.code, "SUPERADMIN_ROLE_PROTECTED");
    }
  });

  it("rejects a tenant administrator managing an existing Super Administrator account", () => {
    const decision = evaluateManageScope({
      actorIsSuperAdmin: false,
      actorOrganizationId: ORG_A,
      targetOrganizationId: ORG_A,
      targetIsSuperAdmin: true,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed === false) {
      assert.equal(decision.code, "SUPERADMIN_TARGET_PROTECTED");
    }
  });

  it("allows a SUPERADMIN to manage any organization and assign SUPERADMIN", () => {
    const decision = evaluateManageScope({
      actorIsSuperAdmin: true,
      actorOrganizationId: ORG_A,
      targetOrganizationId: ORG_B,
      targetRoleCode: "SUPERADMIN",
      targetIsSuperAdmin: true,
    });
    assert.deepEqual(decision, { allowed: true });
  });
});

describe("transition helpers and constants", () => {
  it("exposes the schema status contract", () => {
    assert.deepEqual(USER_STATUSES, [
      "pending",
      "active",
      "suspended",
      "locked",
    ]);
  });

  it("labels activation and deactivation transitions", () => {
    assert.equal(isDeactivationTransition("active", "suspended"), true);
    assert.equal(isDeactivationTransition("active", "active"), false);
    assert.equal(isDeactivationTransition("pending", "active"), false);
  });

  it("compares organizations null-safely", () => {
    assert.equal(sameOrganization(ORG_A, ORG_A), true);
    assert.equal(sameOrganization(ORG_A, ORG_B), false);
    assert.equal(sameOrganization(null, null), true);
    assert.equal(sameOrganization(ORG_A, null), false);
  });
});