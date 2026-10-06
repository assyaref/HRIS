import "server-only";

import {
  and,
  asc,
  eq,
  ilike,
  isNotNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";

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
  organizations,
  payrollItems,
  payslipDocumentVersions,
  payslipDocuments,
  payslips,
  permissionRequests,
  users,
  workLocations,
} from "@/db/schema";
import type { EmployeeStatus } from "./constants";
import {
  EMPLOYEE_DELETABLE_DEPENDENCY_LABELS,
  EMPLOYEE_PROTECTED_DEPENDENCY_LABELS,
  employeeDeleteDependencyDisposition,
  type EmployeeDeleteDependency,
  type EmployeeDeleteDependencyLabel,
} from "./permanent-delete-policy";
import type { EmployeeListSearchInput } from "./schemas";
import type { CustomFieldFilter } from "@/features/employee-fields/filtering";

/**
 * Employee data access (Phase 5) — server-only.
 *
 * Every function is scoped to one organization. Pages and actions always
 * resolve the caller's organization from the authenticated session and pass it
 * here, so employees of another organization can never be listed, loaded or
 * written.
 */

export interface EmployeeListItem {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  employmentStatus: EmployeeStatus;
  hireDate: Date | null;
  linkedUserEmail: string | null;
  createdAt: Date;
}

export interface EmployeeDetail extends EmployeeListItem {
  organizationId: string;
  userId: string | null;
  linkedUserStatus: string | null;
  updatedAt: Date;
}

export interface LinkableUser {
  id: string;
  email: string;
  status: string;
}

