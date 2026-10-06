import "server-only";

import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  announcementRecipients,
  attendanceEvents,
  attendanceRecords,
  employeeAddresses,
  employeeBankAccounts,
  employeeCustomFieldValues,
  employeeDependents,
  employeeDocuments,
  employeeEducations,
  employeeEmploymentHistory,
  employeeFaceEnrollments,
  employeeInsurances,
  employeePayrollComponents,
  employeeProjectAssignments,
  employees,
  faceEnrollmentTemplates,
  leaveBalances,
  leaveRequests,
  payrollItems,
  payslipDocumentVersions,
  payslipDocuments,
  payslips,
  permissionRequests,
} from "@/db/schema";
import {
  TEST_DATA_EMPLOYEE_NUMBER_PREFIX,
  baseTestDataPurgeDisposition,
  isTestDataEmployeeNumber,
  isTestDataExemptCategory,
  testDataPurgeDisposition,
  type TestDataPurgeCategory,
  type TestDataPurgeDirectReport,
  type TestDataPurgeTarget,
} from "./test-data-purge-policy";

/**
 * TEST DATA PURGE data access — server-only.
 *
 * Deliberately a SEPARATE module from `features/employees/queries.ts`. The
 * permanent-delete dependency scan and delete plan are imported there by tests
 * that assert they contain no test-data special-casing; sharing the code would
 * entangle the two capabilities. The TABLE INVENTORY is the same, because it is
 * the same schema — but the classification and the delete plan are this
 * feature's own.
 *
 * Every read is organization-scoped and every read that feeds the purge plan
 * takes the TRANSACTION handle, so the counts describe the same snapshot the
 * DELETE acts on.
 */

type HrisTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface PurgeSource {
  table: AnyPgTable;
  employeeIdColumn: AnyPgColumn;
  organizationIdColumn: AnyPgColumn;
}

/**
 * Every employee-scoped table, in operator display order.
 *
 * Same 20 tables the permanent-delete flow scans: in production none of these
 * employee foreign keys is `CASCADE` (24 `RESTRICT`, 2 self-referencing
 * `SET NULL`, per `db/migrations/0017_employee_delete_safety_reconciliation.sql`),
 * so a single remaining row makes the employee `DELETE` fail. Counting first
 * is what turns that into a readable refusal.
 */
