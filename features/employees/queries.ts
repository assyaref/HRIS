import "server-only";

import {
  and,
  asc,
  eq,
  getTableName,
  ilike,
  inArray,
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
  employeeDeletionRequests,
  employeeDocuments,
  employeeEducations,
  employeeEmploymentHistory,
  employeeFaceEnrollments,
  employeeInsurances,
  employeeLegalHolds,
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
export function buildEmployeeSearchConditions(
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

  if (input.projectId) {
    conditions.push(buildProjectAssignmentCondition(organizationId, input.projectId));
  }

  conditions.push(...buildCustomFieldFilterConditions(organizationId, customFilters));
  return conditions;
}

/**
 * Employees currently assigned to one project, as a correlated EXISTS.
 *
 * The subquery is pinned to the caller's organization as well as the project,
 * so a project id from another tenant can never widen the result set. An
 * EXISTS (rather than a JOIN) keeps exactly one row per employee even when the
 * assignment table holds several rows for the same person — pagination and
 * `count(*)` therefore stay consistent. Employees without any assignment are
 * deliberately NOT required to have one; the predicate is only added when a
 * project filter is active.
 */
export function buildProjectAssignmentCondition(
  organizationId: string,
  projectId: string
): SQL<unknown> {
  return sql`EXISTS (SELECT 1 FROM ${employeeProjectAssignments} WHERE ${and(
    eq(employeeProjectAssignments.organizationId, organizationId),
    eq(employeeProjectAssignments.employeeId, employees.id),
    eq(employeeProjectAssignments.projectId, projectId),
    eq(employeeProjectAssignments.active, true)
  )})`;
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

const employeeDetailSelection = {
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
} as const;

function toEmployeeDetail(row: {
  id: string;
  organizationId: string;
  userId: string | null;
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
  linkedUserStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}): EmployeeDetail {
  return {
    ...toListItem(row),
    organizationId: row.organizationId,
    userId: row.userId,
    linkedUserStatus: row.linkedUserStatus,
    updatedAt: row.updatedAt,
  };
}

/**
 * Load one employee by id WITHOUT an organization filter.
 *
 * This is the ONLY unscoped employee read. It exists so the detail page can
 * discover the record's OWNING organization from the database (which is then
 * treated as authoritative) instead of trusting an organization id from the
 * browser. Authorization MUST be applied by the caller before rendering any
 * field — see `getEmployeeInOrganization` for the org-scoped variant used by
 * every write path.
 */
export async function getEmployeeById(
  employeeId: string
): Promise<EmployeeDetail | null> {
  const rows = await db
    .select(employeeDetailSelection)
    .from(employees)
    .leftJoin(users, eq(users.id, employees.userId))
    .where(eq(employees.id, employeeId))
    .limit(1);

  const row = rows[0];
  return row ? toEmployeeDetail(row) : null;
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
    .select(employeeDetailSelection)
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
  return toEmployeeDetail(row);
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
 * Execution order of the DELETABLE categories. This is deliberately NOT the
 * display order: it is the order that satisfies the payroll foreign-key graph.
 *
 * `payslip_document_versions` → `payslip_documents` → `payslips` must be
 * removed children-first, and the Payslip category must complete BEFORE
 * Payroll, because `payslips.payroll_item_id` is `ON DELETE RESTRICT`.
 * Deleting `payroll_items` then cascades to `payroll_item_components` (its own
 * child table, which carries no `employee_id` of its own).
 *
 * `announcement_recipients` is intentionally last so the remaining profile
 * rows disappear after the payroll chain.
 */
const EMPLOYEE_DELETE_PLAN_CATEGORY_ORDER = [
  "Payslip",
  "Payroll",
  "Documents",
  "Face ID",
  "Projects",
  "Other related records",
] as const satisfies readonly EmployeeDeleteDependencyLabel[];

/**
 * Categories whose child table is listed first in
 * `EMPLOYEE_DELETE_DEPENDENCY_SOURCES` and therefore must be reversed before
 * being executed:
 * - Face ID: enrollment rows before their template (the template carries an
 *   `ON DELETE CASCADE` to the enrollment, so it is emitted explicitly first).
 * - Payslip: versions → documents → payslips (all `RESTRICT`).
 */
const EMPLOYEE_DELETE_PLAN_CHILD_FIRST_CATEGORIES: ReadonlySet<EmployeeDeleteDependencyLabel> =
  new Set(["Face ID", "Payslip"]);

/**
 * The explicit delete plan: DELETABLE categories only, each expanded into the
 * concrete tables to clear, in the fixed execution order above.
 *
 * Every table here is employee-scoped and organization-scoped, and none of them
 * is retention-bound. A category that is PROTECTED must never appear in this
 * list; the guard in `assertEmployeeDeletePlanMatchesPolicy` enforces that.
 * No `CASCADE` is relied upon for the explicitly-listed tables: each statement
 * names its table so a plan edit fails loudly instead of silently removing
 * extra rows.
 */
const EMPLOYEE_DELETABLE_DELETE_PLAN: readonly {
  label: EmployeeDeleteDependencyLabel;
  tables: readonly EmployeeDeleteDependencySource[];
}[] = EMPLOYEE_DELETE_PLAN_CATEGORY_ORDER.map((label) => {
  const group = EMPLOYEE_DELETE_DEPENDENCY_SOURCES.find(
    (source) => source.label === label
  );
  if (!group) {
    throw new Error(
      `Employee permanent delete plan names unknown category "${label}".`
    );
  }
  return {
    label,
    tables: EMPLOYEE_DELETE_PLAN_CHILD_FIRST_CATEGORIES.has(label)
      ? [...group.tables].reverse()
      : group.tables,
  };
});

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
  if (planned.size !== EMPLOYEE_DELETABLE_DEPENDENCY_LABELS.length) {
    throw new Error(
      "Employee permanent delete plan contains a category that the policy does not classify as deletable."
    );
  }
  const planLabels = EMPLOYEE_DELETABLE_DELETE_PLAN.map((entry) => entry.label);
  if (
    planLabels.indexOf("Payslip") === -1 ||
    planLabels.indexOf("Payroll") === -1 ||
    planLabels.indexOf("Payslip") > planLabels.indexOf("Payroll")
  ) {
    throw new Error(
      "Employee permanent delete plan must remove Payslip before Payroll (payslips reference payroll_items with ON DELETE RESTRICT)."
    );
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
 * Live control-plane state for one employee.
 *
 * This is deliberately separate from the operator-facing dependency categories:
 * a legal hold or a deletion request is not a record the delete plan may remove,
 * and folding either into "related records" would misdescribe the effect.
 *
 * - `activeLegalHoldCount > 0` → absolute refusal.
 * - `blockingDeletionRequestCount > 0` (pending/approved) → refusal: the live
 *   path must never race or bypass an in-flight dual-control request.
 * - RELEASED holds and TERMINAL requests do not block. Their `employee_id`
 *   reference is cleared by the migration-0021 `ON DELETE SET NULL` foreign
 *   keys, while the immutable identity snapshots preserve the history.
 */
export interface EmployeeDeletionControlState {
  activeLegalHoldCount: number;
  blockingDeletionRequestCount: number;
}

export async function getEmployeeDeletionControlState(
  tx: HrisTransaction,
  employeeId: string,
  organizationId: string
): Promise<EmployeeDeletionControlState> {
  // Sequential queries: a Drizzle transaction is bound to one pg client, so
  // issuing concurrent queries on it is unsupported and can interleave.
  const holds = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(employeeLegalHolds)
    .where(
      and(
        eq(employeeLegalHolds.organizationId, organizationId),
        eq(employeeLegalHolds.employeeId, employeeId),
        eq(employeeLegalHolds.active, true)
      )
    );
  const requests = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(employeeDeletionRequests)
    .where(
      and(
        eq(employeeDeletionRequests.organizationId, organizationId),
        eq(employeeDeletionRequests.employeeId, employeeId),
        inArray(employeeDeletionRequests.status, ["pending", "approved"])
      )
    );

  return {
    activeLegalHoldCount: holds[0]?.count ?? 0,
    blockingDeletionRequestCount: requests[0]?.count ?? 0,
  };
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

/**
 * Collect every stored payslip PDF storage key that belongs to one employee —
 * from `payslip_documents` AND the append-only `payslip_document_versions`
 * chain — so the post-commit file purge can remove exactly the files the
 * deletion transaction is about to orphan.
 *
 * MUST run INSIDE the deletion transaction, BEFORE
 * `deleteEmployeeDeletableRecords` removes the rows: once the rows are gone
 * the keys are unrecoverable from the database. The keys are scoped by BOTH
 * `employee_id` and `organization_id` like every other statement of the plan,
 * so another tenant's files can never be collected.
 *
 * Returns DISTINCT keys (a document and its current version intentionally
 * share the same storage key; superseded versions carry their own).
 */
export async function collectEmployeePayslipFileKeys(
  tx: HrisTransaction,
  employeeId: string,
  organizationId: string
): Promise<string[]> {
  const documentRows = await tx
    .select({ storageKey: payslipDocuments.storageKey })
    .from(payslipDocuments)
    .where(
      and(
        eq(payslipDocuments.employeeId, employeeId),
        eq(payslipDocuments.organizationId, organizationId)
      )
    );
  const versionRows = await tx
    .select({ storageKey: payslipDocumentVersions.storageKey })
    .from(payslipDocumentVersions)
    .where(
      and(
        eq(payslipDocumentVersions.employeeId, employeeId),
        eq(payslipDocumentVersions.organizationId, organizationId)
      )
    );

  return [
    ...new Set([
      ...documentRows.map((row) => row.storageKey),
      ...versionRows.map((row) => row.storageKey),
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* Retained-record identity snapshots (migration 0022)                  */
/* ------------------------------------------------------------------ */

/**
 * One PROTECTED table whose retained rows must carry the employee's identity
 * before the employee row is detached (`ON DELETE SET NULL`, migration 0022).
 */
interface EmployeeRetainedSnapshotSource {
  table: AnyPgTable;
  employeeIdColumn: AnyPgColumn;
  organizationIdColumn: AnyPgColumn;
  employeeNumberSnapshotColumn: AnyPgColumn;
  employeeNameSnapshotColumn: AnyPgColumn;
}

/**
 * The retained-identity snapshot plan: every PROTECTED table that carries
 * nullable snapshot columns.
 *
 * PAYROLL and PAYSLIP tables are deliberately absent: they are DELETABLE under
 * the owner-approved scope, so their rows are removed (not detached) and they
 * must never be listed here. The guard below fails closed if a deletable table
 * ever appears in the plan.
 *
 * The plan is aligned with the SAME `EMPLOYEE_DELETE_DEPENDENCY_SOURCES` list
 * that drives counting and deletion, so classification can never drift: a
 * table is in this plan if and only if its category is PROTECTED.
 */
const EMPLOYEE_RETAINED_SNAPSHOT_PLAN: readonly EmployeeRetainedSnapshotSource[] =
  [
    {
      table: attendanceRecords,
      employeeIdColumn: attendanceRecords.employeeId,
      organizationIdColumn: attendanceRecords.organizationId,
      employeeNumberSnapshotColumn: attendanceRecords.employeeNumberSnapshot,
      employeeNameSnapshotColumn: attendanceRecords.employeeNameSnapshot,
    },
    {
      table: attendanceEvents,
      employeeIdColumn: attendanceEvents.employeeId,
      organizationIdColumn: attendanceEvents.organizationId,
      employeeNumberSnapshotColumn: attendanceEvents.employeeNumberSnapshot,
      employeeNameSnapshotColumn: attendanceEvents.employeeNameSnapshot,
    },
    {
      table: leaveBalances,
      employeeIdColumn: leaveBalances.employeeId,
      organizationIdColumn: leaveBalances.organizationId,
      employeeNumberSnapshotColumn: leaveBalances.employeeNumberSnapshot,
      employeeNameSnapshotColumn: leaveBalances.employeeNameSnapshot,
    },
    {
      table: leaveRequests,
      employeeIdColumn: leaveRequests.employeeId,
      organizationIdColumn: leaveRequests.organizationId,
      employeeNumberSnapshotColumn: leaveRequests.employeeNumberSnapshot,
      employeeNameSnapshotColumn: leaveRequests.employeeNameSnapshot,
    },
    {
      table: permissionRequests,
      employeeIdColumn: permissionRequests.employeeId,
      organizationIdColumn: permissionRequests.organizationId,
      employeeNumberSnapshotColumn: permissionRequests.employeeNumberSnapshot,
      employeeNameSnapshotColumn: permissionRequests.employeeNameSnapshot,
    },
    {
      table: employeeEmploymentHistory,
      employeeIdColumn: employeeEmploymentHistory.employeeId,
      organizationIdColumn: employeeEmploymentHistory.organizationId,
      employeeNumberSnapshotColumn:
        employeeEmploymentHistory.employeeNumberSnapshot,
      employeeNameSnapshotColumn: employeeEmploymentHistory.employeeNameSnapshot,
    },
  ];

/**
 * Fail fast when the snapshot plan and the policy classification disagree.
 *
 * Runs at module load, mirroring `assertEmployeeDeletePlanMatchesPolicy`:
 * - every PROTECTED table must appear (a newly protected table without
 *   snapshots would detach anonymously and violate the database's
 *   retained-identity CHECK at deletion time);
 * - no DELETABLE table may appear (its rows are removed, never detached —
 *   this includes every payroll/payslip table).
 */
function assertEmployeeSnapshotPlanMatchesPolicy(): void {
  const protectedTables = EMPLOYEE_DELETE_DEPENDENCY_SOURCES.filter(
    (group) => employeeDeleteDependencyDisposition(group.label) === "protected"
  ).flatMap((group) => group.tables.map((source) => source.table));
  const deletableTables = EMPLOYEE_DELETE_DEPENDENCY_SOURCES.filter(
    (group) => employeeDeleteDependencyDisposition(group.label) === "deletable"
  ).flatMap((group) => group.tables.map((source) => source.table));
  const plannedTables = EMPLOYEE_RETAINED_SNAPSHOT_PLAN.map(
    (source) => source.table
  );

  for (const table of protectedTables) {
    if (!plannedTables.includes(table)) {
      throw new Error(
        "Employee permanent delete snapshot plan is missing a protected table with nullable identity snapshots."
      );
    }
  }
  for (const table of deletableTables) {
    if (plannedTables.includes(table)) {
      throw new Error(
        "Employee permanent delete snapshot plan must not include a deletable table."
      );
    }
  }
  if (plannedTables.length !== protectedTables.length) {
    throw new Error(
      "Employee permanent delete snapshot plan contains a table that the policy does not classify as protected."
    );
  }
}

assertEmployeeSnapshotPlanMatchesPolicy();

/**
 * Freeze the employee's identity onto every retained (PROTECTED) row of one
 * employee, inside the deletion transaction, immediately before the employee
 * row is deleted.
 *
 * This is the application half of migration 0022 (see
 * docs/employee-permanent-delete-0022-detach-design.md §4.1):
 * 1. this function fills `employee_number_snapshot` / `employee_name_snapshot`
 *    where they are still NULL (creation-time snapshots are never
 *    overwritten — the payslip PDF password contract depends on that);
 * 2. the subsequent `DELETE FROM employees` fires the protected tables'
 *    `ON DELETE SET NULL` foreign keys, which atomically detaches the retained
 *    rows in the same statement.
 *
 * Every statement is scoped by BOTH `employee_id` and `organization_id`, so a
 * row that belongs to another tenant can never be touched. The
 * `<table>_retained_identity_check` CHECK constraints guarantee a detached
 * row always carries its identity, so the DELETE fails closed if this step
 * were ever skipped against the post-0022 schema.
 *
 * Returns the number of retained rows whose identity was frozen, per table,
 * for the audit summary.
 */
export async function snapshotEmployeeRetainedRecords(
  tx: HrisTransaction,
  employeeId: string,
  organizationId: string,
  identity: { employeeNumber: string; employeeName: string }
): Promise<Record<string, number>> {
  const snapshottedPerTable: Record<string, number> = {};

  for (const source of EMPLOYEE_RETAINED_SNAPSHOT_PLAN) {
    const filled = await tx
      .update(source.table)
      .set({
        employeeNumberSnapshot: sql`coalesce(${source.employeeNumberSnapshotColumn}, ${identity.employeeNumber})`,
        employeeNameSnapshot: sql`coalesce(${source.employeeNameSnapshotColumn}, ${identity.employeeName})`,
      })
      .where(
        and(
          eq(source.employeeIdColumn, employeeId),
          eq(source.organizationIdColumn, organizationId)
        )
      )
      .returning({ id: sql<string>`gen_random_uuid()::text` });
    if (filled.length > 0) {
      snapshottedPerTable[getTableName(source.table)] = filled.length;
    }
  }

  return snapshottedPerTable;
}
