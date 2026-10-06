/**
 * TEST DATA PURGE policy (pure decision logic).
 *
 * This is a SEPARATE capability from Permanent Delete Employee. It is not a
 * bypass of it and shares none of its code path:
 *
 * - `employees.permanent_delete` removes ONE employee the Super Administrator
 *   chooses, and is BLOCKED by any protected historical record.
 * - `employees.test_data_purge` removes records the system has already
 *   identified as TEST data, and applies the SAME protected-record protection.
 *
 * WHY A SEPARATE FEATURE
 * ----------------------
 * Operators need a controlled way to clear deliberate test fixtures from
 * production without weakening retention rules for real employees. Reusing the
 * permanent-delete path would have meant either duplicating it or carving an
 * exception into it. Both are wrong: the permanent-delete policy stays exactly
 * as it is, and this module never removes a retention-bound row either.
 *
 * TEST-DATA IDENTIFICATION
 * ------------------------
 * The `employees` table carries NO test marker — there is no `is_test`,
 * `environment`, `source`, or metadata column (verified against
 * `db/schema/employees.ts`). The single existing convention is the employee
 * number prefix `EMP-TEST-`, so that is the rule, and it is defined HERE, once,
 * as a data constant rather than scattered through the feature.
 *
 * Two consequences are deliberate:
 * - Eligibility is derived from the STORED employee number, never from anything
 *   the browser sends. An operator cannot nominate an arbitrary employee.
 * - `EMP-TEST-*` is an eligibility signal, not by itself a deletion signal.
 *
 * APPROVED TEST-DATA EXCEPTION: EMPLOYMENT HISTORY
 * -----------------------------------------------
 * Business has approved ONE exception, and only inside this feature:
 * employment history belonging to an eligible `EMP-TEST-*` employee may be
 * purged, because the history is itself test fixture data. See
 * `TEST_DATA_PURGE_TEST_DATA_EXCEPTIONS`.
 *
 * Three properties make this safe, and each is enforced rather than assumed:
 *
 * 1. ELIGIBILITY IS PROVEN FIRST. `evaluateTestDataPurge` rejects any selection
 *    containing a non-`EMP-TEST-*` employee BEFORE any classification runs, so
 *    the exception can never be reached with a production employee in the
 *    selection. The disposition helper additionally takes the employee number,
 *    so the exception is not even computable for a production row.
 * 2. IT IS NOT AN INFERENCE. The exception is an explicit, named list — not a
 *    side effect of the prefix. Attendance, leave, permission, payroll and
 *    payslip records REMAIN protected even for a test employee.
 * 3. IT DOES NOT TOUCH PERMANENT DELETE. `permanent-delete-policy.ts` still
 *    protects employment history for every employee, production or test. This
 *    module is a separate capability with a separate permission
 *    (`employees.test_data_purge`), and the two share no code path.
 *
 * A production employee with employment history is therefore still protected
 * everywhere: normal Permanent Delete blocks it, and Test Data Purge refuses it
 * at the eligibility gate before the exception is considered.
 */

/**
 * The one and only test-data marker.
 *
 * Anchored, case-SENSITIVE and prefix-only: it matches `EMP-TEST-001` and
 * refuses `XEMP-TEST-001`, `emp-test-001`, and `EMP-TEST-` with no suffix.
 * Identifiers are matched exactly like this everywhere in the codebase.
 */
export const TEST_DATA_EMPLOYEE_NUMBER_PREFIX = "EMP-TEST-";

/** Minimum suffix length so `EMP-TEST-` alone is never treated as test data. */
const MINIMUM_SUFFIX_LENGTH = 1;

/**
 * Whether a stored employee number identifies designated TEST data.
 *
 * Fails closed on anything that is not a non-empty string.
 */
export function isTestDataEmployeeNumber(employeeNumber: unknown): boolean {
  if (typeof employeeNumber !== "string") return false;
  if (!employeeNumber.startsWith(TEST_DATA_EMPLOYEE_NUMBER_PREFIX)) return false;
  const suffix = employeeNumber.slice(TEST_DATA_EMPLOYEE_NUMBER_PREFIX.length);
  return suffix.trim().length >= MINIMUM_SUFFIX_LENGTH;
}

/**
 * The literal phrase an operator must type to arm the purge.
 *
 * Kept as a constant so the server and the dialog can never disagree about it.
 */
export const TEST_DATA_PURGE_CONFIRMATION_PHRASE = "PURGE TEST DATA";

