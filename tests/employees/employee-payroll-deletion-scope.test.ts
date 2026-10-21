/**
 * OWNER-APPROVED PAYROLL DELETION SCOPE — node:test suite.
 *
 * Pins the exact permanent-deletion scope approved by the project owner
 * (2026-10-21, recorded in
 * docs/employee-deletion-owner-scope-approval-20261021.md and reconciled in
 * docs/employee-deletion-payroll-scope-decision-record.md):
 *
 *   DELETED with the employee (explicit plan, children first):
 *     payslip_document_versions → payslip_documents → payslips
 *     payroll_items (cascades payroll_item_components)
 *     employee_payroll_components
 *     + documents, face ID, projects, master data, announcement recipients
 *
 *   RETAINED, detached with identity snapshots (migration 0022):
 *     attendance_records, attendance_events, leave_balances,
 *     leave_requests, permission_requests, employee_employment_history
 *
 *   RETAINED, untouched (organization-level, no employee reference):
 *     payroll_periods, payroll_runs, payroll_components, payroll_events,
 *     and OTHER employees' payroll rows / payroll_item_components.
 *
 * The suite is deliberately redundant with the classification tests: it is
 * the audit-facing record of WHAT the release deletes vs retains, expressed
 * as executable assertions (source-contract style; no live database — the
 * destructive rehearsal on a disposable database provides the runtime proof).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPLOYEE_DELETABLE_DEPENDENCY_LABELS,
  EMPLOYEE_PROTECTED_DEPENDENCY_LABELS,
  employeeDeleteDependencyDisposition,
} from "../../features/employees/permanent-delete-policy.ts";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const queriesSource = stripComments(readRepoFile("features/employees/queries.ts"));
const schemaPayrollSource = stripComments(readRepoFile("db/schema/payroll.ts"));
const migrationSource = readRepoFile(
  "db/migrations/0022_employee_retention_detach.sql"
);

/** The five payroll/payslip tables deleted with the employee. */
const DELETED_PAYROLL_TABLES = [
  "employee_payroll_components",
  "payroll_items",
  "payslips",
  "payslip_documents",
  "payslip_document_versions",
] as const;

/** The six retained (detached) tables. */
const RETAINED_TABLES = [
  "attendance_records",
  "attendance_events",
  "leave_balances",
  "leave_requests",
  "permission_requests",
  "employee_employment_history",
] as const;

describe("payroll deletion scope: policy classification", () => {
  it("payroll history is classified DELETABLE under the owner-approved scope", () => {
    assert.equal(employeeDeleteDependencyDisposition("Payroll"), "deletable");
    assert.equal(employeeDeleteDependencyDisposition("Payslip"), "deletable");
    assert.deepEqual([...EMPLOYEE_DELETABLE_DEPENDENCY_LABELS], [
      "Payroll",
      "Payslip",
      "Documents",
      "Face ID",
      "Projects",
      "Other related records",
    ]);
  });

  it("only the time/employment-history categories remain protected", () => {
    assert.deepEqual([...EMPLOYEE_PROTECTED_DEPENDENCY_LABELS], [
      "Attendance",
      "Leave",
      "Permission",
      "Employment history",
    ]);
  });

  it("the policy module documents the payroll deletion scope next to the lists", () => {
    const rawPolicySource = readRepoFile(
      "features/employees/permanent-delete-policy.ts"
    );
    assert.equal(
      rawPolicySource.includes(
        "PAYROLL and PAYSLIP are deliberately deletable under the owner-approved"
      ),
      true
    );
  });
});

