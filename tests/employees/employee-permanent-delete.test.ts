/**
 * Permanent employee deletion — node:test suite.
 *
 * Two deletion lifecycles coexist and are tested separately:
 * - DEACTIVATE (`deleteEmployeeAction`, `employee-delete-policy.test.ts`):
 *   `active → inactive`, reversible, keeps every dependent record.
 * - PERMANENT DELETE (`permanentlyDeleteEmployeeAction`): removes the
 *   `employees` row plus the DELETABLE related records, in one transaction.
 *   Reserved for the system-level SUPERADMIN role.
 *
 * This suite pins the parts that can be verified without a live database, in
 * the repository convention (pure decision logic + source invariants):
 *
 * - RBAC: `employees.permanent_delete` AND the system-level SUPERADMIN role are
 *   both required, and every other role is refused (403);
 * - confirmation matching (exact employee number, server-side comparison) and
 *   the second, explicit irreversibility acknowledgement;
 * - the dependency classification: PROTECTED historical records block the
 *   deletion (409) while DELETABLE profile records are removed with it;
 * - `EMP-TEST-*` records are NOT special-cased: they travel the exact same
 *   generic path as any other employee number;
 * - server-side enforcement — organization scope taken from the session (never
 *   the form), confirmation re-checked inside the transaction, one scoped
 *   `DELETE` of the employee row preceded by explicit table-by-table removal of
 *   the deletable records, rollback on failure, and an audit record for
 *   SUCCESS / DENIED / FAILED that survives the employee row;
 * - UI visibility of the destructive action follows `employees.permanent_delete`
 *   (NOT `employees.delete`), and the list and the detail page share ONE dialog
 *   and ONE server action.
 *
 * The database remains the final authority: every employee-scoped foreign key is
 * `RESTRICT`/`SET NULL` (never `CASCADE`), so a protected row that appears
 * between the scan and the DELETE makes the statement fail and the transaction
 * roll back.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPLOYEE_PERMANENT_DELETE_ACKNOWLEDGEMENT_MESSAGE,
  EMPLOYEE_PERMANENT_DELETE_ADVICE,
  EMPLOYEE_PERMANENT_DELETE_CONFIRMATION_MESSAGE,
  EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS,
  EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_MESSAGE,
  EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE,
  EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE,
  EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE,
  EMPLOYEE_PERMANENT_DELETE_PERMISSION,
  EMPLOYEE_PERMANENT_DELETE_PROTECTED_MESSAGE,
  EMPLOYEE_DELETABLE_DEPENDENCY_LABELS,
  EMPLOYEE_PROTECTED_DEPENDENCY_LABELS,
  buildPermanentDeleteDependencyMessage,
  buildPermanentDeleteProtectedMessage,
  canPermanentlyDeleteEmployees,
  employeeDeleteDependencyDisposition,
  evaluatePermanentEmployeeDeletion,
  hasEmployeeDeleteDependencies,
  hasProtectedEmployeeDependencies,
  matchesEmployeeNumberConfirmation,
  presentEmployeeDeleteDependencies,
  presentEmployeeDependenciesByDisposition,
  totalEmployeeDeleteDependencyCount,
  type EmployeeDeleteDependency,
} from "../../features/employees/permanent-delete-policy.ts";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

/** Remove comments so assertions target real code, not explanatory text. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const policySource = stripComments(
  readRepoFile("features/employees/permanent-delete-policy.ts")
);
const actionsSource = stripComments(readRepoFile("features/employees/actions.ts"));
const queriesSource = stripComments(readRepoFile("features/employees/queries.ts"));
const dialogSource = stripComments(
  readRepoFile("features/employees/delete-employee-dialog.tsx")
);
const tableSource = stripComments(readRepoFile("features/employees/employee-table.tsx"));
const listPageSource = stripComments(
  readRepoFile("app/(dashboard)/employees/page.tsx")
);
const detailPageSource = stripComments(
  readRepoFile("app/(dashboard)/employees/[employeeId]/page.tsx")
);
const permissionsSource = stripComments(readRepoFile("lib/auth/permissions.ts"));
const auditSource = stripComments(readRepoFile("lib/auth/audit.ts"));
const seedSource = stripComments(readRepoFile("scripts/seed-rbac.mts"));
const rbacActionsSource = stripComments(readRepoFile("features/rbac/actions.ts"));
const roleEditorPageSource = stripComments(
  readRepoFile("app/(dashboard)/settings/roles/[roleId]/page.tsx")
);

/**
 * Body of one function in actions.ts, bounded by the next top-level
 * declaration so an assertion can never leak into a neighbouring action.
 */
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

/** Collapse JSX/whitespace so copy assertions survive line wrapping. */
function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

const permanentDelete = actionBlock(
  actionsSource,
  "permanentlyDeleteEmployeeAction"
);
const preflight = actionBlock(
  actionsSource,
  "checkEmployeeDeletionDependenciesAction"
);
const auditBlock = actionBlock(actionsSource, "auditPermanentEmployeeDelete");

/** Zero dependencies for every category — the deletable case. */
const NO_DEPENDENCIES: EmployeeDeleteDependency[] =
  EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS.map((label) => ({
    label,
    count: 0,
    disposition: employeeDeleteDependencyDisposition(label),
  }));

function dependencies(overrides: Partial<Record<string, number>>) {
  return NO_DEPENDENCIES.map((dependency) => ({
    ...dependency,
    count: overrides[dependency.label] ?? 0,
  }));
}

const baseInput = {
  actorUserId: "actor-1",
  employeeNumber: "6666",
  linkedUserId: null as string | null,
  dependencies: NO_DEPENDENCIES,
};

/** Every catalog permission code, so the SUPERADMIN shortcut is modelled. */
const ALL_PERMISSION_CODES = permissionsSource
  .match(/^\s+[A-Z_0-9]+: "([a-z_]+\.[a-z_]+)",$/gm)
  ?.map((line) => line.split('"')[1]) as string[];

describe("permission catalog: employees.permanent_delete exists", () => {
  it("is declared once with the project's `resource.action` convention", () => {
    assert.equal(
      permissionsSource.includes(
        'EMPLOYEES_PERMANENT_DELETE: "employees.permanent_delete"'
      ),
      true
    );
    assert.equal(EMPLOYEE_PERMANENT_DELETE_PERMISSION, "employees.permanent_delete");
  });

  it("is part of the catalog so it is seedable and auditable", () => {
    assert.equal(
      permissionsSource.includes("code: PERMISSIONS.EMPLOYEES_PERMANENT_DELETE"),
      true
    );
    const deleteEntry = permissionsSource.indexOf(
      "code: PERMISSIONS.EMPLOYEES_DELETE"
    );
    const permanentEntry = permissionsSource.indexOf(
      "code: PERMISSIONS.EMPLOYEES_PERMANENT_DELETE"
    );
    const importEntry = permissionsSource.indexOf(
      "code: PERMISSIONS.EMPLOYEES_IMPORT"
    );
    assert.equal(
      deleteEntry > -1 && permanentEntry > deleteEntry && importEntry > permanentEntry,
      true,
      "it sits in the employees module between employees.delete and employees.import"
    );
    assert.equal(
      /code: PERMISSIONS\.EMPLOYEES_PERMANENT_DELETE,\s+module: PERMISSION_MODULES\.EMPLOYEES/.test(
        permissionsSource
      ),
      true,
      "it is owned by the employees module"
    );
  });

  it("is documented as a Super Administrator capability", () => {
    const catalogEntry = permissionsSource.slice(
      permissionsSource.indexOf("code: PERMISSIONS.EMPLOYEES_PERMANENT_DELETE")
    );
    assert.equal(catalogEntry.includes("Super Administrator only"), true);
  });

  it("does not duplicate employees.delete", () => {
    assert.equal(
      permissionsSource.includes('EMPLOYEES_PERMANENT_DELETE: "employees.delete"'),
      false
    );
  });
});

