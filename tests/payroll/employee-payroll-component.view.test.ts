/**
 * PM-03.3 — Employee payroll component manager UI-view helper tests.
 *
 * These exercise the PURE client-view logic: RBAC mode resolution, client-side
 * amount guidance, and the exact client → server payload shape (which must
 * never include `organizationId`, `active` or server-only identifiers).
 * No DB, no browser, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  amountForMethodError,
  amountForMethodHelp,
  buildEmployeePayrollComponentCreateInput,
  buildEmployeePayrollComponentEndInput,
  buildEmployeePayrollComponentUpdateInput,
  END_CONFIRMATION_BUTTON,
  END_CONFIRMATION_TITLE,
  resolveEmployeePayrollComponentManagerMode,
} from "../../features/payroll/employee-payroll-component.view.ts";

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";
const COMPONENT_A = "33333333-3333-4333-8333-333333333333";

describe("resolveEmployeePayrollComponentManagerMode", () => {
  it("is hidden without payroll view permission", () => {
    assert.equal(
      resolveEmployeePayrollComponentManagerMode(false, false),
      "hidden"
    );
    assert.equal(
      resolveEmployeePayrollComponentManagerMode(false, true),
      "hidden"
    );
  });

  it("is read-only when the user can view but lacks PAYROLL_MANAGE", () => {
    assert.equal(
      resolveEmployeePayrollComponentManagerMode(true, false),
      "readonly"
    );
  });

  it("allows management only with PAYROLL_MANAGE", () => {
    assert.equal(resolveEmployeePayrollComponentManagerMode(true, true), "manage");
  });
});

describe("amountForMethodError", () => {
  it("accepts percentage 0 and 100", () => {
    assert.equal(amountForMethodError("percentage", 0), null);
    assert.equal(amountForMethodError("percentage", 100), null);
  });

  it("rejects percentage above 100", () => {
    assert.equal(amountForMethodError("percentage", 101), "Persentase harus antara 0 dan 100.");
  });

  it("does not cap fixed and manual amounts", () => {
    assert.equal(amountForMethodError("fixed", 5_000_000), null);
    assert.equal(amountForMethodError("manual", 500_000), null);
    assert.equal(amountForMethodError("manual", 101), null);
  });

  it("localizes the percentage helper text to Indonesian", () => {
    assert.match(amountForMethodHelp("percentage"), /0–100/);
    assert.match(amountForMethodHelp("fixed"), /Rupiah/);
  });
});

describe("buildEmployeePayrollComponentCreateInput", () => {
  it("forwards only the whitelisted payload fields (no organizationId/active)", () => {
    const input = buildEmployeePayrollComponentCreateInput({
      employeeId: EMPLOYEE_A,
      componentId: COMPONENT_A,
      amount: 5_000_000,
      effectiveFrom: "2026-09-01",
      effectiveTo: "2027-09-01",
      notes: "kenaikan gaji",
    });

    assert.deepEqual(input, {
      employeeId: EMPLOYEE_A,
      componentId: COMPONENT_A,
      amount: 5_000_000,
      effectiveFrom: "2026-09-01",
      effectiveTo: "2027-09-01",
      notes: "kenaikan gaji",
    });

    const keys = Object.keys(input);
    assert.ok(!keys.includes("organizationId"));
    assert.ok(!keys.includes("active"));
    assert.ok(!keys.includes("id"));
  });

  it("omits an empty effectiveTo and trims blank notes", () => {
    const input = buildEmployeePayrollComponentCreateInput({
      employeeId: EMPLOYEE_A,
      componentId: COMPONENT_A,
      amount: 1_000_000,
      effectiveFrom: "2026-10-01",
      effectiveTo: "",
      notes: "   ",
    });

    assert.equal(input.effectiveTo, undefined);
    assert.equal(input.notes, undefined);
    assert.deepEqual(
      Object.keys(input).sort(),
      ["amount", "componentId", "effectiveFrom", "employeeId"].sort()
    );
  });
});

describe("buildEmployeePayrollComponentUpdateInput", () => {
  it("forwards the update fields without server-only identifiers", () => {
    const input = buildEmployeePayrollComponentUpdateInput({
      amount: 6_000_000,
      effectiveFrom: "2026-09-01",
      effectiveTo: "",
      notes: "perundingan ulang",
    });

    assert.deepEqual(input, {
      amount: 6_000_000,
      effectiveFrom: "2026-09-01",
      notes: "perundingan ulang",
    });
    const keys = Object.keys(input);
    assert.ok(!keys.includes("organizationId"));
    assert.ok(!keys.includes("active"));
    assert.ok(!keys.includes("id"));
  });

  it("clears a previously scheduled end when effectiveTo is empty", () => {
    const input = buildEmployeePayrollComponentUpdateInput({
      amount: 5_000_000,
      effectiveFrom: "2026-09-01",
      effectiveTo: "",
      notes: "",
    });
    assert.equal(input.effectiveTo, undefined);
    assert.ok(!("effectiveTo" in input));
  });
});

describe("buildEmployeePayrollComponentEndInput", () => {
  it("omits the date so the server defaults to today when empty", () => {
    const input = buildEmployeePayrollComponentEndInput("");
    assert.deepEqual(input, {});
    assert.ok(!("effectiveTo" in input));
  });

  it("forwards an explicit end date", () => {
    assert.deepEqual(buildEmployeePayrollComponentEndInput("2027-01-31"), {
      effectiveTo: "2027-01-31",
    });
  });
});

describe("end confirmation floor (UI strings)", () => {
  it("provides an explicit confirmation title and submit label", () => {
    assert.equal(END_CONFIRMATION_TITLE, "Akhiri komponen gaji");
    assert.equal(END_CONFIRMATION_BUTTON, "Akhiri komponen");
  });
});