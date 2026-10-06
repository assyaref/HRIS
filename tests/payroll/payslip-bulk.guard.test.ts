import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBulkUploadPlan,
  extractEmployeeNumberFromFilename,
  PAYSLIP_BULK_MAX_FILES,
  type PayslipBulkEmployee,
} from "../../features/payroll/payslip-bulk.guard.ts";

const EMPLOYEES: PayslipBulkEmployee[] = [
  { id: "e-1", employeeNumber: "03233", hasBirthDate: true },
  { id: "e-2", employeeNumber: "04001", hasBirthDate: false },
];

test("extracts a leading employee number from supported filename shapes", () => {
  assert.equal(extractEmployeeNumberFromFilename("03233.pdf"), "03233");
  assert.equal(extractEmployeeNumberFromFilename("03233_john.pdf"), "03233");
  assert.equal(extractEmployeeNumberFromFilename("03233-john.pdf"), "03233");
  assert.equal(extractEmployeeNumberFromFilename("03233 john.pdf"), "03233");
  assert.equal(extractEmployeeNumberFromFilename("03233"), "03233");
});

test("strips any directory prefix before matching", () => {
  assert.equal(
    extractEmployeeNumberFromFilename("/tmp/batch/03233.pdf"),
    "03233"
  );
});

test("rejects filenames without a leading digit run", () => {
  assert.equal(extractEmployeeNumberFromFilename("john.pdf"), null);
  assert.equal(extractEmployeeNumberFromFilename(".pdf"), null);
  assert.equal(extractEmployeeNumberFromFilename(""), null);
  assert.equal(extractEmployeeNumberFromFilename("PS-03233.pdf"), null);
});

test("matches files to employees and requires a birth date", () => {
  const plan = buildBulkUploadPlan(
    [{ name: "03233.pdf" }, { name: "04001.pdf" }],
    EMPLOYEES
  );

  assert.equal(plan.total, 2);
  assert.equal(plan.matchedCount, 1);
  assert.equal(plan.entries[0].status, "matched");
  assert.equal(plan.entries[0].employeeId, "e-1");
  assert.equal(plan.entries[1].status, "missing_birth_date");
});

test("flags unknown employees", () => {
  const plan = buildBulkUploadPlan([{ name: "09999.pdf" }], EMPLOYEES);

  assert.equal(plan.entries[0].status, "unknown_employee");
  assert.equal(plan.entries[0].employeeNumber, "09999");
  assert.equal(plan.matchedCount, 0);
  assert.equal(plan.canProceed, false);
});

test("flags duplicate employee numbers within one batch", () => {
  const plan = buildBulkUploadPlan(
    [{ name: "03233.pdf" }, { name: "03233_copy.pdf" }],
    EMPLOYEES
  );

  assert.equal(plan.entries[0].status, "matched");
  assert.equal(plan.entries[1].status, "duplicate_employee");
  assert.equal(plan.problemCount, 1);
});

test("flags invalid filenames and reports the total", () => {
  const plan = buildBulkUploadPlan([{ name: "readme.txt" }], EMPLOYEES);

  assert.equal(plan.entries[0].status, "invalid_filename");
  assert.equal(plan.total, 1);
  assert.equal(plan.problemCount, 1);
});

test("canProceed is true only when at least one file matched and the batch is within the cap", () => {
  const ok = buildBulkUploadPlan([{ name: "03233.pdf" }], EMPLOYEES);
  assert.equal(ok.canProceed, true);

  const tooMany = buildBulkUploadPlan(
    Array.from({ length: PAYSLIP_BULK_MAX_FILES + 1 }, () => ({
      name: "03233.pdf",
    })),
    EMPLOYEES
  );
  assert.equal(tooMany.canProceed, false);
});

test("empty input produces an empty, non-proceeding plan", () => {
  const plan = buildBulkUploadPlan([], EMPLOYEES);

  assert.equal(plan.total, 0);
  assert.equal(plan.matchedCount, 0);
  assert.equal(plan.canProceed, false);
});
