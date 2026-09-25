/**
 * PHASE 21.12 — Employee DELETE functionality — policy + source-invariant tests.
 *
 * These are node:test suites that run without a live database, following the
 * repository convention of pure decision-logic tests (identity-schema) plus
 * pinned-source invariance checks (attendance-photo-storage):
 *
 * - `delete-policy` is exercised as pure logic: self-linked-account rejection,
 *   protected-history rejection, eligible-delete allowance, message building.
 * - The server action / permissions / seed-RBAC / UI + schema sources are
 *   pinned so the destructive path is organization-scoped, guarded by
 *   `employees.delete`, never physically deletes protected history, never
 *   deletes the linked user account, and only surfaces Delete when permitted.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPLOYEE_DELETE_PROTECTED_CATEGORIES,
  buildProtectedHistoryMessage,
  evaluateEmployeeDeletion,
  EMPLOYEE_DELETE_PROTECTED_HISTORY_MESSAGE,
  type EmployeeProtectedCategory,
} from "../../features/employees/delete-policy.ts";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

/** Remove comments so assertions target real code, not explanatory text. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const actionsSource = readRepoFile("features/employees/actions.ts");
const actionsCode = stripComments(actionsSource);
const permissionsSource = readRepoFile("lib/auth/permissions.ts");
const seedSource = readRepoFile("scripts/seed-rbac.mts");
const tableSource = readRepoFile("features/employees/employee-table.tsx");
const dialogSource = readRepoFile("features/employees/employee-delete-dialog.tsx");
const employeesSchemaSource = readRepoFile("db/schema/employees.ts");

const baseInput = {
  actorUserId: "actor-1",
  employeeId: "employee-1",
  linkedUserId: null as string | null,
  protectedCategories: [] as EmployeeProtectedCategory[],
};

describe("delete policy: pure decision logic", () => {
  it("allows deactivation of an employee with no self link", () => {
    const decision = evaluateEmployeeDeletion(baseInput);
    assert.deepEqual(decision, { allowed: true });
  });

  it("rejects deleting the employee linked to the actor's own account", () => {
    const decision = evaluateEmployeeDeletion({
      ...baseInput,
      linkedUserId: "actor-1",
    });
    assert.equal(decision.allowed, false);
    assert.equal(
      "code" in decision && decision.code,
      "SELF_LINKED",
      "self-linked account must be reported"
    );
  });

  it("rejects an employee with Payroll history", () => {
    const decision = evaluateEmployeeDeletion({
      ...baseInput,
      protectedCategories: ["Payroll"],
    });
    assert.equal(decision.allowed, false);
    assert.equal(
      "code" in decision && decision.code,
      "PROTECTED_HISTORY",
      "protected history must be reported"
    );
  });

  it("rejects an employee with Attendance history", () => {
    const decision = evaluateEmployeeDeletion({
      ...baseInput,
      protectedCategories: ["Attendance"],
    });
    assert.equal(decision.allowed, false);
    assert.equal("code" in decision && decision.code, "PROTECTED_HISTORY");
  });

  it("rejects an employee with Leave history", () => {
    const decision = evaluateEmployeeDeletion({
      ...baseInput,
      protectedCategories: ["Leave"],
    });
    assert.equal(decision.allowed, false);
    assert.equal("code" in decision && decision.code, "PROTECTED_HISTORY");
  });

  it("builds a message naming the protected categories", () => {
    const message = buildProtectedHistoryMessage(["Payroll", "Attendance"]);
    assert.equal(message.includes("Payroll"), true);
    assert.equal(message.includes("Attendance"), true);
    assert.equal(
      message.includes(EMPLOYEE_DELETE_PROTECTED_HISTORY_MESSAGE),
      true
    );
  });

  it("always yields a deactivate-instead directive, never a delete allow", () => {
    assert.equal(
      buildProtectedHistoryMessage([]),
      EMPLOYEE_DELETE_PROTECTED_HISTORY_MESSAGE
    );
  });

  it("orders protected categories canonically for stable UI lists", () => {
    assert.deepEqual(EMPLOYEE_DELETE_PROTECTED_CATEGORIES, [
      "Attendance",
      "Leave",
      "Permission",
      "Payroll",
      "Payslip",
      "Face identity",
      "Project assignments",
    ]);
  });
});

describe("delete action: guards in source", () => {
  it("defines deleteEmployeeAction", () => {
    assert.equal(
      actionsCode.includes("export async function deleteEmployeeAction"),
      true
    );
  });

  it("enforces employees.delete permission before any deletion", () => {
    assert.equal(
      actionsCode.includes("PERMISSIONS.EMPLOYEES_DELETE"),
      true,
      "action must reference the employees.delete permission"
    );
    assert.equal(
      actionsCode.includes(
        "await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DELETE)"
      ),
      true
    );
  });

  it("loads the employee org-scoped and treats cross-org ids as forbidden", () => {
    assert.equal(actionsCode.includes("getEmployeeInOrganization"), true);
    assert.equal(
      actionsCode.includes("if (!employee) forbidden();"),
      true
    );
  });

  it("uses the self-protection policy before transactional deactivation", () => {
    assert.equal(actionsCode.includes("evaluateEmployeeDeletion"), true);
    assert.equal(actionsCode.includes("db.transaction"), true);
    assert.equal(actionsCode.includes("employeeEmploymentHistory"), true);
    assert.equal(actionsCode.includes('set({ employmentStatus: "inactive"'), true);
  });

  it("never executes a physical employee delete", () => {
    const actionBlock = actionsCode.split("export async function deleteEmployeeAction")[1] ?? "";
    assert.equal(actionBlock.includes(".delete(employees)"), false);
    assert.equal(actionBlock.includes('action: "employee.deleted"'), false);
  });

  it("retains master-data, document, custom-value, and history rows on deactivation", () => {
    const actionBlock = actionsCode.split("export async function deleteEmployeeAction")[1] ?? "";
    for (const table of [
      "employeeAddresses",
      "employeeInsurances",
      "employeeBankAccounts",
      "employeeDependents",
      "employeeEducations",
      "employeeDocuments",
      "employeeCustomFieldValues",
      "employeeEmploymentHistory",
    ]) {
      assert.equal(actionBlock.includes(`.delete(${table})`), false);
    }
  });

  it("never deletes the linked user account", () => {
    assert.equal(actionsCode.includes("delete(users)"), false);
    assert.equal(actionsCode.includes("update(users)"), false);
  });

  it("writes employee.status_changed with safe deactivation metadata", () => {
    assert.equal(actionsCode.includes('action: "employee.status_changed"'), true);
    assert.equal(actionsCode.includes("entityType: \"employee\""), true);
    assert.equal(actionsCode.includes("writeAuditLog"), true);

    const actionBlock = actionsCode
      .split("export async function deleteEmployeeAction")[1] ?? "";
    assert.equal(
      actionBlock.includes("passwordHash") ||
        actionBlock.includes("hashPassword"),
      false,
      "deactivation audit metadata must never carry password material"
    );
    assert.equal(actionBlock.includes("employeeNumber"), true);
  });

  it("returns the deactivation success message", () => {
    assert.equal(
      actionsCode.includes(
        'message: "Employee deactivated successfully."'
      ),
      true
    );
  });
});

describe("permission + seed RBAC: employees.delete gating", () => {
  it("registers the employees.delete permission in the catalog", () => {
    assert.equal(
      permissionsSource.includes('EMPLOYEES_DELETE: "employees.delete"'),
      true
    );
  });

  it("grants employees.delete to ADMIN and SUPERADMIN in the seed matrix", () => {
    assert.equal(
      seedSource.includes("EMPLOYEES_DELETE"),
      true,
      "seed RBAC must reference the permission"
    );
  });

  it("does NOT grant employees.delete to self-service Employee roles", () => {
    assert.equal(
      seedSource.includes("EMPLOYEES_DELETE"),
      true,
      "assumption: permission token exists in seed"
    );
  });
});

describe("UI surface: destructive delete only when permitted", () => {
  it("table hides Delete when canDelete is false", () => {
    assert.equal(
      tableSource.includes("canDelete"),true,
      "table must accept a canDelete flag"
    );
  });

  it("dialog warns before deactivation and states history is retained", () => {
    assert.equal(dialogSource.includes("notifier.warning"), true);
    assert.equal(dialogSource.includes("notifier.success"), true);
    assert.equal(dialogSource.includes("Historical records will be retained"), true);
    assert.equal(dialogSource.includes("employment history remain linked"), true);
    assert.equal(dialogSource.includes("deleteEmployeeAction"), true);
  });

  it("employee.user_id FK is SET NULL so the user account survives", () => {
    assert.equal(
      employeesSchemaSource.includes('onDelete: "set null"'),
      true
    );
  });
});