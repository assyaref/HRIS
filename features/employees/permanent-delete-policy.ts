/**
 * Permanent employee deletion policy (manual, operator-confirmed).
 *
 * PURE decision logic with no database or framework dependencies, mirroring
 * `delete-policy.ts`: the server action enforces these rules, the dialog
 * renders them, and the tests exercise them without a database.
 *
 * Two distinct lifecycles exist and neither replaces the other:
 * - DEACTIVATE (`deleteEmployeeAction`): `employment_status → inactive`,
 *   reversible, keeps the employee row and every dependent record.
 * - PERMANENT DELETE (`permanentlyDeleteEmployeeAction`): removes the
 *   `employees` row together with the related records that are DELETABLE
 *   (see below). Reserved for the system-level SUPERADMIN role.
 *
 * RELATED RECORDS ARE CLASSIFIED, NOT DELETED BLINDLY
 * ---------------------------------------------------
 * Every employee-scoped foreign key in production is `RESTRICT`/`SET NULL`,
 * never `CASCADE` (migration 0017; migration 0022 later moved the PROTECTED
 * tables to `SET NULL` so their rows are retained, never removed). That is
 * what makes this classification enforceable rather than advisory: a category
 * marked PROTECTED is never issued a DELETE by this flow, and a category
 * marked DELETABLE is removed only through the explicit, table-by-table plan
 * — PostgreSQL, not this module and not a Super Administrator, keeps the
 * final word on referential integrity.
 *
 * - PROTECTED: historical/compliance records. Attendance, leave and permission
 *   absences are the employer's time record; payroll and payslips are the
 *   financial record; employment history is the legal employment timeline.
 *   These are retention-bound, so they are never removed by this flow — not
 *   even by a Super Administrator. Under the approved detach schema they are
 *   RETAINED with immutable identity snapshots and their employee reference
 *   is atomically cleared when the employee row is deleted (migration 0022).
 * - DELETABLE: profile data that belongs to the person and has no meaning once
 *   the person is gone. Documents, face-ID enrollments/templates, project
 *   assignments, and the master-data rows (addresses, insurance, bank
 *   accounts, family/dependents, education, custom field values) plus
 *   announcement delivery rows. These are deleted explicitly, one statement
 *   per table, inside the same transaction as the employee row — never through
 *   a blanket `ON DELETE CASCADE`.
 *
 * REVISED POLICY (Super Administrator override + retention-compatible schema):
 * -----------------------------------------------------------------------
 * `evaluatePermanentEmployeeDeletion` accepts `superAdminOverride`, set ONLY by
 * the server action from the database-backed RBAC gate
 * (`canPermanentlyDeleteEmployees`: the system-level SUPERADMIN role AND the
 * system-only `employees.permanent_delete` code). With the override, protected
 * records no longer fail the APPLICATION-level eligibility decision: the
 * decision is `allowed` and carries the retained categories so the dialog and
 * the audit can describe them. Without the override the protected-record
 * refusal is unchanged.
 *
 * COMPLETING the deletion while protected records exist is the job of the
 * approved retention-detach schema (migration 0022,
 * docs/employee-permanent-delete-0022-detach-design.md): the deletion
 * transaction first freezes the employee's identity onto every retained row
 * (filling NULL snapshots only — creation-time snapshots such as the payslip
 * PDF password contract are never overwritten), then removes the employee
 * row, at which point the protected tables' `ON DELETE SET NULL` foreign keys
 * atomically detach the retained rows. A `<table>_retained_identity_check`
 * CHECK guarantees a detached row always carries its identity, so the DELETE
 * fails closed rather than detaching an anonymous row.
 *
 * The override never deletes protected records. Where migration 0022 has NOT
 * been applied the same attempt fails closed: the pre-0022 `RESTRICT`
 * foreign keys reject the employee `DELETE` (23503), the transaction rolls
 * back, and the server reports the retained-completion error. PostgreSQL —
 * not this module and not a Super Administrator — keeps the final word on
 * referential integrity in BOTH states.
 *
 * A linked login account is deliberately *not* a dependency: the link lives on
 * `employees.user_id`, so it is removed with the row and only the account's own
 * audit trail should outlive the person.
 *
 * Two invariants are deliberate:
 * - No employee number is special-cased. `EMP-TEST-*` records (and any other
 *   identifier) are deletable only through this same generic path.
 * - The confirmation is compared against the employee number loaded from the
 *   database inside the caller's organization, never against a value supplied
 *   by the browser.
 */