const PURGE_SOURCES: readonly {
  category: TestDataPurgeCategory;
  tables: readonly PurgeSource[];
}[] = [
  {
    category: "Employment history",
    tables: [
      {
        table: employeeEmploymentHistory,
        employeeIdColumn: employeeEmploymentHistory.employeeId,
        organizationIdColumn: employeeEmploymentHistory.organizationId,
      },
    ],
  },
  {
    category: "Attendance records",
    tables: [
      {
        table: attendanceRecords,
        employeeIdColumn: attendanceRecords.employeeId,
        organizationIdColumn: attendanceRecords.organizationId,
      },
    ],
  },
  {
    category: "Attendance events",
    tables: [
      {
        table: attendanceEvents,
        employeeIdColumn: attendanceEvents.employeeId,
        organizationIdColumn: attendanceEvents.organizationId,
      },
    ],
  },
  {
    category: "Leave balances",
    tables: [
      {
        table: leaveBalances,
        employeeIdColumn: leaveBalances.employeeId,
        organizationIdColumn: leaveBalances.organizationId,
      },
    ],
  },
  {
    category: "Leave requests",
    tables: [
      {
        table: leaveRequests,
        employeeIdColumn: leaveRequests.employeeId,
        organizationIdColumn: leaveRequests.organizationId,
      },
    ],
  },
  {
    category: "Permission requests",
    tables: [
      {
        table: permissionRequests,
        employeeIdColumn: permissionRequests.employeeId,
        organizationIdColumn: permissionRequests.organizationId,
      },
    ],
  },
  {
    category: "Payroll components",
    tables: [
      {
        table: employeePayrollComponents,
        employeeIdColumn: employeePayrollComponents.employeeId,
        organizationIdColumn: employeePayrollComponents.organizationId,
      },
    ],
  },
  {
    category: "Payroll items",
    tables: [
      {
        table: payrollItems,
        employeeIdColumn: payrollItems.employeeId,
        organizationIdColumn: payrollItems.organizationId,
      },
    ],
  },
  {
    category: "Payslips",
    tables: [
      {
        table: payslips,
        employeeIdColumn: payslips.employeeId,
        organizationIdColumn: payslips.organizationId,
      },
    ],
  },
  {
    category: "Payslip documents",
    tables: [
      {
        table: payslipDocuments,
        employeeIdColumn: payslipDocuments.employeeId,
        organizationIdColumn: payslipDocuments.organizationId,
      },
    ],
  },
  {
    category: "Payslip document versions",
    tables: [
      {
        table: payslipDocumentVersions,
        employeeIdColumn: payslipDocumentVersions.employeeId,
        organizationIdColumn: payslipDocumentVersions.organizationId,
      },
    ],
  },
  {
    category: "Documents",
    tables: [
      {
        table: employeeDocuments,
        employeeIdColumn: employeeDocuments.employeeId,
        organizationIdColumn: employeeDocuments.organizationId,
      },
    ],
  },
  {
    category: "Face ID enrollments",
    tables: [
      {
        table: employeeFaceEnrollments,
        employeeIdColumn: employeeFaceEnrollments.employeeId,
        organizationIdColumn: employeeFaceEnrollments.organizationId,
      },
    ],
  },
  {
    category: "Face ID templates",
    tables: [
      {
        table: faceEnrollmentTemplates,
        employeeIdColumn: faceEnrollmentTemplates.employeeId,
        organizationIdColumn: faceEnrollmentTemplates.organizationId,
      },
    ],
  },
  {
    category: "Project assignments",
    tables: [
      {
        table: employeeProjectAssignments,
        employeeIdColumn: employeeProjectAssignments.employeeId,
        organizationIdColumn: employeeProjectAssignments.organizationId,
      },
    ],
  },
  {
    category: "Addresses",
    tables: [
      {
        table: employeeAddresses,
        employeeIdColumn: employeeAddresses.employeeId,
        organizationIdColumn: employeeAddresses.organizationId,
      },
    ],
  },
  {
    category: "Insurance",
    tables: [
      {
        table: employeeInsurances,
        employeeIdColumn: employeeInsurances.employeeId,
        organizationIdColumn: employeeInsurances.organizationId,
      },
    ],
  },
  {
    category: "Bank accounts",
    tables: [
      {
        table: employeeBankAccounts,
        employeeIdColumn: employeeBankAccounts.employeeId,
        organizationIdColumn: employeeBankAccounts.organizationId,
      },
    ],
  },
  {
    category: "Family members",
    tables: [
      {
        table: employeeDependents,
        employeeIdColumn: employeeDependents.employeeId,
        organizationIdColumn: employeeDependents.organizationId,
      },
    ],
  },
  {
    category: "Education",
    tables: [
      {
        table: employeeEducations,
        employeeIdColumn: employeeEducations.employeeId,
        organizationIdColumn: employeeEducations.organizationId,
      },
    ],
  },
  {
    category: "Custom field values",
    tables: [
      {
        table: employeeCustomFieldValues,
        employeeIdColumn: employeeCustomFieldValues.employeeId,
        organizationIdColumn: employeeCustomFieldValues.organizationId,
      },
    ],
  },
  {
    category: "Announcement recipients",
    tables: [
      {
        table: announcementRecipients,
        employeeIdColumn: announcementRecipients.employeeId,
        organizationIdColumn: announcementRecipients.organizationId,
      },
    ],
  },
];

/**
 * The explicit purge plan: DELETABLE categories only, expanded to the concrete
 * tables to clear.
 *
 * Order is fixed HERE rather than derived at call time. The two Face ID
 * categories are emitted template-then-enrollment, because
 * `face_enrollment_templates` carries its own `ON DELETE CASCADE` to the
 * enrollment. Stating the child explicitly means the cascade is never relied
 * upon: if the plan is edited, the parent delete fails loudly instead of quietly
 * removing extra rows.
 *
 * Built from `baseTestDataPurgeDisposition` — the strictly safe reading that
 * excludes the employment-history exception. The exception is handled SEPARATELY
 * in `deletePurgeEmploymentHistory`, which only runs for employee ids whose
 * eligibility has already been proven inside the transaction. Keeping the two
 * plans apart means this one can never be reached by a production employee.
 */
const PURGE_DELETE_PLAN: readonly {
  category: TestDataPurgeCategory;
  tables: readonly PurgeSource[];
}[] = PURGE_SOURCES.filter(
  (group) => baseTestDataPurgeDisposition(group.category) === "deletable"
).map((group) => {
  if (group.category !== "Face ID enrollments") return group;
  // Reverse this pair: see the order note above.
  const templates = PURGE_SOURCES.find(
    (candidate) => candidate.category === "Face ID templates"
  );
  return {
    category: group.category,
    tables: [...(templates?.tables ?? []), ...group.tables],
  };
});

