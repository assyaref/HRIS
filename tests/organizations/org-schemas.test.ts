/**
 * R19 — Organization input validation (Node built-in `node:test`).
 *
 * Exercises the zod schemas that the server actions re-check on every
 * mutation: required/empty names, code format rules, status contract and
 * `.strict()` unknown-key rejection. Uniqueness (duplicate code/name) is a
 * database + action concern exercised in the RBAC/source suite; the schemas
 * here cover shape-only validation.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
} from "../../features/organizations/schemas.ts";
import {
  ORGANIZATION_STATUSES,
} from "../../features/organizations/constants.ts";

describe("create organization schema", () => {
  it("accepts a valid name/code/status payload and uppercases the code", () => {
    const input: CreateOrganizationInput = {
      name: "Acme Corp",
      code: "acme",
      status: "active",
    };
    const result = createOrganizationSchema.safeParse(input);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.code, "ACME");
      assert.equal(result.data.name, "Acme Corp");
      assert.equal(result.data.status, "active");
    }
  });

  it("defaults the status to active when omitted", () => {
    const result = createOrganizationSchema.safeParse({
      name: "Beta",
      code: "BETA",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.status, "active");
    }
  });

  it("rejects a missing name", () => {
    const result = createOrganizationSchema.safeParse({ code: "ACME" });
    assert.equal(result.success, false);
  });

  it("rejects an empty (whitespace-only) name", () => {
    const result = createOrganizationSchema.safeParse({
      name: "   ",
      code: "ACME",
    });
    assert.equal(result.success, false);
  });

  it("rejects a name that is too long", () => {
    const result = createOrganizationSchema.safeParse({
      name: "x".repeat(121),
      code: "ACME",
    });
    assert.equal(result.success, false);
  });

  it("rejects a missing code", () => {
    const result = createOrganizationSchema.safeParse({ name: "Acme Corp" });
    assert.equal(result.success, false);
  });

  it("rejects a code that is too short", () => {
    const result = createOrganizationSchema.safeParse({
      name: "Acme Corp",
      code: "A",
    });
    assert.equal(result.success, false);
  });

  it("rejects a code with illegal characters", () => {
    const result = createOrganizationSchema.safeParse({
      name: "Acme Corp",
      code: "AC ME!",
    });
    assert.equal(result.success, false);
  });

  it("rejects an unknown status value", () => {
    const result = createOrganizationSchema.safeParse({
      name: "Acme Corp",
      code: "ACME",
      status: "banana",
    });
    assert.equal(result.success, false);
  });

  it("rejects unknown keys (.strict)", () => {
    const result = createOrganizationSchema.safeParse({
      name: "Acme Corp",
      code: "ACME",
      description: "not a schema field",
    });
    assert.equal(result.success, false);
  });
});

describe("update organization schema", () => {
  it("accepts a single-field update", () => {
    const input: UpdateOrganizationInput = { name: "Acme Group" };
    const result = updateOrganizationSchema.safeParse(input);
    assert.equal(result.success, true);
  });

  it("accepts a partial status/code update and uppercases the code", () => {
    const result = updateOrganizationSchema.safeParse({
      code: "acme2",
      status: "inactive",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.code, "ACME2");
      assert.equal(result.data.status, "inactive");
    }
  });

  it("rejects an update that changes nothing", () => {
    const result = updateOrganizationSchema.safeParse({});
    assert.equal(result.success, false);
  });

  it("rejects unknown keys (.strict)", () => {
    const result = updateOrganizationSchema.safeParse({
      name: "Acme",
      email: "security@example.test",
    });
    assert.equal(result.success, false);
  });

  it("rejects a bad code on update", () => {
    const result = updateOrganizationSchema.safeParse({ code: "bad code!" });
    assert.equal(result.success, false);
  });
});

describe("status contract", () => {
  it("exposes exactly the two organization statuses", () => {
    assert.deepEqual(ORGANIZATION_STATUSES, ["active", "inactive"]);
  });
});