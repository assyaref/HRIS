/**
 * Super Administrator full-access helpers (pure logic only).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { safeReturnPath } from "../../features/acting-organization/return-path.ts";
import {
  isFieldEditableByRoles,
  isFieldVisibleToRoles,
} from "../../features/employee-fields/validation.ts";
import { isTabVisibleToRoles } from "../../features/employee-tabs/validation.ts";
import {
  balanceCoversConsumption,
  generateLeaveBalancesSchema,
  isBalanceDeletable,
  leaveBalanceSchema,
  leaveTypeSchema,
} from "../../features/leave/master.schemas.ts";

const ID = "8f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";

test("safeReturnPath keeps list pages and trims record ids", () => {
  assert.equal(safeReturnPath("/leave/management"), "/leave/management");
  assert.equal(safeReturnPath(`/leave/${ID}`), "/leave");
  assert.equal(safeReturnPath(`/settings/roles/${ID}?x=1`), "/settings/roles");
  assert.equal(safeReturnPath(`/employees/${ID}`, true), `/employees/${ID}`);
});

test("safeReturnPath refuses off-site and malformed targets", () => {
  assert.equal(safeReturnPath("https://evil.example"), "/dashboard");
  assert.equal(safeReturnPath("//evil.example/x"), "/dashboard");
  assert.equal(safeReturnPath("/\\evil"), "/dashboard");
  assert.equal(safeReturnPath(undefined), "/dashboard");
  assert.equal(safeReturnPath("/"), "/dashboard");
});

test("SUPERADMIN sees and edits role-restricted fields and tabs", () => {
  assert.equal(isFieldVisibleToRoles(["HR"], ["SUPERADMIN"]), true);
  assert.equal(isFieldEditableByRoles(["HR"], ["SUPERADMIN"]), true);
  assert.equal(isTabVisibleToRoles(["FINANCE"], ["SUPERADMIN"]), true);
  // Tenant roles are unchanged.
  assert.equal(isFieldVisibleToRoles(["HR"], ["EMPLOYEE"]), false);
  assert.equal(isTabVisibleToRoles(["FINANCE"], ["MANAGEMENT"]), false);
  assert.equal(isFieldVisibleToRoles([], ["EMPLOYEE"]), true);
});

test("leave type schema normalizes code and optional allowance", () => {
  const parsed = leaveTypeSchema.parse({
    code: "annual",
    name: " Cuti Tahunan ",
    description: "",
    defaultAllowanceDays: "",
  });
  assert.equal(parsed.code, "ANNUAL");
  assert.equal(parsed.name, "Cuti Tahunan");
  assert.equal(parsed.description, null);
  assert.equal(parsed.defaultAllowanceDays, null);
  assert.equal(
    leaveTypeSchema.parse({ code: "A", name: "A", defaultAllowanceDays: "12" })
      .defaultAllowanceDays,
    12
  );
  assert.equal(leaveTypeSchema.safeParse({ code: "a b", name: "x" }).success, false);
  assert.equal(
    leaveTypeSchema.safeParse({ code: "A", name: "A", defaultAllowanceDays: "-1" })
      .success,
    false
  );
});

test("leave balance schema validates days, halves and year", () => {
  const ok = leaveBalanceSchema.parse({
    employeeId: ID,
    leaveTypeId: ID,
    year: "2026",
    entitlement: "12.5",
    adjustment: "-2",
  });
  assert.equal(ok.entitlement, 12.5);
  assert.equal(ok.adjustment, -2);
  const bad = (patch: Record<string, unknown>) =>
    leaveBalanceSchema.safeParse({
      employeeId: ID,
      leaveTypeId: ID,
      year: "2026",
      entitlement: "12",
      ...patch,
    }).success;
  assert.equal(bad({ entitlement: "1.25" }), false);
  assert.equal(bad({ year: "26" }), false);
  assert.equal(bad({ employeeId: "nope" }), false);
  assert.equal(
    generateLeaveBalancesSchema.parse({ leaveTypeId: ID, year: "2026", entitlement: "" })
      .entitlement,
    null
  );
});

test("balance guards protect consumed days", () => {
  assert.equal(isBalanceDeletable({ used: 0, pending: 0 }), true);
  assert.equal(isBalanceDeletable({ used: 1, pending: 0 }), false);
  assert.equal(isBalanceDeletable({ used: 0, pending: 0.5 }), false);
  assert.equal(
    balanceCoversConsumption({ entitlement: 10, adjustment: 0, used: 6, pending: 4 }),
    true
  );
  assert.equal(
    balanceCoversConsumption({ entitlement: 8, adjustment: 1, used: 6, pending: 4 }),
    false
  );
});

test("organization delete-with-data requires the typed organization code", async () => {
  const { isForceDeleteConfirmed } = await import(
    "../../features/organizations/policy.ts"
  );
  assert.equal(isForceDeleteConfirmed("SPC", "SPC"), true);
  assert.equal(isForceDeleteConfirmed("SPC", " spc "), true);
  assert.equal(isForceDeleteConfirmed("SPC", "SPCX"), false);
  assert.equal(isForceDeleteConfirmed("SPC", ""), false);
  assert.equal(isForceDeleteConfirmed("SPC", undefined), false);
});
