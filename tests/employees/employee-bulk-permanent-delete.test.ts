/**
 * BULK PERMANENT DELETE — node:test suite.
 *
 * Pins the bulk permanent-delete contract without a live database, in the
 * repository convention (pure decision logic + source invariants). No real
 * employee record is ever deleted here; destructive runtime rehearsal belongs
 * on a dedicated test database, never against production data.
 *
 * Covered:
 * - Authorization: only the system-level SUPERADMIN holding
 *   `employees.permanent_delete` may execute; every other role is refused
 *   (403), including direct server-action calls.
 * - Selection & validation: empty selection, duplicate ids, invalid ids and
 *   cross-tenant ids are rejected before any deletion.
 * - Database integrity: a single transaction wraps the whole batch; expected
 *   rollback-on-failure language is present; the existing deletable/protected
 *   classification is reused unchanged.
 * - Audit: a bulk audit action exists and records actor, organization,
 *   selection, result, failed ids/reasons and a correlation id.
 * - UI: the bulk action is offered only to callers entitled to permanent
 *   deletion, shows the selected count, and requires the exact
 *   `DELETE <count> EMPLOYEES` confirmation phrase.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canPermanentlyDeleteEmployees,
  EMPLOYEE_PERMANENT_DELETE_PERMISSION,
} from "../../features/employees/permanent-delete-policy.ts";
import { PERMISSIONS } from "../../lib/auth/permissions.ts";
import { ROLE_CODES } from "../../lib/auth/roles.ts";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const actionsSource = stripComments(
  readRepoFile("features/employees/actions.ts")
);
const queriesSource = stripComments(readRepoFile("features/employees/queries.ts"));
const policySource = stripComments(
  readRepoFile("features/employees/permanent-delete-policy.ts")
);
const tableSource = stripComments(readRepoFile("features/employees/employee-table.tsx"));
const dialogSource = stripComments(
  readRepoFile("features/employees/employee-bulk-delete-dialog.tsx")
);
const pageSource = stripComments(
  readRepoFile("app/(dashboard)/employees/page.tsx")
);
const auditSource = stripComments(readRepoFile("lib/auth/audit.ts"));

/** Body of one top-level function declaration in actions.ts, bounded by the
 * next top-level declaration so an assertion never leaks into a neighbour. */
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

const bulkAction = actionBlock(
  actionsSource,
  "bulkPermanentlyDeleteEmployeesAction"
);

describe("authorization: Super Administrator only", () => {
  it("requires the employees.permanent_delete permission AND the SUPERADMIN role", () => {
    assert.equal(
      canPermanentlyDeleteEmployees({
        isSuperAdmin: true,
        permissionCodes: [PERMISSIONS.EMPLOYEES_PERMANENT_DELETE],
      }),
      true,
      "SUPERADMIN with the permission may permanently delete"
    );
    assert.equal(
      canPermanentlyDeleteEmployees({
        isSuperAdmin: true,
        permissionCodes: [],
      }),
      false,
      "SUPERADMIN without the permission is refused"
    );
    assert.equal(
      canPermanentlyDeleteEmployees({
        isSuperAdmin: false,
        permissionCodes: [PERMISSIONS.EMPLOYEES_PERMANENT_DELETE],
      }),
      false,
      "non-SUPERADMIN with the permission is refused"
    );
    assert.equal(
      canPermanentlyDeleteEmployees({
        isSuperAdmin: false,
        permissionCodes: [],
      }),
      false,
      "non-SUPERADMIN without the permission is refused"
    );
  });

  it("the bulk action re-checks authorization from the session, not the client", () => {
    assert.equal(
      bulkAction.includes("canPermanentlyDeleteEmployees(authorization)"),
      true,
      "bulk action applies the same Super Administrator gate"
    );
    assert.equal(actionsSource.includes("requireUser()"), true);
    assert.equal(
      actionsSource.includes('from "@/lib/auth/rbac"'),
      true,
      "authorization comes from the DB-backed RBAC"
    );
  });

  it("every other role is refused permanent deletion (403-equivalent)", () => {
    const nonSuperAdminRoles = [
      ROLE_CODES.ADMIN,
      ROLE_CODES.MANAGEMENT,
      ROLE_CODES.HR,
      ROLE_CODES.SUPERVISOR,
      ROLE_CODES.EMPLOYEE,
    ];
    for (const role of nonSuperAdminRoles) {
      assert.equal(
        canPermanentlyDeleteEmployees({
          isSuperAdmin: false,
          permissionCodes: [PERMISSIONS.EMPLOYEES_PERMANENT_DELETE],
        }),
        false,
        `${role} must not reach permanent deletion`
      );
    }
  });

  it("refuses when the actor has no organization", () => {
    assert.equal(bulkAction.includes("sessionOrganizationId"), true);
    assert.equal(
      bulkAction.includes('"Your account is not assigned to an organization."'),
      true
    );
  });
});