/** Per-record dispositions. `protected` records are NEVER removed by a purge. */
export type TestDataPurgeDisposition = "deletable" | "protected";

/**
 * Every employee-scoped category a purge can touch, in operator display order.
 *
 * The list is deliberately finer-grained than the permanent-delete categories:
 * the operator needs to know a bank account from a face template before
 * agreeing to remove test data, and those sit in the same "Other related
 * records" bucket there.
 */
export const TEST_DATA_PURGE_CATEGORIES = [
  "Employment history",
  "Attendance records",
  "Attendance events",
  "Leave balances",
  "Leave requests",
  "Permission requests",
  "Payroll components",
  "Payroll items",
  "Payslips",
  "Payslip documents",
  "Payslip document versions",
  "Documents",
  "Face ID enrollments",
  "Face ID templates",
  "Project assignments",
  "Addresses",
  "Insurance",
  "Bank accounts",
  "Family members",
  "Education",
  "Custom field values",
  "Announcement recipients",
] as const;

export type TestDataPurgeCategory = (typeof TEST_DATA_PURGE_CATEGORIES)[number];

/**
 * Retention-bound categories for a PRODUCTION employee, and for every category
 * the business has NOT explicitly excepted.
 *
 * For a non-test employee this list is the whole of what blocks a purge:
 * employment history included, exactly as it blocks a permanent delete.
 */
export const TEST_DATA_PURGE_PROTECTED_CATEGORIES = [
  "Employment history",
  "Attendance records",
  "Attendance events",
  "Leave balances",
  "Leave requests",
  "Permission requests",
  "Payroll components",
  "Payroll items",
  "Payslips",
  "Payslip documents",
  "Payslip document versions",
] as const satisfies readonly TestDataPurgeCategory[];

/**
 * THE APPROVED EXCEPTION — and the only one.
 *
 * Employment history of an eligible `EMP-TEST-*` employee is test fixture data
 * and may be purged. Anything NOT named here stays protected for every employee,
 * including test employees.
 *
 * Deliberately narrow:
 * - only "Employment history" is excepted, not the wider historical record;
 * - attendance, leave, permission absences, payroll and payslips are absent on
 *   purpose — they remain protected even for test data, so a test employee that
 *   ever accrued real time or pay records still blocks the purge.
 */
export const TEST_DATA_PURGE_TEST_DATA_EXCEPTIONS = [
  "Employment history",
] as const satisfies readonly TestDataPurgeCategory[];

const TEST_DATA_EXCEPTION_SET: ReadonlySet<string> = new Set(
  TEST_DATA_PURGE_TEST_DATA_EXCEPTIONS
);

/** Whether a category is covered by the approved test-data exception. */
export function isTestDataExemptCategory(
  category: TestDataPurgeCategory
): boolean {
  return TEST_DATA_EXCEPTION_SET.has(category);
}

/** Categories removed explicitly for EVERY employee, test data or not. */
export const TEST_DATA_PURGE_DELETABLE_CATEGORIES = [
  "Documents",
  "Face ID enrollments",
  "Face ID templates",
  "Project assignments",
  "Addresses",
  "Insurance",
  "Bank accounts",
  "Family members",
  "Education",
  "Custom field values",
  "Announcement recipients",
] as const satisfies readonly TestDataPurgeCategory[];

const PROTECTED_SET: ReadonlySet<string> = new Set(
  TEST_DATA_PURGE_PROTECTED_CATEGORIES
);
const DELETABLE_SET: ReadonlySet<string> = new Set(
  TEST_DATA_PURGE_DELETABLE_CATEGORIES
);

/**
 * The disposition a category carries for a GIVEN employee.
 *
 * The employee number is a REQUIRED parameter, not optional metadata: the
 * approved exception may only ever be applied to a record that has already
 * proven it is designated test data. Callers cannot ask "is employment history
 * deletable?" in the abstract and get `deletable` back for a production row.
 *
 * Order matters. The exception is checked first but ONLY after the employee
 * number passes `isTestDataEmployeeNumber`; every other category falls through
 * to the static classification, and unknown categories fail CLOSED as
 * `protected`, so a newly added table can never become implicitly deletable by
 * omission.
 */
export function testDataPurgeDisposition(
  category: TestDataPurgeCategory,
  employeeNumber: string
): TestDataPurgeDisposition {
  if (isTestDataEmployeeNumber(employeeNumber) && isTestDataExemptCategory(category)) {
    return "deletable";
  }
  if (DELETABLE_SET.has(category)) return "deletable";
  if (PROTECTED_SET.has(category)) return "protected";
  return "protected";
}

