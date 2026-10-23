/**
 * Super Administrator permanent-deletion CONTROL plane — node:test suite.
 *
 * Covers the ADDITIVE controls from `docs/employee-permanent-delete-policy.md`:
 * legal holds, the three-tier classification, dual-control approvals, mandatory
 * reasons, and the hard-disabled executor. Uses synthetic fixtures only.
 *
 * In the repository convention this suite pins what can be verified without a
 * live database: pure decision logic plus source invariants.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DELETION_APPROVALS_BY_TIER,
  DELETION_EXECUTION_ENABLED,
  DELETION_LEGAL_HOLD_MESSAGE,
  DELETION_REASON_MAX_LENGTH,
  DELETION_SELF_APPROVAL_MESSAGE,
  RETENTION_ELIGIBLE_CATEGORIES,
  evaluateDeletionApproval,
  evaluateDeletionEligibility,
  isDeletionExecutionEnabled,
  isRetainedEligibility,
  isValidDeletionReason,
  requiredApprovalsForTier,
  type DeletionApprovalRecord,
} from "../../features/employees/deletion-control-policy.ts";
import {
  EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS,
  employeeDeleteDependencyDisposition,
  resolveEmployeePermanentDeleteScope,
  type EmployeeDeleteDependency,
  type EmployeeDeleteDependencyLabel,
} from "../../features/employees/permanent-delete-policy.ts";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const controlsPolicySource = stripComments(
  readRepoFile("features/employees/deletion-control-policy.ts")
);
const controlsActionsSource = stripComments(
  readRepoFile("features/employees/deletion-control.actions.ts")
);
const permanentPolicySource = stripComments(
  readRepoFile("features/employees/permanent-delete-policy.ts")
);
const permissionsSource = stripComments(readRepoFile("lib/auth/permissions.ts"));
const auditSource = stripComments(readRepoFile("lib/auth/audit.ts"));
const migrationSource = readRepoFile(
  "db/migrations/0021_employee_deletion_controls.sql"
);
const schemaSource = stripComments(
  readRepoFile("db/schema/employee_deletion_controls.ts")
);
const queriesSource = stripComments(
  readRepoFile("features/employees/queries.ts")
);
const actionsSource = stripComments(
  readRepoFile("features/employees/actions.ts")
);
const journalSource = readRepoFile("db/migrations/meta/_journal.json");

/**
 * Body of one function in the control actions module, bounded by the next
 * top-level declaration, so an assertion can never leak into a neighbouring
 * action (same helper contract as the permanent-delete suite).
 */
function actionBlock(source: string, name: string): string {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `deletion-control.actions.ts must define ${name}`);
  const rest = source.slice(start);
  const boundaries = [
    rest.indexOf("\nfunction ", marker.length),
    rest.indexOf("\nexport ", marker.length),
  ].filter((index) => index !== -1);
  const next = boundaries.length > 0 ? Math.min(...boundaries) : -1;
  return next === -1 ? rest : rest.slice(0, next);
}

const placeHoldAction = actionBlock(
  controlsActionsSource,
  "placeEmployeeLegalHoldAction"
);
const releaseHoldAction = actionBlock(
  controlsActionsSource,
  "releaseEmployeeLegalHoldAction"
);
const requestAction = actionBlock(
  controlsActionsSource,
  "requestEmployeeDeletionAction"
);
const decideAction = actionBlock(
  controlsActionsSource,
  "decideEmployeeDeletionRequestAction"
);
const executeAction = actionBlock(
  controlsActionsSource,
  "executeApprovedEmployeeDeletionAction"
);

/** Zero dependencies for every category. */
const NO_DEPENDENCIES: EmployeeDeleteDependency[] =
  EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS.map((label) => ({
    label,
    count: 0,
    disposition: employeeDeleteDependencyDisposition(label),
  }));

