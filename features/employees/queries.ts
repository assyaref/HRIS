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

import { db } from "@/db";
import {
  employeeCustomFieldValues,
  employees,
  organizations,
  users,
} from "@/db/schema";
import type { EmployeeStatus } from "./constants";
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