/**
 * The disposition for a category when the employee is NOT (yet) proven test data.
 *
 * The strictly safe reading: only the always-deletable categories qualify. This
 * is what a pre-eligibility check — the dependency scan, the delete plan
 * validation — must use, so no caller can accidentally widen the scope before
 * the eligibility gate has run.
 */
export function baseTestDataPurgeDisposition(
  category: TestDataPurgeCategory
): TestDataPurgeDisposition {
  if (DELETABLE_SET.has(category)) return "deletable";
  if (PROTECTED_SET.has(category)) return "protected";
  return "protected";
}

/** Both category lists partition the catalog exactly once. */
export function protectedPurgeCategories(): TestDataPurgeCategory[] {
  return [...TEST_DATA_PURGE_PROTECTED_CATEGORIES];
}

export function deletablePurgeCategories(): TestDataPurgeCategory[] {
  return [...TEST_DATA_PURGE_DELETABLE_CATEGORIES];
}

/** One category's row count for one employee. */
export interface TestDataPurgeCount {
  category: TestDataPurgeCategory;
  count: number;
  /**
   * Resolved for THIS employee's number. `"deletable"` on "Employment history"
   * therefore means the approved test-data exception applied, which the UI
   * surfaces as a distinct count rather than hiding inside "other records".
   */
  disposition: TestDataPurgeDisposition;
  /** True when `"deletable"` only because of the approved test-data exception. */
  viaTestDataException?: boolean;
}

/** The employee summary a purge plan carries per employee. */
export interface TestDataPurgeTarget {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employmentStatus: string;
  counts: TestDataPurgeCount[];
}

/** Direct reports that are NOT part of the purge selection. */
export interface TestDataPurgeDirectReport {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  /** Whether the direct report is itself eligible test data. */
  isTestData: boolean;
}

export type TestDataPurgeDecision =
  | {
      allowed: true;
      /** Categories that will be removed, aggregated across the selection. */
      willDelete: TestDataPurgeCount[];
      /** Test-data direct reports whose manager link will be cleared. */
      managerLinksCleared: TestDataPurgeDirectReport[];
    }
  | {
      allowed: false;
      code:
        | "NOT_TEST_DATA"
        | "PROTECTED_RECORDS"
        | "PRODUCTION_DIRECT_REPORT";
      message: string;
      /** Protected categories with a non-zero count, for the block report. */
      blockedCategories?: TestDataPurgeCount[];
      /** Production direct reports that would be affected. */
      productionDirectReports?: TestDataPurgeDirectReport[];
    };

export interface TestDataPurgeEvaluationInput {
  targets: readonly TestDataPurgeTarget[];
  /** Direct reports of the selected employees, outside the selection. */
  directReports: readonly TestDataPurgeDirectReport[];
}

/** Non-zero protected categories across the whole selection. */
export function collectBlockedPurgeCategories(
  targets: readonly TestDataPurgeTarget[]
): TestDataPurgeCount[] {
  const totals = new Map<TestDataPurgeCategory, number>();
  for (const target of targets) {
    for (const entry of target.counts) {
      if (entry.disposition !== "protected" || entry.count <= 0) continue;
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.count);
    }
  }
  return TEST_DATA_PURGE_PROTECTED_CATEGORIES.filter((category) =>
    totals.has(category)
  ).map((category) => ({
    category,
    count: totals.get(category) ?? 0,
    disposition: "protected" as const,
  }));
}

/** Non-zero deletable categories across the whole selection. */
export function collectDeletablePurgeCounts(
  targets: readonly TestDataPurgeTarget[]
): TestDataPurgeCount[] {
  const totals = new Map<TestDataPurgeCategory, number>();
  for (const target of targets) {
    for (const entry of target.counts) {
      if (entry.disposition !== "deletable" || entry.count <= 0) continue;
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.count);
    }
  }
  return TEST_DATA_PURGE_CATEGORIES.filter((category) =>
    totals.has(category)
  ).map((category) => ({
    category,
    count: totals.get(category) ?? 0,
    disposition: "deletable" as const,
    ...(isTestDataExemptCategory(category)
      ? { viaTestDataException: true as const }
      : {}),
  }));
}