function dependencies(
  overrides: Partial<Record<EmployeeDeleteDependencyLabel, number>>
): EmployeeDeleteDependency[] {
  return NO_DEPENDENCIES.map((dependency) => ({
    ...dependency,
    count: overrides[dependency.label] ?? 0,
  }));
}

describe("deletion tier classification", () => {
  it("no dependents and no legal hold is the direct tier", () => {
    const eligibility = evaluateDeletionEligibility({
      legalHoldActive: false,
      dependencies: NO_DEPENDENCIES,
    });
    assert.equal(eligibility.tier, "direct");
    if (eligibility.tier === "direct") {
      assert.deepEqual(eligibility.deletableDependencies, []);
    }
  });

  it("deletable-only dependents stay in the direct tier", () => {
    const eligibility = evaluateDeletionEligibility({
      legalHoldActive: false,
      dependencies: dependencies({ Documents: 2, "Face ID": 1 }),
    });
    assert.equal(eligibility.tier, "direct");
    if (eligibility.tier === "direct") {
      assert.equal(eligibility.deletableDependencies.length, 2);
    }
  });

  it("protected history is retained by default (empty retention schedule)", () => {
    assert.equal(RETENTION_ELIGIBLE_CATEGORIES.length, 0);
    const eligibility = evaluateDeletionEligibility({
      legalHoldActive: false,
      dependencies: dependencies({ Attendance: 10, "Employment history": 3 }),
      employeeNumber: "03233",
    });
    assert.equal(eligibility.tier, "retained");
    if (isRetainedEligibility(eligibility)) {
      assert.equal(eligibility.code, "RETENTION_BOUND");
      assert.equal(eligibility.categories.length, 2);
      assert.match(eligibility.message, /03233/);
    }
  });

  it("an active legal hold is an absolute refusal", () => {
    const eligibility = evaluateDeletionEligibility({
      legalHoldActive: true,
      dependencies: NO_DEPENDENCIES,
      employeeNumber: "E-1",
    });
    assert.equal(eligibility.tier, "retained");
    if (isRetainedEligibility(eligibility)) {
      assert.equal(eligibility.code, "LEGAL_HOLD");
      assert.match(eligibility.message, /E-1/);
      assert.match(eligibility.message, /legal hold/i);
    }
  });

  it("a legal hold dominates a retention-eligible schedule", () => {
    const eligibility = evaluateDeletionEligibility({
      legalHoldActive: true,
      dependencies: dependencies({ Attendance: 1 }),
      retentionEligibleCategories: ["Attendance"],
    });
    assert.equal(eligibility.tier, "retained");
    if (isRetainedEligibility(eligibility)) {
      assert.equal(eligibility.code, "LEGAL_HOLD");
    }
  });

  it("retention-eligible protected records require special approval", () => {
    const eligibility = evaluateDeletionEligibility({
      legalHoldActive: false,
      dependencies: dependencies({ Attendance: 2, Documents: 1 }),
      retentionEligibleCategories: ["Attendance"],
    });
    assert.equal(eligibility.tier, "special_approval");
    if (eligibility.tier === "special_approval") {
      assert.equal(eligibility.requiredApprovals, 2);
      assert.deepEqual(
        eligibility.approvalCategories.map((dependency) => dependency.label),
        ["Attendance"]
      );
      assert.deepEqual(
        eligibility.deletableDependencies.map((dependency) => dependency.label),
        ["Documents"]
      );
    }
  });

  it("a non-eligible protected category dominates over an eligible one", () => {
    const eligibility = evaluateDeletionEligibility({
      legalHoldActive: false,
      dependencies: dependencies({ Attendance: 2, "Employment history": 1 }),
      retentionEligibleCategories: ["Attendance"],
    });
    assert.equal(eligibility.tier, "retained");
    if (isRetainedEligibility(eligibility)) {
      assert.equal(eligibility.code, "RETENTION_BOUND");
      assert.deepEqual(
        eligibility.categories.map((dependency) => dependency.label),
        ["Employment history"]
      );
    }
  });

  it("exposes the legal-hold refusal message constant", () => {
    assert.equal(typeof DELETION_LEGAL_HOLD_MESSAGE, "string");
    assert.equal(DELETION_LEGAL_HOLD_MESSAGE.length > 0, true);
  });
});

