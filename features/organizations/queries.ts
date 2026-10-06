import "server-only";

import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  announcementAttachments,
  announcementRecipients,
  announcements,
  attendanceEvents,
  attendancePhotos,
  attendanceRecords,
  auditLogs,
  employeeFaceEnrollments,
  employeeProjectAssignments,
  employees,
  faceEnrollmentTemplates,
  leaveBalances,
  leaveRequestEvents,
  leaveRequests,
  leaveTypes,
  organizations,
  payrollEvents,
  payrollItems,
  payrollPeriods,
  payrollRuns,
  payslipDocumentVersions,
  payslipDocuments,
  payslips,
  permissionRequestEvents,
  permissionRequests,
  projects,
  roles,
  users,
  workLocations,
} from "@/db/schema";

import type { OrganizationDependencyCounts } from "./policy.ts";
import type { OrganizationStatus } from "./constants.ts";

/**
 * Organizations — data access (R19, Super Administration).
 *
 * Unlike every tenant module, reads here are NOT filtered by the caller's own
 * organization: the actor is structurally the system-level SUPERADMIN (pages
 * guard with `requireSuperAdmin`, actions re-check it), whose whole purpose is
 * cross-tenant visibility. The organization scope of the DATA is still
 * explicit in every query below — rows and counts always carry
 * `organization_id`, so one tenant's numbers can never leak into another's.
 */

export interface OrganizationListItem {
  id: string;
  name: string;
  code: string;
  status: string;
  employeeCount: number;
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationListFilters {
  search?: string | null;
  status?: OrganizationStatus | null;
}

async function countWhere(
  column: AnyPgColumn,
  organizationId: string
): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(column.table as PgTable)
    .where(eq(column, organizationId));
  return rows[0]?.count ?? 0;
}

async function sumCounts(
  organizationId: string,
  ...columns: AnyPgColumn[]
): Promise<number> {
  const counts = await Promise.all(
    columns.map((column) => countWhere(column, organizationId))
  );
  return counts.reduce((sum, value) => sum + value, 0);
}

/**
 * All organizations with per-org user/employee counts.
 *
 * Exactly three queries regardless of the number of organizations (orgs +
 * two grouped count queries) — never per-row.
 */