/**
 * The operator-facing breakdown the pre-purge report requires.
 *
 * Employment history is reported in its own bucket, separated from "other test
 * records", because it is the one category removed under the approved exception
 * and the operator needs to see exactly how much of it is going.
 */
export function summarizePurgeBreakdown(targets: readonly TestDataPurgeTarget[]) {
  const deletable = collectDeletablePurgeCounts(targets);
  const sum = (categories: readonly TestDataPurgeCategory[]): number =>
    categories.reduce((total, entry) => {
      const match = deletable.find((item) => item.category === entry);
      return total + (match?.count ?? 0);
    }, 0);

  const employmentHistory =
    deletable.find((entry) => entry.category === "Employment history")?.count ?? 0;
  const attendance = sum([
    "Attendance records",
    "Attendance events",
  ]);
  const leave = sum(["Leave balances", "Leave requests"]);
  const permission = sum(["Permission requests"]);
  const payroll = sum([
    "Payroll components",
    "Payroll items",
    "Payslips",
    "Payslip documents",
    "Payslip document versions",
  ]);
  const other = deletable
    .filter(
      (entry) =>
        !TEST_DATA_PURGE_TEST_DATA_EXCEPTIONS.includes(entry.category as never) &&
        ![
          "Attendance records",
          "Attendance events",
          "Leave balances",
          "Leave requests",
          "Permission requests",
          "Payroll components",
          "Payroll items",
          "Payslips",
          "Payslip documents",
          "Payslip document versions",
        ].includes(entry.category)
    )
    .reduce((total, entry) => total + entry.count, 0);

  return {
    employeeCount: targets.length,
    employmentHistory,
    attendance,
    leave,
    permission,
    payroll,
    other,
    total: totalDeletablePurgeRecords(targets),
  };
}

/** Every related record the purge would remove, across all deletable categories. */
export function totalDeletablePurgeRecords(
  targets: readonly TestDataPurgeTarget[]
): number {
  return collectDeletablePurgeCounts(targets).reduce(
    (total, entry) => total + entry.count,
    0
  );
}

/**
 * Whether a direct report may be left alone.
 *
 * A PRODUCTION direct report is never touched: the manager link is only ever
 * cleared for a direct report that is itself eligible test data. A production
 * employee affected by a purge is a hard block, because removing a test manager
 * must not silently restructure a real reporting line.
 */
export function productionDirectReports(
  directReports: readonly TestDataPurgeDirectReport[]
): TestDataPurgeDirectReport[] {
  return directReports.filter((report) => !report.isTestData);
}

export const TEST_DATA_PURGE_PROTECTED_MESSAGE =
  "Test Data Purge blocked — protected historical records exist.";

export const TEST_DATA_PURGE_RETENTION_NOTICE =
  "These records are protected by HRIS data-retention rules.";

export const TEST_DATA_PURGE_DIRECT_REPORT_MESSAGE =
  "Test Data Purge blocked — a production employee reports to a selected test employee.";

export const TEST_DATA_PURGE_NOT_TEST_DATA_MESSAGE =
  "Only records explicitly identified as TEST data are eligible for purge.";

export const TEST_DATA_PURGE_INVALID_CONFIRMATION_MESSAGE =
  "Purge confirmation did not match.";

export const TEST_DATA_PURGE_ACKNOWLEDGEMENT_MESSAGE =
  "You must acknowledge that a test data purge cannot be undone.";

export const TEST_DATA_PURGE_FORBIDDEN_MESSAGE =
  "You do not have permission to purge test data.";

export const TEST_DATA_PURGE_NOT_FOUND_MESSAGE =
  "None of the selected records exist in your organization.";

export const TEST_DATA_PURGE_FAILED_MESSAGE =
  "Test data purge failed. No records were deleted.";

export const TEST_DATA_PURGE_EMPTY_SELECTION_MESSAGE =
  "Select at least one test employee.";

export const TEST_DATA_PURGE_ADVICE =
  "No records were deleted. Resolve the findings and try again.";

/** Block report text, listing every protected category with its count. */
export function buildProtectedPurgeMessage(
  blockedCategories: readonly TestDataPurgeCount[]
): string {
  const lines = blockedCategories.map(
    (entry) => `${entry.category}: ${entry.count}`
  );
  return [
    TEST_DATA_PURGE_PROTECTED_MESSAGE,
    "",
    "Protected records:",
    ...(lines.length > 0 ? lines : ["(none reported)"]),
    "",
    TEST_DATA_PURGE_RETENTION_NOTICE,
    "",
    TEST_DATA_PURGE_ADVICE,
  ].join("\n");
}