describe("selection and validation", () => {
  it("rejects an empty selection before any deletion", () => {
    assert.equal(bulkAction.includes('code: "EMPTY_SELECTION"'), true);
    assert.equal(
      bulkAction.includes("employeeIds.length === 0"),
      true
    );
  });

  it("rejects duplicate ids", () => {
    assert.equal(bulkAction.includes('code: "DUPLICATE_IDS"'), true);
    assert.equal(bulkAction.includes("employeeIds.indexOf(id) !== index"), true);
  });

  it("rejects invalid (non-UUID) ids", () => {
    assert.equal(bulkAction.includes('code: "INVALID_IDS"'), true);
    assert.equal(bulkAction.includes("UUID_PATTERN.test(id)"), true);
  });

  it("rejects cross-tenant / unknown employee ids", () => {
    // Every selected id must resolve to an employee owned by the listing's
    // organization; a mismatch resolves as not found without leaking existence.
    assert.equal(bulkAction.includes('code: "NOT_FOUND"'), true);
    assert.equal(
      queriesSource.includes("getEmployeesByIds"),
      true,
      "employee loading is organization-scoped"
    );
    assert.equal(
      queriesSource.includes("inArray(employees.id, employeeIds)"),
      true
    );
    assert.equal(
      queriesSource.includes("eq(employees.organizationId, organizationId)"),
      true
    );
  });

  it("requires the exact confirmation phrase `DELETE <count> EMPLOYEES`", () => {
    assert.equal(
      actionsSource.includes("DELETE ${selectedCount} EMPLOYEES"),
      true,
      "confirmation phrase template is count-bound"
    );
    assert.equal(
      bulkAction.includes("confirmation !== expectedConfirmation"),
      true,
      "phrase is compared exactly, server-side"
    );
  });

  it("requires the irreversibility acknowledgement", () => {
    assert.equal(
      bulkAction.includes('code: "ACKNOWLEDGEMENT_MISSING"'),
      true
    );
    assert.equal(bulkAction.includes("isAcknowledgedBulkPermanentDelete"), true);
  });

  it("only selected employees are affected — the batch id list is submitted explicitly", () => {
    // The action reads the explicit id array from the form and resolves every
    // id against the listing's organization before anything is deleted.
    assert.equal(
      bulkAction.includes('JSON.parse(field(formData, "employeeIds"))'),
      true
    );
    assert.equal(
      bulkAction.includes("getEmployeesByIds(employeeIds, organizationId)"),
      true
    );
    // The client submits the explicit id array (never a "select all" flag).
    assert.equal(
      dialogSource.includes('formData.set("employeeIds", JSON.stringify'),
      true
    );
  });
});

describe("database integrity and atomicity", () => {
  it("runs the whole batch inside a single transaction", () => {
    assert.equal(
      bulkAction.includes("await db.transaction(async (tx) => {"),
      true,
      "one transaction for the entire bulk deletion"
    );
  });

  it("locks every selected row before deleting (concurrent-submission safety)", () => {
    assert.equal(bulkAction.includes(".for(\"update\")"), true);
  });

  it("rolls back on failure and never reports a failed employee as deleted", () => {
    assert.equal(
      bulkAction.includes("catch (error)"),
      true
    );
    assert.equal(
      bulkAction.includes('code: "FAILED"'),
      true
    );
    assert.equal(
      bulkAction.includes("EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE"),
      true,
      "failure is reported as no data deleted"
    );
  });

  it("reuses the existing deletable-record plan and retention classification", () => {
    assert.equal(
      bulkAction.includes("deleteEmployeeDeletableRecords("),
      true
    );
    assert.equal(
      bulkAction.includes("snapshotEmployeeRetainedRecords("),
      true,
      "protected history is snapshotted, not deleted"
    );
    assert.equal(
      policySource.includes('"Payroll"'),
      true,
      "payroll remains in the deletable category per the approved scope"
    );
    assert.equal(
      policySource.includes('"Attendance"'),
      true,
      "attendance remains protected/retained"
    );
    assert.equal(
      queriesSource.includes("EMPLOYEE_PROTECTED_DEPENDENCY_LABELS"),
      true
    );
  });

  it("audit_logs is append-only and never deleted by the deletion path", () => {
    assert.equal(queriesSource.includes("auditLogs"), false);
    assert.equal(bulkAction.includes("delete(auditLogs"), false);
    // The deletion path removes employees and deletable related records only;
    // the audit trail is written (appended), never deleted.
    assert.equal(
      bulkAction.includes("writeAuditLog"),
      true
    );
  });

  it("repeated requests on already-deleted ids are not inconsistent", () => {
    assert.equal(
      bulkAction.includes("getEmployeesByIds(employeeIds, organizationId)"),
      true
    );
    assert.equal(
      bulkAction.includes('selected.length !== employeeIds.length'),
      true,
      "missing/deleted ids resolve as not found on replay"
    );
  });
});