/**
 * The APPROVED EXCEPTION plan — employment history, and nothing else.
 *
 * Kept apart from `PURGE_DELETE_PLAN` on purpose. This plan is only ever
 * reachable through `deletePurgeEmploymentHistory`, which is called with the
 * employee ids whose `EMP-TEST-*` eligibility was proven inside the transaction.
 * A production employee can never appear in that id list, so its history can
 * never be deleted here — and normal Permanent Delete still protects employment
 * history for everyone.
 */
const TEST_DATA_EXCEPTION_DELETE_PLAN: readonly {
  category: TestDataPurgeCategory;
  tables: readonly PurgeSource[];
}[] = PURGE_SOURCES.filter((group) => isTestDataExemptCategory(group.category)).map(
  (group) => ({ category: group.category, tables: [...group.tables] })
);

/**
 * Fail fast when the purge plan and the policy classification disagree.
 *
 * Runs at module load, so a category that becomes protected — or a new
 * employee-scoped table added to a protected category — cannot silently remain
 * in the plan that actually issues `DELETE` statements. Fails CLOSED: an
 * unknown category is treated as protected by `baseTestDataPurgeDisposition`.
 */
function assertPurgePlanMatchesPolicy(): void {
  const planned = new Set(PURGE_DELETE_PLAN.map((entry) => entry.category));
  for (const entry of PURGE_DELETE_PLAN) {
    if (baseTestDataPurgeDisposition(entry.category) !== "deletable") {
      throw new Error(
        `Test Data Purge plan must not delete protected category "${entry.category}".`
      );
    }
    if (entry.tables.length === 0) {
      throw new Error(
        `Test Data Purge plan has no tables for "${entry.category}".`
      );
    }
  }
  for (const group of PURGE_SOURCES) {
    if (
      baseTestDataPurgeDisposition(group.category) === "deletable" &&
      !planned.has(group.category)
    ) {
      throw new Error(
        `Test Data Purge plan is missing deletable category "${group.category}".`
      );
    }
  }
  // A PROTECTED category must never appear in the always-deletable plan. An
  // excepted category is removed only through its own gated plan below, and a
  // non-excepted protected category is never deleted at all. A protected
  // category in this plan would be an unreviewed bypass.
  for (const group of PURGE_SOURCES) {
    if (
      baseTestDataPurgeDisposition(group.category) === "protected" &&
      planned.has(group.category)
    ) {
      throw new Error(
        `Test Data Purge plan must not delete protected category "${group.category}".`
      );
    }
  }
  // The employment-history plan must exist and must cover every excepted table.
  for (const group of PURGE_SOURCES) {
    if (!isTestDataExemptCategory(group.category)) continue;
    const entry = TEST_DATA_EXCEPTION_DELETE_PLAN.find(
      (candidate) => candidate.category === group.category
    );
    if (!entry) {
      throw new Error(
        `Test Data Purge is missing the gated delete plan for excepted category "${group.category}".`
      );
    }
  }
}

assertPurgePlanMatchesPolicy();

/**
 * List every employee of `organizationId` identified as TEST data.
 *
 * The `LIKE` filter runs in the DATABASE, so a production employee is never
 * loaded and can never be rendered as eligible. The in-process re-check is a
 * belt-and-braces guard against a `LIKE` wildcard edge case in the prefix.
 */
export async function listTestDataEmployees(
  organizationId: string
): Promise<
  {
    employeeId: string;
    employeeNumber: string;
    employeeName: string;
    employmentStatus: string;
  }[]
> {
  const rows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employmentStatus: employees.employmentStatus,
    })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        sql`${employees.employeeNumber} LIKE ${`${TEST_DATA_EMPLOYEE_NUMBER_PREFIX}%`}`
      )
    )
    .orderBy(asc(employees.employeeNumber));

  return rows
    .filter((row) => isTestDataEmployeeNumber(row.employeeNumber))
    .map((row) => ({
      employeeId: row.id,
      employeeNumber: row.employeeNumber,
      employeeName: `${row.firstName} ${row.lastName}`,
      employmentStatus: row.employmentStatus,
    }));
}

/**
 * Load the selected employees org-scoped, for the pre-purge report.
 *
 * Only rows inside `organizationId` are returned, so a cross-organization id
 * resolves as "not found" and cannot disclose another tenant's data.
 */