/** Block report for a production employee inside the reporting line. */
export function buildProductionDirectReportMessage(
  reports: readonly TestDataPurgeDirectReport[]
): string {
  const lines = reports.map(
    (report) =>
      `${report.employeeNumber} — ${report.employeeName} (production employee)`
  );
  return [
    TEST_DATA_PURGE_DIRECT_REPORT_MESSAGE,
    "",
    "Production employees affected:",
    ...lines,
    "",
    "A production employee must never be affected by a test-data purge. " +
      "Reassign or unlink the reporting line first, then purge.",
  ].join("\n");
}

/**
 * Decide whether the purge may proceed.
 *
 * Order is load-bearing and each step fails closed:
 *
 * 1. ELIGIBILITY — every target must be designated TEST data. This runs FIRST,
 *    before any category is classified, because the approved employment-history
 *    exception is only reachable once eligibility is proven. A selection
 *    containing one production employee is refused here, so the exception is
 *    never evaluated against it.
 * 2. PROTECTED RECORDS — anything not excepted for test data blocks the whole
 *    purge. Attendance, leave, permission, payroll and payslip remain protected
 *    even for a test employee.
 * 3. PRODUCTION DIRECT REPORTS — a real employee in the reporting line blocks.
 *
 * Returns an aggregate, never a partial approval: a purge is all-or-nothing.
 */
export function evaluateTestDataPurge(
  input: TestDataPurgeEvaluationInput
): TestDataPurgeDecision {
  const notTestData = input.targets.filter(
    (target) => !isTestDataEmployeeNumber(target.employeeNumber)
  );
  if (notTestData.length > 0) {
    return {
      allowed: false,
      code: "NOT_TEST_DATA",
      message: TEST_DATA_PURGE_NOT_TEST_DATA_MESSAGE,
    };
  }

  const blockedCategories = collectBlockedPurgeCategories(input.targets);
  if (blockedCategories.length > 0) {
    return {
      allowed: false,
      code: "PROTECTED_RECORDS",
      message: buildProtectedPurgeMessage(blockedCategories),
      blockedCategories,
    };
  }

  const affected = productionDirectReports(input.directReports);
  if (affected.length > 0) {
    return {
      allowed: false,
      code: "PRODUCTION_DIRECT_REPORT",
      message: buildProductionDirectReportMessage(affected),
      productionDirectReports: affected,
    };
  }

  return {
    allowed: true,
    willDelete: collectDeletablePurgeCounts(input.targets),
    managerLinksCleared: input.directReports.filter(
      (report) => report.isTestData
    ),
  };
}

/** Exact, case-sensitive match of the typed purge phrase. */
export function matchesPurgeConfirmationPhrase(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim() === TEST_DATA_PURGE_CONFIRMATION_PHRASE;
}

/**
 * Per-employee confirmation phrase, e.g. `PURGE TEST DATA EMP-TEST-001`.
 *
 * Required for EVERY selected employee, so a multi-employee purge cannot be
 * confirmed by acknowledging one record and hoping the rest are similar.
 */
export function purgeConfirmationPhraseFor(
  employeeNumber: string
): string {
  return `${TEST_DATA_PURGE_CONFIRMATION_PHRASE} ${employeeNumber}`;
}

export function matchesEmployeePurgeConfirmation(
  employeeNumber: string,
  value: unknown
): boolean {
  if (typeof value !== "string") return false;
  if (!isTestDataEmployeeNumber(employeeNumber)) return false;
  return value.trim() === purgeConfirmationPhraseFor(employeeNumber);
}

/**
 * Server-issued plan token.
 *
 * A fingerprint over the exact selection and its related-record counts. The
 * dialog receives it, echoes it back, and the server recomputes it from the
 * rows it is about to act on: if anything changed between the preview and the
 * confirmation — a row added, an employee deleted, a different selection — the
 * tokens differ and the purge is refused as `INVALID_CONFIRMATION`. This is
 * what makes the client unable to influence the plan.
 */
export function testDataPurgePlanToken(input: {
  employeeIds: readonly string[];
  countsByEmployee: ReadonlyMap<string, string>;
}): string {
  const parts = [...input.employeeIds]
    .sort()
    .map((employeeId) => `${employeeId}:${input.countsByEmployee.get(employeeId) ?? ""}`);
  return parts.join("|");
}