describe("mandatory deletion reason", () => {
  it("rejects missing, short, non-string and over-long reasons", () => {
    assert.equal(isValidDeletionReason(undefined), false);
    assert.equal(isValidDeletionReason(null), false);
    assert.equal(isValidDeletionReason(42), false);
    assert.equal(isValidDeletionReason("too short"), false);
    assert.equal(isValidDeletionReason("   "), false);
    assert.equal(
      isValidDeletionReason("x".repeat(DELETION_REASON_MAX_LENGTH + 1)),
      false
    );
  });

  it("accepts a non-trivial reason and trims", () => {
    assert.equal(
      isValidDeletionReason("  Duplicate test record approved for removal  "),
      true
    );
  });
});

describe("required approvals per tier", () => {
  it("direct requires one, special approval two, retained none", () => {
    assert.equal(requiredApprovalsForTier("direct"), 1);
    assert.equal(requiredApprovalsForTier("special_approval"), 2);
    assert.equal(requiredApprovalsForTier("retained"), 0);
    assert.deepEqual(DELETION_APPROVALS_BY_TIER, {
      direct: 1,
      special_approval: 2,
      retained: 0,
    });
  });
});

describe("dual-control approvals", () => {
  const requesterUserId = "super-a";
  const otherApprover = "super-b";
  const thirdApprover = "super-c";

  function decision(
    approverUserId: string,
    value: DeletionApprovalRecord["decision"]
  ): DeletionApprovalRecord {
    return { approverUserId, decision: value };
  }

  it("stays pending until the required number of distinct approvals arrive", () => {
    const outcome = evaluateDeletionApproval({
      requesterUserId,
      requiredApprovals: 2,
      approvals: [decision(otherApprover, "approved")],
    });
    assert.equal(outcome.status, "pending");
    if (outcome.status === "pending") {
      assert.equal(outcome.approvalsReceived, 1);
      assert.equal(outcome.approvalsRequired, 2);
    }
  });

  it("approves when distinct approvers meet the requirement", () => {
    const outcome = evaluateDeletionApproval({
      requesterUserId,
      requiredApprovals: 2,
      approvals: [
        decision(otherApprover, "approved"),
        decision(thirdApprover, "approved"),
      ],
    });
    assert.equal(outcome.status, "approved");
    if (outcome.status === "approved") {
      assert.equal(outcome.approverUserIds.length, 2);
    }
  });

  it("refuses self-approval", () => {
    const outcome = evaluateDeletionApproval({
      requesterUserId,
      requiredApprovals: 1,
      approvals: [decision(requesterUserId, "approved")],
    });
    assert.equal(outcome.status, "invalid");
    if (outcome.status === "invalid") {
      assert.equal(outcome.code, "SELF_APPROVAL_FORBIDDEN");
      assert.equal(outcome.message, DELETION_SELF_APPROVAL_MESSAGE);
    }
  });

  it("refuses a duplicated approver in one batch", () => {
    const outcome = evaluateDeletionApproval({
      requesterUserId,
      requiredApprovals: 2,
      approvals: [
        decision(otherApprover, "approved"),
        decision(otherApprover, "approved"),
      ],
    });
    assert.equal(outcome.status, "invalid");
    if (outcome.status === "invalid") {
      assert.equal(outcome.code, "DUPLICATE_APPROVER");
    }
  });

  it("a single rejection rejects even when another approved", () => {
    const outcome = evaluateDeletionApproval({
      requesterUserId,
      requiredApprovals: 2,
      approvals: [
        decision(otherApprover, "approved"),
        decision(thirdApprover, "rejected"),
      ],
    });
    assert.equal(outcome.status, "rejected");
    if (outcome.status === "rejected") {
      assert.equal(outcome.rejectedByUserId, thirdApprover);
    }
  });

  it("a non-positive requirement is never approvable", () => {
    const outcome = evaluateDeletionApproval({
      requesterUserId,
      requiredApprovals: 0,
      approvals: [decision(otherApprover, "approved")],
    });
    assert.equal(outcome.status, "invalid");
    if (outcome.status === "invalid") {
      assert.equal(outcome.code, "INVALID_REQUIREMENT");
    }
  });
});