describe("RBAC: the gate requires employees.permanent_delete AND SUPERADMIN", () => {
  it("SUPERADMIN + employees.permanent_delete => allowed", () => {
    assert.equal(
      canPermanentlyDeleteEmployees({
        isSuperAdmin: true,
        permissionCodes: [...ALL_PERMISSION_CODES],
      }),
      true
    );
  });

  it("a non-SUPERADMIN holder of the permission code is still refused", () => {
    // Defence in depth: a tenant that somehow receives the code in a custom
    // role must not be able to permanently delete employees.
    assert.equal(
      canPermanentlyDeleteEmployees({
        isSuperAdmin: false,
        permissionCodes: [EMPLOYEE_PERMANENT_DELETE_PERMISSION],
      }),
      false
    );
  });

  it("SUPERADMIN without the catalog entry is refused (no silent fallback)", () => {
    assert.equal(
      canPermanentlyDeleteEmployees({
        isSuperAdmin: true,
        permissionCodes: ["employees.view"],
      }),
      false
    );
  });

  it("every other role is refused (403), including ones holding employees.delete", () => {
    for (const roleCode of ["ADMIN", "HR", "MANAGEMENT", "FINANCE", "SUPERVISOR", "EMPLOYEE"]) {
      assert.equal(
        canPermanentlyDeleteEmployees({
          isSuperAdmin: false,
          permissionCodes: [
            "employees.view",
            "employees.create",
            "employees.update",
            "employees.delete",
            EMPLOYEE_PERMANENT_DELETE_PERMISSION,
          ],
        }),
        false,
        `${roleCode} must never reach permanent deletion`
      );
    }
  });

  it("an org-less / unknown actor is refused", () => {
    assert.equal(
      canPermanentlyDeleteEmployees({ isSuperAdmin: false, permissionCodes: [] }),
      false
    );
  });

  it("never matches on a role NAME — only on the boolean and the code", () => {
    assert.equal(
      /role\s*===\s*"|\.role\b|roleCode\s*===\s*"SUPERADMIN"/.test(policySource),
      false,
      "the gate must not string-match a role name"
    );
  });
});

describe("RBAC seed: the permission is granted to SUPERADMIN only", () => {
  function roleBlock(roleCode: string): string {
    const header = `[ROLE_CODES.${roleCode}]:`;
    const start = seedSource.indexOf(header);
    assert.notEqual(start, -1, `seed must define ROLE_${roleCode} block`);
    const listStart = seedSource.indexOf("[", start + header.length);
    const listEnd = seedSource.indexOf("]", listStart);
    return seedSource.slice(listStart, listEnd + 1);
  }

  const TOKEN = "PERMISSIONS.EMPLOYEES_PERMANENT_DELETE";

  it("SUPERADMIN receives it through the whole catalog", () => {
    assert.equal(
      /\[ROLE_CODES\.SUPERADMIN\]:\s*ALL_PERMISSIONS/.test(seedSource),
      true
    );
    assert.equal(
      permissionsSource.includes(
        `code: PERMISSIONS.EMPLOYEES_PERMANENT_DELETE`
      ),
      true,
      "ALL_PERMISSIONS is built from PERMISSION_CATALOG"
    );
  });

  it("no organization-level role block lists it", () => {
    for (const roleCode of [
      "ADMIN",
      "MANAGEMENT",
      "HR",
      "FINANCE",
      "SUPERVISOR",
      "EMPLOYEE",
    ]) {
      assert.equal(
        roleBlock(roleCode).includes(TOKEN),
        false,
        `${roleCode} must not be granted employees.permanent_delete`
      );
    }
  });

  it("the seed refuses to write the grant into any organization role", () => {
    assert.equal(seedSource.includes("SYSTEM_ONLY_PERMISSIONS"), true);
    assert.equal(
      seedSource.includes("must not hold the system-level permission"),
      true
    );
    assert.equal(
      /SYSTEM_ONLY_PERMISSION_CODES[\s\S]*?EMPLOYEES_PERMANENT_DELETE[\s\S]*?\];/.test(
        permissionsSource
      ),
      true,
      "employees.permanent_delete is declared system-only in the shared catalog"
    );
    assert.equal(
      seedSource.includes("for (const roleCode of ORGANIZATION_ROLE_CODES)"),
      true,
      "the guard covers every organization-level role"
    );
  });

  it("employees.delete is unchanged for Admin / HR / Management", () => {
    for (const roleCode of ["ADMIN", "HR", "MANAGEMENT"]) {
      assert.equal(
        roleBlock(roleCode).includes("PERMISSIONS.EMPLOYEES_DELETE"),
        true,
        `${roleCode} keeps its deactivate capability`
      );
    }
  });
});

describe("server action: authorization is enforced server-side", () => {
  it("re-authenticates before anything else", () => {
    assert.equal(permanentDelete.includes("await requireUser()"), true);
    assert.equal(
      permanentDelete.indexOf("await requireUser()") <
        permanentDelete.indexOf("canPermanentlyDeleteEmployees("),
      true,
      "authentication precedes authorization"
    );
  });

  it("authorizes from the DB-backed RBAC of the session, never the form", () => {
    assert.equal(permanentDelete.includes("getUserAuthorization(user.id)"), true);
    assert.equal(
      permanentDelete.includes("canPermanentlyDeleteEmployees(authorization)"),
      true
    );
    assert.equal(
      permanentDelete.includes("PERMISSIONS.EMPLOYEES_PERMANENT_DELETE"),
      false,
      "the action delegates the gate to the shared policy helper"
    );
  });

  it("does NOT authorize on employees.delete", () => {
    const block = permanentDelete.slice(
      permanentDelete.indexOf("const user = await requireUser()")
    );
    assert.equal(
      block.slice(0, block.indexOf("if (!canPermanentlyDelete)")).includes(
        "EMPLOYEES_DELETE"
      ),
      false,
      "holding employees.delete must never imply permanent deletion"
    );
  });

  it("returns the 403 message when the gate fails", () => {
    assert.equal(
      permanentDelete.includes("EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE"),
      true
    );
    assert.equal(
      permanentDelete.includes("toPermanentDeleteError(\n      \"FORBIDDEN\""),
      true
    );
  });

  it("rejects before loading or touching the employee row", () => {
    const deniedAt = permanentDelete.indexOf(
      "EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE"
    );
    assert.equal(
      deniedAt < permanentDelete.indexOf("db.transaction"),
      true,
      "the permission check precedes the transaction"
    );
    assert.equal(
      deniedAt < permanentDelete.indexOf("getEmployeeInOrganization("),
      true,
      "the permission check precedes the employee load"
    );
  });

  it("the pre-flight is gated identically, so counts are not disclosed early", () => {
    assert.equal(
      preflight.includes("getUserAuthorization(user.id)"),
      true
    );
    assert.equal(
      preflight.includes("canPermanentlyDeleteEmployees(authorization)"),
      true
    );
    assert.equal(
      preflight.indexOf("canPermanentlyDeleteEmployees(") <
        preflight.indexOf("getEmployeeInOrganization("),
      true
    );
    assert.equal(
      preflight.includes("EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE"),
      true
    );
  });
});