export async function listPurgeTargets(
  tx: HrisTransaction,
  employeeIds: readonly string[],
  organizationId: string
): Promise<TestDataPurgeTarget[]> {
  if (employeeIds.length === 0) return [];
  const rows = await tx
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employmentStatus: employees.employmentStatus,
    })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        inArray(employees.id, [...employeeIds])
      )
    )
    .orderBy(asc(employees.employeeNumber));

  return rows.map((row) => ({
    employeeId: row.id,
    employeeNumber: row.employeeNumber,
    employeeName: `${row.firstName} ${row.lastName}`,
    employmentStatus: row.employmentStatus,
    counts: [],
  }));
}

/**
 * Direct reports of the selected employees that are NOT themselves selected.
 *
 * Each is classified as test data or not, because the policy treats them very
 * differently: a production employee BLOCKS the purge, a test-data employee
 * only loses its manager link.
 */
export async function listPurgeDirectReports(
  tx: HrisTransaction,
  employeeIds: readonly string[],
  organizationId: string
): Promise<TestDataPurgeDirectReport[]> {
  if (employeeIds.length === 0) return [];
  const rows = await tx
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        inArray(employees.managerId, [...employeeIds]),
        notInArray(employees.id, [...employeeIds])
      )
    )
    .orderBy(asc(employees.employeeNumber));

  return rows.map((row) => ({
    employeeId: row.id,
    employeeNumber: row.employeeNumber,
    employeeName: `${row.firstName} ${row.lastName}`,
    isTestData: isTestDataEmployeeNumber(row.employeeNumber),
  }));
}

/**
 * Count every related record per selected employee.
 *
 * Callers MUST pass the purge transaction, so the counts and the subsequent
 * `DELETE` share one snapshot. A purge touches at most a handful of employees,
 * so the statement count (20 tables per employee) is bounded and predictable.
 */
export async function countPurgeDependencies(
  tx: HrisTransaction,
  employeeIds: readonly string[]
): Promise<Map<string, TestDataPurgeTarget["counts"]>> {
  const result = new Map<string, TestDataPurgeTarget["counts"]>();
  for (const employeeId of employeeIds) {
    // The stored employee number decides the disposition. A production employee
    // therefore reports its employment history as PROTECTED here, even though a
    // test employee's reports it as deletable — the exception is not
    // computable without an already-proven eligible number.
    const rows = await tx
      .select({ employeeNumber: employees.employeeNumber })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    const employeeNumber = rows[0]?.employeeNumber ?? "";

    const counts: {
      category: TestDataPurgeCategory;
      count: number;
      disposition: TestDataPurgeTarget["counts"][number]["disposition"];
      viaTestDataException?: true;
    }[] = [];
    for (const group of PURGE_SOURCES) {
      let total = 0;
      for (const source of group.tables) {
        const counted = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(source.table)
          .where(eq(source.employeeIdColumn, employeeId));
        total += counted[0]?.count ?? 0;
      }
      const disposition = testDataPurgeDisposition(group.category, employeeNumber);
      counts.push({
        category: group.category,
        count: total,
        disposition,
        ...(disposition === "deletable" &&
        isTestDataExemptCategory(group.category)
          ? { viaTestDataException: true as const }
          : {}),
      });
    }
    result.set(
      employeeId,
      counts
        .filter((entry) => entry.count > 0)
        .map(({ category, count, disposition, viaTestDataException }) => ({
          category,
          count,
          disposition,
          ...(viaTestDataException ? { viaTestDataException } : {}),
        }))
    );
  }
  return result;
}

/**
 * Explicitly delete the DELETABLE related records of the selected employees.
 *
 * Called inside the purge transaction, immediately before the employee rows.
 * Every statement is scoped by BOTH `employee_id` AND `organization_id`, so a
 * row belonging to another tenant can never be removed. No CASCADE is relied
 * upon.
 */
export async function deletePurgeDeletableRecords(
  tx: HrisTransaction,
  employeeIds: readonly string[],
  organizationId: string
): Promise<Record<string, number>> {
  const removedPerCategory: Record<string, number> = {};
  for (const entry of PURGE_DELETE_PLAN) {
    let removed = 0;
    for (const source of entry.tables) {
      const deleted = await tx
        .delete(source.table)
        .where(
          and(
            inArray(source.employeeIdColumn, [...employeeIds]),
            eq(source.organizationIdColumn, organizationId)
          )
        )
        .returning({ id: source.employeeIdColumn });
      removed += deleted.length;
    }
    if (removed > 0) {
      removedPerCategory[entry.category] = removed;
    }
  }
  return removedPerCategory;
}

