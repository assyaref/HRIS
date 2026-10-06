/**
 * TEST DATA PURGE — node:test suite.
 *
 * A capability SEPARATE from permanent deletion. This suite pins the parts that
 * can be verified without a live database, in the repository convention (pure
 * decision logic + source invariants):
 *
 * - identification: eligibility comes ONLY from the `EMP-TEST-*` employee-number
 *   prefix, and there is no `is_test`/`environment`/`source` column that could
 *   have been used instead;
 * - RBAC: `employees.test_data_purge` AND the system-level SUPERADMIN role are
 *   both required, and the capability is refused for every other role;
 * - classification: protected historical records (attendance, leave, permission,
 *   payroll, payslip) BLOCK the purge; deletable profile records are removed
 *   with it. Employment history is the ONE approved exception: it may be
 *   purged for eligible `EMP-TEST-*` employees only, and it stays protected
 *   for every production employee and for normal Permanent Delete;
 * - a PRODUCTION employee inside the reporting line blocks the purge, and a
 *   TEST-DATA direct report may only have its manager link cleared;
 * - confirmation: the exact phrase, the per-employee phrase, the
 *   acknowledgement checkbox, and the server-generated plan token;
 * - server-side enforcement: organization scope from the session, eligibility
 *   from the STORED employee number, plan recomputation inside the transaction,
 *   explicit table-by-table deletes with no CASCADE, rollback on failure, and an
 *   audit row written inside the transaction that survives the employee rows;
 * - isolation: the permanent-delete path is not modified to accommodate this.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PERMISSION_CATALOG, PERMISSIONS } from "../../lib/auth/permissions.ts";
import { ORGANIZATION_ROLE_CODES } from "../../lib/auth/roles.ts";
import {
  EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS,
  employeeDeleteDependencyDisposition,
  evaluatePermanentEmployeeDeletion,
} from "../../features/employees/permanent-delete-policy.ts";
import {
  TEST_DATA_PURGE_CATEGORIES,
  TEST_DATA_PURGE_CONFIRMATION_PHRASE,
  TEST_DATA_PURGE_DELETABLE_CATEGORIES,
  TEST_DATA_PURGE_PROTECTED_CATEGORIES,
  TEST_DATA_PURGE_TEST_DATA_EXCEPTIONS,
  baseTestDataPurgeDisposition,
  collectBlockedPurgeCategories,
  evaluateTestDataPurge,
  isTestDataEmployeeNumber,
  isTestDataExemptCategory,
  matchesEmployeePurgeConfirmation,
  matchesPurgeConfirmationPhrase,
  productionDirectReports,
  summarizePurgeBreakdown,
  purgeConfirmationPhraseFor,
  testDataPurgeDisposition,
  totalDeletablePurgeRecords,
  type TestDataPurgeDirectReport,
  type TestDataPurgeTarget,
} from "../../features/employees/test-data-purge-policy.ts";

const ROOT = path.resolve(process.cwd());
function source(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

/** Remove comments so assertions target real code, not explanatory text. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const permissionsSource = source("lib/auth/permissions.ts");
const policySource = source("features/employees/test-data-purge-policy.ts");
const queriesSource = source("features/employees/test-data-purge.queries.ts");
const actionsSource = source("features/employees/test-data-purge.actions.ts");
const auditSource = source("lib/auth/audit.ts");

/** Comment-stripped variants, for the source-invariant assertions below. */
const policyCode = stripComments(policySource);
const queriesCode = stripComments(queriesSource);
const actionsCode = stripComments(actionsSource);
const auditCode = stripComments(auditSource);
const permanentPolicyCode = stripComments(
  source("features/employees/permanent-delete-policy.ts")
);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type Category = TestDataPurgeTarget["counts"][number]["category"];

/**
 * Build a target whose counts carry the disposition RESOLVED FOR ITS OWN NUMBER.
 *
 * The helper deliberately calls the production helper rather than hard-coding a
 * disposition, so a test fixture cannot drift from the real classification.
 */
function target(
  employeeNumber: string,
  counts: Partial<Record<Category, number>> = {}
): TestDataPurgeTarget {
  const entries = Object.entries(counts) as [Category, number][];
  return {
    employeeId: `id-${employeeNumber}`,
    employeeNumber,
    employeeName: "Test Employee",
    employmentStatus: "inactive",
    counts: entries.map(([category, count]) => {
      const disposition = testDataPurgeDisposition(category, employeeNumber);
      return {
        category,
        count: count ?? 0,
        disposition,
        ...(disposition === "deletable" && isTestDataExemptCategory(category)
          ? { viaTestDataException: true as const }
          : {}),
      };
    }),
  };
}