export const EMPLOYEE_PERMANENT_DELETE_NOT_FOUND_MESSAGE =
  "Employee not found.";

export const EMPLOYEE_PERMANENT_DELETE_FORBIDDEN_MESSAGE =
  "You do not have permission to permanently delete employees.";

export const EMPLOYEE_PERMANENT_DELETE_CONFIRMATION_MESSAGE =
  "Employee number confirmation does not match.";

export const EMPLOYEE_PERMANENT_DELETE_ACKNOWLEDGEMENT_MESSAGE =
  "You must confirm that this action cannot be undone.";

export const EMPLOYEE_PERMANENT_DELETE_PROTECTED_MESSAGE =
  "Employee cannot be permanently deleted because protected historical records exist.";

export const EMPLOYEE_PERMANENT_DELETE_RETAINED_COMPLETION_MESSAGE =
  "Permanent deletion cannot be completed because protected historical records must be retained.";

export const EMPLOYEE_PERMANENT_DELETE_RETAINED_COMPLETION_EXPLANATION =
  "The Super Administrator override removed the application-level block, but the database still enforces the retention of these records (ON DELETE RESTRICT, NOT NULL employee references). Nothing was deleted.";

export const EMPLOYEE_PERMANENT_DELETE_RETAINED_PREREQUISITES =
  "To complete this deletion, obtain the retention-policy approval and the required database change for the retained categories, or deactivate/archive this employee instead.";

export const EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_MESSAGE =
  "Employee cannot be permanently deleted because related records still exist.";

export const EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE =
  "Permanent deletion failed. No data was deleted.";

export const EMPLOYEE_PERMANENT_DELETE_ADVICE =
  "Please deactivate/archive this employee instead.";

/**
 * Dependency categories, in display order.
 *
 * The labels are the operator-facing vocabulary of the confirmation dialog and
 * the rejection message.
 */
export const EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS = [
  "Attendance",
  "Leave",
  "Permission",
  "Payroll",
  "Payslip",
  "Documents",
  "Employment history",
  "Face ID",
  "Projects",
  "Other related records",
] as const;

export type EmployeeDeleteDependencyLabel =
  (typeof EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS)[number];

/**
 * Retention-bound categories. A non-zero count in any of these makes the
 * permanent deletion impossible — see the module comment for why.
 */
export const EMPLOYEE_PROTECTED_DEPENDENCY_LABELS = [
  "Attendance",
  "Leave",
  "Permission",
  "Payroll",
  "Payslip",
  "Employment history",
] as const satisfies readonly EmployeeDeleteDependencyLabel[];

/**
 * Categories that are removed explicitly, in the same transaction as the
 * employee row.
 */
export const EMPLOYEE_DELETABLE_DEPENDENCY_LABELS = [
  "Documents",
  "Face ID",
  "Projects",
  "Other related records",
] as const satisfies readonly EmployeeDeleteDependencyLabel[];

export type EmployeeDeleteDependencyDisposition = "protected" | "deletable";

const PROTECTED_LABEL_SET: ReadonlySet<string> = new Set(
  EMPLOYEE_PROTECTED_DEPENDENCY_LABELS
);
const DELETABLE_LABEL_SET: ReadonlySet<string> = new Set(
  EMPLOYEE_DELETABLE_DEPENDENCY_LABELS
);

/**
 * The classification a category carries. Exported so the action can assert
 * that its explicit delete plan and this decision layer cannot drift apart.
 */
export function employeeDeleteDependencyDisposition(
  label: EmployeeDeleteDependencyLabel
): EmployeeDeleteDependencyDisposition {
  if (PROTECTED_LABEL_SET.has(label)) return "protected";
  if (DELETABLE_LABEL_SET.has(label)) return "deletable";
  // Fail closed: an unclassified label is treated as protected so a newly added
  // category can never become implicitly deletable by omission.
  return "protected";
}

export interface EmployeeDeleteDependency {
  label: EmployeeDeleteDependencyLabel;
  count: number;
  disposition: EmployeeDeleteDependencyDisposition;
}

/** Dependents currently present for an employee (zero counts may be dropped). */
export function presentEmployeeDeleteDependencies(
  dependencies: readonly EmployeeDeleteDependency[]
): EmployeeDeleteDependency[] {
  return EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_LABELS.map((label) => {
    const match = dependencies.find((dependency) => dependency.label === label);
    return {
      label,
      count: match?.count ?? 0,
      disposition:
        match?.disposition ?? employeeDeleteDependencyDisposition(label),
    };
  }).filter((dependency) => dependency.count > 0);
}

