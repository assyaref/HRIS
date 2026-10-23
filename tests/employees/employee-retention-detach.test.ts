/**
 * Employee deletion scope (migration 0022) — node:test suite.
 *
 * Pins the OWNER-APPROVED permanent-deletion scope documented in
 * docs/employee-deletion-payroll-scope-decision-record.md, in the repository
 * convention (pure decision logic + source invariants; no live database):
 *
 * - RETAINED tables (six): attendance, leave, permission and employment
 *   history become nullable + ON DELETE SET NULL with an identity snapshot
 *   backfill and a retained-identity CHECK per table.
 * - DELETED tables (five payroll/payslip tables): restored to NOT NULL +
 *   ON DELETE RESTRICT, with the retention-only snapshot columns and CHECKs
 *   dropped. The permanent-delete plan removes them explicitly, children
 *   first, so the RESTRICT foreign keys are the backstop.
 * - No CASCADE anywhere, transactional, idempotent, NOT journaled, and the
 *   control plane (0021) untouched.
 * - The deletion transaction: the snapshot step runs INSIDE the single
 *   transaction, before the deletable-record removal and the employee DELETE,
 *   is org+employee scoped, never reads the form, and fills NULLs only.
 * - Historical reporting: retained time/history rows stay visible via
 *   LEFT JOIN + snapshot COALESCE, and search matches the snapshots.
 * - Fail-closed compatibility: against a pre-0022 schema the foreign-key
 *   rejection still reports the retained-completion error, and the executor
 *   of the control plane stays disabled.
 * - Organization/project isolation: every statement of the plan is scoped by
 *   BOTH employee_id and organization_id; a deleted employee never removes
 *   another employee's records or unrelated organization/project data.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DELETION_EXECUTION_ENABLED,
  RETENTION_ELIGIBLE_CATEGORIES,
} from "../../features/employees/deletion-control-policy.ts";
import {
  EMPLOYEE_DELETABLE_DEPENDENCY_LABELS,
  EMPLOYEE_PERMANENT_DELETE_PERMISSION,
  EMPLOYEE_PROTECTED_DEPENDENCY_LABELS,
  canPermanentlyDeleteEmployees,
  employeeDeleteDependencyDisposition,
  evaluatePermanentEmployeeDeletion,
  type EmployeeDeleteDependencyLabel,
} from "../../features/employees/permanent-delete-policy.ts";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

/** Remove comments so assertions target real code, not explanatory text. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const migrationSource = readRepoFile("db/migrations/0022_employee_retention_detach.sql");
const migration0021Source = readRepoFile(
  "db/migrations/0021_employee_deletion_controls.sql"
);
const journalSource = readRepoFile("db/migrations/meta/_journal.json");
const schemaAttendanceSource = stripComments(
  readRepoFile("db/schema/attendance.ts")
);
const schemaLeaveSource = stripComments(readRepoFile("db/schema/leave.ts"));
const schemaPayrollSource = stripComments(readRepoFile("db/schema/payroll.ts"));
const schemaPermissionSource = stripComments(
  readRepoFile("db/schema/permission_requests.ts")
);
const schemaDetailsSource = stripComments(
  readRepoFile("db/schema/employee_details.ts")
);
const schemaSource = [
  schemaAttendanceSource,
  schemaLeaveSource,
  schemaPayrollSource,
  schemaPermissionSource,
  schemaDetailsSource,
  stripComments(readRepoFile("db/schema/face_enrollments.ts")),
  stripComments(readRepoFile("db/schema/assignments.ts")),
  stripComments(readRepoFile("db/schema/employee_custom_fields.ts")),
  stripComments(readRepoFile("db/schema/announcements.ts")),
].join("\n");
const actionsSource = stripComments(
  readRepoFile("features/employees/actions.ts")
);
const queriesSource = stripComments(readRepoFile("features/employees/queries.ts"));
const attendanceQueriesSource = stripComments(
  readRepoFile("features/attendance/queries.ts")
);
const leaveQueriesSource = stripComments(readRepoFile("features/leave/queries.ts"));
const leaveActionsSource = stripComments(readRepoFile("features/leave/actions.ts"));
const permissionQueriesSource = stripComments(
  readRepoFile("features/permission/queries.ts")
);
const permissionActionsSource = stripComments(
  readRepoFile("features/permission/actions.ts")
);
const payrollQueriesSource = stripComments(
  readRepoFile("features/payroll/queries.ts")
);
const dialogSource = stripComments(
  readRepoFile("features/employees/delete-employee-dialog.tsx")
);
const deletionControlActionsSource = stripComments(
  readRepoFile("features/employees/deletion-control.actions.ts")
);

function actionBlock(source: string, name: string): string {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `actions.ts must define ${name}`);
  const rest = source.slice(start);
  const boundaries = [
    rest.indexOf("\nfunction ", marker.length),
    rest.indexOf("\nexport ", marker.length),
  ].filter((index) => index !== -1);
  const next = boundaries.length > 0 ? Math.min(...boundaries) : -1;
  return next === -1 ? rest : rest.slice(0, next);
}

const permanentDelete = actionBlock(
  actionsSource,
  "permanentlyDeleteEmployeeAction"
);

/**
 * The six RETAINED (time/employment-history) tables: nullable employee
 * references + ON DELETE SET NULL + identity snapshots + retained CHECK.
 */
const RETAINED_TABLES = [
  "attendance_records",
  "attendance_events",
  "leave_balances",
  "leave_requests",
  "permission_requests",
  "employee_employment_history",
] as const;