/**
 * Delete employment history under the APPROVED TEST-DATA EXCEPTION.
 *
 * This is the only path in the codebase that removes employment history, and it
 * is reachable ONLY through `employees.test_data_purge`. Two independent guards:
 *
 * - the caller passes `eligibleEmployeeIds`, which the action has already proven
 *   to be `EMP-TEST-*` on this transaction's snapshot;
 * - the guard below re-checks the STORED employee number of every row it is
 *   about to delete and refuses anything that is not designated test data, so a
 *   caller bug cannot turn this into a generic "delete any history" statement.
 *
 * Normal Permanent Delete never reaches here and continues to protect employment
 * history for every employee.
 */
export async function deletePurgeEmploymentHistory(
  tx: HrisTransaction,
  eligibleEmployeeIds: readonly string[],
  organizationId: string
): Promise<number> {
  if (eligibleEmployeeIds.length === 0) return 0;
  let removed = 0;
  for (const entry of TEST_DATA_EXCEPTION_DELETE_PLAN) {
    for (const source of entry.tables) {
      // Resolve the eligible ids to their stored numbers, and keep only the ones
      // that genuinely match the test-data prefix.
      const verified = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.organizationId, organizationId),
            inArray(employees.id, [...eligibleEmployeeIds]),
            sql`${employees.employeeNumber} LIKE ${`${TEST_DATA_EMPLOYEE_NUMBER_PREFIX}%`}`
          )
        );
      const verifiedIds = verified
        .map((row) => row.id)
        .filter((id) => {
          const target = eligibleEmployeeIds.find((candidate) => candidate === id);
          return target !== undefined;
        });
      if (verifiedIds.length === 0) continue;
      // Belt and braces: re-derive eligibility from the stored number in
      // JavaScript, not only in the SQL predicate.
      const confirmed = (
        await tx
          .select({ id: employees.id, employeeNumber: employees.employeeNumber })
          .from(employees)
          .where(
            and(
              eq(employees.organizationId, organizationId),
              inArray(employees.id, verifiedIds)
            )
          )
      )
        .filter((row) => isTestDataEmployeeNumber(row.employeeNumber))
        .map((row) => row.id);
      if (confirmed.length === 0) continue;
      const deleted = await tx
        .delete(source.table)
        .where(
          and(
            inArray(source.employeeIdColumn, confirmed),
            eq(source.organizationIdColumn, organizationId)
          )
        )
        .returning({ id: source.employeeIdColumn });
      removed += deleted.length;
    }
  }
  return removed;
}

/**
 * Clear the manager link of TEST-DATA direct reports left behind.
 *
 * Only ever called for reports the policy already classified as test data.
 * Production employees are refused earlier and never reach this function, so a
 * real reporting line is never restructured by a test-data purge.
 */
export async function clearTestDataManagerLinks(
  tx: HrisTransaction,
  directReportIds: readonly string[],
  organizationId: string
): Promise<number> {
  if (directReportIds.length === 0) return 0;
  const cleared = await tx
    .update(employees)
    .set({ managerId: null })
    .where(
      and(
        eq(employees.organizationId, organizationId),
        inArray(employees.id, [...directReportIds])
      )
    )
    .returning({ id: employees.id });
  return cleared.length;
}

/** Delete the selected employee rows themselves, org-scoped. */
export async function deletePurgeEmployees(
  tx: HrisTransaction,
  employeeIds: readonly string[],
  organizationId: string
): Promise<string[]> {
  if (employeeIds.length === 0) return [];
  const deleted = await tx
    .delete(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        inArray(employees.id, [...employeeIds])
      )
    )
    .returning({ id: employees.id });
  return deleted.map((row) => row.id);
}

/**
 * Build the confirmation fingerprint for a plan.
 *
 * The dialog echoes this token back; the server recomputes it from the rows it
 * is about to act on and refuses a mismatch. This is what makes the deletion
 * plan server-owned: the client cannot alter the selection, the counts, or the
 * direct-report set without invalidating the token.
 */
export function buildPurgePlanToken(
  targets: readonly TestDataPurgeTarget[],
  directReports: readonly TestDataPurgeDirectReport[]
): string {
  const payload = targets
    .map((target) =>
      [
        target.employeeId,
        target.employeeNumber,
        target.counts
          .map((entry) => `${entry.category}=${entry.count}`)
          .sort()
          .join(","),
      ].join("|")
    )
    .sort()
    .join(";");
  const reports = directReports
    .map((report) => `${report.employeeId}:${report.employeeNumber}`)
    .sort()
    .join(",");
  return `${payload}#${reports}`;
}