/** Present dependents, narrowed to one disposition, display order preserved. */
export function presentEmployeeDependenciesByDisposition(
  dependencies: readonly EmployeeDeleteDependency[],
  disposition: EmployeeDeleteDependencyDisposition
): EmployeeDeleteDependency[] {
  return presentEmployeeDeleteDependencies(dependencies).filter(
    (dependency) => dependency.disposition === disposition
  );
}

/** Whether any dependent/historical record still references the employee. */
export function hasEmployeeDeleteDependencies(
  dependencies: readonly EmployeeDeleteDependency[]
): boolean {
  return dependencies.some((dependency) => dependency.count > 0);
}

/** Whether any PROTECTED (retention-bound) record still references the employee. */
export function hasProtectedEmployeeDependencies(
  dependencies: readonly EmployeeDeleteDependency[]
): boolean {
  return presentEmployeeDependenciesByDisposition(
    dependencies,
    "protected"
  ).length > 0;
}

/** Total number of related records across every category. */
export function totalEmployeeDeleteDependencyCount(
  dependencies: readonly EmployeeDeleteDependency[]
): number {
  return dependencies.reduce((total, dependency) => total + dependency.count, 0);
}

/**
 * Exact employee-number confirmation.
 *
 * Surrounding whitespace is ignored (pasted values), case is significant
 * (employee numbers are identifiers, not prose), and a missing value never
 * matches.
 */
export function matchesEmployeeNumberConfirmation(
  employeeNumber: string,
  confirmation: unknown
): boolean {
  if (typeof confirmation !== "string") return false;
  if (employeeNumber.trim() === "") return false;
  return confirmation.trim() === employeeNumber.trim();
}

function formatDependencyLines(
  dependencies: readonly EmployeeDeleteDependency[]
): string[] {
  return presentEmployeeDeleteDependencies(dependencies).map(
    (dependency) => `${dependency.label}: ${dependency.count}`
  );
}

/**
 * Human-readable rejection for an employee whose PROTECTED history blocks the
 * permanent deletion:
 *
 *   Employee cannot be permanently deleted because protected historical records exist.
 *
 *   Cannot delete employee 03233.
 *
 *   Protected records:
 *   Payroll: 3
 *   Attendance: 10
 *
 *   Please deactivate/archive this employee instead.
 */
export function buildPermanentDeleteProtectedMessage(
  employeeNumber: string,
  dependencies: readonly EmployeeDeleteDependency[]
): string {
  const protectedDependencies = presentEmployeeDependenciesByDisposition(
    dependencies,
    "protected"
  );
  const lines = protectedDependencies.map(
    (dependency) => `${dependency.label}: ${dependency.count}`
  );
  return [
    EMPLOYEE_PERMANENT_DELETE_PROTECTED_MESSAGE,
    "",
    `Cannot delete employee ${employeeNumber}.`,
    "",
    "Protected records:",
    ...(lines.length > 0 ? lines : ["Other related records: 0"]),
    "",
    EMPLOYEE_PERMANENT_DELETE_ADVICE,
  ].join("\n");
}

/**
 * Human-readable refusal returned when a Super Administrator's override
 * attempt cannot SAFELY COMPLETE because protected records are retained and
 * the database refused to remove the employee row. This is the COMPATIBILITY
 * FALLBACK for databases where the retention-detach schema (migration 0022)
 * has not been applied; where it has, the deletion completes and the retained
 * records are reported on the success path instead:
 *
 *   Permanent deletion cannot be completed because protected historical records must be retained.
 *
 *   Cannot delete employee 03233 while its protected records are retained.
 *
 *   Retained records:
 *   Employment history: 3
 *
 *   The Super Administrator override removed the application-level block, but
 *   the database still enforces the retention of these records (ON DELETE RESTRICT, NOT NULL employee references). Nothing was deleted.
 *
 *   To complete this deletion, obtain the retention-policy approval ...
 */
export function buildPermanentDeleteRetainedCompletionMessage(
  employeeNumber: string,
  dependencies: readonly EmployeeDeleteDependency[]
): string {
  const retained = presentEmployeeDependenciesByDisposition(
    dependencies,
    "protected"
  );
  const lines = retained.map(
    (dependency) => `${dependency.label}: ${dependency.count}`
  );
  return [
    EMPLOYEE_PERMANENT_DELETE_RETAINED_COMPLETION_MESSAGE,
    "",
    `Cannot delete employee ${employeeNumber} while its protected records are retained.`,
    "",
    "Retained records:",
    ...(lines.length > 0 ? lines : ["Other related records: 0"]),
    "",
    EMPLOYEE_PERMANENT_DELETE_RETAINED_COMPLETION_EXPLANATION,
    "",
    EMPLOYEE_PERMANENT_DELETE_RETAINED_PREREQUISITES,
  ].join("\n");
}

