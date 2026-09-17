/**
 * PM-07 — Payslip revocation guard tests (Node `node:test`).
 *
 * These exercise the PURE decision and validation functions in
 * features/payroll/payslip-revocation.guard.ts:
 * - the `published -> revoked` transition rule (a `generated`, `revoked` or
 *   unknown status can never be revoked),
 * - the reason contract (requiring explicit management access, a non-empty
 *   reason after trimming and the length bound),
 * - the audit-recording contract (an audit decision is recorded exactly when
 *   — and only when — the revocation is allowed).
 * No DB, no auth, no filesystem.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildPayslipRevocationDecision,
  canRevokePayslip,
  isValidPayslipRevocationReason,
  PAYSLIP_REVOCATION_REASON_MAX_LENGTH,
} from "../../features/payroll/payslip-revocation.guard.ts";

describe("canRevokePayslip", () => {
  it("allows the published status", () => {
    assert.equal(canRevokePayslip("published"), true);
  });

  it("rejects the generated status", () => {
    assert.equal(canRevokePayslip("generated"), false);
  });

  it("rejects the revoked status", () => {
    assert.equal(canRevokePayslip("revoked"), false);
  });

  it("rejects unknown statuses", () => {
    assert.equal(canRevokePayslip("draft"), false);
    assert.equal(canRevokePayslip(""), false);
    assert.equal(canRevokePayslip("anything-else"), false);
  });
});

describe("isValidPayslipRevocationReason", () => {
  it("accepts a normal non-empty reason", () => {
    assert.equal(
      isValidPayslipRevocationReason("Net amount was incorrect."),
      true
    );
  });

  it("accepts a reason that is only whitespace-padded", () => {
    assert.equal(
      isValidPayslipRevocationReason("  paid twice - corrected  "),
      true
    );
  });

  it("rejects an empty reason", () => {
    assert.equal(isValidPayslipRevocationReason(""), false);
  });

  it("rejects a whitespace-only reason", () => {
    assert.equal(isValidPayslipRevocationReason("   \t  \n"), false);
  });

  it("rejects a reason over the maximum length", () => {
    assert.equal(
      isValidPayslipRevocationReason(
        "x".repeat(PAYSLIP_REVOCATION_REASON_MAX_LENGTH + 1)
      ),
      false
    );
  });

  it("accepts a reason exactly at the maximum length", () => {
    assert.equal(
      isValidPayslipRevocationReason(
        "x".repeat(PAYSLIP_REVOCATION_REASON_MAX_LENGTH)
      ),
      true
    );
  });
});

describe("buildPayslipRevocationDecision", () => {
  it("allows revoking a published payslip and records audit", () => {
    const decision = buildPayslipRevocationDecision({
      payslipStatus: "published",
      reason: "Net amount was incorrect.",
      managementAllowed: true,
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.recordAudit, true);
    assert.equal(decision.message, null);
  });

  it("rejects a generated payslip and records no audit", () => {
    const decision = buildPayslipRevocationDecision({
      payslipStatus: "generated",
      reason: "Net amount was incorrect.",
      managementAllowed: true,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.recordAudit, false);
  });

  it("rejects a revoked payslip and records no audit", () => {
    const decision = buildPayslipRevocationDecision({
      payslipStatus: "revoked",
      reason: "Net amount was incorrect.",
      managementAllowed: true,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.recordAudit, false);
  });

  it("rejects an unknown status and records no audit", () => {
    const decision = buildPayslipRevocationDecision({
      payslipStatus: "pending",
      reason: "Net amount was incorrect.",
      managementAllowed: true,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.recordAudit, false);
  });

  it("rejects when management access is not allowed and records no audit", () => {
    const decision = buildPayslipRevocationDecision({
      payslipStatus: "published",
      reason: "Net amount was incorrect.",
      managementAllowed: false,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.recordAudit, false);
  });

  it("rejects an empty reason and records no audit", () => {
    const decision = buildPayslipRevocationDecision({
      payslipStatus: "published",
      reason: "",
      managementAllowed: true,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.recordAudit, false);
  });

  it("rejects a whitespace-only reason and records no audit", () => {
    const decision = buildPayslipRevocationDecision({
      payslipStatus: "published",
      reason: "   \t  ",
      managementAllowed: true,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.recordAudit, false);
  });

  it("accepts a reason padded with surrounding whitespace", () => {
    const decision = buildPayslipRevocationDecision({
      payslipStatus: "published",
      reason: "  Double payment issued  ",
      managementAllowed: true,
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.recordAudit, true);
  });

  it("rejects a reason over the maximum length and records no audit", () => {
    const decision = buildPayslipRevocationDecision({
      payslipStatus: "published",
      reason: "x".repeat(PAYSLIP_REVOCATION_REASON_MAX_LENGTH + 1),
      managementAllowed: true,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.recordAudit, false);
  });
});