function directReport(
  employeeNumber: string,
  isTestData: boolean
): TestDataPurgeDirectReport {
  return {
    employeeId: `id-${employeeNumber}`,
    employeeNumber,
    employeeName: "Report",
    isTestData,
  };
}

/* ------------------------------------------------------------------ */
/* Identification                                                      */
/* ------------------------------------------------------------------ */

describe("test-data identification: EMP-TEST-* is the only signal", () => {
  it("accepts the designated test prefix", () => {
    assert.equal(isTestDataEmployeeNumber("EMP-TEST-001"), true);
    assert.equal(isTestDataEmployeeNumber("EMP-TEST-003"), true);
    assert.equal(isTestDataEmployeeNumber("EMP-TEST-"), false);
  });

  it("refuses every production employee number", () => {
    assert.equal(isTestDataEmployeeNumber("EMP-0001"), false);
    assert.equal(isTestDataEmployeeNumber("emp-test-001"), false);
    assert.equal(isTestDataEmployeeNumber("XEMP-TEST-001"), false);
    assert.equal(isTestDataEmployeeNumber("TEST-EMP-001"), false);
  });

  it("fails closed on non-strings", () => {
    assert.equal(isTestDataEmployeeNumber(null), false);
    assert.equal(isTestDataEmployeeNumber(undefined), false);
    assert.equal(isTestDataEmployeeNumber(42), false);
  });

  it("documents WHY the prefix rule exists: no marker column in the schema", () => {
    const schema = source("db/schema/employees.ts");
    for (const column of ["isTest", "is_test", "environment", "source"]) {
      assert.equal(
        schema.includes(column),
        false,
        `db/schema/employees.ts unexpectedly has a "${column}" column; the ` +
          "identifier rule must be revisited if a real marker exists"
      );
    }
    // The rationale is documentation, so it is asserted against the raw file.
    assert.equal(policySource.includes("no `is_test`"), true);
  });
});

/* ------------------------------------------------------------------ */
/* RBAC                                                                */
/* ------------------------------------------------------------------ */

