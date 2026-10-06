/**
 * Phase 12 — user account CRUD input validation (Node built-in `node:test`).
 *
 * Exercises the PURE zod schemas in `features/users/schemas.ts`:
 * - Email/name/uuid/password shape rules.
 * - The status contract (pending | active | suspended | locked).
 * - The "an active account requires a password" refinement.
 *
 * Authorization, duplicate detection and org scoping are enforced server-side
 * in the actions, not here (no DB, no browser in this suite).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createUserSchema, updateUserSchema } from "../../features/users/schemas.ts";

const VALID_UUID = "00000000-0000-4000-8000-000000000000";

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Manager",
    email: "manager@example.com",
    organizationId: VALID_UUID,
    roleId: VALID_UUID,
    status: "active",
    password: "S3curePassw0rd!",
    ...overrides,
  };
}

function updatePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Manager",
    email: "manager@example.com",
    roleId: VALID_UUID,
    status: "active",
    ...overrides,
  };
}

describe("createUserSchema", () => {
  it("accepts a valid active account with a password", () => {
    const result = createUserSchema.safeParse(createPayload());
    assert.equal(result.success, true);
  });

  it("accepts a pending invitation without a password", () => {
    const result = createUserSchema.safeParse(
      createPayload({
        status: "pending",
        password: undefined,
        employeeId: undefined,
      })
    );
    assert.equal(result.success, true);
  });

  it("rejects an active account without a password", () => {
    const result = createUserSchema.safeParse(
      createPayload({ password: undefined })
    );
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.issues.some((issue) => issue.path[0] === "password"));
    }
  });

  it("rejects an invalid email", () => {
    const result = createUserSchema.safeParse(
      createPayload({ email: "not-an-email" })
    );
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.issues.some((issue) => issue.path[0] === "email"));
    }
  });

  it("rejects an email over 254 characters", () => {
    const result = createUserSchema.safeParse(
      createPayload({ email: `${"a".repeat(250)}@example.com` })
    );
    assert.equal(result.success, false);
  });

  it("rejects a short password", () => {
    const result = createUserSchema.safeParse(
      createPayload({ password: "short" })
    );
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.issues.some((issue) => issue.path[0] === "password"));
    }
  });

  it("rejects an invalid organizationId uuid", () => {
    const result = createUserSchema.safeParse(
      createPayload({ organizationId: "not-a-uuid" })
    );
    assert.equal(result.success, false);
  });

  it("rejects an invalid roleId uuid", () => {
    const result = createUserSchema.safeParse(
      createPayload({ roleId: "not-a-uuid" })
    );
    assert.equal(result.success, false);
  });

  it("rejects an invalid employeeId uuid", () => {
    const result = createUserSchema.safeParse(
      createPayload({ employeeId: "nope" })
    );
    assert.equal(result.success, false);
  });

  it("rejects an unknown status outside the contract", () => {
    const result = createUserSchema.safeParse(
      createPayload({ status: "archived" })
    );
    assert.equal(result.success, false);
  });

  it("accepts all contract statuses", () => {
    for (const status of ["pending", "active", "suspended", "locked"]) {
      const result = createUserSchema.safeParse(
        createPayload({ status })
      );
      assert.equal(result.success, true, `status ${status} should parse`);
    }
  });

  it("trims the name", () => {
    const result = createUserSchema.safeParse(
      createPayload({ name: "  Padded  " })
    );
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.name, "Padded");
    }
  });
});

describe("updateUserSchema", () => {
  it("accepts a valid update payload", () => {
    const result = updateUserSchema.safeParse(updatePayload());
    assert.equal(result.success, true);
  });

  it("accepts optional role and employee cleared", () => {
    const result = updateUserSchema.safeParse(
      updatePayload({ roleId: undefined, employeeId: undefined })
    );
    assert.equal(result.success, true);
  });

  it("rejects an invalid email", () => {
    const result = updateUserSchema.safeParse(updatePayload({ email: "x" }));
    assert.equal(result.success, false);
  });

  it("rejects an invalid status", () => {
    const result = updateUserSchema.safeParse(updatePayload({ status: "frozen" }));
    assert.equal(result.success, false);
  });

  it("rejects a bad roleId uuid", () => {
    const result = updateUserSchema.safeParse(updatePayload({ roleId: "bad" }));
    assert.equal(result.success, false);
  });
});