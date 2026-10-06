/**
 * PM-11 — Locked payroll period deletion guard tests (Node `node:test`).
 *
 * These exercise the PURE decision functions in
 * features/payroll/payroll-period-deletion.guard.ts:
 * - locked + no payslips → allowed
 * - locked + all payslips REVOKED → allowed
 * - locked + any GENERATED payslip → rejected (message names the status)
 * - locked + any PUBLISHED payslip → rejected (message names the status)
 * - locked + mixed generated/published → rejected naming both statuses
 * - locked + unknown payslip status → rejected (never silently deleted)
 * No DB, no auth, no filesystem.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildLockedPayrollPeriodDeletionDecision,
  canDeleteLockedPeriodWithPayslipStatus,
} from "../../features/payroll/payroll-period-deletion.guard.ts";

describe("canDeleteLockedPeriodWithPayslipStatus", () => {
  it("allows deleting a payslip that is revoked", () => {
    assert.equal(canDeleteLockedPeriodWithPayslipStatus("revoked"), true);
  });

  it("rejects deleting a generated payslip", () => {
    assert.equal(canDeleteLockedPeriodWithPayslipStatus("generated"), false);
  });

  it("rejects deleting a published payslip", () => {
    assert.equal(canDeleteLockedPeriodWithPayslipStatus("published"), false);
  });

  it("rejects deleting a payslip with an unknown status", () => {
    assert.equal(canDeleteLockedPeriodWithPayslipStatus("pending"), false);
    assert.equal(canDeleteLockedPeriodWithPayslipStatus(""), false);
  });
});

describe("buildLockedPayrollPeriodDeletionDecision", () => {
  it("allows deletion when the locked period has no payslips", () => {
    const decision = buildLockedPayrollPeriodDeletionDecision([]);

    assert.equal(decision.allowed, true);
    assert.equal(decision.message, null);
  });

  it("allows deletion when every payslip is revoked", () => {
    const decision = buildLockedPayrollPeriodDeletionDecision([
      "revoked",
      "revoked",
    ]);

    assert.equal(decision.allowed, true);
    assert.equal(decision.message, null);
  });

  it("rejects deletion when the locked period has a generated payslip", () => {
    const decision = buildLockedPayrollPeriodDeletionDecision(["generated"]);

    assert.equal(decision.allowed, false);
    assert.match(decision.message ?? "", /generated/);
  });

  it("rejects deletion when the locked period has a published payslip", () => {
    const decision = buildLockedPayrollPeriodDeletionDecision(["published"]);

    assert.equal(decision.allowed, false);
    assert.match(decision.message ?? "", /published/);
  });

  it("rejects deletion when any single payslip is active even if others are revoked", () => {
    const decision = buildLockedPayrollPeriodDeletionDecision([
      "revoked",
      "generated",
      "generated",
      "revoked",
    ]);

    assert.equal(decision.allowed, false);
    assert.match(decision.message ?? "", /generated/);
  });

  it("rejects deletion when generated and published payslips coexist", () => {
    const decision = buildLockedPayrollPeriodDeletionDecision([
      "generated",
      "published",
    ]);

    assert.equal(decision.allowed, false);
    assert.match(decision.message ?? "", /generated/);
    assert.match(decision.message ?? "", /published/);
  });

  it("rejects deletion when a payslip has an unknown status", () => {
    const decision = buildLockedPayrollPeriodDeletionDecision(["pending"]);

    assert.equal(decision.allowed, false);
    assert.match(decision.message ?? "", /pending/);
  });

  it("rejects deletion when only unknown statuses coexist with generated", () => {
    const decision = buildLockedPayrollPeriodDeletionDecision([
      "pending",
      "generated",
    ]);

    assert.equal(decision.allowed, false);
    assert.match(decision.message ?? "", /pending/);
    assert.match(decision.message ?? "", /generated/);
  });

  it("produces an accurate message mentioning how the status blocks deletion", () => {
    const decision = buildLockedPayrollPeriodDeletionDecision(["generated"]);

    assert.equal(
      decision.message,
      "This locked payroll period has generated payslips and cannot be deleted. Revoke the payslips first."
    );
  });
});