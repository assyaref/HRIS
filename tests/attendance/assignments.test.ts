/**
 * PHASE 9.2 — Assignment management unit tests (Node built-in `node:test`).
 *
 * These tests exercise the PURE modules used by the assignment server
 * actions: the input schema (`assignments.schemas.ts`) and the create/end
 * decision guards (`assignments.guard.ts`). No DB, no browser, no network.
 *
 * Scope note: authorization (`requirePermission`), DB ownership queries and
 * audit writes live in the server actions/queries and require a live
 * PostgreSQL instance (the repository has no DB-backed test harness). Those
 * paths are protected by the same guard functions tested here plus org-scoped
 * SQL reviewed in code.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assignmentCreateSchema } from "../../features/attendance/assignments.schemas.ts";
import {
  evaluateCreateAssignmentGuard,
  evaluateEndAssignmentGuard,
} from "../../features/attendance/assignments.guard.ts";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const PROJECT_B = "44444444-4444-4444-8444-444444444444";
const ASSIGNMENT_A = "55555555-5555-4555-8555-555555555555";

describe("assignmentCreateSchema", () => {
  it("accepts valid employeeId + projectId", () => {
    const parsed = assignmentCreateSchema.safeParse({
      employeeId: EMPLOYEE_A,
      projectId: PROJECT_A,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects a missing projectId", () => {
    const parsed = assignmentCreateSchema.safeParse({
      employeeId: EMPLOYEE_A,
      projectId: "",
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "projectId");
    }
  });

  it("rejects a malformed projectId", () => {
    const parsed = assignmentCreateSchema.safeParse({
      employeeId: EMPLOYEE_A,
      projectId: "not-a-uuid",
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "projectId");
    }
  });

  it("rejects a malformed employeeId", () => {
    const parsed = assignmentCreateSchema.safeParse({
      employeeId: "nope",
      projectId: PROJECT_A,
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "employeeId");
    }
  });

  it("rejects a missing employeeId", () => {
    const parsed = assignmentCreateSchema.safeParse({
      employeeId: "",
      projectId: PROJECT_A,
    });
    assert.equal(parsed.success, false);
  });
});

describe("evaluateCreateAssignmentGuard", () => {
  const validBase = {
    actorOrganizationId: ORG_A,
    employee: {
      id: EMPLOYEE_A,
      organizationId: ORG_A,
      employmentStatus: "active",
    },
    project: {
      id: PROJECT_A,
      organizationId: ORG_A,
      status: "active",
    },
    existingActiveAssignment: false,
  };

  it("authorizes a valid active employee + active project", () => {
    assert.deepEqual(evaluateCreateAssignmentGuard(validBase), { ok: true });
  });

  it("rejects when the employee does not exist", () => {
    const decision = evaluateCreateAssignmentGuard({ ...validBase, employee: null });
    assert.deepEqual(decision, { ok: false, message: "Employee not found." });
  });

  it("rejects an employee from another organization (generic not found)", () => {
    const decision = evaluateCreateAssignmentGuard({
      ...validBase,
      employee: { id: EMPLOYEE_A, organizationId: ORG_B, employmentStatus: "active" },
    });
    assert.deepEqual(decision, { ok: false, message: "Employee not found." });
  });

  it("rejects an inactive employee", () => {
    const decision = evaluateCreateAssignmentGuard({
      ...validBase,
      employee: { id: EMPLOYEE_A, organizationId: ORG_A, employmentStatus: "inactive" },
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /Inactive employees/i);
    }
  });

  it("rejects when the project does not exist", () => {
    const decision = evaluateCreateAssignmentGuard({ ...validBase, project: null });
    assert.deepEqual(decision, { ok: false, message: "Project not found." });
  });

  it("rejects a project from another organization (generic not found)", () => {
    const decision = evaluateCreateAssignmentGuard({
      ...validBase,
      project: { id: PROJECT_A, organizationId: ORG_B, status: "active" },
    });
    assert.deepEqual(decision, { ok: false, message: "Project not found." });
  });

  it("rejects an inactive/completed project", () => {
    const inactive = evaluateCreateAssignmentGuard({
      ...validBase,
      project: { id: PROJECT_A, organizationId: ORG_A, status: "inactive" },
    });
    assert.equal(inactive.ok, false);
    if (!inactive.ok) assert.match(inactive.message, /Only active projects/i);

    const completed = evaluateCreateAssignmentGuard({
      ...validBase,
      project: { id: PROJECT_A, organizationId: ORG_A, status: "completed" },
    });
    assert.equal(completed.ok, false);
  });

  it("rejects a duplicate ACTIVE assignment for the same project", () => {
    const decision = evaluateCreateAssignmentGuard({
      ...validBase,
      existingActiveAssignment: true,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /already actively assigned/i);
    }
  });

  it("permits multiple active assignments across DIFFERENT projects", () => {
    const decision = evaluateCreateAssignmentGuard({
      ...validBase,
      project: { id: PROJECT_B, organizationId: ORG_A, status: "active" },
    });
    assert.deepEqual(decision, { ok: true });
  });

  it("is deterministic", () => {
    assert.deepEqual(
      evaluateCreateAssignmentGuard(validBase),
      evaluateCreateAssignmentGuard(validBase)
    );
  });
});

describe("evaluateEndAssignmentGuard", () => {
  const validBase = {
    actorOrganizationId: ORG_A,
    assignment: {
      id: ASSIGNMENT_A,
      organizationId: ORG_A,
      active: true,
    },
  };

  it("authorizes ending an active assignment", () => {
    assert.deepEqual(evaluateEndAssignmentGuard(validBase), { ok: true });
  });

  it("rejects when the assignment does not exist", () => {
    const decision = evaluateEndAssignmentGuard({ ...validBase, assignment: null });
    assert.deepEqual(decision, { ok: false, message: "Assignment not found." });
  });

  it("rejects a cross-organization assignment (generic not found)", () => {
    const decision = evaluateEndAssignmentGuard({
      ...validBase,
      assignment: { id: ASSIGNMENT_A, organizationId: ORG_B, active: true },
    });
    assert.deepEqual(decision, { ok: false, message: "Assignment not found." });
  });

  it("rejects an already-ended assignment", () => {
    const decision = evaluateEndAssignmentGuard({
      ...validBase,
      assignment: { id: ASSIGNMENT_A, organizationId: ORG_A, active: false },
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /already ended/i);
    }
  });
});