describe("executor is hard-disabled", () => {
  it("the policy constant and accessor report disabled", () => {
    assert.equal(DELETION_EXECUTION_ENABLED, false);
    assert.equal(isDeletionExecutionEnabled(), false);
    assert.match(controlsPolicySource, /DELETION_EXECUTION_ENABLED\s*=\s*false/);
  });

  it("the executor action contains NO DELETE statement", () => {
    assert.equal(/\.delete\s*\(/.test(controlsActionsSource), false);
    assert.equal(/DELETE\s+FROM/i.test(controlsActionsSource), false);
    assert.equal(
      controlsActionsSource.includes("deleteEmployeeDeletableRecords("),
      false
    );
  });

  it("the executor returns EXECUTION_DISABLED and audits the block", () => {
    assert.equal(
      controlsActionsSource.includes("isDeletionExecutionEnabled()"),
      true
    );
    assert.equal(controlsActionsSource.includes("EXECUTION_DISABLED"), true);
    assert.equal(
      controlsActionsSource.includes("employee.deletion.execution_blocked"),
      true
    );
    assert.equal(
      auditSource.includes("employee.deletion.execution_blocked"),
      true
    );
  });
});

describe("server-side authorization and scope", () => {
  it("re-authorizes from the database-backed RBAC, not the form", () => {
    assert.equal(controlsActionsSource.includes("getUserAuthorization("), true);
    assert.equal(controlsActionsSource.includes("isSuperAdmin"), true);
    assert.equal(controlsActionsSource.includes("requireUser()"), true);
    // No role/organization/authorization value is ever read from the form.
    assert.equal(
      /formData\.get\(\s*["'](role|organizationId|isSuperAdmin|permissionCodes)["']\s*\)/.test(
        controlsActionsSource
      ),
      false
    );
  });

  it("resolves the owning organization from the database via the shared scope helper", () => {
    assert.equal(
      controlsActionsSource.includes("resolveEmployeePermanentDeleteScope("),
      true
    );
    assert.equal(controlsActionsSource.includes("getEmployeeById("), true);
  });

  it("requires SUPERADMIN plus the explicit system-only permission codes", () => {
    assert.equal(
      controlsActionsSource.includes("PERMISSIONS.EMPLOYEES_LEGAL_HOLD"),
      true
    );
    assert.equal(
      controlsActionsSource.includes("PERMISSIONS.EMPLOYEES_DELETION_APPROVE"),
      true
    );
    assert.equal(
      controlsActionsSource.includes("PERMISSIONS.EMPLOYEES_PERMANENT_DELETE"),
      true
    );
  });
});

describe("audit trail", () => {
  it("records hold, request, decision and blocked-execution events", () => {
    for (const action of [
      "employee.legal_hold.placed",
      "employee.legal_hold.released",
      "employee.deletion.requested",
      "employee.deletion.approved",
      "employee.deletion.rejected",
      "employee.deletion.execution_blocked",
    ]) {
      assert.equal(auditSource.includes(action), true, `${action} in audit.ts`);
    }
  });

  it("captures actor, reason and result in the control audit metadata", () => {
    assert.equal(controlsActionsSource.includes("actorUserId"), true);
    assert.equal(controlsActionsSource.includes("actorRole"), true);
    assert.equal(controlsActionsSource.includes("reason"), true);
    assert.equal(controlsActionsSource.includes("result"), true);
  });
});

describe("migration and schema integrity", () => {
  it("is additive only (no DROP/ALTER of existing objects)", () => {
    assert.equal(/DROP\s+TABLE/i.test(migrationSource), false);
    assert.equal(/ALTER\s+TABLE/i.test(migrationSource), false);
  });

  it("detaches released/terminal control rows but keeps live control state blocking", () => {
    for (const table of [
      "employee_legal_holds",
      "employee_deletion_requests",
      "employee_deletion_approvals",
    ]) {
      assert.equal(migrationSource.includes(table), true, `${table} in migration`);
      assert.equal(schemaSource.includes(table), true, `${table} in schema`);
    }
    // Released holds and terminal requests must survive the employee row as
    // history, so their employee references detach instead of RESTRICTing.
    assert.equal(
      (migrationSource.match(
        /employee_id uuid REFERENCES employees\(id\) ON DELETE SET NULL/g
      ) ?? []).length,
      2,
      "legal holds and deletion requests detach their employee reference"
    );
    assert.equal(
      /employee_id uuid NOT NULL REFERENCES employees\(id\) ON DELETE RESTRICT/.test(
        migrationSource
      ),
      false,
      "no control-plane employee reference may pin a terminal row forever"
    );
    // The database still refuses to detach LIVE control state.
    assert.equal(
      migrationSource.includes(
        "employee_legal_holds_active_requires_employee"
      ),
      true
    );
    assert.match(
      migrationSource,
      /CHECK \(NOT active OR employee_id IS NOT NULL\)/
    );
    assert.equal(
      migrationSource.includes(
        "employee_deletion_requests_active_requires_employee"
      ),
      true
    );
    assert.match(
      migrationSource,
      /OR status IN \('rejected', 'cancelled', 'executed'\)/
    );
    // Identity survives detachment.
    assert.equal(
      migrationSource.includes("employee_number_snapshot text NOT NULL"),
      true
    );
    assert.equal(
      migrationSource.includes("employee_name_snapshot text NOT NULL"),
      true
    );
  });

  it("wires the live delete path to the control plane with precise refusals", () => {
    assert.equal(
      queriesSource.includes("getEmployeeDeletionControlState"),
      true
    );
    assert.equal(
      queriesSource.includes("employeeLegalHolds"),
      true
    );
    assert.equal(
      queriesSource.includes("employeeDeletionRequests"),
      true
    );
    assert.match(
      queriesSource,
      /inArray\(employeeDeletionRequests\.status, \["pending", "approved"\]\)/
    );
    assert.equal(
      actionsSource.includes("getEmployeeDeletionControlState"),
      true
    );
    assert.equal(actionsSource.includes('stateCode: "LEGAL_HOLD"'), true);
    assert.equal(
      actionsSource.includes('stateCode: "ACTIVE_DELETION_REQUEST"'),
      true
    );
    assert.equal(
      actionsSource.includes("employee_legal_holds_active_requires_employee"),
      true
    );
    assert.equal(
      actionsSource.includes(
        "employee_deletion_requests_active_requires_employee"
      ),
      true
    );
    // The control pre-flight must run inside the deletion transaction BEFORE
    // snapshots/removals.
    const controlCheck = actionsSource.indexOf(
      "getEmployeeDeletionControlState(\n        tx,"
    );
    const snapshotStep = actionsSource.indexOf(
      "snapshotEmployeeRetainedRecords(\n        tx,"
    );
    assert.notEqual(controlCheck, -1);
    assert.notEqual(snapshotStep, -1);
    assert.equal(controlCheck < snapshotStep, true);
  });

  it("is journaled with a fresh when after the approved lineage repair", () => {
    // docs/drizzle-lineage-reconciliation-execution-record-20261023.md
    // journalled 0021 (with 0019/0020/0022) using fresh `when` values so the
    // drizzle migrator applies them. A stale or tied `when` is silently
    // skipped forever (drill-proven), so the contract pins the exact tag,
    // its file presence, and when > the pre-repair ledger watermark
    // 1790661254287 (0018_employee_custom_tabs, ledger id 18).
    const journal = JSON.parse(journalSource) as {
      entries: { idx: number; when: number; tag: string }[];
    };
    const entry = journal.entries.find(
      (candidate) => candidate.tag === "0021_employee_deletion_controls"
    );
    assert.notEqual(entry, undefined, "journal must contain 0021");
    assert.equal(
      (entry?.when ?? 0) > 1790661254287,
      true,
      "0021 must carry a fresh when > 1790661254287 (stale/tied when is silently skipped by the migrator)"
    );
  });
});

describe("permissions catalog", () => {
  it("declares the two new system-only codes", () => {
    assert.equal(permissionsSource.includes("employees.legal_hold"), true);
    assert.equal(
      permissionsSource.includes("employees.deletion_approve"),
      true
    );
    assert.equal(permissionsSource.includes("EMPLOYEES_LEGAL_HOLD"), true);
    assert.equal(permissionsSource.includes("EMPLOYEES_DELETION_APPROVE"), true);
    assert.match(
      permissionsSource,
      /SYSTEM_ONLY_PERMISSION_CODES[\s\S]*?EMPLOYEES_LEGAL_HOLD[\s\S]*?EMPLOYEES_DELETION_APPROVE[\s\S]*?\];/
    );
  });

  it("does not weaken the existing permanent-delete protection", () => {
    assert.equal(
      permanentPolicySource.includes("employees.permanent_delete"),
      true
    );
    assert.equal(
      /EMPLOYEE_PROTECTED_DEPENDENCY_LABELS = \[/.test(permanentPolicySource),
      true
    );
  });
});

describe("tenant isolation (cross-organization scope)", () => {
  const owningOrganizationId = "org-employee-owner";
  const sessionOrganizationId = "org-actor-session";

  it("a non-SUPERADMIN can never reach the control plane, regardless of arguments", () => {
    const scope = resolveEmployeePermanentDeleteScope({
      employeeOrganizationId: owningOrganizationId,
      userOrganizationId: sessionOrganizationId,
      isSuperAdmin: false,
      requestedOrganizationId: owningOrganizationId,
    });
    assert.equal(scope, null);
  });

  it("refuses when the session or the record has no organization", () => {
    assert.equal(
      resolveEmployeePermanentDeleteScope({
        employeeOrganizationId: owningOrganizationId,
        userOrganizationId: null,
        isSuperAdmin: true,
      }),
      null
    );
    assert.equal(
      resolveEmployeePermanentDeleteScope({
        employeeOrganizationId: "",
        userOrganizationId: sessionOrganizationId,
        isSuperAdmin: true,
      }),
      null
    );
  });

  it("a SUPERADMIN may operate on another tenant's record, scoped to the OWNING organization", () => {
    const scope = resolveEmployeePermanentDeleteScope({
      employeeOrganizationId: owningOrganizationId,
      userOrganizationId: sessionOrganizationId,
      isSuperAdmin: true,
    });
    assert.notEqual(scope, null);
    assert.equal(scope?.organizationId, owningOrganizationId);
    assert.equal(scope?.viewingOtherOrganization, true);
  });

  it("a forged or inconsistent organization context is refused, never followed", () => {
    const scope = resolveEmployeePermanentDeleteScope({
      employeeOrganizationId: owningOrganizationId,
      userOrganizationId: sessionOrganizationId,
      isSuperAdmin: true,
      requestedOrganizationId: "org-attacker-claimed",
    });
    assert.equal(scope, null);
  });

  it("a matching organization context is accepted as a consistency assertion only", () => {
    const scope = resolveEmployeePermanentDeleteScope({
      employeeOrganizationId: owningOrganizationId,
      userOrganizationId: sessionOrganizationId,
      isSuperAdmin: true,
      requestedOrganizationId: owningOrganizationId,
    });
    assert.equal(scope?.organizationId, owningOrganizationId);
  });
});

describe("transactional integrity and rollback", () => {
  it("the deletion request runs in exactly ONE transaction (atomic snapshot + insert)", () => {
    assert.equal((requestAction.match(/db\.transaction\(/g) ?? []).length, 1);
    // The confirmation is re-checked INSIDE the transaction, on the locked row.
    assert.equal(
      requestAction.includes(
        "matchesEmployeeNumberConfirmation(current.employeeNumber, confirmation)"
      ),
      true
    );
  });

  it("the dual-control decision runs in exactly ONE transaction (locked request + insert + update)", () => {
    assert.equal((decideAction.match(/db\.transaction\(/g) ?? []).length, 1);
    assert.equal(decideAction.includes(".for(\"update\")"), true);
  });

  it("the hold release locks the row inside ONE transaction (no double-release race)", () => {
    assert.equal((releaseHoldAction.match(/db\.transaction\(/g) ?? []).length, 1);
    assert.equal(releaseHoldAction.includes(".for(\"update\")"), true);
  });

  it("the executor performs NO business write — it is a read-and-refuse check", () => {
    assert.equal((executeAction.match(/db\.transaction\(/g) ?? []).length, 0);
    assert.equal(/\.insert\(/.test(executeAction), false);
    assert.equal(/\.update\(/.test(executeAction), false);
  });
});

describe("audit refusal vocabulary (SUCCESS / DENIED / FAILED parity)", () => {
  it("every control operation records all three outcomes", () => {
    assert.equal(controlsActionsSource.includes('result: "SUCCESS"'), true);
    assert.equal(controlsActionsSource.includes('result: "DENIED"'), true);
    assert.equal(controlsActionsSource.includes('result: "FAILED"'), true);
  });

  it("every refusal carries a machine-readable reason", () => {
    const expectedReasons = [
      "PERMISSION_DENIED",
      "NOT_FOUND",
      "REASON_REQUIRED",
      "HOLD_EXISTS",
      "CONFIRMATION_MISMATCH",
      "LEGAL_HOLD",
      "RETENTION_BOUND",
      "SELF_APPROVAL_FORBIDDEN",
      "DUPLICATE_APPROVER",
      "NOT_PENDING",
      "NOT_APPROVED",
      "EXECUTION_DISABLED",
      "UNEXPECTED_ERROR",
    ];
    for (const reason of expectedReasons) {
      assert.equal(
        controlsActionsSource.includes(`"${reason}"`),
        true,
        `reason "${reason}" must be auditable in the control actions`
      );
    }
  });

  it("the refusal precedes the audit so the actor identity is always recorded", () => {
    // resolveControlContext keeps the identity even when unauthorized, so a
    // FORBIDDEN attempt is auditable with the real actor — same as the live
    // permanent-delete action.
    assert.equal(
      /authorized: boolean/.test(controlsActionsSource),
      true
    );
    assert.equal(
      controlsActionsSource.includes(
        "if (!context.authorized || !context.sessionOrganizationId)"
      ),
      true
    );
  });
});

describe("single active legal hold", () => {
  it("the database enforces at most one active hold per employee", () => {
    assert.equal(
      schemaSource.includes("employee_legal_holds_active_hold_unique"),
      true
    );
    assert.match(migrationSource, /employee_legal_holds_active_hold_unique/);
    assert.match(migrationSource, /WHERE active/);
  });

  it("a concurrent duplicate placement fails closed with HOLD_EXISTS", () => {
    assert.equal(controlsActionsSource.includes("isUniqueViolation("), true);
    assert.equal(controlsActionsSource.includes("HOLD_EXISTS"), true);
    assert.match(placeHoldAction, /code: "HOLD_EXISTS"/);
  });
});
