/**
 * Projects — payload validation contracts (Node built-in `node:test`).
 *
 * Exercises the zod schemas in `features/projects/schemas.ts`:
 * - Create REQUIRES an organizationId (the Super Administrator organization
 *   selector) and validates its uuid shape.
 * - Code/name shape, status enum and date format are enforced.
 * - End date may not precede start date.
 * - Update keeps every field optional but applies the same shape rules.
 * - The list search schema accepts a uuid organization filter.
 *
 * The server actions additionally re-validate the organization against the
 * `organizations` table (exists + active) before writing.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createProjectSchema,
  projectListSearchSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
} from "../../features/projects/schemas.ts";

const ORG_A = "9e177a2e-5b30-493a-a42c-0dd3f8dc39f1";
const ORG_B = "651cc79b-8ff5-4f5a-bbae-22a7d05f0b50";
const PROJECT_ID = "fe6a6807-551f-4481-a033-c8d816e3d4ce";

describe("createProjectSchema: organization selector", () => {
  it("accepts a valid project with a selected organization", () => {
    const parsed = createProjectSchema.safeParse({
      organizationId: ORG_A,
      code: "PROJECT-001",
      name: "New Project",
      status: "active",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    assert.equal(parsed.success, true);
  });

  it("rejects a missing organizationId (organization is required)", () => {
    const parsed = createProjectSchema.safeParse({
      code: "PROJECT-001",
      name: "New Project",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects an empty-string organizationId", () => {
    const parsed = createProjectSchema.safeParse({
      organizationId: "",
      code: "PROJECT-001",
      name: "New Project",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a malformed (non-uuid) organizationId", () => {
    const parsed = createProjectSchema.safeParse({
      organizationId: "not-a-uuid",
      code: "PROJECT-001",
      name: "New Project",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects unknown keys (strict payload)", () => {
    const parsed = createProjectSchema.safeParse({
      organizationId: ORG_A,
      code: "PROJECT-001",
      name: "New Project",
      isAdmin: true,
    });
    assert.equal(parsed.success, false);
  });

  it("defaults status to active when omitted", () => {
    const parsed = createProjectSchema.safeParse({
      organizationId: ORG_A,
      code: "PROJECT-001",
      name: "New Project",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.status, "active");
    }
  });
});

describe("createProjectSchema: field contracts", () => {
  const base = {
    organizationId: ORG_A,
    name: "New Project",
  };

  it("rejects an invalid project code pattern", () => {
    const parsed = createProjectSchema.safeParse({
      ...base,
      code: "BAD CODE!",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects an empty project name", () => {
    const parsed = createProjectSchema.safeParse({
      ...base,
      code: "PROJECT-001",
      name: "   ",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects an unknown status value", () => {
    const parsed = createProjectSchema.safeParse({
      ...base,
      code: "PROJECT-001",
      status: "paused",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a badly formatted date", () => {
    const parsed = createProjectSchema.safeParse({
      ...base,
      code: "PROJECT-001",
      startDate: "01-2026-01",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects an end date earlier than the start date", () => {
    const parsed = createProjectSchema.safeParse({
      ...base,
      code: "PROJECT-001",
      startDate: "2026-06-01",
      endDate: "2026-05-31",
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find(
        (item) => item.path[0] === "endDate"
      );
      assert.ok(issue, "endDate must carry the validation issue");
    }
  });

  it("accepts an end date equal to the start date", () => {
    const parsed = createProjectSchema.safeParse({
      ...base,
      code: "PROJECT-001",
      startDate: "2026-06-01",
      endDate: "2026-06-01",
    });
    assert.equal(parsed.success, true);
  });

  it("allows both dates to be omitted", () => {
    const parsed = createProjectSchema.safeParse({
      ...base,
      code: "PROJECT-001",
    });
    assert.equal(parsed.success, true);
  });
});

describe("updateProjectSchema: partial + guardrails", () => {
  it("accepts a partial update without touching other fields", () => {
    const parsed = updateProjectSchema.safeParse({ name: "Renamed" });
    assert.equal(parsed.success, true);
  });

  it("accepts an organization move as a uuid", () => {
    const parsed = updateProjectSchema.safeParse({
      organizationId: ORG_B,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects a malformed organizationId", () => {
    const parsed = updateProjectSchema.safeParse({
      organizationId: PROJECT_ID.slice(0, 8),
    });
    assert.equal(parsed.success, false);
  });

  it("rejects an end date earlier than the start date across fields", () => {
    const parsed = updateProjectSchema.safeParse({
      startDate: "2026-06-01",
      endDate: "2025-01-01",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects unknown keys (strict payload)", () => {
    const parsed = updateProjectSchema.safeParse({
      organizationId: ORG_A,
      isOwner: true,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects an invalid status transition value", () => {
    const parsed = updateProjectStatusSchema.safeParse({ status: "archived" });
    assert.equal(parsed.success, false);
  });

  it("accepts the three lifecycle statuses", () => {
    for (const status of ["active", "inactive", "completed"] as const) {
      const parsed = updateProjectStatusSchema.safeParse({ status });
      assert.equal(parsed.success, true);
    }
  });
});

describe("projectListSearchSchema: list filters", () => {
  it("accepts an empty filter set", () => {
    const parsed = projectListSearchSchema.safeParse({});
    assert.equal(parsed.success, true);
  });

  it("accepts a uuid organization filter", () => {
    const parsed = projectListSearchSchema.safeParse({
      organizationId: ORG_A,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects a non-uuid organization filter", () => {
    const parsed = projectListSearchSchema.safeParse({
      organizationId: "all",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects an unknown status filter", () => {
    const parsed = projectListSearchSchema.safeParse({ status: "paused" });
    assert.equal(parsed.success, false);
  });

  it("caps the search query at 80 characters", () => {
    const parsed = projectListSearchSchema.safeParse({ q: "x".repeat(81) });
    assert.equal(parsed.success, false);
  });
});