/**
 * The five payroll/payslip tables DELETED with the employee: restored to
 * NOT NULL + ON DELETE RESTRICT, retention snapshots/CHECKs dropped.
 */
const DELETED_PAYROLL_TABLES = [
  "employee_payroll_components",
  "payroll_items",
  "payslips",
  "payslip_documents",
  "payslip_document_versions",
] as const;

/** Every table whose `employee_id` reference becomes detachable. */
const DETACHED_TABLES = RETAINED_TABLES;

const DELETABLE_TABLES = [
  "employee_documents",
  "employee_face_enrollments",
  "face_enrollment_templates",
  "employee_project_assignments",
  "employee_addresses",
  "employee_insurances",
  "employee_bank_accounts",
  "employee_dependents",
  "employee_educations",
  "employee_custom_field_values",
  "announcement_recipients",
] as const;

/* ------------------------------------------------------------------ */
/* 1. Migration content                                                */
/* ------------------------------------------------------------------ */

describe("migration 0022: structure and safety", () => {
  it("is one transaction and is idempotent (re-runnable)", () => {
    assert.equal(migrationSource.includes("BEGIN;"), true);
    assert.equal(migrationSource.includes("COMMIT;"), true);
    assert.equal((migrationSource.match(/^BEGIN;$/gm) ?? []).length, 1);
    assert.equal((migrationSource.match(/^COMMIT;$/gm) ?? []).length, 1);
    // Idempotency guards on every retained table's schema change.
    for (const table of DETACHED_TABLES) {
      assert.equal(
        migrationSource.includes(`ALTER TABLE ${table}\n  ADD COLUMN IF NOT EXISTS employee_number_snapshot`),
        true,
        `${table} gets an idempotent employee_number_snapshot column`
      );
    }
    assert.equal(
      (migrationSource.match(/DROP CONSTRAINT IF EXISTS/g) ?? []).length >=
        RETAINED_TABLES.length + DELETED_PAYROLL_TABLES.length,
      true,
      "every FK swap/drop is idempotent"
    );
    const migrationWithoutCommentsOrDoBlocks = migrationSource
      .replace(/--[^\n]*/g, "")
      .replace(/DO \$\$[\s\S]*?\$\$;/g, "");
    // Retained CHECK *creations* happen inside guarded DO blocks. Outside DO
    // blocks, "retained_identity_check" may only appear in an idempotent
    // `DROP CONSTRAINT IF EXISTS` (removing the retention CHECK from the
    // five payroll tables that are now deleted with the employee).
    const bareCheckStatements = migrationWithoutCommentsOrDoBlocks
      .split(";")
      .filter((statement) => statement.includes("retained_identity_check"))
      .map((statement) => statement.trim());
    for (const statement of bareCheckStatements) {
      assert.equal(
        statement.startsWith("ALTER TABLE") &&
          statement.includes("DROP CONSTRAINT IF EXISTS"),
        true,
        `retained_identity_check outside a DO block must be an idempotent drop, saw: ${statement}`
      );
    }
    assert.equal(
      (migrationSource.match(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/g) ??
        []).length,
      RETAINED_TABLES.length,
      "every retained-table CHECK creation is guarded"
    );
  });

  it("never deletes rows or overwrites live data; backfills snapshots from NULLs only", () => {
    assert.equal(migrationSource.match(/^\s*DELETE FROM/gm), null);
    assert.equal(migrationSource.match(/^\s*TRUNCATE/gim), null);
    // The only DROP COLUMNs are the retention-only columns removed from the
    // five payroll tables (which never existed in production). No live column
    // is dropped.
    const droppedColumns = (
      migrationSource.match(/DROP COLUMN IF EXISTS (\w+)/g) ?? []
    ).map((statement) => statement.replace("DROP COLUMN IF EXISTS ", ""));
    for (const column of droppedColumns) {
      assert.equal(
        column === "employee_number_snapshot" ||
          column === "employee_name_snapshot",
        true,
        `only retention-only snapshot columns may be dropped, saw ${column}`
      );
    }
    // Backfills fill NULLs only; creation-time snapshots are preserved.
    for (const table of DETACHED_TABLES) {
      const update = migrationSource.slice(
        migrationSource.indexOf(`UPDATE ${table} t`)
      );
      const until = update.indexOf("ALTER TABLE");
      assert.equal(
        update.slice(0, until).includes(
          "SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number)"
        ),
        true,
        `${table} backfill must never overwrite an existing snapshot`
      );
    }
  });

  it("makes the RETAINED employee references nullable with ON DELETE SET NULL", () => {
    for (const table of RETAINED_TABLES) {
      assert.equal(
        migrationSource.includes(`ALTER TABLE ${table}\n  ALTER COLUMN employee_id DROP NOT NULL;`),
        true,
        `${table}.employee_id must become nullable`
      );
      assert.equal(
        migrationSource.includes(
          `ADD CONSTRAINT ${table}_employee_id_employees_id_fk\n  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;`
        ),
        true,
        `${table}'s employee FK must become SET NULL (detach, never delete)`
      );
    }
  });

  it("restores NOT NULL + ON DELETE RESTRICT on the DELETED payroll tables", () => {
    for (const table of DELETED_PAYROLL_TABLES) {
      assert.equal(
        migrationSource.includes(`ALTER TABLE ${table}\n  ALTER COLUMN employee_id SET NOT NULL;`),
        true,
        `${table}.employee_id must be NOT NULL (deleted explicitly)`
      );
      assert.equal(
        migrationSource.includes(
          `ADD CONSTRAINT ${table}_employee_id_employees_id_fk\n  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;`
        ),
        true,
        `${table}'s employee FK must be RESTRICT (deletion backstop)`
      );
    }
  });

  it("keeps every DELETABLE reference RESTRICT + NOT NULL (the racing-insert backstop)", () => {
    for (const table of DELETABLE_TABLES) {
      assert.equal(
        migrationSource.includes(`ALTER TABLE ${table}`),
        false,
        `${table} is deletable and must not be touched by 0022`
      );
    }
  });

  it("contains no CASCADE and no constraint disabling", () => {
    assert.equal(migrationSource.match(/ON DELETE CASCADE/g), null);
    assert.equal(migrationSource.match(/session_replication_role/gi), null);
    assert.equal(migrationSource.match(/DROP CONSTRAINT(?![^;]*IF EXISTS)/g), null);
    assert.equal(migrationSource.match(/DISABLE TRIGGER/gi), null);
  });

  it("guarantees a retained row always carries its identity (retained-identity CHECK)", () => {
    for (const table of RETAINED_TABLES) {
      assert.equal(
        migrationSource.includes(
          `ADD CONSTRAINT ${table}_retained_identity_check\n      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL)`
        ),
        true,
        `${table} must reject an anonymous detached row`
      );
    }
  });

  it("drops retention-only payroll snapshots but keeps creation-time snapshots intact", () => {
    // The five payroll tables are DELETED, so the retention-only columns are
    // dropped and no retained-identity CHECK is added.
    for (const table of DELETED_PAYROLL_TABLES) {
      assert.equal(
        migrationSource.includes(
          `ADD CONSTRAINT ${table}_retained_identity_check`
        ),
        false,
        `${table} is deleted; it must not gain a retention CHECK`
      );
    }
    // Creation-time snapshots used by payslip reporting / PDF password stay:
    // 0022 must never redefine payslips.employee_number_snapshot.
    assert.equal(
      migrationSource.includes(
        "ALTER TABLE payslips\n  ADD COLUMN IF NOT EXISTS employee_number_snapshot"
      ),
      false,
      "payslips.employee_number_snapshot already exists (0013) and must not be redefined"
    );
    assert.equal(
      migrationSource.includes("ALTER TABLE payroll_items\n  ADD COLUMN"),
      false,
      "payroll_items carries NOT NULL creation-time snapshots; nothing to add"
    );
    // payslips.employee_name_snapshot is a retention-only column: it is dropped.
    assert.equal(
      migrationSource.includes(
        "ALTER TABLE payslips\n  DROP COLUMN IF EXISTS employee_name_snapshot;"
      ),
      true
    );
  });

  it("is journaled with a FRESH when after the approved lineage repair, and integrates the control plane without weakening it (0021)", () => {
    // The approved lineage-reconciliation change
    // (docs/drizzle-lineage-reconciliation-execution-record-20261023.md)
    // journalled 0019-0022 with fresh `when` values. A stale or tied `when`
    // is silently skipped forever by the drizzle migrator (drill-proven), so
    // the journal contract pins: exact tags present, idx contiguous, and
    // every new `when` strictly greater than the pre-repair ledger
    // watermark 1790661254287 (0018_employee_custom_tabs, ledger id 18).
    const journal = JSON.parse(journalSource) as {
      entries: {
        idx: number;
        when: number;
        tag: string;
        breakpoints: boolean;
      }[];
    };
    const reconciledTags = [
      "0019_face_template_key_version",
      "0020_user_password_lifecycle",
      "0021_employee_deletion_controls",
      "0022_employee_retention_detach",
    ];
    for (const tag of reconciledTags) {
      const entry = journal.entries.find((candidate) => candidate.tag === tag);
      assert.notEqual(entry, undefined, `journal must contain ${tag}`);
      assert.equal(
        (entry?.when ?? 0) > 1790661254287,
        true,
        `${tag} must carry a fresh when > the 0018 ledger watermark 1790661254287 (stale/tied when is silently skipped by the migrator)`
      );
    }
    for (let idx = 0; idx < journal.entries.length; idx += 1) {
      assert.equal(journal.entries[idx]?.idx, idx, "journal idx must be contiguous");
    }
    // 0021 detaches released/terminal control history, but a LIVE hold/request
    // still blocks the DELETE through a database CHECK after SET NULL.
    assert.equal(
      migration0021Source.includes(
        "employee_legal_holds_active_requires_employee"
      ),
      true
    );
    assert.equal(
      migration0021Source.includes(
        "employee_deletion_requests_active_requires_employee"
      ),
      true
    );
    assert.equal(
      migration0021Source.includes(
        "employee_id uuid REFERENCES employees(id) ON DELETE SET NULL"
      ),
      true
    );
  });

  it("documents the blocking sign-off and forbids automatic production application", () => {
    assert.equal(migrationSource.includes("DO NOT APPLY WITHOUT SIGN-OFF"), true);
    assert.equal(migrationSource.includes("DELIBERATELY NOT JOURNALED"), true);
    assert.equal(migrationSource.includes("BEGIN;"), true);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Drizzle schema mirrors the post-0022 database                    */
/* ------------------------------------------------------------------ */

describe("drizzle schema: the detach design is expressed in code", () => {
  it("declares the snapshot columns on every retained table", () => {
    for (const column of [
      "employee_number_snapshot",
      "employee_name_snapshot",
    ]) {
      assert.equal(schemaSource.includes(`text("${column}")`), true);
    }
    // Six retained tables carry both snapshot columns as nullable text.
    const snapshotColumns = (schemaSource.match(
      /employee_number_snapshot"\)|employee_name_snapshot"\)/g
    ) ?? []).length;
    assert.equal(
      snapshotColumns >= RETAINED_TABLES.length * 2,
      true,
      "every retained table must declare both snapshot columns"
    );
  });

  it("declares SET NULL on the retained references and RESTRICT on the deleted payroll references", () => {
    const setNullRefs = (schemaSource.match(
      /uuid\("employee_id"\)[.\s\S]*?\.references\(\(\) => employees\.id,\s*\{\s*onDelete: "set null",\s*\}\)/g
    ) ?? []).length;
    assert.equal(setNullRefs >= RETAINED_TABLES.length, true);

    // The five payroll tables keep NOT NULL + RESTRICT in the Drizzle schema.
    for (const table of [
      "employee_payroll_components",
      "payroll_items",
      "payslips",
      "payslip_documents",
      "payslip_document_versions",
    ]) {
      const tableIndex = schemaPayrollSource.indexOf(`"${table}"`);
      assert.notEqual(tableIndex, -1, `${table} must be in the payroll schema`);
      const slice = schemaPayrollSource.slice(tableIndex, tableIndex + 2500);
      assert.equal(
        slice.includes('onDelete: "restrict"') &&
          slice.includes('uuid("employee_id")'),
        true,
        `${table} must keep a NOT NULL RESTRICT employee reference`
      );
    }
    // Deletable tables keep their references (RESTRICT in the production DB).
    for (const table of [
      "employeeDocuments",
      "employeeFaceEnrollments",
      "faceEnrollmentTemplates",
      "employeeProjectAssignments",
      "employeeAddresses",
      "employeeInsurances",
      "employeeBankAccounts",
      "employeeDependents",
      "employeeEducations",
      "employeeCustomFieldValues",
      "announcementRecipients",
    ]) {
      assert.equal(
        schemaSource.includes(`${table}`),
        true,
        `${table} remains in the schema with its explicit delete plan`
      );
    }
  });

  it("declares the retained-identity CHECK on every retained table only", () => {
    for (const table of RETAINED_TABLES) {
      assert.equal(
        schemaSource.includes(`${table}_retained_identity_check`),
        true,
        `${table} must declare its retained-identity check`
      );
    }
    for (const table of DELETED_PAYROLL_TABLES) {
      assert.equal(
        schemaPayrollSource.includes(`${table}_retained_identity_check`),
        false,
        `${table} is deleted and must not declare a retained-identity check`
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. The deletion transaction                                         */
/* ------------------------------------------------------------------ */

describe("deletion transaction: snapshot, then delete — atomically", () => {
  it("freezes retained identity INSIDE the single transaction, before any DELETE", () => {
    assert.equal((permanentDelete.match(/db\.transaction\(/g) ?? []).length, 1);
    const snapshotAt = permanentDelete.indexOf("snapshotEmployeeRetainedRecords(");
    const deletableAt = permanentDelete.indexOf("deleteEmployeeDeletableRecords(");
    const employeeDeleteAt = permanentDelete.indexOf(".delete(employees)");
    assert.notEqual(snapshotAt, -1);
    assert.equal(
      snapshotAt < deletableAt,
      true,
      "snapshots are frozen before the deletable records are removed"
    );
    assert.equal(
      deletableAt < employeeDeleteAt,
      true,
      "the employee row is deleted last"
    );
    assert.equal(
      permanentDelete.indexOf("db.transaction") < snapshotAt,
      true,
      "the snapshot step runs on the transaction handle"
    );
  });

  it("the snapshot helper never issues a DELETE and fills NULLs only", () => {
    const helper = queriesSource.slice(
      queriesSource.indexOf("export async function snapshotEmployeeRetainedRecords")
    );
    assert.equal(helper.includes(".update("), true);
    assert.equal(helper.includes(".delete("), false);
    assert.equal(
      helper.includes("coalesce("),
      true,
      "existing snapshots (payslip PDF password contract) are never overwritten"
    );
  });

  it("the snapshot plan is derived from the retained classification and asserted", () => {
    const plan = queriesSource.slice(
      queriesSource.indexOf("EMPLOYEE_RETAINED_SNAPSHOT_PLAN")
    );
    assert.equal(
      plan.includes("assertEmployeeSnapshotPlanMatchesPolicy"),
      true,
      "the plan and the policy classification cannot drift"
    );
    assert.equal(
      queriesSource.includes("assertEmployeeSnapshotPlanMatchesPolicy();"),
      true,
      "the assertion runs at module load"
    );
    for (const table of [
      "attendanceRecords",
      "attendanceEvents",
      "leaveBalances",
      "leaveRequests",
      "permissionRequests",
      "employeeEmploymentHistory",
    ]) {
      assert.equal(
        plan.includes(`table: ${table},`),
        true,
        `${table} must be in the snapshot plan`
      );
    }
    // Payroll history is DELETED with the employee: no payroll table may be
    // snapshotted (their rows are removed, never detached).
    for (const table of [
      "employeePayrollComponents",
      "payrollItems",
      "payslips",
      "payslipDocuments",
      "payslipDocumentVersions",
    ]) {
      assert.equal(
        plan.includes(`table: ${table},`),
        false,
        `${table} is deleted with the employee and must not be in the snapshot plan`
      );
    }
  });

  it("every snapshot statement is scoped by BOTH employee and organization", () => {
    const helper = queriesSource.slice(
      queriesSource.indexOf("export async function snapshotEmployeeRetainedRecords")
    );
    assert.equal(
      helper.includes("eq(source.employeeIdColumn, employeeId)"),
      true
    );
    assert.equal(
      helper.includes("eq(source.organizationIdColumn, organizationId)"),
      true
    );
  });

  it("keeps the pre-0022 foreign-key refusal as the fail-closed fallback", () => {
    assert.equal(permanentDelete.includes("isForeignKeyViolation(error)"), true);
    assert.equal(
      permanentDelete.includes("buildPermanentDeleteRetainedCompletionMessage("),
      true,
      "a 23503 against a pre-0022 schema still reports the retained-completion error"
    );
  });

  it("reports the retained records and the frozen snapshots on SUCCESS", () => {
    assert.equal(
      permanentDelete.includes("retainedDependencies: decision.retained"),
      true
    );
    assert.equal(
      permanentDelete.includes("snapshottedRetainedRecords: outcome.snapshottedRecords"),
      true,
      "the audit records which retained rows had their identity frozen"
    );
    assert.equal(
      permanentDelete.includes("retainedDependencies: outcome.retainedDependencies"),
      true,
      "the success state carries the retained summary for the final-result panel"
    );
  });
});

/* ------------------------------------------------------------------ */
/* 4. Pure policy model: every protected category survives the override */
/* ------------------------------------------------------------------ */

function dependencies(overrides: Partial<Record<string, number>>) {
  const labels: EmployeeDeleteDependencyLabel[] = [
    ...EMPLOYEE_PROTECTED_DEPENDENCY_LABELS,
    ...EMPLOYEE_DELETABLE_DEPENDENCY_LABELS,
  ];
  return labels.map((label) => ({
    label,
    count: overrides[label] ?? 0,
    disposition: employeeDeleteDependencyDisposition(label),
  }));
}

describe("policy model: the override completes with retained records", () => {
  const actorInput = {
    actorUserId: "super-1",
    employeeNumber: "03233",
    linkedUserId: null as string | null,
    superAdminOverride: true,
  };

  it("deletion with NO dependencies succeeds and retains nothing", () => {
    const decision = evaluatePermanentEmployeeDeletion({
      ...actorInput,
      dependencies: dependencies({}),
    });
    assert.equal(decision.allowed, true);
    if (decision.allowed) {
      assert.equal(decision.retained.length, 0);
      assert.equal(decision.willDelete.length, 0);
    }
  });

  it("deletion with EVERY retained category succeeds and reports all of them retained", () => {
    const decision = evaluatePermanentEmployeeDeletion({
      ...actorInput,
      dependencies: dependencies({
        Attendance: 12,
        Leave: 3,
        Permission: 2,
        Payroll: 4,
        Payslip: 5,
        "Employment history": 30,
      }),
    });
    assert.equal(decision.allowed, true);
    if (decision.allowed) {
      assert.deepEqual(
        decision.retained.map((dependency) => dependency.label),
        ["Attendance", "Leave", "Permission", "Employment history"]
      );
      assert.deepEqual(
        decision.retained.map((dependency) => dependency.count),
        [12, 3, 2, 30]
      );
      // Payroll history is owner-approved deletable: it is reported as
      // removed, not retained.
      assert.deepEqual(
        decision.willDelete.map((dependency) => dependency.label),
        ["Payroll", "Payslip"]
      );
    }
  });

  it("mixed dependents split into willDelete vs retained", () => {
    const decision = evaluatePermanentEmployeeDeletion({
      ...actorInput,
      dependencies: dependencies({
        Attendance: 7,
        Documents: 2,
        "Face ID": 1,
        Payslip: 1,
      }),
    });
    assert.equal(decision.allowed, true);
    if (decision.allowed) {
      assert.deepEqual(
        decision.willDelete.map((dependency) => dependency.label),
        ["Payslip", "Documents", "Face ID"]
      );
      assert.deepEqual(
        decision.retained.map((dependency) => dependency.label),
        ["Attendance"]
      );
    }
  });

  it("without the override every protected category is still an absolute refusal", () => {
    for (const label of EMPLOYEE_PROTECTED_DEPENDENCY_LABELS) {
      const decision = evaluatePermanentEmployeeDeletion({
        ...actorInput,
        superAdminOverride: false,
        dependencies: dependencies({ [label]: 1 }),
      });
      assert.equal(
        decision.allowed,
        false,
        `${label} must never be deletable without the server-side override`
      );
      if (!decision.allowed) {
        assert.equal(decision.code, "PROTECTED_RECORDS");
      }
    }
  });

  it("the classification covers every protected table of the dependency graph", () => {
    for (const label of EMPLOYEE_PROTECTED_DEPENDENCY_LABELS) {
      assert.equal(
        employeeDeleteDependencyDisposition(label),
        "protected"
      );
    }
    // The retained categories are exactly the migration's detached tables.
    assert.deepEqual([...EMPLOYEE_PROTECTED_DEPENDENCY_LABELS], [
      "Attendance",
      "Leave",
      "Permission",
      "Employment history",
    ]);
    // Payroll history is now a deletable category under the owner-approved
    // scope, together with the profile categories.
    assert.deepEqual([...EMPLOYEE_DELETABLE_DEPENDENCY_LABELS], [
      "Payroll",
      "Payslip",
      "Documents",
      "Face ID",
      "Projects",
      "Other related records",
    ]);
  });

  it("the control plane stays disabled and its retention schedule stays empty", () => {
    assert.equal(DELETION_EXECUTION_ENABLED, false);
    assert.deepEqual([...RETENTION_ELIGIBLE_CATEGORIES], []);
    assert.equal(
      deletionControlActionsSource.match(/tx\s*\.\s*delete\(/g),
      null,
      "the control-plane executor contains no DELETE statements"
    );
  });
});

/* ------------------------------------------------------------------ */
/* 5. Historical reporting survives the deletion                       */
/* ------------------------------------------------------------------ */

describe("historical reporting: detached rows stay visible via snapshots", () => {
  it("attendance management queries LEFT JOIN and resolve identity from snapshots", () => {
    assert.equal(
      attendanceQueriesSource.includes(
        "coalesce(\n    ${employees.firstName} || ' ' || ${employees.lastName},\n    ${attendanceRecords.employeeNameSnapshot}\n  )"
      ),
      true,
      "the attendance name resolves live-first, snapshot-fallback"
    );
    assert.equal(
      attendanceQueriesSource.includes(
        "coalesce(\n    ${employees.employeeNumber},\n    ${attendanceRecords.employeeNumberSnapshot}\n  )"
      ),
      true
    );
    assert.equal(
      attendanceQueriesSource.includes(
        ".leftJoin(employees, eq(employees.id, attendanceRecords.employeeId))"
      ),
      true,
      "a detached attendance row must not vanish from the management list"
    );
    assert.equal(
      attendanceQueriesSource.includes(
        "ilike(attendanceRecords.employeeNumberSnapshot, pattern)"
      ),
      true,
      "search matches the retained identity too"
    );
  });

  it("leave management queries/detail/review are snapshot-aware", () => {
    assert.equal(
      leaveQueriesSource.includes(".leftJoin(employees, eq(employees.id, leaveRequests.employeeId))"),
      true
    );
    assert.equal(
      leaveQueriesSource.includes("${leaveRequests.employeeNameSnapshot}"),
      true
    );
    assert.equal(
      leaveQueriesSource.includes("ilike(leaveRequests.employeeNumberSnapshot, pattern)"),
      true
    );
    assert.equal(
      leaveActionsSource.includes(".leftJoin(employees, eq(employees.id, leaveRequests.employeeId))"),
      true,
      "the review context load must survive a detached request"
    );
    assert.equal(
      leaveActionsSource.includes(
        "This request belongs to a permanently deleted employee and can no longer be reviewed."
      ),
      true,
      "a detached request is refused safely instead of mutating detached balances"
    );
  });

  it("permission management queries/detail are snapshot-aware and decisions stay safe", () => {
    assert.equal(
      permissionQueriesSource.includes(
        ".leftJoin(employees, eq(employees.id, permissionRequests.employeeId))"
      ),
      true
    );
    assert.equal(
      permissionQueriesSource.includes("${permissionRequests.employeeNameSnapshot}"),
      true
    );
    assert.equal(
      permissionQueriesSource.includes(
        "ilike(permissionRequests.employeeNumberSnapshot, pattern)"
      ),
      true
    );
    assert.equal(
      permissionActionsSource.includes(
        ".leftJoin(employees, eq(employees.id, permissionRequests.employeeId))"
      ),
      true
    );
    // Ownership checks compare against the session employee, so a NULL
    // detached reference can never authorize anything.
    assert.equal(
      permissionActionsSource.includes("if (request.employeeId !== employee.id) forbidden();"),
      true
    );
  });

  it("payroll overview/detail resolve identity without retention snapshots (payslips are deleted, not detached)", () => {
    // Under the owner-approved scope a permanently deleted employee's
    // payslips are GONE, so there is no detached-payslip fallback: the
    // payroll queries resolve names from the payroll-item creation snapshot
    // and the live employee row only.
    assert.equal(
      payrollQueriesSource.includes("${payslips.employeeNameSnapshot}"),
      false,
      "the retention-only payslip name snapshot must not be referenced"
    );
    assert.equal(
      payrollQueriesSource.includes("${payrollItems.employeeNameSnapshot}"),
      true,
      "the payroll-item creation snapshot still stabilizes live payslip names"
    );
    // Self-service stays INNER-joined: a deleted employee has no session.
    assert.equal(
      payrollQueriesSource.includes("eq(payslips.employeeId, employeeId)"),
      true
    );
  });

  it("the published-payslip PDF route still resolves the password from creation-time snapshots", () => {
    const pdfRouteSource = stripComments(
      readRepoFile("app/api/payroll/payslips/[payslipId]/pdf/route.ts")
    );
    assert.equal(
      pdfRouteSource.includes("innerJoin(\n      employees"),
      false,
      "management must still be able to download a payslip PDF without a hard employee dependency"
    );
  });
});

/* ------------------------------------------------------------------ */
/* 6. Authorization, isolation and idempotency                         */
/* ------------------------------------------------------------------ */

describe("authorization and isolation under the detach design", () => {
  it("the override and the snapshot step are never taken from the form", () => {
    assert.equal(
      permanentDelete.includes("superAdminOverride: canPermanentlyDelete"),
      true
    );
    assert.equal(
      /formData\.get\(\s*["']superAdminOverride["']/.test(permanentDelete),
      false
    );
    assert.equal(
      /field\(formData, "superAdminOverride"\)/.test(permanentDelete),
      false
    );
    const snapshotBlock = permanentDelete.slice(
      permanentDelete.indexOf("snapshotEmployeeRetainedRecords(")
    );
    assert.equal(
      /formData/.test(snapshotBlock.slice(0, 400)),
      false,
      "the snapshot inputs come from the locked database row, never the form"
    );
  });

  it("a deleted employee cannot remove another employee's or tenant's data", () => {
    const deletableHelper = queriesSource.slice(
      queriesSource.indexOf("export async function deleteEmployeeDeletableRecords")
    );
    assert.equal(
      deletableHelper.includes("eq(source.employeeIdColumn, employeeId)"),
      true
    );
    assert.equal(
      deletableHelper.includes("eq(source.organizationIdColumn, organizationId)"),
      true
    );
    // Projects themselves are never touched: only the assignment rows.
    assert.equal(
      queriesSource.includes("export async function deleteEmployeeDeletableRecords"),
      true
    );
    const projectTables = (queriesSource.match(/table: projects,/g) ?? []).length;
    assert.equal(
      projectTables === 0,
      true,
      "no project/organization row is part of any delete or snapshot plan"
    );
  });

  it("re-deleting the same employee resolves as NOT_FOUND (idempotent refusal)", () => {
    assert.equal(
      permanentDelete.indexOf("EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE") <
        permanentDelete.indexOf("db.transaction"),
      true,
      "a second attempt must be refused before any write, exactly like a foreign id"
    );
  });

  it("the document folder is removed only after the commit", () => {
    assert.equal(
      permanentDelete.includes(
        "deleteEmployeeDocumentStorage(\n      scopedOrganizationId,\n      employeeId\n    )"
      ),
      true
    );
    assert.equal(
      permanentDelete.indexOf('result: "SUCCESS"') <
        permanentDelete.indexOf("deleteEmployeeDocumentStorage("),
      true
    );
  });
});

/* ------------------------------------------------------------------ */
/* 7. UI contract                                                      */
/* ------------------------------------------------------------------ */

describe("UI: the operator sees exactly what the transaction will do", () => {
  it("states which employee is being deleted", () => {
    assert.equal(dialogSource.includes("Permanent Delete Employee?"), true);
    assert.equal(dialogSource.includes("{displayName}"), true);
    assert.equal(dialogSource.includes("{employee.employeeNumber}"), true);
  });

  it("separates records that will be deleted from those retained", () => {
    assert.equal(dialogSource.includes("(will be deleted)"), true);
    assert.equal(dialogSource.includes("(retained for legal and audit purposes)"), true);
    assert.equal(dialogSource.includes("Retained records (never deleted)"), true);
    assert.equal(
      dialogSource.includes("(retained — their manager link will be cleared)"),
      true
    );
  });

  it("shows the final result of the transaction and keeps the redirect", () => {
    assert.equal(
      dialogSource.includes('data-testid="permanent-delete-final-result"'),
      true
    );
    assert.equal(dialogSource.includes("Final result of the transaction"), true);
    assert.equal(dialogSource.includes("(retained with its historical identity)"), true);
    assert.equal(dialogSource.includes("router.replace(redirectTo)"), true);
    assert.equal(dialogSource.includes("router.refresh();"), true);
    assert.equal(dialogSource.includes("notifier.success("), true);
  });

  it("does not disable the destructive button merely because protected records exist", () => {
    const copy = dialogSource.replace(/\s+/g, " ");
    assert.equal(
      copy.includes(
        "const canSubmitDelete = confirmationMatches && acknowledged && reasonValid && dependencyCheck.status === \"ready\" && !legalHoldActive && blockingDeletionRequestCount === 0;"
      ),
      true,
      "the typed number, acknowledgement, valid reason, arrived report and no live control-plane block gate the button"
    );
    assert.equal(
      copy.includes("hasRetainedRecords &&"),
      false,
      "retained records must not enter the submit gate"
    );
  });
});

/* ------------------------------------------------------------------ */
/* 8. Migration 0022 lifecycle: repeatable before AND after deletion   */
/* ------------------------------------------------------------------ */

describe("migration 0022: lifecycle-independent verification and repeatability", () => {
  const checkCondition =
    "employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL";
  const verificationBlock = migrationSource.slice(
    migrationSource.indexOf("Verification (lifecycle-independent")
  );

  it("no longer fails a re-run merely because retained rows were detached", () => {
    assert.notEqual(
      migrationSource.indexOf("Verification (lifecycle-independent"),
      -1,
      "the migration must carry the lifecycle-independent verification block"
    );
    // The removed assertion counted attendance rows with employee_id IS NULL
    // and raised. That is a legitimate post-deletion state, so it must be gone.
    assert.equal(
      migrationSource.includes("detached rows before any deletion"),
      false,
      "the unconditional 'zero detached rows' assertion must not return"
    );
    assert.equal(
      /SELECT count\(\*\) INTO bad FROM attendance_records WHERE employee_id IS NULL;/.test(
        migrationSource
      ),
      false,
      "no statement may assert that no retained row has been detached"
    );
    // The retained-identity CHECK is the invariant, not 'zero detachments'.
    assert.equal(migrationSource.includes(checkCondition), true);
  });

  it("verifies backfill completeness without depending on future deletion data", () => {
    assert.equal(
      verificationBlock.includes(
        "employee_id IS NOT NULL AND employee_number_snapshot IS NULL"
      ),
      true,
      "live rows missing a snapshot are the real backfill failure signal"
    );
    assert.equal(verificationBlock.includes("backfill incomplete"), true);
  });

  it("verifies that a detached/retained row is never anonymous", () => {
    assert.equal(
      verificationBlock.includes(
        "employee_id IS NULL AND employee_number_snapshot IS NULL"
      ),
      true
    );
    assert.equal(verificationBlock.includes("anonymous retained rows"), true);
  });

  it("verifies the schema invariants from the catalog, not from row counts", () => {
    assert.equal(verificationBlock.includes("confdeltype::text"), true);
    assert.equal(
      verificationBlock.includes("IS DISTINCT FROM 'n'"),
      true,
      "the employee FK must be verified as ON DELETE SET NULL ('n')"
    );
    assert.equal(
      verificationBlock.includes("employee_id is still NOT NULL"),
      true,
      "employee_id must be verified nullable"
    );
    assert.equal(
      verificationBlock.includes("retained_identity_check constraint is missing"),
      true,
      "the retained-identity CHECK must be verified present"
    );
  });

  it("applies the verification to all six retained tables and all five deleted payroll tables", () => {
    const arrayStart = verificationBlock.indexOf(
      "retained_tables text[] := ARRAY["
    );
    assert.notEqual(arrayStart, -1);
    const arrayBlock = verificationBlock.slice(
      arrayStart,
      verificationBlock.indexOf("];", arrayStart)
    );
    for (const table of RETAINED_TABLES) {
      assert.equal(
        arrayBlock.includes(`'${table}'`),
        true,
        `${table} must be covered by the retained-table verification`
      );
    }
    assert.equal(
      verificationBlock.includes("FOREACH tbl IN ARRAY retained_tables LOOP"),
      true
    );

    const deletedArrayStart = verificationBlock.indexOf(
      "deleted_tables text[] := ARRAY["
    );
    assert.notEqual(deletedArrayStart, -1);
    const deletedArrayBlock = verificationBlock.slice(
      deletedArrayStart,
      verificationBlock.indexOf("];", deletedArrayStart)
    );
    for (const table of DELETED_PAYROLL_TABLES) {
      assert.equal(
        deletedArrayBlock.includes(`'${table}'`),
        true,
        `${table} must be covered by the deleted-payroll-table verification`
      );
    }
    assert.equal(
      verificationBlock.includes("FOREACH tbl IN ARRAY deleted_tables LOOP"),
      true
    );
    // The deleted payroll tables are verified as the deletion backstop:
    // NOT NULL + ON DELETE RESTRICT, with no retention CHECK.
    assert.equal(
      verificationBlock.includes("employee_id must be NOT NULL"),
      true
    );
    assert.equal(
      verificationBlock.includes("employee FK is not ON DELETE RESTRICT"),
      true
    );
    assert.equal(
      verificationBlock.includes(
        "retention-only retained_identity_check must not exist"
      ),
      true
    );
    assert.equal(verificationBlock.includes("RAISE EXCEPTION"), true);
  });

  it("the retained-identity CHECK accepts detached-with-snapshot and rejects anonymous", () => {
    // Mirror the migrated CHECK constraint as a predicate over (employee_id,
    // employee_number_snapshot). This is the guarantee that makes reruns after
    // deletion safe: a legitimate detached row is retained WITH identity.
    const satisfiesRetainedIdentityCheck = (
      employeeId: string | null,
      employeeNumberSnapshot: string | null
    ): boolean => employeeId !== null || employeeNumberSnapshot !== null;

    assert.equal(satisfiesRetainedIdentityCheck("emp-1", null), true, "live row");
    assert.equal(
      satisfiesRetainedIdentityCheck(null, "03233"),
      true,
      "detached retained row"
    );
    assert.equal(satisfiesRetainedIdentityCheck("emp-1", "03233"), true);
    assert.equal(
      satisfiesRetainedIdentityCheck(null, null),
      false,
      "an anonymous retained row is impossible after 0022"
    );
    // And the CHECK text in the migration encodes exactly this predicate.
    assert.equal(migrationSource.includes(`CHECK (${checkCondition})`), true);
  });

  it("is one transaction whose failure path rolls everything back (all-or-nothing)", () => {
    // Exactly one BEGIN/COMMIT, and the verification runs after every ALTER.
    const lastAdd = migrationSource.lastIndexOf("ADD CONSTRAINT");
    const verificationAt = migrationSource.indexOf(
      "Verification (lifecycle-independent"
    );
    assert.equal(
      verificationAt > lastAdd,
      true,
      "verification must run after every schema change"
    );
    assert.equal((migrationSource.match(/^BEGIN;$/gm) ?? []).length, 1);
    assert.equal((migrationSource.match(/^COMMIT;$/gm) ?? []).length, 1);
    assert.equal(
      migrationSource
        .slice(0, migrationSource.indexOf("BEGIN;"))
        .includes("COMMIT;"),
      false
    );
  });

  it("touches no RBAC surface: Superadmin-only authorization stays in the application", () => {
    for (const forbidden of [
      "GRANT",
      "role_permissions",
      "user_roles",
      "CREATE ROLE",
      "INSERT INTO",
    ]) {
      assert.equal(
        migrationSource.includes(forbidden),
        false,
        `migration must not seed or alter RBAC (${forbidden})`
      );
    }
    // The application gate still requires BOTH the permission and SUPERADMIN.
    assert.equal(
      canPermanentlyDeleteEmployees({
        isSuperAdmin: false,
        permissionCodes: [EMPLOYEE_PERMANENT_DELETE_PERMISSION],
      }),
      false,
      "a non-SUPERADMIN holding the code is still refused"
    );
    assert.equal(
      canPermanentlyDeleteEmployees({
        isSuperAdmin: true,
        permissionCodes: [],
      }),
      false,
      "a SUPERADMIN without the code is still refused"
    );
    assert.equal(
      canPermanentlyDeleteEmployees({
        isSuperAdmin: true,
        permissionCodes: [EMPLOYEE_PERMANENT_DELETE_PERMISSION],
      }),
      true
    );
  });
});
