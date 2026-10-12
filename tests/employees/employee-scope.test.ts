/**
 * Employee list scope resolution — tenant-isolation unit tests (node:test).
 *
 * These pin the PURE rules shared by the employees page and the export route:
 * a non-Super Administrator can never leave their own organization no matter
 * what `org`/`projectId` they submit, and a Super Administrator may only view
 * an existing, ACTIVE organization by a well-formed UUID. A stale/invalid
 * project is always reset (which is what makes an organization change drop a
 * project that does not belong to the new organization).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isUuid,
  resolveEmployeeScope,
  resolveSelectedProjectId,
} from "../../features/employees/scope.ts";

const SYSTEM = "3f66da05-2817-4ea8-98db-5b3094c09626";
const SUPRACO = "651cc79b-8ff5-4f5a-bbae-22a7d05f0b50";
const PROJECT = "2d15af09-8876-4a80-aef7-566cfa698d41";

describe("isUuid", () => {
  it("accepts a canonical uuid", () => {
    assert.equal(isUuid(SUPRACO), true);
  });

  it("rejects malformed ids and non-strings", () => {
    assert.equal(isUuid("not-a-uuid"), false);
    assert.equal(isUuid(""), false);
    assert.equal(isUuid(undefined), false);
    assert.equal(isUuid(null), false);
    assert.equal(isUuid(42), false);
  });
});

describe("resolveEmployeeScope", () => {
  it("uses the session organization for a non-superadmin, ignoring the request", () => {
    const scope = resolveEmployeeScope({
      requestedOrganizationId: SUPRACO,
      userOrganizationId: SYSTEM,
      isSuperAdmin: false,
      requestedOrganizationIsActive: false,
    });
    assert.equal(scope.organizationId, SYSTEM);
    assert.equal(scope.viewingOtherOrganization, false);
  });

  it("lets a superadmin view a different, active organization", () => {
    const scope = resolveEmployeeScope({
      requestedOrganizationId: SUPRACO,
      userOrganizationId: SYSTEM,
      isSuperAdmin: true,
      requestedOrganizationIsActive: true,
    });
    assert.equal(scope.organizationId, SUPRACO);
    assert.equal(scope.viewingOtherOrganization, true);
  });

  it("stays on the own organization when a superadmin requests it explicitly", () => {
    const scope = resolveEmployeeScope({
      requestedOrganizationId: SYSTEM,
      userOrganizationId: SYSTEM,
      isSuperAdmin: true,
      requestedOrganizationIsActive: true,
    });
    assert.equal(scope.organizationId, SYSTEM);
    assert.equal(scope.viewingOtherOrganization, false);
  });

  it("refuses a requested organization that is unknown or inactive", () => {
    const scope = resolveEmployeeScope({
      requestedOrganizationId: SUPRACO,
      userOrganizationId: SYSTEM,
      isSuperAdmin: true,
      requestedOrganizationIsActive: false,
    });
    assert.equal(scope.organizationId, SYSTEM);
    assert.equal(scope.viewingOtherOrganization, false);
  });

  it("refuses a malformed requested organization", () => {
    const scope = resolveEmployeeScope({
      requestedOrganizationId: "'; DROP TABLE employees;--",
      userOrganizationId: SYSTEM,
      isSuperAdmin: true,
      requestedOrganizationIsActive: true,
    });
    assert.equal(scope.organizationId, SYSTEM);
    assert.equal(scope.viewingOtherOrganization, false);
  });

  it("returns no scope when the session has no organization", () => {
    const scope = resolveEmployeeScope({
      requestedOrganizationId: SUPRACO,
      userOrganizationId: null,
      isSuperAdmin: false,
      requestedOrganizationIsActive: true,
    });
    assert.equal(scope.organizationId, null);
    assert.equal(scope.viewingOtherOrganization, false);
  });
});

describe("resolveSelectedProjectId", () => {
  it("keeps a valid project that belongs to the organization", () => {
    assert.equal(
      resolveSelectedProjectId({
        requestedProjectId: PROJECT,
        projectBelongsToOrganization: true,
      }),
      PROJECT
    );
  });

  it("resets a project that does not belong to the organization", () => {
    assert.equal(
      resolveSelectedProjectId({
        requestedProjectId: PROJECT,
        projectBelongsToOrganization: false,
      }),
      null
    );
  });

  it("resets a malformed project id", () => {
    assert.equal(
      resolveSelectedProjectId({
        requestedProjectId: "not-a-uuid",
        projectBelongsToOrganization: true,
      }),
      null
    );
  });

  it("returns null when no project was requested", () => {
    assert.equal(
      resolveSelectedProjectId({
        requestedProjectId: undefined,
        projectBelongsToOrganization: true,
      }),
      null
    );
    assert.equal(
      resolveSelectedProjectId({
        requestedProjectId: "  ",
        projectBelongsToOrganization: true,
      }),
      null
    );
  });
});