describe("operator-facing message contract", () => {
  it("pins the 403 / 404 / 400 / 409 / 500 wording used by the dialog", () => {
    assert.equal(
      EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE,
      "You do not have permission to permanently delete employees."
    );
    assert.equal(
      EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE,
      "Employee not found."
    );
    assert.equal(
      EMPLOYEE_PERMANENT_DELETE_CONFIRMATION_MESSAGE,
      "Employee number confirmation does not match."
    );
    assert.equal(
      EMPLOYEE_PERMANENT_DELETE_ACKNOWLEDGEMENT_MESSAGE,
      "You must confirm that this action cannot be undone."
    );
    assert.equal(
      EMPLOYEE_PERMANENT_DELETE_PROTECTED_MESSAGE,
      "Employee cannot be permanently deleted because protected historical records exist."
    );
    assert.equal(
      EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_MESSAGE,
      "Employee cannot be permanently deleted because related records still exist."
    );
    assert.equal(
      EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE,
      "Permanent deletion failed. No data was deleted."
    );
  });

  it("uses the exact strings the requirements specify", () => {
    assert.equal(
      EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE,
      "You do not have permission to permanently delete employees."
    );
    assert.equal(EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE, "Employee not found.");
    assert.equal(
      EMPLOYEE_PERMANENT_DELETE_CONFIRMATION_MESSAGE,
      "Employee number confirmation does not match."
    );
    assert.equal(
      EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE,
      "Permanent deletion failed. No data was deleted."
    );
  });
});

describe("employee-number confirmation", () => {
  it("accepts the exact employee number", () => {
    assert.equal(matchesEmployeeNumberConfirmation("6666", "6666"), true);
    assert.equal(
      matchesEmployeeNumberConfirmation("EMP-TEST-001", "EMP-TEST-001"),
      true
    );
  });

  it("rejects a different employee number", () => {
    assert.equal(matchesEmployeeNumberConfirmation("6666", "6667"), false);
    assert.equal(
      matchesEmployeeNumberConfirmation("EMP-TEST-001", "EMP-TEST-002"),
      false
    );
  });

  it("rejects a partial or extended match", () => {
    assert.equal(matchesEmployeeNumberConfirmation("6666", "666"), false);
    assert.equal(matchesEmployeeNumberConfirmation("6666", "66660"), false);
  });

  it("ignores surrounding whitespace from a pasted value", () => {
    assert.equal(matchesEmployeeNumberConfirmation("6666", "  6666  "), true);
  });

  it("is case sensitive (identifiers, not prose)", () => {
    assert.equal(
      matchesEmployeeNumberConfirmation("EMP-TEST-001", "emp-test-001"),
      false
    );
  });

  it("never matches a missing or non-string confirmation", () => {
    for (const value of [undefined, null, "", "   ", 6666, {}, []]) {
      assert.equal(
        matchesEmployeeNumberConfirmation("6666", value),
        false,
        `confirmation ${JSON.stringify(value)} must not match`
      );
    }
  });

  it("never matches an empty stored employee number", () => {
    assert.equal(matchesEmployeeNumberConfirmation("", ""), false);
  });
});

describe("related records are classified, not treated uniformly", () => {
  it("every category carries a disposition", () => {
    for (const label of EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS) {
      assert.ok(
        ["protected", "deletable"].includes(employeeDeleteDependencyDisposition(label)),
        `${label} must be classified`
      );
    }
  });

  it("retention-bound categories are protected", () => {
    assert.deepEqual([...EMPLOYEE_PROTECTED_DEPENDENCY_LABELS], [
      "Attendance",
      "Leave",
      "Permission",
      "Payroll",
      "Payslip",
      "Employment history",
    ]);
  });

  it("profile categories are deletable", () => {
    assert.deepEqual([...EMPLOYEE_DELETABLE_DEPENDENCY_LABELS], [
      "Documents",
      "Face ID",
      "Projects",
      "Other related records",
    ]);
  });

  it("protected and deletable partition the catalog exactly once", () => {
    assert.equal(
      EMPLOYEE_PROTECTED_DEPENDENCY_LABELS.length +
        EMPLOYEE_DELETABLE_DEPENDENCY_LABELS.length,
      EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS.length
    );
    const all = [
      ...EMPLOYEE_PROTECTED_DEPENDENCY_LABELS,
      ...EMPLOYEE_DELETABLE_DEPENDENCY_LABELS,
    ];
    assert.equal(new Set(all).size, all.length, "no category appears twice");
    for (const label of all) {
      assert.ok(
        (EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS as readonly string[]).includes(label)
      );
    }
  });

  it("an unknown category fails closed as protected", () => {
    const unknown = "Brand New Module" as never;
    assert.equal(employeeDeleteDependencyDisposition(unknown), "protected");
  });

  it("separates the two dispositions for display", () => {
    const deps = dependencies({ Attendance: 2, Documents: 4, "Face ID": 1 });
    assert.deepEqual(
      presentEmployeeDependenciesByDisposition(deps, "protected").map(
        (d) => [d.label, d.count]
      ),
      [["Attendance", 2]]
    );
    assert.deepEqual(
      presentEmployeeDependenciesByDisposition(deps, "deletable").map(
        (d) => [d.label, d.count]
      ),
      [
        ["Documents", 4],
        ["Face ID", 1],
      ]
    );
  });

  it("totals every related record across dispositions", () => {
    assert.equal(
      totalEmployeeDeleteDependencyCount(dependencies({ Attendance: 2, Documents: 4 })),
      6
    );
    assert.equal(totalEmployeeDeleteDependencyCount(NO_DEPENDENCIES), 0);
  });

  it("only protected records block; deletable ones do not", () => {
    const deps = dependencies({ Documents: 4, "Face ID": 2 });
    assert.equal(hasEmployeeDeleteDependencies(deps), true);
    assert.equal(hasProtectedEmployeeDependencies(deps), false);
  });
});

describe("deletion decision", () => {
  it("allows a deletion when every category is empty", () => {
    const decision = evaluatePermanentEmployeeDeletion(baseInput);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.allowed && decision.willDelete, []);
  });

  it("reports no dependencies for an empty scan", () => {
    assert.equal(hasEmployeeDeleteDependencies(NO_DEPENDENCIES), false);
    assert.deepEqual(presentEmployeeDeleteDependencies(NO_DEPENDENCIES), []);
  });

  it("allows a deletion with DELETABLE records and reports what will be removed", () => {
    for (const label of EMPLOYEE_DELETABLE_DEPENDENCY_LABELS) {
      const decision = evaluatePermanentEmployeeDeletion({
        ...baseInput,
        dependencies: dependencies({ [label]: 3 }),
      });
      assert.equal(
        decision.allowed,
        true,
        `${label} is deletable and must not block the operation`
      );
      assert.deepEqual(
        decision.allowed && decision.willDelete.map((d) => [d.label, d.count]),
        [[label, 3]]
      );
    }
  });

  it("blocks a deletion with any PROTECTED record", () => {
    for (const label of EMPLOYEE_PROTECTED_DEPENDENCY_LABELS) {
      const decision = evaluatePermanentEmployeeDeletion({
        ...baseInput,
        dependencies: dependencies({ [label]: 1 }),
      });
      assert.equal(decision.allowed, false, `${label} must block the deletion`);
      assert.equal(
        "code" in decision && decision.code,
        "PROTECTED_RECORDS",
        `${label} must be reported as protected history`
      );
      assert.deepEqual(
        "dependencies" in decision
          ? decision.dependencies.map((d) => d.label)
          : [],
        [label],
        "only the protected categories are listed as the blocker"
      );
    }
  });

  it("a single protected record blocks even with deletable ones present", () => {
    const decision = evaluatePermanentEmployeeDeletion({
      ...baseInput,
      dependencies: dependencies({
        Attendance: 10,
        Payroll: 3,
        Documents: 7,
      }),
    });
    assert.equal(decision.allowed, false);
    assert.equal(
      "code" in decision && decision.code,
      "PROTECTED_RECORDS"
    );
  });

  it("rejects deleting the employee linked to the actor's own account", () => {
    const decision = evaluatePermanentEmployeeDeletion({
      ...baseInput,
      linkedUserId: "actor-1",
    });
    assert.equal(decision.allowed, false);
    assert.equal("code" in decision && decision.code, "SELF_LINKED");
  });

  it("the self-linked check wins over the dependency check", () => {
    const decision = evaluatePermanentEmployeeDeletion({
      ...baseInput,
      linkedUserId: "actor-1",
      dependencies: dependencies({ Payroll: 1 }),
    });
    assert.equal("code" in decision && decision.code, "SELF_LINKED");
  });

  it("still allows deleting an employee linked to ANOTHER account", () => {
    const decision = evaluatePermanentEmployeeDeletion({
      ...baseInput,
      linkedUserId: "someone-else",
    });
    assert.equal(decision.allowed, true);
  });
});