describe("payroll deletion scope: the explicit delete plan", () => {
  const planBlock = queriesSource.slice(
    queriesSource.indexOf("const EMPLOYEE_DELETE_PLAN_CATEGORY_ORDER"),
    queriesSource.indexOf("assertEmployeeDeletePlanMatchesPolicy();")
  );

  /** Snake-case table name → Drizzle identifier used in queries.ts. */
  const TABLE_IDENTIFIERS: Record<string, string> = {
    employee_payroll_components: "employeePayrollComponents",
    payroll_items: "payrollItems",
    payslips: "payslips",
    payslip_documents: "payslipDocuments",
    payslip_document_versions: "payslipDocumentVersions",
  };

  it("every payroll table is covered by the dependency scan", () => {
    for (const table of DELETED_PAYROLL_TABLES) {
      assert.equal(
        queriesSource.includes(`table: ${TABLE_IDENTIFIERS[table]},`),
        true,
        `${table} must be scanned`
      );
    }
  });

  it("Payslip executes before Payroll (payslips reference payroll_items RESTRICT)", () => {
    assert.equal(
      planBlock.indexOf('"Payslip"') < planBlock.indexOf('"Payroll"'),
      true,
      "the execution order must clear payslip children before payroll items"
    );
    assert.equal(
      queriesSource.includes(
        "must remove Payslip before Payroll (payslips reference payroll_items with ON DELETE RESTRICT)"
      ),
      true,
      "the module-load guard enforces the order"
    );
  });

  it("payslip versions → documents → payslips are deleted children first", () => {
    assert.equal(
      planBlock.includes('new Set(["Face ID", "Payslip"])'),
      true,
      "Payslip is a child-first category"
    );
    // Source order within the Payslip category is payslips, documents,
    // versions; the child-first reversal executes versions, documents, payslips.
    const payslipCategory = queriesSource.slice(
      queriesSource.indexOf('label: "Payslip"'),
      queriesSource.indexOf('label: "Documents"')
    );
    assert.equal(payslipCategory.includes("table: payslips,"), true);
    assert.equal(payslipCategory.includes("table: payslipDocuments,"), true);
    assert.equal(payslipCategory.includes("table: payslipDocumentVersions,"), true);
    assert.equal(
      planBlock.includes("[...group.tables].reverse()"),
      true,
      "the child-first reversal is applied to the declared order"
    );
  });

  it("no retained table may appear in the delete plan and vice versa", () => {
    const retainedPlan = queriesSource.slice(
      queriesSource.indexOf("EMPLOYEE_RETAINED_SNAPSHOT_PLAN"),
      queriesSource.indexOf("assertEmployeeSnapshotPlanMatchesPolicy();")
    );
    for (const table of [
      "employeePayrollComponents",
      "payrollItems",
      "payslips",
      "payslipDocuments",
      "payslipDocumentVersions",
    ]) {
      assert.equal(
        retainedPlan.includes(`table: ${table},`),
        false,
        `${table} is deleted with the employee and must not be snapshotted`
      );
    }
    for (const table of [
      "attendanceRecords",
      "attendanceEvents",
      "leaveBalances",
      "leaveRequests",
      "permissionRequests",
      "employeeEmploymentHistory",
    ]) {
      assert.equal(
        retainedPlan.includes(`table: ${table},`),
        true,
        `${table} is retained and must be snapshotted`
      );
    }
  });
});

