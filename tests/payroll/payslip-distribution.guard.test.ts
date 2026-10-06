import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDistributionPayslipNumber,
  buildDistributionPayslipUploadDecision,
  buildPayslipPublishDecision,
  isPayslipKind,
} from "../../features/payroll/payslip-distribution.guard.ts";

test("isPayslipKind narrows the two known provenances", () => {
  assert.equal(isPayslipKind("calculated"), true);
  assert.equal(isPayslipKind("distribution"), true);
  assert.equal(isPayslipKind("something"), false);
  assert.equal(isPayslipKind(null), false);
});

test("builds a deterministic distribution payslip number", () => {
  assert.equal(
    buildDistributionPayslipNumber("2026-08", "03233"),
    "PS-2026-08-D-03233"
  );
});

test("normalizes the period code (case and whitespace)", () => {
  assert.equal(
    buildDistributionPayslipNumber(" aug 2026 ", "777"),
    "PS-AUG2026-D-777"
  );
});

test("rejects a non-numeric employee number", () => {
  assert.throws(() => buildDistributionPayslipNumber("2026-08", "ABC123"));
});

test("distribution numbers cannot collide with Mode A numbering", () => {
  const calculated = "PS-2026-08-0001";
  const distribution = buildDistributionPayslipNumber("2026-08", "0001");
  assert.notEqual(distribution, calculated);
  assert.match(distribution, /-D-/);
});

test("distribution upload requires an employee number", () => {
  const decision = buildDistributionPayslipUploadDecision({
    periodStatus: "draft",
    duplicateEmployeePayslip: false,
    employeeNumber: "",
    birthDate: new Date("1995-08-25T00:00:00.000Z"),
  });
  assert.equal(decision.allowed, false);
});

test("distribution upload requires a birth date", () => {
  const decision = buildDistributionPayslipUploadDecision({
    periodStatus: "draft",
    duplicateEmployeePayslip: false,
    employeeNumber: "03233",
    birthDate: null,
  });
  assert.equal(decision.allowed, false);
});

test("distribution upload rejects cancelled and locked periods", () => {
  for (const periodStatus of ["cancelled", "locked"]) {
    const decision = buildDistributionPayslipUploadDecision({
      periodStatus,
      duplicateEmployeePayslip: false,
      employeeNumber: "03233",
      birthDate: new Date("1995-08-25T00:00:00.000Z"),
    });
    assert.equal(decision.allowed, false);
  }
});

test("distribution upload rejects a duplicate payslip for the period", () => {
  const decision = buildDistributionPayslipUploadDecision({
    periodStatus: "approved",
    duplicateEmployeePayslip: true,
    employeeNumber: "03233",
    birthDate: new Date("1995-08-25T00:00:00.000Z"),
  });
  assert.equal(decision.allowed, false);
});

test("distribution upload allows an eligible employee", () => {
  const decision = buildDistributionPayslipUploadDecision({
    periodStatus: "processing",
    duplicateEmployeePayslip: false,
    employeeNumber: "03233",
    birthDate: new Date("1995-08-25T00:00:00.000Z"),
  });
  assert.equal(decision.allowed, true);
});

test("publish requires generated status and a document", () => {
  assert.equal(
    buildPayslipPublishDecision({ status: "generated", hasDocument: true })
      .allowed,
    true
  );
  assert.equal(
    buildPayslipPublishDecision({ status: "published", hasDocument: true })
      .allowed,
    false
  );
  assert.equal(
    buildPayslipPublishDecision({ status: "generated", hasDocument: false })
      .allowed,
    false
  );
});