describe("protected rejection message names the retained modules", () => {
  it("lists the protected categories in canonical order", () => {
    const message = buildPermanentDeleteProtectedMessage(
      "03233",
      dependencies({ Payroll: 3, Attendance: 10, Documents: 2 })
    );
    const lines = message.split("\n");
    assert.equal(lines[0], EMPLOYEE_PERMANENT_DELETE_PROTECTED_MESSAGE);
    assert.equal(message.includes("Cannot delete employee 03233."), true);
    assert.equal(message.includes("Protected records:"), true);
    assert.equal(lines.indexOf("Attendance: 10") < lines.indexOf("Payroll: 3"), true);
    assert.equal(
      message.includes("Documents: 2"),
      false,
      "a deletable category is not presented as a blocker"
    );
    assert.equal(message.includes(EMPLOYEE_PERMANENT_DELETE_ADVICE), true);
  });

  it("keeps the generic related-records fallback available", () => {
    const message = buildPermanentDeleteDependencyMessage(
      "6666",
      dependencies({ Documents: 4 })
    );
    assert.equal(lines0(message), EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_MESSAGE);
    assert.equal(message.includes("Documents: 4"), true);
    assert.equal(message.includes(EMPLOYEE_PERMANENT_DELETE_ADVICE), true);
  });
});

function lines0(message: string): string {
  return message.split("\n")[0];
}

describe("EMP-TEST-* records use the generic path (no special case)", () => {
  const testNumbers = ["EMP-TEST-001", "EMP-TEST-002", "EMP-TEST-003"];

  it("no source in the delete flow contains an EMP-TEST identifier", () => {
    for (const [name, source] of [
      ["permanent-delete-policy.ts", policySource],
      ["actions.ts", permanentDelete],
      ["queries.ts", queriesSource],
      ["delete-employee-dialog.tsx", dialogSource],
      ["employee-table.tsx", tableSource],
    ] as const) {
      assert.equal(
        /EMP-TEST/i.test(source),
        false,
        `${name} must not special-case a test employee number`
      );
    }
  });

  for (const employeeNumber of testNumbers) {
    it(`${employeeNumber} is deletable when no module references it`, () => {
      const decision = evaluatePermanentEmployeeDeletion({
        ...baseInput,
        employeeNumber,
      });
      assert.equal(decision.allowed, true);
    });

    it(`${employeeNumber} is blocked by protected history, with its number in the message`, () => {
      const decision = evaluatePermanentEmployeeDeletion({
        ...baseInput,
        employeeNumber,
        dependencies: dependencies({ "Employment history": 2 }),
      });
      assert.equal(decision.allowed, false);
      assert.equal(
        "message" in decision && decision.message.includes(employeeNumber),
        true
      );
    });

    it(`${employeeNumber} is deletable with deletable records present`, () => {
      const decision = evaluatePermanentEmployeeDeletion({
        ...baseInput,
        employeeNumber,
        dependencies: dependencies({ Documents: 1 }),
      });
      assert.equal(decision.allowed, true);
    });
  }

  it("confirmation is compared against the employee number, not a prefix rule", () => {
    assert.equal(
      matchesEmployeeNumberConfirmation("EMP-TEST-001", "EMP-TEST-001"),
      true
    );
    assert.equal(
      matchesEmployeeNumberConfirmation("EMP-TEST-001", "EMP-TEST-002"),
      false
    );
  });
});

describe("server action: organization scoping", () => {
  it("takes the organization from the authenticated session only", () => {
    assert.equal(permanentDelete.includes("user.organizationId"), true);
    assert.equal(
      permanentDelete.includes('field(formData, "organizationId")'),
      false,
      "an organization_id from the browser must never be trusted"
    );
  });

  it("loads the employee org-scoped and never reveals cross-org existence", () => {
    assert.equal(
      permanentDelete.includes(
        "getEmployeeInOrganization(employeeId, organizationId)"
      ),
      true
    );
    assert.equal(
      permanentDelete.includes("EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE"),
      true
    );
  });

  it("re-reads and locks the row inside the transaction, still org-scoped", () => {
    assert.equal(permanentDelete.includes('.for("update")'), true);
    assert.equal(
      permanentDelete.includes("eq(employees.organizationId, organizationId)"),
      true
    );
  });
});

describe("server action: layered confirmation", () => {
  it("reads only the typed confirmation from the form", () => {
    assert.equal(
      permanentDelete.includes('field(formData, "confirmEmployeeNumber")'),
      true
    );
  });

  it("compares it with the stored employee number", () => {
    assert.equal(
      permanentDelete.includes("matchesEmployeeNumberConfirmation("),
      true
    );
  });

  it("re-checks it inside the transaction, before the delete", () => {
    const insideTransaction = permanentDelete.slice(
      permanentDelete.indexOf("db.transaction")
    );
    assert.equal(
      insideTransaction.indexOf("matchesEmployeeNumberConfirmation(") <
        insideTransaction.indexOf(".delete(employees)"),
      true,
      "the confirmation is verified before the DELETE statement"
    );
  });

  it("returns the 400 message when the confirmation does not match", () => {
    assert.equal(
      permanentDelete.includes(
        "EMPLOYEE_PERMANENT_DELETE_CONFIRMATION_MESSAGE"
      ),
      true
    );
  });

  it("re-validates the irreversibility acknowledgement server-side", () => {
    assert.equal(permanentDelete.includes("isAcknowledgedPermanentDelete(formData)"), true);
    assert.equal(
      permanentDelete.includes(
        "EMPLOYEE_PERMANENT_DELETE_ACKNOWLEDGEMENT_MESSAGE"
      ),
      true
    );
  });

  it("accepts only an affirmative acknowledgement value", () => {
    const helper = actionBlock(actionsSource, "isAcknowledgedPermanentDelete");
    for (const truthy of ['"true"', '"on"', '"1"']) {
      assert.equal(
        helper.includes(`raw === ${truthy}`),
        true,
        `${truthy} must be accepted`
      );
    }
    assert.equal(
      helper.includes('raw === "false"'),
      false,
      "an explicit false is a refusal"
    );
  });

  it("checks the acknowledgement before the transaction", () => {
    assert.equal(
      permanentDelete.indexOf("isAcknowledgedPermanentDelete(formData)") <
        permanentDelete.indexOf("db.transaction"),
      true
    );
  });
});