describe("payroll deletion scope: schema backstop", () => {
  it("every payroll table keeps a NOT NULL RESTRICT employee reference", () => {
    for (const table of DELETED_PAYROLL_TABLES) {
      const tableIndex = schemaPayrollSource.indexOf(`"${table}"`);
      assert.notEqual(tableIndex, -1, `${table} must exist`);
      const slice = schemaPayrollSource.slice(tableIndex, tableIndex + 2500);
      assert.equal(
        slice.includes('uuid("employee_id")') &&
          slice.includes('.notNull()') &&
          slice.includes('onDelete: "restrict"'),
        true,
        `${table}.employee_id must stay NOT NULL with ON DELETE RESTRICT`
      );
    }
  });

  it("the payroll tables declare no retention identity snapshots or CHECKs", () => {
    for (const table of DELETED_PAYROLL_TABLES) {
      assert.equal(
        schemaPayrollSource.includes(`${table}_retained_identity_check`),
        false,
        `${table} must not declare a retained-identity CHECK`
      );
    }
    assert.equal(
      schemaPayrollSource.includes(
        'text("employee_number_snapshot"),\n    /** Immutable display-name snapshot'
      ),
      false,
      "no payroll table may declare retention-only snapshot columns"
    );
  });

  it("the payslip PDF password snapshots survive the scope change", () => {
    const payslipsIndex = schemaPayrollSource.indexOf('"payslips"');
    const payslipsSlice = schemaPayrollSource.slice(
      payslipsIndex,
      payslipsIndex + 4000
    );
    assert.equal(
      payslipsSlice.includes('text("employee_number_snapshot")'),
      true,
      "payslips.employee_number_snapshot (0013, PDF password contract) stays"
    );
    assert.equal(
      payslipsSlice.includes('date("birth_date_snapshot"'),
      true,
      "payslips.birth_date_snapshot (0014, PDF password contract) stays"
    );
    const itemsIndex = schemaPayrollSource.indexOf('"payroll_items"');
    const itemsSlice = schemaPayrollSource.slice(itemsIndex, itemsIndex + 2500);
    assert.equal(
      itemsSlice.includes('text("employee_number_snapshot").notNull()') &&
        itemsSlice.includes('text("employee_name_snapshot").notNull()'),
      true,
      "payroll_items creation-time snapshots stay NOT NULL"
    );
  });

  it("organization-level payroll records carry no employee reference", () => {
    for (const table of [
      "payroll_periods",
      "payroll_runs",
      "payroll_components",
      "payroll_events",
    ]) {
      const tableIndex = schemaPayrollSource.indexOf(`"${table}"`);
      assert.notEqual(tableIndex, -1, `${table} must exist`);
      const nextTable = schemaPayrollSource.indexOf("pgTable(", tableIndex);
      const slice = schemaPayrollSource.slice(
        tableIndex,
        nextTable === -1 ? undefined : nextTable
      );
      assert.equal(
        slice.includes('uuid("employee_id")'),
        false,
        `${table} is organization-level and must not reference employees`
      );
    }
  });
});

describe("payroll deletion scope: migration 0022 contract", () => {
  it("restores RESTRICT + NOT NULL on every payroll table and verifies it", () => {
    for (const table of DELETED_PAYROLL_TABLES) {
      assert.equal(
        migrationSource.includes(
          `ADD CONSTRAINT ${table}_employee_id_employees_id_fk\n  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;`
        ),
        true,
        `${table} FK must be restored to RESTRICT`
      );
      assert.equal(
        migrationSource.includes(
          `ALTER TABLE ${table}\n  ALTER COLUMN employee_id SET NOT NULL;`
        ),
        true,
        `${table}.employee_id must be restored to NOT NULL`
      );
    }
    assert.equal(
      migrationSource.includes("FOREACH tbl IN ARRAY deleted_tables LOOP"),
      true,
      "the closing verification must check the deleted payroll tables"
    );
  });

  it("adds no snapshot columns to payroll tables and drops the retention-only ones", () => {
    for (const table of DELETED_PAYROLL_TABLES) {
      assert.equal(
        migrationSource.includes(
          `ALTER TABLE ${table}\n  ADD COLUMN IF NOT EXISTS employee_number_snapshot`
        ),
        false,
        `${table} must not gain a retention snapshot column`
      );
    }
    assert.equal(
      migrationSource.includes(
        "ALTER TABLE payslips\n  DROP COLUMN IF EXISTS employee_name_snapshot;"
      ),
      true,
      "the retention-only payslips name snapshot is dropped"
    );
  });

  it("keeps the six retained tables on the detach path", () => {
    for (const table of RETAINED_TABLES) {
      assert.equal(
        migrationSource.includes(
          `ADD CONSTRAINT ${table}_employee_id_employees_id_fk\n  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;`
        ),
        true,
        `${table} stays retained/detached`
      );
    }
  });
});