/**
 * Human-readable rejection for an employee that still holds dependents of any
 * classification. Retained as the generic/fallback formatter so an unexpected
 * shape still produces the operator guidance in the runbook.
 *
 *   Employee cannot be permanently deleted because related records still exist.
 *
 *   Cannot delete employee 03233.
 *
 *   Related records exist:
 *   Attendance: 10
 *   Payroll: 3
 *
 *   Please deactivate/archive this employee instead.
 */
export function buildPermanentDeleteDependencyMessage(
  employeeNumber: string,
  dependencies: readonly EmployeeDeleteDependency[]
): string {
  const lines = formatDependencyLines(dependencies);
  return [
    EMPLOYEE_PERMANENT_DELETE_DEPENDENCY_MESSAGE,
    "",
    `Cannot delete employee ${employeeNumber}.`,
    "",
    "Related records exist:",
    ...(lines.length > 0 ? lines : ["Other related records: 0"]),
    "",
    EMPLOYEE_PERMANENT_DELETE_ADVICE,
  ].join("\n");
}

export const EMPLOYEE_PERMANENT_DELETE_SELF_LINKED_MESSAGE =
  "You cannot permanently delete the employee record linked to your own account.";

/** The permission code required for permanent deletion (from the catalog). */
export const EMPLOYEE_PERMANENT_DELETE_PERMISSION =
  "employees.permanent_delete" as const;

/**
 * The minimal authorization shape the permanent-delete gate needs.
 *
 * Structurally satisfied by `UserAuthorization` from `lib/auth/rbac`, so this
 * gate is decided by the SAME database-backed authorization the rest of the
 * application uses — there is no second source of truth and no role-name
 * matching anywhere.
 */
export interface PermanentDeleteAuthorization {
  /** Whether the user holds the system-level SUPERADMIN role. */
  isSuperAdmin: boolean;
  /** Effective permission codes (the full catalog for a SUPERADMIN). */
  permissionCodes: readonly string[];
}

/**
 * Whether an actor may permanently delete employees.
 *
 * TWO independent conditions, both required:
 * 1. the explicit `employees.permanent_delete` capability code, and
 * 2. the system-level SUPERADMIN role.
 *
 * Condition (2) is deliberately redundant. Condition (1) is what makes the
 * capability expressible, assignable and auditable in the permission matrix.
 * Condition (2) is the structural guarantee that an ORGANIZATION-level role —
 * which can otherwise create custom roles and grant them permissions — can
 * never reach permanent deletion, even if the code were ever granted to a
 * tenant role. It mirrors the existing `organizations.*` SUPERADMIN-only
 * permissions, and `scripts/seed-rbac.mts` refuses to write the grant into any
 * organization-level role.
 *
 * A Super Administrator satisfies both automatically: `getUserAuthorization`
 * returns the full catalog and `isSuperAdmin: true` for that role.
 */
export function canPermanentlyDeleteEmployees(
  authorization: PermanentDeleteAuthorization
): boolean {
  return (
    authorization.isSuperAdmin &&
    authorization.permissionCodes.includes(EMPLOYEE_PERMANENT_DELETE_PERMISSION)
  );
}

export interface EmployeePermanentDeleteScopeInput {
  /**
   * The organization that owns the employee record, read from the database.
   * AUTHORITATIVE: never taken from the browser.
   */
  employeeOrganizationId: string;
  /** The authenticated user's own organization (from the session). */
  userOrganizationId: string | null;
  /** Whether the caller holds the system-level SUPERADMIN role. */
  isSuperAdmin: boolean;
  /**
   * The organization context the operation was initiated from (the listing's
   * selected tenant, or the validated `org` of the detail URL). Only ever a
   * consistency assertion: it can never widen access and is never used as a
   * lookup key.
   */
  requestedOrganizationId?: string | null;
}

export interface EmployeePermanentDeleteScope {
  /** The owning organization whose data may be permanently deleted. */
  organizationId: string;
  /** True only when a SUPERADMIN is operating on another tenant's record. */
  viewingOtherOrganization: boolean;
}