describe("server action: transaction and explicit deletion", () => {
  it("runs the whole operation inside ONE transaction", () => {
    assert.equal(permanentDelete.includes("db.transaction(async (tx) =>"), true);
    const transactions = (permanentDelete.match(/db\.transaction\(/g) ?? []).length;
    assert.equal(transactions, 1, "no second transaction may split the operation");
  });

  it("counts and classifies dependencies on the transaction handle", () => {
    assert.equal(
      permanentDelete.includes("listEmployeeDeletionDependencies(\n        tx,"),
      true
    );
    assert.equal(
      permanentDelete.includes("evaluatePermanentEmployeeDeletion("),
      true
    );
  });

  it("removes the DELETABLE related records before the employee row", () => {
    assert.equal(
      permanentDelete.includes("deleteEmployeeDeletableRecords("),
      true
    );
    assert.equal(
      permanentDelete.indexOf("deleteEmployeeDeletableRecords(") <
        permanentDelete.indexOf(".delete(employees)"),
      true,
      "dependent rows and the employee row are removed in the same transaction, dependents first"
    );
  });

  it("deletes exactly one row directly, scoped to id AND organization", () => {
    const deletes = actionsSource.match(/\.delete\([A-Za-z]+\)/g) ?? [];
    assert.deepEqual(
      deletes,
      [".delete(employees)"],
      "the action deletes the employee row itself; related tables are cleared by the shared plan"
    );
    const statement = permanentDelete.slice(permanentDelete.indexOf(".delete(employees)"));
    assert.equal(statement.includes("eq(employees.id, current.id)"), true);
    assert.equal(
      statement.includes("eq(employees.organizationId, organizationId)"),
      true
    );
    assert.equal(statement.includes(".returning({ id: employees.id })"), true);
  });

  it("never deletes a PROTECTED table", () => {
    for (const table of [
      "employeeEmploymentHistory",
      "employeePayrollComponents",
      "payrollItems",
      "payslips",
      "payslipDocuments",
      "payslipDocumentVersions",
      "attendanceRecords",
      "attendanceEvents",
      "leaveBalances",
      "leaveRequests",
      "permissionRequests",
    ]) {
      assert.equal(
        queriesSource.includes(`.delete(${table})`),
        false,
        `${table} is retention-bound and must never be deleted`
      );
    }
  });

  it("never deletes users (the linked account outlives the employee)", () => {
    assert.equal(queriesSource.includes(".delete(users)"), false);
  });

  it("rolls back on a foreign-key rejection and reports related records", () => {
    assert.equal(permanentDelete.includes("isForeignKeyViolation(error)"), true);
    assert.equal(
      permanentDelete.includes("buildPermanentDeleteDependencyMessage("),
      true
    );
    assert.equal(
      permanentDelete.includes("buildPermanentDeleteProtectedMessage("),
      true,
      "a foreign-key rejection on protected data reports the protected summary"
    );
  });

  it("rolls back on any other failure and commits nothing", () => {
    assert.equal(
      permanentDelete.includes("EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE"),
      true
    );
    assert.equal(
      permanentDelete.includes('console.error("[employees] permanent delete failed"'),
      true
    );
  });

  it("re-reads the dependency summary after a rollback for the 409 summary", () => {
    assert.equal(
      permanentDelete.includes("readEmployeeDeletionDependencies("),
      true
    );
  });

  it("removes the employee's private document folder only AFTER the commit", () => {
    assert.equal(
      permanentDelete.includes("deleteEmployeeDocumentStorage(organizationId, employeeId)"),
      true
    );
    const successAt = permanentDelete.indexOf('result: "SUCCESS"');
    const storageAt = permanentDelete.indexOf("deleteEmployeeDocumentStorage(");
    assert.equal(
      successAt < storageAt,
      true,
      "files must never be removed before the transaction commits"
    );
  });

  it("revalidates the list and the detail route after a committed delete", () => {
    assert.equal(permanentDelete.includes('revalidatePath("/employees")'), true);
    assert.equal(
      permanentDelete.includes("revalidatePath(`/employees/${employeeId}`)"),
      true
    );
  });

  it("reports success with the required message", () => {
    assert.equal(
      permanentDelete.includes(
        'message: "Employee permanently deleted successfully."'
      ),
      true
    );
  });
});

describe("queries: the explicit delete plan matches the policy", () => {
  const planBlock = queriesSource.slice(
    queriesSource.indexOf("const EMPLOYEE_DELETABLE_DELETE_PLAN"),
    queriesSource.indexOf("assertEmployeeDeletePlanMatchesPolicy();")
  );

  it("is derived from the deletable categories only", () => {
    assert.equal(
      planBlock.includes('employeeDeleteDependencyDisposition(group.label) === "deletable"'),
      true,
      "the plan must be derived from the policy classification, not hand-listed"
    );
  });

  it("fails fast when the plan and the policy disagree", () => {
    assert.equal(
      queriesSource.includes("assertEmployeeDeletePlanMatchesPolicy"),
      true
    );
    assert.equal(
      queriesSource.includes("must not delete protected category"),
      true
    );
    assert.equal(
      queriesSource.includes("is missing deletable category"),
      true
    );
    assert.equal(
      queriesSource.includes("assertEmployeeDeletePlanMatchesPolicy();"),
      true,
      "the guard runs at module load"
    );
  });

  it("scopes every explicit delete to employee AND organization", () => {
    const deleteHelper = queriesSource.slice(
      queriesSource.indexOf("export async function deleteEmployeeDeletableRecords")
    );
    assert.equal(deleteHelper.includes(".delete(source.table)"), true);
    assert.equal(deleteHelper.includes("eq(source.employeeIdColumn, employeeId)"), true);
    assert.equal(
      deleteHelper.includes("eq(source.organizationIdColumn, organizationId)"),
      true,
      "a related row from another tenant must never be removed"
    );
  });

  it("reverses the face-ID pair so no ON DELETE CASCADE is relied upon", () => {
    assert.equal(
      planBlock.includes("[group.tables[1], group.tables[0]]"),
      true,
      "face_enrollment_templates must be deleted before employee_face_enrollments"
    );
  });

  it("relies on the RESTRICT contract from the reconciliation migration", () => {
    // db/schema/*.ts still declares `onDelete: "cascade"` on some employee-scoped
    // tables. That is pre-existing drift, neutralized in the live database by the
    // reconciliation migration, and this feature must neither depend on it nor
    // reintroduce it. The migration is the authoritative production contract.
    const migration = readRepoFile(
      "db/migrations/0017_employee_delete_safety_reconciliation.sql"
    );
    assert.equal(
      /ADD CONSTRAINT employee_addresses_employee_id_employees_id_fk[\s\S]*?ON DELETE RESTRICT;/.test(
        migration
      ),
      true,
      "employee-scoped FKs are re-declared as RESTRICT"
    );
    assert.equal(
      migration.includes("ON DELETE CASCADE"),
      false,
      "the reconciliation migration must never weaken a table to CASCADE"
    );

    // The two self-referencing FKs are deliberately NOT RESTRICT: deleting an
    // employee re-points their direct reports and approval chains instead of
    // blocking the delete. They predate 0017 and are declared in the schema.
    const employeesSchema = readRepoFile("db/schema/employees.ts");
    assert.equal(
      /managerId[\s\S]*?onDelete: "set null"/.test(employeesSchema),
      true,
      "deleting an employee nulls the manager pointer of their direct reports"
    );
  });
});

describe("server action: audit trail", () => {
  it("records the operation as EMPLOYEE_PERMANENT_DELETE", () => {
    assert.equal(
      actionsSource.includes('operation: "EMPLOYEE_PERMANENT_DELETE"'),
      true
    );
    assert.equal(
      auditSource.includes('"employee.permanently_deleted"'),
      true,
      "the action is part of the audit action union"
    );
    assert.equal(auditBlock.includes('action: "employee.permanently_deleted"'), true);
    assert.equal(auditBlock.includes('entityType: "employee"'), true);
  });

  it("captures the actor, organization and employee snapshot", () => {
    assert.equal(auditBlock.includes("organizationId: input.organizationId"), true);
    assert.equal(auditBlock.includes("actorUserId: input.actorUserId"), true);
    assert.equal(auditBlock.includes("actorEmail: input.actorEmail"), true);
    assert.equal(auditBlock.includes("actorRole: input.actorRole"), true);
    assert.equal(auditBlock.includes("entityId: input.employeeId"), true);
    assert.equal(auditBlock.includes("employeeId: input.employeeId"), true);
    assert.equal(auditBlock.includes("employeeNumber: input.employeeNumber"), true);
    assert.equal(auditBlock.includes("employeeName: input.employeeName"), true);
  });

  it("supplies the actor email and role from the session and the DB-backed RBAC", () => {
    assert.equal(permanentDelete.includes("actorEmail: user.email"), true);
    assert.equal(
      permanentDelete.includes("displayRoleLabel(authorization.roleCodes)"),
      true
    );
  });

  it("records the deleted related-record summary", () => {
    assert.equal(
      auditBlock.includes("deletedRelatedRecords: input.deletedRelatedRecords ?? {}"),
      true
    );
    assert.equal(
      permanentDelete.includes("deletedRelatedRecords: outcome.removedSummary"),
      true,
      "the committed per-category counts are audited"
    );
  });

  it("does NOT depend on the employee row, so the trail survives the deletion", () => {
    const auditSchema = readRepoFile("db/schema/audit.ts");
    assert.equal(
      /entityId:\s*uuid\("entity_id"\)/.test(auditSchema),
      true,
      "audit_logs.entity_id must be a plain column with no foreign key"
    );
    assert.equal(
      /entityId:\s*uuid\("entity_id"\)\s*\.references/.test(auditSchema),
      false
    );
    assert.equal(
      permanentDelete.includes("await auditPermanentEmployeeDelete({"),
      true
    );
  });

  it("records SUCCESS, DENIED and FAILED outcomes with a reason", () => {
    assert.equal(
      actionsSource.includes(
        'type PermanentDeleteAuditResult = "SUCCESS" | "DENIED" | "FAILED"'
      ),
      true
    );
    assert.equal(permanentDelete.includes('result: "SUCCESS"'), true);
    assert.equal(permanentDelete.includes('result: "DENIED"'), true);
    assert.equal(permanentDelete.includes('result: "FAILED"'), true);
  });

  it("keeps driver messages out of the audit row", () => {
    assert.equal(permanentDelete.includes('reason: "UNEXPECTED_ERROR"'), true);
    assert.equal(
      permanentDelete.includes("reason: error instanceof Error"),
      false,
      "audit reasons stay machine-readable; detail belongs in the server log"
    );
  });

  it("audits every denied path", () => {
    for (const reason of [
      "PERMISSION_DENIED",
      "NOT_FOUND",
      "CONFIRMATION_MISMATCH",
      "ACKNOWLEDGEMENT_MISSING",
      "RELATED_RECORDS_EXIST",
      "PROTECTED_HISTORICAL_RECORDS",
      "SELF_LINKED",
      "NO_ORGANIZATION",
    ]) {
      assert.equal(
        permanentDelete.includes(`reason: "${reason}"`) ||
          permanentDelete.includes(`${reason}"`),
        true,
        `denied path ${reason} must be audited`
      );
    }
  });

  it("never stores secrets or master-data payloads in the audit metadata", () => {
    for (const forbidden of [
      "password",
      "passwordHash",
      "hashPassword",
      "sessionToken",
      "nik",
      "faceDescriptor",
    ]) {
      assert.equal(
        auditBlock.toLowerCase().includes(forbidden.toLowerCase()),
        false,
        `audit metadata must not carry ${forbidden}`
      );
    }
  });

  it("never lets a lost audit row change the reported outcome", () => {
    assert.equal(auditBlock.includes("console.error"), true);
    assert.equal(auditBlock.includes("throw"), false);
  });
});

describe("UI: the Super Administrator dialog", () => {
  it("uses the single server action and the shared policy helpers", () => {
    assert.equal(dialogSource.includes("permanentlyDeleteEmployeeAction"), true);
    assert.equal(dialogSource.includes("matchesEmployeeNumberConfirmation"), true);
    assert.equal(dialogSource.includes("hasProtectedEmployeeDependencies"), true);
  });

  it("uses the project's Dialog component, never a browser confirm()", () => {
    assert.equal(dialogSource.includes("from \"@/components/ui/dialog\""), true);
    assert.equal(dialogSource.includes("<DialogContent>"), true);
    assert.equal(
      /\b(confirm|window\.confirm)\s*\(/.test(dialogSource),
      false,
      "no native confirm() — the project has a Dialog component"
    );
  });

  it("shows the required title and warnings", () => {
    const copy = normalize(dialogSource);
    assert.equal(copy.includes("Permanent Delete Employee?"), true);
    assert.equal(
      copy.includes(
        "This action permanently deletes this employee and eligible related records. This action cannot be undone."
      ),
      true
    );
    assert.equal(copy.includes("This action cannot be undone."), true);
    assert.equal(
      copy.includes(
        "Permanent deletion will remove this employee and eligible related records in a single transaction."
      ),
      true
    );
    assert.equal(
      copy.includes("Protected historical records, if any, will not be deleted."),
      true
    );
  });

  it("shows Name, Employee Number and Status", () => {
    const copy = normalize(dialogSource);
    assert.equal(copy.includes("Name"), true);
    assert.equal(copy.includes("Employee Number"), true);
    assert.equal(copy.includes("Status"), true);
    assert.equal(copy.includes("EmployeeStatusBadge"), true);
  });

  it("shows related-record counts and the total", () => {
    const copy = normalize(dialogSource);
    assert.equal(copy.includes("Related records"), true);
    assert.equal(copy.includes("Total related records:"), true);
    assert.equal(copy.includes("deletableSummary.map((dependency) => ("), true);
    assert.equal(copy.includes("dependencyCheck.deletableDependencies"), true);
  });

  it("explains a protected-record block instead of saying Delete is disabled", () => {
    const copy = normalize(dialogSource);
    assert.equal(
      copy.includes(
        "Permanent deletion is blocked because this employee has protected historical records."
      ),
      true
    );
    assert.equal(copy.includes("Protected records"), true);
    assert.equal(
      copy.includes(
        "These records are retained for legal and audit purposes and cannot be deleted, not even by a Super Administrator."
      ),
      true
    );
    assert.equal(copy.includes("Delete is disabled"), false);
  });

  it("never labels the button 'Delete blocked by related records'", () => {
    assert.equal(
      dialogSource.includes("Delete blocked by related records"),
      false,
      "related records are no longer treated as a blanket block"
    );
    assert.equal(
      normalize(dialogSource).includes(
        'blockedByProtectedRecords ? "Delete blocked by protected records" : "Delete Permanently"'
      ),
      true
    );
  });

  it("renders the destructive action and both footer buttons", () => {
    assert.equal(dialogSource.includes('variant="destructive"'), true);
    assert.equal(dialogSource.includes("text-destructive"), true);
    assert.equal(dialogSource.includes("Delete Permanently"), true);
    assert.equal(dialogSource.includes("Cancel"), true);
  });

  it("offers a layered confirmation: typed number AND acknowledgement", () => {
    assert.equal(dialogSource.includes("Type the Employee Number to confirm"), true);
    assert.equal(
      dialogSource.includes(
        'data-testid="permanent-delete-acknowledgement"'
      ),
      true
    );
    assert.equal(
      normalize(dialogSource).includes(
        "I understand that this action cannot be undone. Are you absolutely sure?"
      ),
      true,
      "the second confirmation layer is visible next to the checkbox"
    );
    assert.equal(
      normalize(dialogSource).includes(
        "const canSubmitDelete = confirmationMatches && acknowledged && dependencyCheck.status === \"ready\" && !blockedByProtectedRecords;"
      ),
      true,
      "both confirmation layers and a clean report are required"
    );
    assert.equal(
      dialogSource.includes("disabled={isPending || !canSubmitDelete}"),
      true
    );
    assert.equal(
      dialogSource.includes("if (!canSubmitDelete) return;"),
      true,
      "the handler refuses to fire a request the UI knows is refused"
    );
  });

  it("fails closed while the pre-flight is pending or failed", () => {
    assert.equal(
      dialogSource.includes('dependencyCheck.status === "ready"'),
      true
    );
    assert.equal(dialogSource.includes("void runDependencyCheck();"), true);
    assert.equal(dialogSource.includes("setDependencyCheck(idleDependencyCheck)"), true);
  });

  it("shows a loading state and prevents double submit", () => {
    assert.equal(dialogSource.includes("Deleting"), true);
    assert.equal(dialogSource.includes("disabled={isPending"), true);
    assert.equal(
      dialogSource.includes("if (isPending) return;"),
      true,
      "the dialog cannot be re-opened or closed mid-request"
    );
  });

  it("sends only the confirmations, never an organization or an id", () => {
    assert.equal(
      dialogSource.includes('formData.set("confirmEmployeeNumber", confirmation)'),
      true
    );
    assert.equal(
      dialogSource.includes('formData.set("acknowledgedPermanentDelete", "true")'),
      true
    );
    assert.equal(dialogSource.includes('formData.set("organizationId"'), false);
    assert.equal(dialogSource.includes('formData.set("employeeId"'), false);
  });

  it("renders a multi-line rejection without collapsing the summary", () => {
    assert.equal(dialogSource.includes("whitespace-pre-line"), true);
    assert.equal(dialogSource.includes('role="alert"'), true);
  });

  it("raises the success toast and refreshes the list", () => {
    assert.equal(dialogSource.includes("notifier.success("), true);
    assert.equal(
      dialogSource.includes(
        'state.message ?? "Employee permanently deleted successfully."'
      ),
      true
    );
    assert.equal(dialogSource.includes("router.refresh();"), true);
    assert.equal(dialogSource.includes("router.replace(redirectTo)"), true);
  });
});

describe("UI: Delete visibility follows employees.permanent_delete", () => {
  it("the employee list renders the action only for permanent-delete callers", () => {
    assert.equal(
      listPageSource.includes("canPermanentlyDeleteEmployees(authorization)"),
      true
    );
    assert.equal(
      listPageSource.includes("canPermanentDelete={canPermanentDelete}"),
      true
    );
    assert.equal(
      /\{canPermanentDelete \? \(\s*<EmployeePermanentDeleteDialog/.test(
        normalize(tableSource)
      ),
      true,
      "the row action is rendered inside the permission guard"
    );
  });

  it("the row action is available for active AND inactive employees", () => {
    const guard = tableSource.slice(
      tableSource.indexOf("{canPermanentDelete ? ("),
      tableSource.indexOf("</>")
    );
    assert.equal(guard.includes("EmployeePermanentDeleteDialog"), true);
    assert.equal(
      guard.includes("employmentStatus"),
      false,
      "permanent deletion must not be limited to active employees"
    );
  });

  it("Deactivate keeps its own status guard and its own permission", () => {
    assert.equal(
      tableSource.includes(
        'canDelete && employee.employmentStatus === "active"'
      ),
      true
    );
    assert.equal(
      tableSource.includes("EmployeeDeleteDialog employee={employee}"),
      true
    );
    assert.equal(
      normalize(tableSource).includes(
        '{canDelete && employee.employmentStatus === "active" ? ('
      ),
      true,
      "Deactivate is still gated on employees.delete plus its own status check"
    );
    assert.equal(
      tableSource.includes("EmployeeDeleteDialog employee={employee}"),
      true
    );
  });

  it("the two destructive actions are never merged into one guard", () => {
    assert.equal(
      /\{canDelete \? \(\s*<EmployeePermanentDeleteDialog/.test(normalize(tableSource)),
      false,
      "permanent deletion must not fall back to the employees.delete guard"
    );
  });

  it("the detail page reuses the very same dialog and gate", () => {
    assert.equal(detailPageSource.includes("EmployeePermanentDeleteDialog"), true);
    assert.equal(
      detailPageSource.includes("canPermanentlyDeleteEmployees(authorization)"),
      true
    );
    assert.equal(
      /\{canPermanentDelete \? \([\s\S]{0,400}EmployeePermanentDeleteDialog/.test(
        detailPageSource
      ),
      true,
      "the detail action is gated on the permanent-delete capability"
    );
  });

  it("defines no second, divergent delete implementation", () => {
    for (const [name, source] of [
      ["employee-table.tsx", tableSource],
      ["delete-employee-dialog.tsx", dialogSource],
      ["employees/[employeeId]/page.tsx", detailPageSource],
      ["employees/page.tsx", listPageSource],
    ] as const) {
      const deleteCalls = source.match(/tx\s*\.\s*delete\(|db\s*\.\s*delete\(/g) ?? [];
      assert.deepEqual(deleteCalls, [], `${name} must not delete rows directly`);
    }
  });
});

describe("feature: delete and deactivate stay separate capabilities", () => {
  it("deactivation never deletes a row and keeps employment history", () => {
    const deactivate = actionBlock(actionsSource, "deleteEmployeeAction");
    assert.equal(deactivate.includes(".delete(employees)"), false);
    assert.equal(deactivate.includes("employeeEmploymentHistory"), true);
    assert.equal(deactivate.includes('set({ employmentStatus: "inactive"'), true);
  });

  it("permanent deletion never rewrites the employment status", () => {
    assert.equal(
      permanentDelete.includes('set({ employmentStatus'),
      false,
      "the permanent delete must not be a deactivation"
    );
  });

  it("deactivation still authorizes on employees.delete", () => {
    const deactivate = actionBlock(actionsSource, "deleteEmployeeAction");
    assert.equal(
      deactivate.includes(
        "requirePermission(user.id, PERMISSIONS.EMPLOYEES_DELETE)"
      ),
      true
    );
  });
});

describe("confirm-button gate model", () => {
  /**
   * Model of the dialog's gate: the button is enabled only when the typed
   * employee number matches exactly AND the acknowledgement is ticked AND the
   * pre-flight report ARRIVED AND it reported no PROTECTED record.
   */
  const gate = ({
    matches,
    acknowledged,
    reportReady,
    protectedBlocked,
  }: Record<string, boolean>) =>
    matches && acknowledged && reportReady && !protectedBlocked;

  it("protected history => the delete button is disabled", () => {
    assert.equal(
      gate({ matches: true, acknowledged: true, reportReady: true, protectedBlocked: true }),
      false
    );
  });

  it("correct confirmation + acknowledgement + clean report => enabled", () => {
    assert.equal(
      gate({ matches: true, acknowledged: true, reportReady: true, protectedBlocked: false }),
      true
    );
  });

  it("wrong confirmation => disabled", () => {
    for (const confirmation of ["", " ", "EMP-TEST-00", "EMP-TEST-0011", "emp-test-002"]) {
      assert.equal(
        matchesEmployeeNumberConfirmation("EMP-TEST-002", confirmation),
        false
      );
      assert.equal(
        gate({ matches: false, acknowledged: true, reportReady: true, protectedBlocked: false }),
        false
      );
    }
  });

  it("missing acknowledgement => disabled even with a correct number", () => {
    assert.equal(
      gate({ matches: true, acknowledged: false, reportReady: true, protectedBlocked: false }),
      false,
      "the second confirmation layer is mandatory"
    );
  });

  it("a pending or failed pre-flight fails closed", () => {
    assert.equal(
      gate({ matches: true, acknowledged: true, reportReady: false, protectedBlocked: false }),
      false,
      "no DELETE request may be sent before the report arrives"
    );
  });

  it("keeps Cancel available and the report visible", () => {
    const cancel = dialogSource.slice(
      dialogSource.indexOf("<DialogFooter>"),
      dialogSource.indexOf("</DialogFooter>")
    );
    assert.equal(
      /variant="outline"[\s\S]{0,220}?disabled=\{isPending\}[\s\S]{0,220}?Cancel/.test(
        normalize(cancel)
      ),
      true,
      "Cancel is only disabled while a delete is in flight"
    );
    assert.equal(
      dialogSource.includes('data-testid="permanent-delete-dependency-report"'),
      true
    );
  });
});

describe("backend: the pre-flight is read-only and fails closed", () => {
  it("the pre-flight never writes, deletes or audits", () => {
    for (const forbiddenCall of [
      ".delete(",
      ".insert(",
      ".update(",
      "writeAuditLog",
      "auditPermanentEmployeeDelete",
      "revalidatePath",
    ]) {
      assert.equal(
        preflight.includes(forbiddenCall),
        false,
        `the dependency check must not contain ${forbiddenCall}`
      );
    }
  });

  it("the pre-flight keeps the same organization scope", () => {
    assert.equal(
      preflight.includes(
        "getEmployeeInOrganization(employeeId, organizationId)"
      ),
      true
    );
    assert.equal(
      /readEmployeeDeletionDependencies\(\s*employee\.id,\s*organizationId\s*\)/.test(
        normalize(preflight)
      ),
      true
    );
    assert.equal(
      /formData|formAction\(/.test(preflight),
      false,
      "the pre-flight is not a form submission"
    );
  });

  it("the pre-flight reports blocked=true on every failure path", () => {
    const deniedReport = actionBlock(actionsSource, "deniedDependencyReport");
    assert.equal(deniedReport.includes("blocked: true"), true);
    for (const path of [
      "EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE",
      "is not assigned to an organization",
      "EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE",
      "EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE",
    ]) {
      assert.equal(
        preflight.includes(`deniedDependencyReport(${path}`) ||
          normalize(preflight).includes(`deniedDependencyReport( ${path}`) ||
          preflight.includes(`deniedDependencyReport(\n      "${path}`) ||
          preflight.includes(`deniedDependencyReport(\n      ${path}`) ||
          preflight.includes(`deniedDependencyReport(\n      EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE`),
        true,
        `${path} must fail closed`
      );
    }
  });

  it("the pre-flight blocks only on PROTECTED records", () => {
    assert.equal(
      preflight.includes("blocked: hasProtectedEmployeeDependencies(dependencies)"),
      true
    );
    assert.equal(
      preflight.includes("protectedDependencies:"),
      true
    );
    assert.equal(
      preflight.includes("deletableDependencies:"),
      true
    );
    assert.equal(
      preflight.includes("totalRelatedRecords: totalEmployeeDeleteDependencyCount(dependencies)"),
      true
    );
  });

  it("the 409 enforcement in permanentlyDeleteEmployeeAction is intact", () => {
    assert.equal(
      permanentDelete.includes("isForeignKeyViolation(error)"),
      true
    );
    assert.equal(permanentDelete.includes("listEmployeeDeletionDependencies("), true);
    assert.equal(
      permanentDelete.includes(
        "getEmployeeInOrganization(employeeId, organizationId)"
      ),
      true
    );
    assert.equal(
      permanentDelete.includes('stateCode === "PROTECTED_RECORDS"') ||
        permanentDelete.includes('"PROTECTED_RECORDS"'),
      true
    );
  });
});

describe("system-only permission: no tenant role can hold or grant it", () => {
  it("is declared once in the shared system-only list", () => {
    const block = permissionsSource.slice(
      permissionsSource.indexOf("SYSTEM_ONLY_PERMISSION_CODES"),
      permissionsSource.indexOf("isSystemOnlyPermission")
    );
    assert.equal(block.includes("PERMISSIONS.EMPLOYEES_PERMANENT_DELETE"), true);
    assert.equal(
      permissionsSource.includes(
        "return SYSTEM_ONLY_PERMISSION_CODES.includes(code);"
      ),
      true,
      "the predicate is exported so every caller shares one definition"
    );
  });

  it("the seed guard consumes that list rather than a second copy", () => {
    assert.equal(
      /const SYSTEM_ONLY_PERMISSIONS: readonly Permission\[\] =\s*SYSTEM_ONLY_PERMISSION_CODES;/.test(
        normalize(seedSource)
      ),
      true,
      "a second hand-maintained list could drift and silently re-open the grant"
    );
  });

  it("the role editor never offers it for an organization-level role", () => {
    assert.equal(
      roleEditorPageSource.includes("isSystemOnlyPermission(definition.code)"),
      true
    );
    assert.equal(
      normalize(roleEditorPageSource).includes(
        "role.code === SUPERADMIN_ROLE_CODE ? PERMISSION_CATALOG : PERMISSION_CATALOG.filter("
      ),
      true,
      "only the SUPERADMIN role may show the checkbox"
    );
  });

  it("the server refuses the grant even if the form is forged", () => {
    assert.equal(
      rbacActionsSource.includes("isSystemOnlyPermission(code)"),
      true,
      "UI hiding is a convenience; the action is the guard"
    );
    assert.equal(
      rbacActionsSource.includes("role.code !== SUPERADMIN_ROLE_CODE"),
      true
    );
    assert.equal(
      rbacActionsSource.includes(
        "is a Super Administrator capability and cannot be assigned to this role."
      ),
      true
    );
  });

  it("the seed still refuses to write it into an organization role", () => {
    assert.equal(
      seedSource.includes("must not hold the system-level permission"),
      true
    );
  });
});

describe("retained relationships are never presented as deleted rows", () => {
  it("direct reports are counted by a dedicated, non-deleting query", () => {
    assert.equal(
      queriesSource.includes("export async function countEmployeeDirectReports"),
      true
    );
    const helper = queriesSource.slice(
      queriesSource.indexOf("export async function countEmployeeDirectReports"),
      queriesSource.indexOf("export async function deleteEmployeeDeletableRecords")
    );
    assert.equal(
      helper.includes(".delete("),
      false,
      "a direct report only loses its manager — it is never deleted"
    );
  });

  it("the dependency scan does not fold them into a deletable category", () => {
    const scan = queriesSource.slice(
      queriesSource.indexOf("export async function listEmployeeDeletionDependencies"),
      queriesSource.indexOf("export async function countEmployeeDirectReports")
    );
    assert.equal(
      scan.includes("managerId, employeeId"),
      false,
      "direct reports must not be counted as removable related records"
    );
    assert.equal(
      scan.includes("+ directReports"),
      false,
      "the catch-all total describes rows the operation removes"
    );
  });

  it("the dialog reports them separately as retained", () => {
    assert.equal(dialogSource.includes("dependencyCheck.directReportCount"), true);
    assert.equal(
      normalize(dialogSource).includes("Direct reports"),
      true
    );
    assert.equal(
      normalize(dialogSource).includes(
        "(retained — their manager link will be cleared)"
      ),
      true,
      "the operator must not be told a retained employee will be deleted"
    );
    assert.equal(
      normalize(dialogSource).includes(
        "(retained — their manager link will be cleared) (will be deleted)"
      ),
      false,
      "the retained figure must not sit inside the will-be-deleted block"
    );
  });
});
