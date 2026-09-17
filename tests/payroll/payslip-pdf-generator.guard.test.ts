/**
 * PM-05 — Payslip PDF generation guard tests (Node `node:test`).
 *
 * Exercises the PURE decision functions in
 * features/payroll/payslip-pdf-generator.guard.ts:
 * - run-status eligibility (approved/locked only),
 * - generated-status check,
 * - candidate classification with the fixed skip-reason priority.
 * No DB, no auth, no filesystem.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyPayslipPdfCandidates,
  isGeneratedPayslipStatus,
  runStatusAllowsDocumentGeneration,
  type PayslipPdfCandidateInput,
} from "../../features/payroll/payslip-pdf-generator.guard.ts";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const P4 = "44444444-4444-4444-8444-444444444444";
const BIRTH = new Date("1998-07-05T00:00:00.000Z");

function candidate(
  overrides: Partial<PayslipPdfCandidateInput> = {}
): PayslipPdfCandidateInput {
  return {
    payslipId: P1,
    status: "generated",
    nik: "3273010507980001",
    birthDate: BIRTH,
    existingDocument: false,
    ...overrides,
  };
}

describe("runStatusAllowsDocumentGeneration", () => {
  it("allows approved and locked runs", () => {
    assert.equal(runStatusAllowsDocumentGeneration("approved"), true);
    assert.equal(runStatusAllowsDocumentGeneration("locked"), true);
  });

  it("rejects every other run status", () => {
    for (const status of [
      "draft",
      "calculated",
      "submitted",
      "rejected",
      "cancelled",
      "",
      "LOCKED",
    ]) {
      assert.equal(runStatusAllowsDocumentGeneration(status), false, status);
    }
  });
});

describe("isGeneratedPayslipStatus", () => {
  it("accepts only the generated status", () => {
    assert.equal(isGeneratedPayslipStatus("generated"), true);
    for (const status of [
      "published",
      "revoked",
      "draft",
      "",
      "Generated",
    ]) {
      assert.equal(isGeneratedPayslipStatus(status), false, status);
    }
  });
});

describe("classifyPayslipPdfCandidates", () => {
  it("includes a generated payslip with a full identity", () => {
    const { included, skipped } = classifyPayslipPdfCandidates([candidate()]);

    assert.equal(included.length, 1);
    assert.equal(included[0].payslipId, P1);
    assert.deepEqual(skipped, []);
  });

  it("skips payslips that are not in generated status", () => {
    const { included, skipped } = classifyPayslipPdfCandidates([
      candidate({ payslipId: P2, status: "published", existingDocument: false }),
      candidate({ payslipId: P3, status: "revoked" }),
    ]);

    assert.deepEqual(included, []);
    assert.deepEqual(skipped, [
      { payslipId: P2, reason: "not_generated" },
      { payslipId: P3, reason: "not_generated" },
    ]);
  });

  it("skips payslips that already have a document (never duplicate)", () => {
    const { included, skipped } = classifyPayslipPdfCandidates([
      candidate({ payslipId: P2, existingDocument: true }),
    ]);

    assert.deepEqual(included, []);
    assert.deepEqual(skipped, [{ payslipId: P2, reason: "document_exists" }]);
  });

  it("skips payslips whose employee has no NIK", () => {
    const { included, skipped } = classifyPayslipPdfCandidates([
      candidate({ payslipId: P2, nik: null }),
      candidate({ payslipId: P3, nik: "" }),
    ]);

    assert.deepEqual(included, []);
    assert.deepEqual(skipped, [
      { payslipId: P2, reason: "missing_nik" },
      { payslipId: P3, reason: "missing_nik" },
    ]);
  });

  it("skips payslips whose employee has no birth date", () => {
    const { included, skipped } = classifyPayslipPdfCandidates([
      candidate({ payslipId: P2, birthDate: null }),
      candidate({ payslipId: P3, birthDate: undefined }),
    ]);

    assert.deepEqual(included, []);
    assert.deepEqual(skipped, [
      { payslipId: P2, reason: "missing_birthdate" },
      { payslipId: P3, reason: "missing_birthdate" },
    ]);
  });

  it("applies skip reasons in priority order", () => {
    // A published payslip with a document and a missing NIK still reports
    // the highest-priority reason only (not_generated).
    const { skipped } = classifyPayslipPdfCandidates([
      candidate({ payslipId: P2, status: "published", existingDocument: true, nik: null }),
    ]);

    assert.deepEqual(skipped, [{ payslipId: P2, reason: "not_generated" }]);
  });

  it("mixes included and skipped payslips in one outcome", () => {
    const { included, skipped } = classifyPayslipPdfCandidates([
      candidate({ payslipId: P1 }),
      candidate({ payslipId: P2, existingDocument: true }),
      candidate({ payslipId: P3, nik: null }),
      candidate({ payslipId: P4, birthDate: null }),
    ]);

    assert.deepEqual(
      included.map((entry) => entry.payslipId),
      [P1]
    );
    assert.deepEqual(skipped, [
      { payslipId: P2, reason: "document_exists" },
      { payslipId: P3, reason: "missing_nik" },
      { payslipId: P4, reason: "missing_birthdate" },
    ]);
  });

  it("handles empty and single-field-typed input gracefully", () => {
    const empty = classifyPayslipPdfCandidates([]);
    assert.deepEqual(empty.included, []);
    assert.deepEqual(empty.skipped, []);
  });

  it("passes string birth dates through the same classification", () => {
    const { included, skipped } = classifyPayslipPdfCandidates([
      candidate({ birthDate: "1998-07-05T00:00:00.000Z" }),
    ]);

    assert.equal(included.length, 1);
    assert.deepEqual(skipped, []);
  });
});