export async function listOrganizations(
  input: OrganizationListFilters = {}
): Promise<OrganizationListItem[]> {
  const conditions = [];
  if (input.status) {
    conditions.push(eq(organizations.status, input.status));
  }
  if (input.search?.trim()) {
    const pattern = `%${input.search.trim()}%`;
    conditions.push(
      or(
        ilike(organizations.name, pattern),
        ilike(organizations.code, pattern)
      )!
    );
  }

  const orgRows = await db
    .select()
    .from(organizations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(organizations.code));

  if (orgRows.length === 0) return [];

  const orgIds = orgRows.map((row) => row.id);

  const [employeeCounts, userCounts] = await Promise.all([
    db
      .select({
        organizationId: employees.organizationId,
        employeeCount: count(),
      })
      .from(employees)
      .where(inArray(employees.organizationId, orgIds))
      .groupBy(employees.organizationId),
    db
      .select({
        organizationId: users.organizationId,
        userCount: count(),
      })
      .from(users)
      .where(inArray(users.organizationId, orgIds))
      .groupBy(users.organizationId),
  ]);

  const employeeByOrg = new Map(
    employeeCounts.map((row) => [row.organizationId, row.employeeCount])
  );
  const userByOrg = new Map(
    userCounts.map((row) => [row.organizationId, row.userCount])
  );

  return orgRows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status,
    employeeCount: employeeByOrg.get(row.id) ?? 0,
    userCount: userByOrg.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export interface OrganizationDetail {
  id: string;
  name: string;
  code: string;
  status: string;
  employeeCount: number;
  activeEmployeeCount: number;
  userCount: number;
  activeUserCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One organization + aggregate stats (fixed query count, never per-row). */
export async function getOrganizationDetail(
  organizationId: string
): Promise<OrganizationDetail | null> {
  const [orgRows, employeeAgg, userAgg] = await Promise.all([
    db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1),
    db
      .select({
        total: count(),
        active:
          sql<number>`count(*) filter (where ${employees.employmentStatus} = 'active')::int`,
      })
      .from(employees)
      .where(eq(employees.organizationId, organizationId)),
    db
      .select({
        total: count(),
        active:
          sql<number>`count(*) filter (where ${users.status} = 'active')::int`,
      })
      .from(users)
      .where(eq(users.organizationId, organizationId)),
  ]);

  const org = orgRows[0];
  if (!org) return null;

  return {
    id: org.id,
    name: org.name,
    code: org.code,
    status: org.status,
    employeeCount: employeeAgg[0]?.total ?? 0,
    activeEmployeeCount: employeeAgg[0]?.active ?? 0,
    userCount: userAgg[0]?.total ?? 0,
    activeUserCount: userAgg[0]?.active ?? 0,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  };
}

/**
 * Dependency scan for the delete guard and the detail "linked records" panel.
 *
 * Covers EVERY table that references `organizations.id` (R19 audit):
 * tenant business data, historical/event records and audit trails alike.
 * Protected history means a deletion is rejected — deactivation is the
 * sanctioned alternative.
 */
export async function detectOrganizationDependencies(
  organizationId: string
): Promise<OrganizationDependencyCounts> {
  const [
    usersCount,
    employeesCount,
    rolesCount,
    attendanceCount,
    leaveCount,
    permissionRequestsCount,
    payrollCount,
    payslipsCount,
    payslipDocumentsCount,
    announcementsCount,
    workLocationsCount,
    projectsCount,
    assignmentsCount,
    faceEnrollmentsCount,
    auditCount,
  ] = await Promise.all([
    countWhere(users.organizationId, organizationId),
    countWhere(employees.organizationId, organizationId),
    countWhere(roles.organizationId, organizationId),
    sumCounts(
      organizationId,
      attendanceRecords.organizationId,
      attendanceEvents.organizationId,
      attendancePhotos.organizationId
    ),
    sumCounts(
      organizationId,
      leaveTypes.organizationId,
      leaveBalances.organizationId,
      leaveRequests.organizationId,
      leaveRequestEvents.organizationId
    ),
    sumCounts(
      organizationId,
      permissionRequests.organizationId,
      permissionRequestEvents.organizationId
    ),
    sumCounts(
      organizationId,
      payrollPeriods.organizationId,
      payrollRuns.organizationId,
      payrollItems.organizationId,
      payrollEvents.organizationId
    ),
    sumCounts(
      organizationId,
      payslips.organizationId,
      payslipDocumentVersions.organizationId
    ),
    countWhere(payslipDocuments.organizationId, organizationId),
    sumCounts(
      organizationId,
      announcements.organizationId,
      announcementRecipients.organizationId,
      announcementAttachments.organizationId
    ),
    countWhere(workLocations.organizationId, organizationId),
    countWhere(projects.organizationId, organizationId),
    countWhere(
      employeeProjectAssignments.organizationId,
      organizationId
    ),
    sumCounts(
      organizationId,
      employeeFaceEnrollments.organizationId,
      faceEnrollmentTemplates.organizationId
    ),
    countWhere(auditLogs.organizationId, organizationId),
  ]);

  return {
    users: usersCount,
    employees: employeesCount,
    roles: rolesCount,
    attendance: attendanceCount,
    leave: leaveCount,
    permission_requests: permissionRequestsCount,
    payroll: payrollCount,
    payslips: payslipsCount,
    payslip_documents: payslipDocumentsCount,
    announcements: announcementsCount,
    work_locations: workLocationsCount,
    projects: projectsCount,
    assignments: assignmentsCount,
    face_enrollments: faceEnrollmentsCount,
    audit: auditCount,
  };
}

/** True when another organization already uses `code`. */
export async function isOrganizationCodeTaken(
  code: string,
  excludeOrganizationId?: string
): Promise<boolean> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.code, code),
        excludeOrganizationId
          ? sql`${organizations.id} <> ${excludeOrganizationId}::uuid`
          : undefined
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** True when another organization already uses the exact `name`. */
export async function isOrganizationNameTaken(
  name: string,
  excludeOrganizationId?: string
): Promise<boolean> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.name, name),
        excludeOrganizationId
          ? sql`${organizations.id} <> ${excludeOrganizationId}::uuid`
          : undefined
      )
    )
    .limit(1);
  return rows.length > 0;
}