export interface EmployeeListResult {
  items: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const EMPLOYEE_PAGE_SIZE = 20;

/**
 * Share the ORG-scoped search/status WHERE conditions between the paged list
 * and the (unpaginated) CSV export so the export always mirrors the filters
 * applied on the employees page (`q` + `status`, same query-parameter names).
 */
function buildEmployeeSearchConditions(
  organizationId: string,
  input: EmployeeListSearchInput,
  customFilters: readonly CustomFieldFilter[] = []
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [
    eq(employees.organizationId, organizationId),
  ];

  const search = input.q?.trim();
  if (search) {
    const pattern = `%${search}%`;
    const searchClause = or(
      ilike(employees.employeeNumber, pattern),
      ilike(employees.firstName, pattern),
      ilike(employees.lastName, pattern),
      ilike(employees.email, pattern)
    );
    if (searchClause) {
      conditions.push(searchClause);
    }
  }

  if (input.status) {
    conditions.push(eq(employees.employmentStatus, input.status));
  }

  conditions.push(...buildCustomFieldFilterConditions(organizationId, customFilters));
  return conditions;
}

/** Escape ILIKE metacharacters so user text is matched literally. */
function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Dynamic custom-field filter predicates (Employee Master Data 2.0).
 *
 * Each filter becomes a correlated, fully parameterized EXISTS subquery on
 * `employee_custom_field_values` pinned to (organization, field definition) —
 * so the database does the filtering (never the browser, never an in-memory
 * scan of the employee table), a value from another tenant can never match,
 * and multiple filters combine with AND. Matching rules are chosen purely by
 * the field TYPE; field names are never inspected.
 */
export function buildCustomFieldFilterConditions(
  organizationId: string,
  filters: readonly CustomFieldFilter[]
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  for (const filter of filters) {
    const valueColumn = employeeCustomFieldValues;
    const shared = [
      eq(valueColumn.organizationId, organizationId),
      eq(valueColumn.employeeId, employees.id),
      eq(valueColumn.fieldDefinitionId, filter.spec.fieldDefinitionId),
    ];

    let predicate: SQL<unknown>;
    switch (filter.predicate.kind) {
      case "contains": {
        predicate = and(
          ...shared,
          sql`${valueColumn.valueText} ILIKE ${`%${escapeIlike(filter.predicate.value)}%`}`
        )!;
        break;
      }
      case "numberEq": {
        predicate = and(
          ...shared,
          sql`${valueColumn.valueNumber} = ${String(filter.predicate.value)}::numeric`
        )!;
        break;
      }
      case "booleanEq": {
        predicate = and(
          ...shared,
          eq(valueColumn.valueBoolean, filter.predicate.value)
        )!;
        break;
      }
      case "dateEq": {
        // Date-only custom values are stored as UTC midnight (see
        // parseCustomFieldValue); compare the UTC calendar day so the result
        // is independent of the database session timezone.
        predicate = and(
          ...shared,
          sql`(${valueColumn.valueDate} AT TIME ZONE 'UTC')::date = ${filter.predicate.value}::date`
        )!;
        break;
      }
      case "datetimeEq": {
        // Compare UTC wall-clock minute; parameter is `YYYY-MM-DDTHH:mm:ss.sssZ`
        // from the parser. `date_trunc` avoids false mismatches on seconds/ms.
        predicate = and(
          ...shared,
          sql`date_trunc('minute', ${valueColumn.valueDate} AT TIME ZONE 'UTC') = date_trunc('minute', ${filter.predicate.value}::timestamptz)`
        )!;
        break;
      }
      case "datetimeDay": {
        predicate = and(
          ...shared,
          sql`(${valueColumn.valueDate} AT TIME ZONE 'UTC')::date = ${filter.predicate.value}::date`
        )!;
        break;
      }
      case "optionAny": {
        // select/radio/multiselect values are stored as a JSONB option array;
        // `@>` keeps the lookup index-friendly and parameterized.
        predicate = and(
          ...shared,
          sql`${valueColumn.valueJson} @> ${JSON.stringify([filter.predicate.value])}::jsonb`
        )!;
        break;
      }
      default: {
        const _exhaustive: never = filter.predicate;
        void _exhaustive;
        continue;
      }
    }

    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${valueColumn} WHERE ${predicate})`
    );
  }

  return conditions;
}

/**
 * Org-scoped employee list with optional text search and status filter.
 *
 * Search matches employee number, first name, last name and (employee) email
 * via parameterized `ILIKE`. Filtering happens in the database — the browser
 * never receives the full employee table.
 */
export async function listEmployeesByOrganization(
  organizationId: string,
  input: EmployeeListSearchInput = {},
  customFilters: readonly CustomFieldFilter[] = []
): Promise<EmployeeListResult> {
  const conditions = buildEmployeeSearchConditions(
    organizationId,
    input,
    customFilters
  );

  const page = Math.max(1, input.page ?? 1);
  const offset = (page - 1) * EMPLOYEE_PAGE_SIZE;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: employees.id,
        employeeNumber: employees.employeeNumber,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        phone: employees.phone,
        department: employees.department,
        position: employees.position,
        employmentStatus: employees.employmentStatus,
        hireDate: employees.hireDate,
        linkedUserEmail: users.email,
        createdAt: employees.createdAt,
      })
      .from(employees)
      .leftJoin(users, eq(users.id, employees.userId))
      .where(and(...conditions))
      .orderBy(
        asc(employees.lastName),
        asc(employees.firstName),
        asc(employees.employeeNumber)
      )
      .limit(EMPLOYEE_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(and(...conditions)),
  ]);

  const total = countRows[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / EMPLOYEE_PAGE_SIZE));

  return {
    items: rows.map(toListItem),
    total,
    page,
    pageSize: EMPLOYEE_PAGE_SIZE,
    totalPages,
  };
}

/**
 * Every employee in one organization matching the same search/status filters
 * used by the employees page, WITHOUT pagination.
 *
 * Powers the CSV export (`app/api/employees/export/route.ts`): the download
 * represents the full filtered result set — not just the current page, and not
 * the whole organization when a filter is active.
 */
export async function listEmployeesFlatByOrganization(
  organizationId: string,
  input: EmployeeListSearchInput = {},
  customFilters: readonly CustomFieldFilter[] = []
): Promise<EmployeeListItem[]> {
  const conditions = buildEmployeeSearchConditions(
    organizationId,
    input,
    customFilters
  );

  const rows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      phone: employees.phone,
      department: employees.department,
      position: employees.position,
      employmentStatus: employees.employmentStatus,
      hireDate: employees.hireDate,
      linkedUserEmail: users.email,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .leftJoin(users, eq(users.id, employees.userId))
    .where(and(...conditions))
    .orderBy(
      asc(employees.lastName),
      asc(employees.firstName),
      asc(employees.employeeNumber)
    );

  return rows.map(toListItem);
}

/**
 * Load one employee, but only when it belongs to `organizationId`.
 * Returns `null` for unknown employees and for employees owned by another
 * organization (callers respond with forbidden so cross-org existence is
 * never revealed).
 */
export async function getEmployeeInOrganization(
  employeeId: string,
  organizationId: string
): Promise<EmployeeDetail | null> {
  const rows = await db
    .select({
      id: employees.id,
      organizationId: employees.organizationId,
      userId: employees.userId,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      phone: employees.phone,
      department: employees.department,
      position: employees.position,
      employmentStatus: employees.employmentStatus,
      hireDate: employees.hireDate,
      linkedUserEmail: users.email,
      linkedUserStatus: users.status,
      createdAt: employees.createdAt,
      updatedAt: employees.updatedAt,
    })
    .from(employees)
    .leftJoin(users, eq(users.id, employees.userId))
    .where(
      and(
        eq(employees.id, employeeId),
        eq(employees.organizationId, organizationId)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row || row.organizationId !== organizationId) return null;
  return {
    ...toListItem(row),
    organizationId: row.organizationId,
    userId: row.userId,
    linkedUserStatus: row.linkedUserStatus,
    updatedAt: row.updatedAt,
  };
}

function toListItem(row: {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  employmentStatus: string;
  hireDate: Date | null;
  linkedUserEmail: string | null;
  createdAt: Date;
}): EmployeeListItem {
  return {
    id: row.id,
    employeeNumber: row.employeeNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    department: row.department,
    position: row.position,
    employmentStatus: row.employmentStatus as EmployeeStatus,
    hireDate: row.hireDate,
    linkedUserEmail: row.linkedUserEmail,
    createdAt: row.createdAt,
  };
}

/**
 * Users in one organization that may be linked to an employee.
 * Excludes users already linked to a *different* employee. `currentEmployeeId`
 * keeps the employee's own current link available in edit flows.
 */
export async function listLinkableUsers(
  organizationId: string,
  currentEmployeeId?: string
): Promise<LinkableUser[]> {
  const usersInOrg = await db
    .select({ id: users.id, email: users.email, status: users.status })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(asc(users.email));

  const linkConditions = [
    eq(employees.organizationId, organizationId),
    isNotNull(employees.userId),
  ];
  if (currentEmployeeId) {
    linkConditions.push(ne(employees.id, currentEmployeeId));
  }

  const linkedRows = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(and(...linkConditions));

  const linkedUserIds = new Set(
    linkedRows
      .map((row) => row.userId)
      .filter((id): id is string => typeof id === "string")
  );

  return usersInOrg.filter((user) => !linkedUserIds.has(user.id));
}

/** Organization display name for a detail header. */
export async function getOrganizationName(
  organizationId: string
): Promise<string | null> {
  const rows = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return rows[0]?.name ?? null;
}

/**
 * Employee number + email for every employee in one organization.
 *
 * Used by the CSV import preview/confirm to reject rows whose employee number
 * or email already exists. Only identity columns are streamed — no blobs.
 */
export async function listEmployeeIdentifiersByOrganization(
  organizationId: string
): Promise<
  Array<{
    id: string;
    employeeNumber: string;
    email: string | null;
    status: string;
  }>
> {
  return db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      email: employees.email,
      status: employees.employmentStatus,
    })
    .from(employees)
    .where(eq(employees.organizationId, organizationId));
}


/** A slim employee row resolved by its linked user (org-scoped). */
export interface LinkedEmployee {
  id: string;
  organizationId: string;
  userId: string | null;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  employmentStatus: string;
}

/** Resolve the employee record linked to a user account, org-scoped. */
export async function getEmployeeByUserId(
  userId: string,
  organizationId: string
): Promise<LinkedEmployee | null> {
  const rows = await db
    .select({
      id: employees.id,
      organizationId: employees.organizationId,
      userId: employees.userId,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employmentStatus: employees.employmentStatus,
    })
    .from(employees)
    .where(
      and(
        eq(employees.userId, userId),
        eq(employees.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row;
}

/**
 * Rich self-service profile for the signed-in employee.
 *
 * Resolved strictly from the linked user id + organization, so an employee can
 * only ever read their own record. This is additive to (and does not replace)
 * `getEmployeeByUserId`, which remains the slim resolver used by guards.
 */
export interface EmployeeSelfProfile {
  id: string;
  organizationId: string;
  userId: string | null;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  division: string | null;
  employmentStatus: string;
  hireDate: Date | null;
  profilePhotoUrl: string | null;
  workLocationName: string | null;
  managerName: string | null;
}

export async function getEmployeeSelfProfile(
  userId: string,
  organizationId: string
): Promise<EmployeeSelfProfile | null> {
  const managers = alias(employees, "managers");

  const rows = await db
    .select({
      id: employees.id,
      organizationId: employees.organizationId,
      userId: employees.userId,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      nickname: employees.nickname,
      email: employees.email,
      phone: employees.phone,
      position: employees.position,
      department: employees.department,
      division: employees.division,
      employmentStatus: employees.employmentStatus,
      hireDate: employees.hireDate,
      profilePhotoUrl: employees.profilePhotoUrl,
      workLocationName: workLocations.name,
      managerName: sql<
        string | null
      >`nullif(concat_ws(' ', ${managers.firstName}, ${managers.lastName}), '')`,
    })
    .from(employees)
    .leftJoin(workLocations, eq(workLocations.id, employees.workLocationId))
    .leftJoin(managers, eq(managers.id, employees.managerId))
    .where(
      and(
        eq(employees.userId, userId),
        eq(employees.organizationId, organizationId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Transaction handle used by the permanent-deletion scan. Derived from the
 * `db.transaction` signature so the scan can run INSIDE the deletion
 * transaction (the dependency counts then describe the same snapshot the
 * DELETE acts on) without importing driver-specific generics.
 */
type HrisTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One employee-scoped table probed for rows that would block a deletion. */
interface EmployeeDeleteDependencySource {
  table: AnyPgTable;
  employeeIdColumn: AnyPgColumn;
  organizationIdColumn: AnyPgColumn;
}

/**
 * Every table that references `employees`, grouped into the operator-facing
 * categories of `permanent-delete-policy`.
 *
 * In production none of these employee foreign keys is `CASCADE` (24
 * `RESTRICT`, 2 self-referencing `SET NULL`), so a single remaining row makes
 * the `DELETE` fail. The scan exists to count them before the statement is
 * issued, to classify each category as protected or deletable, and to describe
 * exactly which modules still hold the employee.
 *
 * Each category's disposition is derived from the policy module rather than
 * repeated here, so the scan can never disagree with the decision layer.
 */
const EMPLOYEE_DELETE_DEPENDENCY_SOURCES: readonly {
  label: EmployeeDeleteDependencyLabel;
  tables: readonly EmployeeDeleteDependencySource[];
}[] = [
  {
    label: "Attendance",
    tables: [
      {
        table: attendanceRecords,
        employeeIdColumn: attendanceRecords.employeeId,
        organizationIdColumn: attendanceRecords.organizationId,
      },
      {
        table: attendanceEvents,
        employeeIdColumn: attendanceEvents.employeeId,
        organizationIdColumn: attendanceEvents.organizationId,
      },
    ],
  },
  {
    label: "Leave",
    tables: [
      {
        table: leaveBalances,
        employeeIdColumn: leaveBalances.employeeId,
        organizationIdColumn: leaveBalances.organizationId,
      },
      {
        table: leaveRequests,
        employeeIdColumn: leaveRequests.employeeId,
        organizationIdColumn: leaveRequests.organizationId,
      },
    ],
  },
  {
    label: "Permission",
    tables: [
      {
        table: permissionRequests,
        employeeIdColumn: permissionRequests.employeeId,
        organizationIdColumn: permissionRequests.organizationId,
      },
    ],
  },
  {
    label: "Payroll",
    tables: [
      {
        table: employeePayrollComponents,
        employeeIdColumn: employeePayrollComponents.employeeId,
        organizationIdColumn: employeePayrollComponents.organizationId,
      },
      {
        table: payrollItems,
        employeeIdColumn: payrollItems.employeeId,
        organizationIdColumn: payrollItems.organizationId,
      },
    ],
  },
  {
    label: "Payslip",
    tables: [
      {
        table: payslips,
        employeeIdColumn: payslips.employeeId,
        organizationIdColumn: payslips.organizationId,
      },
      {
        table: payslipDocuments,
        employeeIdColumn: payslipDocuments.employeeId,
        organizationIdColumn: payslipDocuments.organizationId,
      },
      {
        table: payslipDocumentVersions,
        employeeIdColumn: payslipDocumentVersions.employeeId,
        organizationIdColumn: payslipDocumentVersions.organizationId,
      },
    ],
  },
  {
    label: "Documents",
    tables: [
      {
        table: employeeDocuments,
        employeeIdColumn: employeeDocuments.employeeId,
        organizationIdColumn: employeeDocuments.organizationId,
      },
    ],
  },
  {
    label: "Employment history",
    tables: [
      {
        table: employeeEmploymentHistory,
        employeeIdColumn: employeeEmploymentHistory.employeeId,
        organizationIdColumn: employeeEmploymentHistory.organizationId,
      },
    ],
  },
  {
    label: "Face ID",
    tables: [
      {
        table: employeeFaceEnrollments,
        employeeIdColumn: employeeFaceEnrollments.employeeId,
        organizationIdColumn: employeeFaceEnrollments.organizationId,
      },
      {
        table: faceEnrollmentTemplates,
        employeeIdColumn: faceEnrollmentTemplates.employeeId,
        organizationIdColumn: faceEnrollmentTemplates.organizationId,
      },
    ],
  },
  {
    label: "Projects",
    tables: [
      {
        table: employeeProjectAssignments,
        employeeIdColumn: employeeProjectAssignments.employeeId,
        organizationIdColumn: employeeProjectAssignments.organizationId,
      },
    ],
  },
  {
    label: "Other related records",
    tables: [
      {
        table: employeeAddresses,
        employeeIdColumn: employeeAddresses.employeeId,
        organizationIdColumn: employeeAddresses.organizationId,
      },
      {
        table: employeeInsurances,
        employeeIdColumn: employeeInsurances.employeeId,
        organizationIdColumn: employeeInsurances.organizationId,
      },
      {
        table: employeeBankAccounts,
        employeeIdColumn: employeeBankAccounts.employeeId,
        organizationIdColumn: employeeBankAccounts.organizationId,
      },
      {
        table: employeeDependents,
        employeeIdColumn: employeeDependents.employeeId,
        organizationIdColumn: employeeDependents.organizationId,
      },
      {
        table: employeeEducations,
        employeeIdColumn: employeeEducations.employeeId,
        organizationIdColumn: employeeEducations.organizationId,
      },
      {
        table: employeeCustomFieldValues,
        employeeIdColumn: employeeCustomFieldValues.employeeId,
        organizationIdColumn: employeeCustomFieldValues.organizationId,
      },
      {
        table: announcementRecipients,
        employeeIdColumn: announcementRecipients.employeeId,
        organizationIdColumn: announcementRecipients.organizationId,
      },
    ],
  },
];

/**
 * The explicit delete plan: DELETABLE categories only, each expanded into the
 * concrete tables to clear.
 *
 * Deletion order matters and is fixed here, not derived at call time:
 * `face_enrollment_templates` is deleted BEFORE `employee_face_enrollments`
 * because the template row carries its own `ON DELETE CASCADE` to the
 * enrollment. Emitting the child statement explicitly means the cascade is
 * never relied upon — if the plan is ever edited, the parent delete fails
 * loudly instead of quietly removing extra rows.
 *
 * Every table here is employee-scoped and organization-scoped, and none of them
 * is retention-bound. A category that is PROTECTED must never appear in this
 * list; the guard in `assertEmployeeDeletePlanMatchesPolicy` enforces that.
 */
const EMPLOYEE_DELETABLE_DELETE_PLAN: readonly {
  label: EmployeeDeleteDependencyLabel;
  tables: readonly EmployeeDeleteDependencySource[];
}[] = EMPLOYEE_DELETE_DEPENDENCY_SOURCES.filter(
  (group) =>
    employeeDeleteDependencyDisposition(group.label) === "deletable"
).map((group) => ({
  label: group.label,
  tables:
    group.label === "Face ID"
      ? // Child first: see the order note above.
        [group.tables[1], group.tables[0]].filter(
          (source): source is EmployeeDeleteDependencySource =>
            source !== undefined
        )
      : group.tables,
}));

/**
 * Fail fast when the delete plan and the policy classification disagree.
 *
 * This runs at module load, so a category that becomes protected (or a new
 * table added to a protected category) cannot silently stay in the plan that
 * actually issues DELETE statements.
 */
function assertEmployeeDeletePlanMatchesPolicy(): void {
  const planned = new Set(
    EMPLOYEE_DELETABLE_DELETE_PLAN.map((entry) => entry.label)
  );
  for (const label of EMPLOYEE_PROTECTED_DEPENDENCY_LABELS) {
    if (planned.has(label)) {
      throw new Error(
        `Employee permanent delete plan must not delete protected category "${label}".`
      );
    }
  }
  for (const label of EMPLOYEE_DELETABLE_DEPENDENCY_LABELS) {
    if (!planned.has(label)) {
      throw new Error(
        `Employee permanent delete plan is missing deletable category "${label}".`
      );
    }
  }
  for (const entry of EMPLOYEE_DELETABLE_DELETE_PLAN) {
    if (entry.tables.length === 0) {
      throw new Error(
        `Employee permanent delete plan has no tables for "${entry.label}".`
      );
    }
  }
}

assertEmployeeDeletePlanMatchesPolicy();

/** Count rows of one employee-scoped table, always scoped to the organization. */
async function countEmployeeScopedRows(
  tx: HrisTransaction,
  source: EmployeeDeleteDependencySource,
  employeeId: string,
  organizationId: string
): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(source.table)
    .where(
      and(
        eq(source.employeeIdColumn, employeeId),
        eq(source.organizationIdColumn, organizationId)
      )
    );
  return rows[0]?.count ?? 0;
}

/**
 * Count every record that still references an employee, grouped by category.
 *
 * Callers MUST pass the deletion transaction (or a read-only transaction), so
 * the counts and the subsequent `DELETE` share one snapshot. Returns one entry
 * per category (including zeros) in the canonical display order; the decision
 * layer drops the zero entries.
 *
 * Each entry carries the policy `disposition`, so a consumer can never infer
 * "deletable" from the absence of a protected marker.
 *
 * `audit_logs` is intentionally not counted: it is append-only, references
 * entities by text id and has no foreign key, so it never blocks a deletion
 * and is never cascaded.
 */
export async function listEmployeeDeletionDependencies(
  tx: HrisTransaction,
  employeeId: string,
  organizationId: string
): Promise<EmployeeDeleteDependency[]> {
  const counts = await Promise.all(
    EMPLOYEE_DELETE_DEPENDENCY_SOURCES.map(async (group) => {
      const tableCounts = await Promise.all(
        group.tables.map((source) =>
          countEmployeeScopedRows(tx, source, employeeId, organizationId)
        )
      );
      const count = tableCounts.reduce((total, value) => total + value, 0);
      return {
        label: group.label,
        count,
        disposition: employeeDeleteDependencyDisposition(group.label),
      } satisfies EmployeeDeleteDependency;
    })
  );

  // One implicit relationship has no dedicated table row but is still affected by
  // the delete: direct reports, whose `manager_id` is nulled by the
  // self-referencing SET NULL foreign key. Those employees are NOT deleted — they
  // only lose their manager — so they are deliberately kept OUT of the counted
  // categories: the dialog renders the deletable categories as "will be deleted",
  // and folding a retained row into that total would tell the operator a record
  // is destroyed when it is not. `countEmployeeDirectReports` exposes the figure
  // separately so the UI can describe the actual effect.
  // (A linked login account is not a dependent of the employee:
  // `employees.user_id` points at `users`, so the account survives; the decision
  // layer only blocks the self-linked case.)
  return counts;
}

/**
 * Direct reports of an employee, which survive the deletion with a null manager.
 *
 * Reported for display only. These rows are never issued a DELETE: the
 * self-referencing `ON DELETE SET NULL` foreign key does the work, so the count
 * must not be presented as a removal.
 */
export async function countEmployeeDirectReports(
  tx: HrisTransaction,
  employeeId: string,
  organizationId: string
): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        eq(employees.managerId, employeeId)
      )
    );
  return rows[0]?.count ?? 0;
}

/**
 * Explicitly delete the DELETABLE related records of one employee.
 *
 * MUST be called inside the deletion transaction, immediately before the
 * employee row itself is removed, and only after
 * `evaluatePermanentEmployeeDeletion` has returned `allowed: true` — which is
 * what guarantees no protected row is touched (the plan contains no protected
 * table, and the `RESTRICT` foreign keys remain the backstop).
 *
 * Every statement is scoped by BOTH `employee_id` and `organization_id`, so a
 * row that belongs to another tenant can never be removed.
 *
 * Returns the number of rows removed per category, for the audit summary.
 */
export async function deleteEmployeeDeletableRecords(
  tx: HrisTransaction,
  employeeId: string,
  organizationId: string
): Promise<Record<string, number>> {
  const removedPerCategory: Record<string, number> = {};

  for (const entry of EMPLOYEE_DELETABLE_DELETE_PLAN) {
    let removedForCategory = 0;
    for (const source of entry.tables) {
      const removed = await tx
        .delete(source.table)
        .where(
          and(
            eq(source.employeeIdColumn, employeeId),
            eq(source.organizationIdColumn, organizationId)
          )
        )
        .returning({ id: sql<string>`gen_random_uuid()::text` });
      removedForCategory += removed.length;
    }
    if (removedForCategory > 0) {
      removedPerCategory[entry.label] = removedForCategory;
    }
  }

  return removedPerCategory;
}