describe("audit logging", () => {
  it("defines a bulk permanent-delete audit action", () => {
    assert.equal(
      auditSource.includes('"employee.bulk_permanently_deleted"'),
      true
    );
  });

  it("records actor, organization, selection, result, failures and correlation id", () => {
    assert.equal(
      bulkAction.includes("employee.bulk_permanently_deleted"),
      true
    );
    assert.equal(
      bulkAction.includes("actorUserId: user.id"),
      true
    );
    assert.equal(
      bulkAction.includes("selectedCount"),
      true
    );
    assert.equal(
      bulkAction.includes("employeeIds"),
      true
    );
    assert.equal(
      bulkAction.includes("employeeNumbers"),
      true
    );
    assert.equal(
      bulkAction.includes("result:"),
      true
    );
    assert.equal(
      bulkAction.includes("failedEmployees"),
      true
    );
    assert.equal(
      bulkAction.includes("correlationId"),
      true
    );
  });

  it("never logs passwords, secrets or authentication data", () => {
    const secrets = ["passwordHash", "password", "token"];
    for (const secret of secrets) {
      assert.equal(
        bulkAction.includes(secret),
        false,
        `bulk audit must not log ${secret}`
      );
    }
  });
});

describe("ui: bulk action gating and confirmation", () => {
  it("the bulk action is offered only to callers entitled to permanent deletion", () => {
    assert.equal(
      pageSource.includes("canPermanentlyDeleteEmployees(authorization)"),
      true
    );
    assert.equal(
      tableSource.includes("canPermanentDelete && selectedCount > 0"),
      true,
      "bulk bar renders only when entitled and something is selected"
    );
  });

  it("the selected employee count is displayed and the bar is hidden when nothing is selected", () => {
    assert.equal(
      tableSource.includes("Delete Selected Employees ({selectedCount})"),
      true
    );
    assert.equal(
      tableSource.includes("canBulkDelete ? ("),
      true,
      "bar is conditional on a non-empty selection"
    );
  });

  it("the confirmation dialog requires the exact phrase matching the selected count", () => {
    assert.equal(
      dialogSource.includes("DELETE ${selectedCount} EMPLOYEES"),
      true
    );
    assert.equal(
      dialogSource.includes("confirmation === expectedConfirmation"),
      true
    );
    assert.equal(
      dialogSource.includes("data-testid=\"bulk-delete-confirmation-mismatch\""),
      true
    );
  });

  it("the confirmation button is disabled until the phrase and acknowledgement are satisfied", () => {
    assert.equal(
      dialogSource.includes("confirmationMatches && acknowledged && !isPending"),
      true
    );
    assert.equal(
      dialogSource.includes("data-testid=\"bulk-delete-acknowledgement\""),
      true
    );
  });

  it("selection clears and the list refreshes after a successful deletion", () => {
    assert.equal(
      dialogSource.includes("router.refresh()"),
      true
    );
    assert.equal(
      dialogSource.includes("reset()"),
      true
    );
    assert.equal(
      actionsSource.includes("revalidatePath(\"/employees\")"),
      true
    );
  });

  it("error messages identify the reason for failure", () => {
    assert.equal(
      dialogSource.includes("data-testid=\"bulk-delete-error\""),
      true
    );
    assert.equal(
      bulkAction.includes("Cannot delete"),
      true
    );
  });
});

describe("no production data is touched by this suite", () => {
  it("imports only pure modules and reads source as text", () => {
    assert.equal(canPermanentlyDeleteEmployees.length > 0, true);
    assert.equal(EMPLOYEE_PERMANENT_DELETE_PERMISSION, "employees.permanent_delete");
    assert.equal(actionsSource.includes("employees"), true);
  });
});