describe("RBAC: employees.test_data_purge is SUPERADMIN-only", () => {
  it("the capability exists and is distinct from permanent delete", () => {
    assert.equal(PERMISSIONS.EMPLOYEES_TEST_DATA_PURGE, "employees.test_data_purge");
    assert.notEqual(
      PERMISSIONS.EMPLOYEES_TEST_DATA_PURGE,
      PERMISSIONS.EMPLOYEES_PERMANENT_DELETE
    );
    assert.notEqual(
      PERMISSIONS.EMPLOYEES_TEST_DATA_PURGE,
      PERMISSIONS.EMPLOYEES_DELETE,
      "a purge must never reuse the reversible deactivate capability"
    );
  });

  it("is seeded into the permission catalog", () => {
    const entry = PERMISSION_CATALOG.find(
      (permission) => permission.code === PERMISSIONS.EMPLOYEES_TEST_DATA_PURGE
    );
    assert.ok(entry, "employees.test_data_purge is missing from the catalog");
    assert.equal(entry.module, "employees");
  });

  it("is declared system-only in the SHARED catalog", () => {
    assert.match(
      permissionsSource,
      /SYSTEM_ONLY_PERMISSION_CODES[\s\S]*?EMPLOYEES_TEST_DATA_PURGE[\s\S]*?\];/
    );
  });

  it("the action requires the code AND the SUPERADMIN role", () => {
    assert.ok(
      actionsCode.includes("authorization.isSuperAdmin"),
      "the purge must be gated on isSuperAdmin, not the permission code alone"
    );
    assert.ok(
      actionsCode.includes("PERMISSIONS.EMPLOYEES_TEST_DATA_PURGE")
    );
    assert.ok(
      actionsCode.includes('"FORBIDDEN"'),
      "a refusal must use the typed FORBIDDEN code"
    );
  });

  it("the seed refuses to grant it to any organization role", () => {
    const seed = source("scripts/seed-rbac.mts");
    assert.ok(
      seed.includes("SYSTEM_ONLY_PERMISSION_CODES"),
      "the seed must consume the shared list so the guard cannot drift"
    );
    for (const roleCode of ORGANIZATION_ROLE_CODES) {
      const matrix = seed.match(
        new RegExp(
          `\\[ROLE_CODES\\.${roleCode}\\]:\\s*\\[([^\\]]*)\\]`
        )
      );
      const granted = matrix?.[1] ?? "";
      assert.equal(
        granted.includes("EMPLOYEES_TEST_DATA_PURGE"),
        false,
        `${roleCode} must not be granted employees.test_data_purge`
      );
    }
  });

  it("the role editor rejects assigning it to a tenant role", () => {
    const rbac = source("features/rbac/actions.ts");
    assert.ok(
      rbac.includes("isSystemOnlyPermission"),
      "RULE 6 must reuse the shared helper"
    );
  });

  it("is not reachable from the employee list or detail pages", () => {
    for (const page of [
      "app/(dashboard)/employees/page.tsx",
      "app/(dashboard)/employees/[employeeId]/page.tsx",
    ]) {
      assert.equal(
        source(page).includes("TEST_DATA_PURGE"),
        false,
        `${page} must not host the purge; it belongs in Settings`
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

describe("classification: protected records are never deletable", () => {
  it("partitions the category catalog exactly once", () => {
    const protectedSet: ReadonlySet<string> = new Set(
      TEST_DATA_PURGE_PROTECTED_CATEGORIES
    );
    const deletableSet: ReadonlySet<string> = new Set(
      TEST_DATA_PURGE_DELETABLE_CATEGORIES
    );
    for (const category of TEST_DATA_PURGE_CATEGORIES) {
      const inProtected = protectedSet.has(category);
      const inDeletable = deletableSet.has(category);
      assert.notEqual(
        inProtected,
        inDeletable,
        `${category} must be exactly one of protected/deletable`
      );
    }
    assert.equal(
      protectedSet.size + deletableSet.size,
      TEST_DATA_PURGE_CATEGORIES.length
    );
  });

  it("marks the retention-bound categories protected", () => {
    for (const category of [
      "Attendance records",
      "Leave requests",
      "Permission requests",
      "Payroll items",
      "Payslips",
    ] as const) {
      assert.equal(
        testDataPurgeDisposition(category, "EMP-TEST-001"),
        "protected",
        `${category} must stay protected even for test data`
      );
      assert.equal(
        testDataPurgeDisposition(category, "EMP-0001"),
        "protected",
        `${category} must be protected for production employees`
      );
    }
  });

  it("fails CLOSED for a category outside the catalog", () => {
    // Cast: the compile-time type forbids this, which is the first guard; the
    // runtime behaviour is the second.
    assert.equal(
      testDataPurgeDisposition(
        "Some New Category" as unknown as Category,
        "EMP-TEST-001"
      ),
      "protected"
    );
  });
});

/* ------------------------------------------------------------------ */
/* APPROVED EXCEPTION: employment history, test data only             */
/* ------------------------------------------------------------------ */

describe("approved exception: employment history is purgeable for TEST data only", () => {
  it("the exception is exactly one category", () => {
    assert.deepEqual(
      [...TEST_DATA_PURGE_TEST_DATA_EXCEPTIONS],
      ["Employment history"]
    );
    assert.equal(isTestDataExemptCategory("Employment history"), true);
    assert.equal(isTestDataExemptCategory("Payslips"), false);
    assert.equal(isTestDataExemptCategory("Attendance records"), false);
  });

  it("employment history is DELETABLE for an eligible test employee", () => {
    assert.equal(
      testDataPurgeDisposition("Employment history", "EMP-TEST-001"),
      "deletable"
    );
  });

  it("employment history stays PROTECTED for a production employee", () => {
    assert.equal(
      testDataPurgeDisposition("Employment history", "EMP-0001"),
      "protected",
      "the exception must never apply to a production employee"
    );
    assert.equal(
      baseTestDataPurgeDisposition("Employment history"),
      "protected",
      "the base classification excludes the exception entirely"
    );
  });

  it("the exception cannot be computed without an eligible number", () => {
    for (const productionNumber of ["EMP-0001", "emp-test-001", "", "XEMP-TEST-001"]) {
      assert.equal(
        testDataPurgeDisposition("Employment history", productionNumber),
        "protected",
        `${productionNumber} must not reach the exception`
      );
    }
  });

  it("a production employee in the selection blocks BEFORE the exception applies", () => {
    // One test employee with history, one production employee with history: the
    // whole purge is refused, so no history is removed for either.
    const decision = evaluateTestDataPurge({
      targets: [
        target("EMP-TEST-001", { "Employment history": 5 }),
        target("EMP-0042", { "Employment history": 3 }),
      ],
      directReports: [],
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "NOT_TEST_DATA");
  });

  it("allows a test employee whose ONLY history is employment history", () => {
    const decision = evaluateTestDataPurge({
      targets: [
        target("EMP-TEST-001", { "Employment history": 5 }),
        target("EMP-TEST-003", { "Employment history": 2 }),
      ],
      directReports: [],
    });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.deepEqual(
      decision.willDelete.map((entry) => [entry.category, entry.count]),
      [["Employment history", 7]]
    );
    assert.equal(
      decision.willDelete.every((entry) => entry.viaTestDataException === true),
      true,
      "the exception must be flagged in the plan, not hidden"
    );
  });

  it("still blocks on attendance/leave/payroll even for test data", () => {
    for (const category of [
      "Attendance records",
      "Leave requests",
      "Payslips",
    ] as const) {
      const decision = evaluateTestDataPurge({
        targets: [target("EMP-TEST-001", { [category]: 2 })],
        directReports: [],
      });
      assert.equal(
        decision.allowed,
        false,
        `${category} must still block a test-data purge`
      );
    }
  });

  it("reports the required breakdown with employment history separated", () => {
    const breakdown = summarizePurgeBreakdown([
      target("EMP-TEST-001", {
        "Employment history": 5,
        Documents: 2,
        "Custom field values": 1,
      }),
    ]);
    assert.deepEqual(breakdown, {
      employeeCount: 1,
      employmentHistory: 5,
      attendance: 0,
      leave: 0,
      permission: 0,
      payroll: 0,
      other: 3,
      total: 8,
    });
  });

  it("the excepted plan is a SEPARATE, gated delete path", () => {
    assert.ok(
      queriesCode.includes("deletePurgeEmploymentHistory"),
      "employment history must be removed through its own gated function"
    );
    assert.ok(
      queriesCode.includes("TEST_DATA_EXCEPTION_DELETE_PLAN"),
      "the exception plan must be declared separately from the base plan"
    );
    // The base plan is built from the exception-free classification.
    assert.ok(
      queriesCode.includes(
        'baseTestDataPurgeDisposition(group.category) === "deletable"'
      ),
      "the always-deletable plan must exclude excepted categories"
    );
    assert.equal(
      permanentPolicyCode.includes("Employment history"),
      true,
      "permanent delete must still know about employment history"
    );
    assert.ok(
      /EMPLOYEE_PROTECTED_DEPENDENCY_LABELS[\s\S]*"Employment history"/.test(
        permanentPolicyCode
      ),
      "permanent delete must still classify employment history as protected"
    );
  });

  it("the plan/policy guard fails only when a PROTECTED category enters the base plan", () => {
    // The guard runs at module load, so it must throw exactly when a protected
    // category (excepted or not) is planned for deletion by the base plan — and
    // never for protected categories that are simply not deleted.
    assert.ok(
      /baseTestDataPurgeDisposition\(group\.category\) === "protected" &&\s*planned\.has\(group\.category\)/.test(
        queriesCode
      ),
      "a protected category in the delete plan must fail the guard"
    );
    assert.ok(
      queriesCode.includes(
        'Test Data Purge plan must not delete protected category'
      ),
      "the bypass must be rejected with a loud, typed error"
    );
  });

  it("normal Permanent Delete still blocks the SAME history for this test employee", () => {
    // The exception applies to Test Data Purge ONLY: the generic path must
    // still refuse to remove employment history, test employee or not.
    const dependencies = EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS.map((label) => ({
      label,
      count: label === "Employment history" ? 5 : 0,
      disposition: employeeDeleteDependencyDisposition(label),
    }));
    const decision = evaluatePermanentEmployeeDeletion({
      actorUserId: "actor-1",
      employeeNumber: "EMP-TEST-001",
      linkedUserId: null,
      dependencies,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "PROTECTED_RECORDS");
  });

  it("the gated delete re-verifies the stored number before deleting", () => {
    const fnStart = queriesCode.indexOf(
      "export async function deletePurgeEmploymentHistory"
    );
    assert.ok(fnStart > 0, "the gated delete must exist");
    const fnBody = queriesCode.slice(
      fnStart,
      queriesCode.indexOf("export async function clearTestDataManagerLinks")
    );
    assert.ok(
      fnBody.includes("isTestDataEmployeeNumber(row.employeeNumber)"),
      "the gated delete must re-check the stored employee number"
    );
    assert.ok(
      fnBody.includes("eq(source.organizationIdColumn, organizationId)"),
      "the gated delete must be organization-scoped"
    );
  });

  it("the action derives eligible ids from the eligibility gate", () => {
    assert.ok(
      actionsCode.includes(
        ".filter((target) => isTestDataEmployeeNumber(target.employeeNumber))"
      ),
      "only proven-eligible ids may reach the excepted delete"
    );
    assert.ok(
      actionsCode.includes("deletePurgeEmploymentHistory("),
      "the action must call the gated delete"
    );
  });
});

/* ------------------------------------------------------------------ */
/* The decision                                                        */
/* ------------------------------------------------------------------ */

describe("evaluateTestDataPurge: blocks", () => {
  it("blocks when ANY target holds protected history", () => {
    const decision = evaluateTestDataPurge({
      targets: [
        target("EMP-TEST-001", { Documents: 2 }),
        target("EMP-TEST-002", { "Payslips": 1 }),
      ],
      directReports: [],
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "PROTECTED_RECORDS");
    assert.ok(decision.message.includes("Payslips: 1"));
  });

  it("the exception does NOT extend to other protected categories of the same employee", () => {
    // 5 excepted history rows plus 1 payslip: the payslip is not excepted, so it
    // blocks the whole purge and the history rows survive with it.
    const decision = evaluateTestDataPurge({
      targets: [target("EMP-TEST-001", { "Employment history": 5, Payslips: 1 })],
      directReports: [],
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "PROTECTED_RECORDS");
    assert.ok(decision.message.includes("Payslips: 1"));
  });

  it("a production employee with the same history shape never enters the purge", () => {
    const decision = evaluateTestDataPurge({
      targets: [target("EMP-0001", { "Employment history": 5 })],
      directReports: [],
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(
      decision.code,
      "NOT_TEST_DATA",
      "the eligibility gate refuses before any classification runs"
    );
  });

  it("refuses a NON-test employee, even with no protected records", () => {
    const decision = evaluateTestDataPurge({
      targets: [target("EMP-0001", { Documents: 1 })],
      directReports: [],
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "NOT_TEST_DATA");
  });

  it("blocks when a PRODUCTION employee reports to a selected test employee", () => {
    const decision = evaluateTestDataPurge({
      targets: [target("EMP-TEST-001", { Documents: 1 })],
      directReports: [directReport("EMP-0042", false)],
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "PRODUCTION_DIRECT_REPORT");
    assert.ok(decision.message.includes("EMP-0042"));
  });

  it("has NO unreviewed retention bypass: eligibility never bypasses retention", () => {
    // The absence of any UNREVIEWED bypass is the property under test. The
    // approved employment-history exception is an explicit, named list covered
    // elsewhere in this suite, not a branch that reaches the protected check.
    const bypassWords = (
      policyCode.match(/bypass|override|ignoreRetention|skipProtected/gi) ?? []
    ).join(" ");
    assert.equal(
      bypassWords,
      "",
      "the policy must not contain a test-data retention bypass"
    );
    assert.equal(
      /if\s*\(\s*isTestDataEmployeeNumber[^)]*\)\s*\{[^}]*protected/i.test(
        policyCode
      ),
      false,
      "eligibility must not influence the protected-record check"
    );
  });
});

describe("evaluateTestDataPurge: allows", () => {
  it("allows a clean test employee with only deletable records", () => {
    const decision = evaluateTestDataPurge({
      targets: [target("EMP-TEST-010", { Documents: 3, Addresses: 1 })],
      directReports: [],
    });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.deepEqual(
      decision.willDelete.map((entry) => [entry.category, entry.count]),
      [
        ["Documents", 3],
        ["Addresses", 1],
      ]
    );
  });

  it("allows a TEST-DATA direct report and clears only its manager link", () => {
    const decision = evaluateTestDataPurge({
      targets: [target("EMP-TEST-010", { Documents: 1 })],
      directReports: [directReport("EMP-TEST-011", true)],
    });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.deepEqual(
      decision.managerLinksCleared.map((report) => report.employeeNumber),
      ["EMP-TEST-011"]
    );
  });

  it("counts only DELETABLE records toward the total", () => {
    const targets = [target("EMP-TEST-010", { Documents: 2, "Bank accounts": 1 })];
    assert.equal(totalDeletablePurgeRecords(targets), 3);
  });

  it("reports protected categories with non-zero counts only", () => {
    const blocked = collectBlockedPurgeCategories([
      target("EMP-TEST-010", { "Payslips": 4, "Leave balances": 0 }),
    ]);
    assert.deepEqual(
      blocked.map((entry) => [entry.category, entry.count]),
      [["Payslips", 4]]
    );
  });

  it("separates production from test direct reports", () => {
    const reports = [
      directReport("EMP-TEST-011", true),
      directReport("EMP-0042", false),
    ];
    assert.deepEqual(
      productionDirectReports(reports).map((r) => r.employeeNumber),
      ["EMP-0042"]
    );
  });

  it("the LIVE production shape is now purgeable: EMP-TEST-001 employment history", () => {
    // Live production carried 5 employment-history rows for this employee.
    // Under the approved test-data exception those rows are what the purge
    // removes — flagged, not hidden.
    const decision = evaluateTestDataPurge({
      targets: [target("EMP-TEST-001", { "Employment history": 5 })],
      directReports: [],
    });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.deepEqual(
      decision.willDelete.map((entry) => [entry.category, entry.count]),
      [["Employment history", 5]]
    );
    assert.equal(
      decision.willDelete.every((entry) => entry.viaTestDataException === true),
      true,
      "the exception must be flagged in the plan, not hidden"
    );
  });

  it("the LIVE production shape is now purgeable: EMP-TEST-003 employment history", () => {
    const decision = evaluateTestDataPurge({
      targets: [target("EMP-TEST-003", { "Employment history": 2 })],
      directReports: [],
    });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.deepEqual(
      decision.willDelete.map((entry) => [entry.category, entry.count]),
      [["Employment history", 2]]
    );
    assert.equal(
      decision.willDelete.every((entry) => entry.viaTestDataException === true),
      true
    );
  });
});

/* ------------------------------------------------------------------ */
/* Confirmation                                                        */
/* ------------------------------------------------------------------ */

describe("confirmation: layered and server-verifiable", () => {
  it("requires the exact phrase", () => {
    assert.equal(matchesPurgeConfirmationPhrase("PURGE TEST DATA"), true);
    assert.equal(matchesPurgeConfirmationPhrase("  PURGE TEST DATA  "), true);
    assert.equal(matchesPurgeConfirmationPhrase("purge test data"), false);
    assert.equal(matchesPurgeConfirmationPhrase("PURGE TEST"), false);
    assert.equal(matchesPurgeConfirmationPhrase(""), false);
    assert.equal(matchesPurgeConfirmationPhrase(null), false);
  });

  it("requires a per-employee phrase that includes the number", () => {
    const phrase = purgeConfirmationPhraseFor("EMP-TEST-001");
    assert.equal(phrase, `${TEST_DATA_PURGE_CONFIRMATION_PHRASE} EMP-TEST-001`);
    assert.equal(
      matchesEmployeePurgeConfirmation("EMP-TEST-001", phrase),
      true
    );
    assert.equal(
      matchesEmployeePurgeConfirmation("EMP-TEST-001", "PURGE TEST DATA"),
      false,
      "the generic phrase must not satisfy the per-employee layer"
    );
    assert.equal(
      matchesEmployeePurgeConfirmation("EMP-TEST-001", "PURGE TEST DATA EMP-TEST-002"),
      false,
      "one employee's phrase must not confirm another"
    );
  });

  it("refuses to generate a phrase for a non-test employee", () => {
    assert.equal(
      matchesEmployeePurgeConfirmation("EMP-0042", "PURGE TEST DATA EMP-0042"),
      false
    );
  });
});

/* ------------------------------------------------------------------ */
/* Server-side enforcement                                             */
/* ------------------------------------------------------------------ */

describe("server-side enforcement", () => {
  it("takes the organization from the SESSION, never the form", () => {
    assert.ok(
      actionsCode.includes("user.organizationId"),
      "the purge must scope to the session organization"
    );
    for (const fieldName of ["organizationId", "organization_id"]) {
      assert.equal(
        actionsCode.includes(`formData.get("${fieldName}")`),
        false,
        `${fieldName} must never be read from the request body`
      );
    }
  });

  it("re-derives eligibility from the STORED employee number", () => {
    assert.ok(
      actionsCode.includes("isTestDataEmployeeNumber(target.employeeNumber)"),
      "eligibility must be decided from the database value"
    );
  });

  it("uses a read-only analysis step and a separate execute step", () => {
    assert.ok(
      actionsCode.includes("export async function analyzeTestDataPurgeAction")
    );
    assert.ok(
      actionsCode.includes("export async function purgeTestEmployeesAction")
    );
  });

  it("recomputes the plan inside the transaction and refuses a mismatch", () => {
    assert.ok(
      actionsCode.includes("buildPurgePlanToken(targets, directReports) !== submittedToken"),
      "the token must be recomputed on the transaction snapshot and compared"
    );
    assert.ok(actionsCode.includes('stateCode: "INVALID_CONFIRMATION"'));
  });

  it("refuses a selection that does not resolve ENTIRELY in the organization", () => {
    assert.ok(
      actionsCode.includes("targets.length !== targetIds.length"),
      "a partially-resolvable selection must be refused, not purged as a subset"
    );
    assert.ok(actionsCode.includes('"ORGANIZATION_MISMATCH"'));
  });

  it("re-validates BOTH confirmation layers server-side", () => {
    assert.ok(actionsCode.includes('field(formData, "confirmationPhrase")'));
    assert.ok(actionsCode.includes('formData.get("acknowledgedPurge")'));
    assert.ok(actionsCode.includes('getAll("employeeConfirmations")'));
    assert.ok(
      actionsCode.includes("isAcknowledged(formData)"),
      "the acknowledgement checkbox must be re-checked, not trusted from the client"
    );
  });

  it("runs every delete and the audit row in ONE transaction", () => {
    // The EXECUTE action's transaction, identified by its own outcome type.
    const txStart = actionsCode.indexOf("outcome = await db.transaction");
    assert.ok(txStart > 0, "the purge must open a transaction");
    const txEnd = actionsCode.indexOf('if (outcome.code === "REFUSED")');
    assert.ok(txEnd > txStart);
    const body = actionsCode.slice(txStart, txEnd);

    const deletes = body.indexOf("deletePurgeDeletableRecords");
    const employeeDelete = body.indexOf("deletePurgeEmployees");
    const audit = body.indexOf("await writeTestDataPurgeAudit(\n        tx,");
    assert.ok(deletes > 0, "deletable records are removed inside the tx");
    assert.ok(employeeDelete > deletes, "the employee row goes after its records");
    assert.ok(
      audit > deletes && audit < txEnd,
      "the SUCCESS audit row must be written inside the transaction"
    );

    // Every refusal is audited OUTSIDE the transaction, against the pooled
    // client, so a rolled-back attempt is still recorded.
    assert.ok(
      (actionsCode.match(/writeTestDataPurgeAudit\(db,/g) ?? []).length >= 5,
      "refusals must be audited with the pooled client"
    );
  });

  it("never relies on CASCADE and scopes every delete to the organization", () => {
    assert.ok(
      !queriesCode.includes("onDelete"),
      "the purge must not add a cascade; production FKs are RESTRICT/SET NULL"
    );
    assert.ok(
      queriesCode.includes("eq(source.organizationIdColumn, organizationId)"),
      "related-record deletes must be organization-scoped"
    );
    assert.ok(
      queriesCode.includes("eq(employees.organizationId, organizationId)"),
      "the employee delete must be organization-scoped"
    );
  });

  it("never deletes a production employee as a side effect", () => {
    assert.ok(
      actionsCode.includes("decision.managerLinksCleared"),
      "only test-data direct reports may lose their manager link"
    );
    assert.ok(
      queriesCode.includes("clearTestDataManagerLinks"),
      "the manager-link update must be explicit, not implicit via FK SET NULL"
    );
    // Direct reports are only ever CLEARED, never deleted: the delete statement
    // targets `employees` with the operator's selection ids only.
    const employeeDeleteBlock = queriesCode.slice(
      queriesCode.indexOf("export async function deletePurgeEmployees")
    );
    assert.ok(employeeDeleteBlock.includes("inArray(employees.id, [...employeeIds])"));
  });

  it("refreshes the list and caches after a successful purge", () => {
    assert.ok(actionsCode.includes('revalidatePath("/employees")'));
    assert.ok(actionsCode.includes('revalidatePath("/settings/test-data-purge")'));
  });

  it("cleans up document storage only AFTER the commit", () => {
    // After the transaction closes and after the refusal branch has returned, i.e.
    // strictly on the committed path (the import at the top is not a call site).
    const refusalBranch = actionsCode.indexOf('if (outcome.code === "REFUSED")');
    const deleteCall = actionsCode.indexOf(
      "await deleteEmployeeDocumentStorage(",
      refusalBranch
    );
    assert.ok(
      deleteCall > refusalBranch,
      "storage cleanup must happen after the commit, outside the refusal path"
    );
  });
});

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

describe("audit: TEST_DATA_PURGE is recorded and survives the deletion", () => {
  it("the audit action exists", () => {
    assert.ok(auditCode.includes('"employee.test_data_purged"'));
  });

  it("records the operation, actor, selection and outcome", () => {
    for (const field of [
      'operation: "TEST_DATA_PURGE"',
      "actorUserId:",
      "actorEmail:",
      "actorRole:",
      "selectedEmployees:",
      "selectedEmployeeCount:",
      "removedRelatedRecords:",
      "result:",
    ]) {
      assert.ok(
        actionsCode.includes(field),
        `the audit metadata must include ${field}`
      );
    }
  });

  it("records REFUSALS too, not only successes", () => {
    const denialReasons = [
      "PERMISSION_DENIED",
      "NO_ORGANIZATION",
      "EMPTY_SELECTION",
      "PHRASE_MISMATCH",
      "ACKNOWLEDGEMENT_MISSING",
      "PLAN_CHANGED",
      "NOT_TEST_DATA",
      "ORGANIZATION_MISMATCH",
    ];
    for (const reason of denialReasons) {
      assert.ok(
        actionsCode.includes(`"${reason}"`),
        `a ${reason} attempt must be audited`
      );
    }
  });

  it("stores employee identity as a SNAPSHOT, so no FK can break the trail", () => {
    // `audit_logs.entity_id` has no foreign key; the purge passes no entityId and
    // records the employee details in metadata instead.
    assert.ok(
      actionsCode.includes("employeeNumber:") || actionsCode.includes("selectedEmployees"),
      "the audit row must snapshot the employee identities"
    );
    assert.ok(
      /auditLogs[\s\S]*entityId: [a-zA-Z]+/.test(auditCode) === false ||
        auditCode.includes("entityId: input.entityId ?? null"),
      "entityId must remain a plain nullable column"
    );
  });
});

/* ------------------------------------------------------------------ */
/* Isolation from permanent delete                                     */
/* ------------------------------------------------------------------ */

describe("isolation: permanent delete is untouched", () => {
  it("the permanent-delete policy has no test-data branch", () => {
    const permanent = permanentPolicyCode;
    assert.equal(
      permanent.includes("EMP-TEST"),
      false,
      "permanent delete must keep treating every employee number identically"
    );
    assert.equal(
      permanent.includes("TEST_DATA_PURGE"),
      false,
      "permanent delete must not reference the purge capability"
    );
  });

  it("the permanent-delete action has no purge reference", () => {
    assert.equal(
      actionsCode.includes("permanentlyDeleteEmployeeAction"),
      false,
      "the purge must not be wired into the permanent-delete action"
    );
  });

  it("the purge shares no module with permanent delete", () => {
    assert.equal(
      queriesCode.includes('from "./queries"'),
      false,
      "the purge must use its own queries module so the shared path stays generic"
    );
  });

  it("the purge lives under Settings, not on the employee pages", () => {
    assert.ok(source("app/(dashboard)/settings/test-data/page.tsx").includes("requirePermission") ||
      source("app/(dashboard)/settings/test-data/page.tsx").includes("getUserAuthorization"));
    assert.ok(
      source("components/layout/navigation.ts").includes('href: "/settings/test-data"'),
      "the purge needs a Settings navigation entry"
    );
    assert.ok(
      source("components/layout/navigation.ts").includes('title: "Test Data"')
    );
  });
});