/**
 * Resolve whether the actor may permanently delete ONE employee, and in which
 * organization scope.
 *
 * The employee's OWNING organization (read from the record, not the browser)
 * is authoritative. Returns `null` when:
 *  - the actor is not the system-level SUPERADMIN (tenant roles can never
 *    permanently delete, regardless of any URL or form they submit);
 *  - the session has no organization;
 *  - the employee record carries no organization;
 *  - an explicit organization context was supplied that does NOT match the
 *    record's owner (an inconsistent context is refused, never followed).
 *
 * This is the scope half of `canPermanentlyDeleteEmployees`: that gate decides
 * whether the actor may permanently delete at all, this decides on which
 * tenant's record. Both are evaluated from server-side facts only.
 */
export function resolveEmployeePermanentDeleteScope(
  input: EmployeePermanentDeleteScopeInput
): EmployeePermanentDeleteScope | null {
  if (!input.isSuperAdmin) return null;
  if (!input.userOrganizationId) return null;
  const owning = input.employeeOrganizationId;
  if (!owning) return null;

  const requested = input.requestedOrganizationId?.trim();
  if (requested && requested !== owning) return null;

  return {
    organizationId: owning,
    viewingOtherOrganization: owning !== input.userOrganizationId,
  };
}

export type PermanentEmployeeDeleteDecision =
  | {
      allowed: true;
      /** Deletable categories with a non-zero count, in delete-plan order. */
      willDelete: EmployeeDeleteDependency[];
      /**
       * Protected categories with a non-zero count. Present only under the
       * Super Administrator override: they are RETAINED (never deleted), and
       * the database's `RESTRICT` foreign keys keep refusing to remove the
       * employee row while they exist.
       */
      retained: EmployeeDeleteDependency[];
    }
  | {
      allowed: false;
      code: "SELF_LINKED";
      message: string;
    }
  | {
      allowed: false;
      code: "PROTECTED_RECORDS";
      message: string;
      dependencies: EmployeeDeleteDependency[];
    };

export interface PermanentEmployeeDeleteInput {
  /** The authenticated actor running the deletion. */
  actorUserId: string;
  /** Employee number as stored in the database (org-scoped load). */
  employeeNumber: string;
  /** Linked user account, if any (employees.user_id). */
  linkedUserId: string | null;
  /** Dependents counted inside the deletion transaction. */
  dependencies: readonly EmployeeDeleteDependency[];
  /**
   * Whether the actor may override the protected-record blocker at the
   * APPLICATION level (revised HRIS deletion policy).
   *
   * Set ONLY by the server action from the database-backed RBAC gate
   * (`canPermanentlyDeleteEmployees`), never from the browser. Optional and
   * FAIL-CLOSED: without it the protected-record refusal is unchanged, so
   * every other caller keeps the historical behavior.
   */
  superAdminOverride?: boolean;
}

/**
 * Decide whether a permanent employee deletion may be attempted.
 *
 * Runs INSIDE the deletion transaction so the dependency counts describe the
 * same snapshot the DELETE acts on. The database `RESTRICT` foreign keys stay
 * the final authority: a racing insert that appears after the counts are taken
 * makes the DELETE fail and the transaction roll back.
 *
 * Revised policy: with `superAdminOverride` the protected-record blocker is
 * removed from this eligibility decision — the attempt proceeds and the
 * retained categories are reported so the UI and the audit can explain them.
 * The self-linked guard always wins, for every actor.
 */
export function evaluatePermanentEmployeeDeletion(
  input: PermanentEmployeeDeleteInput
): PermanentEmployeeDeleteDecision {
  if (input.linkedUserId === input.actorUserId) {
    return {
      allowed: false,
      code: "SELF_LINKED",
      message: EMPLOYEE_PERMANENT_DELETE_SELF_LINKED_MESSAGE,
    };
  }

  const protectedPresent = presentEmployeeDependenciesByDisposition(
    input.dependencies,
    "protected"
  );

  if (protectedPresent.length > 0 && !input.superAdminOverride) {
    return {
      allowed: false,
      code: "PROTECTED_RECORDS",
      message: buildPermanentDeleteProtectedMessage(
        input.employeeNumber,
        input.dependencies
      ),
      dependencies: protectedPresent,
    };
  }

  return {
    allowed: true,
    willDelete: presentEmployeeDependenciesByDisposition(
      input.dependencies,
      "deletable"
    ),
    retained: protectedPresent,
  };
}