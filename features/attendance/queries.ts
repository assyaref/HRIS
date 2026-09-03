import "server-only";

import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  attendanceEvents,
  attendanceRecords,
  employeeProjectAssignments,
  employees,
  projects,
  workLocations,
} from "@/db/schema";
import { parseAttendanceDate } from "@/lib/attendance/time";
import type { AttendanceStatus } from "./constants";
import type { AttendanceFilterInput } from "./schemas";

/**
 * Attendance data access (Phase 6) — server-only.
 *
 * Rules:
 * - Every query is organization scoped.
 * - Employee self-service queries pin `employees.user_id = currentUser.id`,
 *   never a client-supplied employee id.
 * - Management queries scope by `attendance.organization_id`.
 */

export interface AttendanceEmployee {
  id: string;
  organizationId: string;
  userId: string | null;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  employmentStatus: string;
}

/** Employee's own project + work-location options for check-in. */
export interface AttendanceOption {
  projectId: string;
  projectCode: string;
  projectName: string;
  workLocationId: string;
  workLocationName: string;
}

export interface AttendanceRow {
  id: string;
  attendanceDate: Date;
  status: AttendanceStatus;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  projectId: string | null;
  projectName: string | null;
  workLocationId: string | null;
  workLocationName: string | null;
  workLocationTimezone: string | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  checkInLocationStatus: string | null;
  checkInVerificationStatus: string | null;
  checkInAccuracyMeters: number | null;
  checkInDistanceMeters: number | null;
  checkOutLocationStatus: string | null;
  checkOutVerificationStatus: string | null;
  checkOutAccuracyMeters: number | null;
  checkOutDistanceMeters: number | null;
}

export interface AttendanceEventRow {
  id: string;
  eventType: string;
  eventAt: Date;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceMeters: number | null;
  verificationMethod: string | null;
  reason: string | null;
}

export interface AttendanceDetail {
  attendance: AttendanceRow;
  events: AttendanceEventRow[];
  employeeUserId: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const ATTENDANCE_PAGE_SIZE = 20;

/** The employee record linked to the authenticated user (org-scoped). */
export async function getEmployeeForUser(
  userId: string,
  organizationId: string
): Promise<AttendanceEmployee | null> {
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
 * Projects/work locations the employee may attend today, from their ACTIVE
 * assignments. Only active projects with active work locations qualify.
 */
export async function listEligibleAttendanceOptions(
  organizationId: string,
  employeeId: string
): Promise<AttendanceOption[]> {
  const rows = await db
    .select({
      projectId: projects.id,
      projectCode: projects.code,
      projectName: projects.name,
      workLocationId: workLocations.id,
      workLocationName: workLocations.name,
    })
    .from(employeeProjectAssignments)
    .innerJoin(projects, eq(projects.id, employeeProjectAssignments.projectId))
    .innerJoin(workLocations, eq(workLocations.projectId, projects.id))
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        eq(employeeProjectAssignments.active, true),
        eq(projects.organizationId, organizationId),
        eq(projects.status, "active"),
        eq(workLocations.organizationId, organizationId),
        eq(workLocations.status, "active")
      )
    )
    .orderBy(asc(projects.name), asc(workLocations.name));

  return rows;
}

/** Shared select columns for joined attendance rows. */
const attendanceViewColumns = {
  id: attendanceRecords.id,
  attendanceDate: attendanceRecords.attendanceDate,
  status: attendanceRecords.status,
  employeeId: employees.id,
  employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
  employeeNumber: employees.employeeNumber,
  employeeUserId: employees.userId,
  projectId: projects.id,
  projectName: projects.name,
  workLocationId: workLocations.id,
  workLocationName: workLocations.name,
  workLocationTimezone: workLocations.timezone,
  checkInAt: attendanceRecords.checkInAt,
  checkOutAt: attendanceRecords.checkOutAt,
  checkInLocationStatus: attendanceRecords.checkInLocationStatus,
  checkInVerificationStatus: attendanceRecords.checkInVerificationStatus,
  checkInAccuracyMeters: attendanceRecords.checkInAccuracyMeters,
  checkInDistanceMeters: attendanceRecords.checkInDistanceMeters,
  checkOutLocationStatus: attendanceRecords.checkOutLocationStatus,
  checkOutVerificationStatus: attendanceRecords.checkOutVerificationStatus,
  checkOutAccuracyMeters: attendanceRecords.checkOutAccuracyMeters,
  checkOutDistanceMeters: attendanceRecords.checkOutDistanceMeters,
} as const;

/** The joined row shape produced by `attendanceViewColumns`. */
export interface AttendanceViewRow {
  id: string;
  attendanceDate: Date;
  status: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  employeeUserId: string | null;
  projectId: string | null;
  projectName: string | null;
  workLocationId: string | null;
  workLocationName: string | null;
  workLocationTimezone: string | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  checkInLocationStatus: string | null;
  checkInVerificationStatus: string | null;
  checkInAccuracyMeters: number | null;
  checkInDistanceMeters: number | null;
  checkOutLocationStatus: string | null;
  checkOutVerificationStatus: string | null;
  checkOutAccuracyMeters: number | null;
  checkOutDistanceMeters: number | null;
}

export function toAttendanceRow(row: AttendanceViewRow): AttendanceRow {
  return {
    id: row.id,
    attendanceDate: row.attendanceDate,
    status: row.status as AttendanceStatus,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    employeeNumber: row.employeeNumber,
    projectId: row.projectId,
    projectName: row.projectName,
    workLocationId: row.workLocationId,
    workLocationName: row.workLocationName,
    workLocationTimezone: row.workLocationTimezone,
    checkInAt: row.checkInAt,
    checkOutAt: row.checkOutAt,
    checkInLocationStatus: row.checkInLocationStatus,
    checkInVerificationStatus: row.checkInVerificationStatus,
    checkInAccuracyMeters: row.checkInAccuracyMeters,
    checkInDistanceMeters: row.checkInDistanceMeters,
    checkOutLocationStatus: row.checkOutLocationStatus,
    checkOutVerificationStatus: row.checkOutVerificationStatus,
    checkOutAccuracyMeters: row.checkOutAccuracyMeters,
    checkOutDistanceMeters: row.checkOutDistanceMeters,
  };
}

/** The latest still-open attendance (checked in, not checked out). */
export async function findOpenAttendance(
  organizationId: string,
  employeeId: string
): Promise<AttendanceRow | null> {
  const rows = await db
    .select(attendanceViewColumns)
    .from(attendanceRecords)
    .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .leftJoin(projects, eq(projects.id, attendanceRecords.projectId))
    .leftJoin(
      workLocations,
      eq(workLocations.id, attendanceRecords.workLocationId)
    )
    .where(
      and(
        eq(attendanceRecords.organizationId, organizationId),
        eq(attendanceRecords.employeeId, employeeId),
        sql`${attendanceRecords.checkInAt} is not null`,
        sql`${attendanceRecords.checkOutAt} is null`
      )
    )
    .orderBy(desc(attendanceRecords.checkInAt))
    .limit(1);

  const row = rows[0];
  return row
    ? toAttendanceRow(row as unknown as AttendanceViewRow)
    : null;
}

/** A specific employee's attendance for a calendar day, if it exists. */
export async function findAttendanceForDate(
  organizationId: string,
  employeeId: string,
  attendanceDate: Date
): Promise<AttendanceRow | null> {
  const rows = await db
    .select(attendanceViewColumns)
    .from(attendanceRecords)
    .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .leftJoin(projects, eq(projects.id, attendanceRecords.projectId))
    .leftJoin(
      workLocations,
      eq(workLocations.id, attendanceRecords.workLocationId)
    )
    .where(
      and(
        eq(attendanceRecords.organizationId, organizationId),
        eq(attendanceRecords.employeeId, employeeId),
        eq(attendanceRecords.attendanceDate, attendanceDate)
      )
    )
    .limit(1);

  const row = rows[0];
  return row
    ? toAttendanceRow(row as unknown as AttendanceViewRow)
    : null;
}


/** Attendance history for one employee (self-service), newest first. */
export async function listMyAttendanceHistory(
  organizationId: string,
  employeeId: string,
  page = 1
): Promise<Paginated<AttendanceRow>> {
  const pageSize = ATTENDANCE_PAGE_SIZE;
  const currentPage = Math.max(1, page);
  const conditions = [
    eq(attendanceRecords.organizationId, organizationId),
    eq(attendanceRecords.employeeId, employeeId),
  ];

  const [rows, countRows] = await Promise.all([
    db
      .select(attendanceViewColumns)
      .from(attendanceRecords)
      .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
      .leftJoin(projects, eq(projects.id, attendanceRecords.projectId))
      .leftJoin(
        workLocations,
        eq(workLocations.id, attendanceRecords.workLocationId)
      )
      .where(and(...conditions))
      .orderBy(
        desc(attendanceRecords.attendanceDate),
        desc(attendanceRecords.checkInAt)
      )
      .limit(pageSize)
      .offset((currentPage - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(attendanceRecords)
      .where(and(...conditions)),
  ]);

  const total = countRows[0]?.count ?? 0;
  return {
    items: rows.map((row) =>
      toAttendanceRow(row as unknown as AttendanceViewRow)
    ),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Organization-wide attendance for management, with filters + pagination. */
export async function listOrganizationAttendance(
  organizationId: string,
  filters: AttendanceFilterInput = {}
): Promise<Paginated<AttendanceRow>> {
  const pageSize = ATTENDANCE_PAGE_SIZE;
  const currentPage = Math.max(1, filters.page ?? 1);
  const conditions = [eq(attendanceRecords.organizationId, organizationId)];

  if (filters.date) {
    conditions.push(
      eq(attendanceRecords.attendanceDate, parseAttendanceDate(filters.date))
    );
  }
  if (filters.projectId) {
    conditions.push(eq(attendanceRecords.projectId, filters.projectId));
  }
  if (filters.status) {
    conditions.push(eq(attendanceRecords.status, filters.status));
  }
  const search = filters.q?.trim();
  if (search) {
    const pattern = `%${search}%`;
    const searchClause = or(
      ilike(employees.employeeNumber, pattern),
      ilike(employees.firstName, pattern),
      ilike(employees.lastName, pattern),
      ilike(employees.email, pattern)
    );
    if (searchClause) conditions.push(searchClause);
  }

  const [rows, countRows] = await Promise.all([
    db
      .select(attendanceViewColumns)
      .from(attendanceRecords)
      .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
      .leftJoin(projects, eq(projects.id, attendanceRecords.projectId))
      .leftJoin(
        workLocations,
        eq(workLocations.id, attendanceRecords.workLocationId)
      )
      .where(and(...conditions))
      .orderBy(
        desc(attendanceRecords.attendanceDate),
        desc(attendanceRecords.checkInAt)
      )
      .limit(pageSize)
      .offset((currentPage - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(attendanceRecords)
      .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
      .where(and(...conditions)),
  ]);

  const total = countRows[0]?.count ?? 0;
  return {
    items: rows.map((row) =>
      toAttendanceRow(row as unknown as AttendanceViewRow)
    ),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Full attendance detail + immutable event history.
 * Returns `null` when the id does not belong to `organizationId` (callers
 * respond with forbidden so cross-org existence is never revealed).
 */
export async function getAttendanceDetail(
  organizationId: string,
  attendanceId: string
): Promise<AttendanceDetail | null> {
  const recordRows = await db
    .select(attendanceViewColumns)
    .from(attendanceRecords)
    .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .leftJoin(projects, eq(projects.id, attendanceRecords.projectId))
    .leftJoin(
      workLocations,
      eq(workLocations.id, attendanceRecords.workLocationId)
    )
    .where(
      and(
        eq(attendanceRecords.id, attendanceId),
        eq(attendanceRecords.organizationId, organizationId)
      )
    )
    .limit(1);

  const record = recordRows[0];
  if (!record) return null;

  const eventRows = await db
    .select({
      id: attendanceEvents.id,
      eventType: attendanceEvents.eventType,
      eventAt: attendanceEvents.eventAt,
      latitude: attendanceEvents.latitude,
      longitude: attendanceEvents.longitude,
      accuracyMeters: attendanceEvents.accuracyMeters,
      distanceMeters: attendanceEvents.distanceMeters,
      verificationMethod: attendanceEvents.verificationMethod,
      reason: attendanceEvents.reason,
    })
    .from(attendanceEvents)
    .where(eq(attendanceEvents.attendanceId, attendanceId))
    .orderBy(asc(attendanceEvents.eventAt), asc(attendanceEvents.createdAt));

  const view = record as unknown as AttendanceViewRow;
  return {
    attendance: toAttendanceRow(view),
    events: eventRows.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      eventAt: event.eventAt,
      latitude: event.latitude,
      longitude: event.longitude,
      accuracyMeters: event.accuracyMeters,
      distanceMeters: event.distanceMeters,
      verificationMethod: event.verificationMethod,
      reason: event.reason,
    })),
    employeeUserId: view.employeeUserId,
  };
}


export interface AttendanceWorkLocation {
  id: string;
  organizationId: string;
  projectId: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  maxGpsAccuracyMeters: number | null;
  timezone: string | null;
  status: string;
}

/** Load a work location row, org-scoped (used for server-side geofencing). */
export async function getWorkLocationInOrganization(
  organizationId: string,
  workLocationId: string
): Promise<AttendanceWorkLocation | null> {
  const rows = await db
    .select({
      id: workLocations.id,
      organizationId: workLocations.organizationId,
      projectId: workLocations.projectId,
      name: workLocations.name,
      latitude: workLocations.latitude,
      longitude: workLocations.longitude,
      radiusMeters: workLocations.radiusMeters,
      maxGpsAccuracyMeters: workLocations.maxGpsAccuracyMeters,
      timezone: workLocations.timezone,
      status: workLocations.status,
    })
    .from(workLocations)
    .where(
      and(
        eq(workLocations.id, workLocationId),
        eq(workLocations.organizationId, organizationId)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return row;
}

/**
 * Validate that the employee has an ACTIVE assignment for `projectId` and that
 * `workLocationId` belongs to that project (both org-scoped). Used by the
 * check-in action — an employee can never submit an arbitrary project.
 */
export async function getEligibleAssignmentLocation(
  organizationId: string,
  employeeId: string,
  projectId: string,
  workLocationId: string
): Promise<AttendanceWorkLocation | null> {
  const rows = await db
    .select({
      id: workLocations.id,
      organizationId: workLocations.organizationId,
      projectId: workLocations.projectId,
      name: workLocations.name,
      latitude: workLocations.latitude,
      longitude: workLocations.longitude,
      radiusMeters: workLocations.radiusMeters,
      maxGpsAccuracyMeters: workLocations.maxGpsAccuracyMeters,
      timezone: workLocations.timezone,
      status: workLocations.status,
    })
    .from(employeeProjectAssignments)
    .innerJoin(projects, eq(projects.id, employeeProjectAssignments.projectId))
    .innerJoin(workLocations, eq(workLocations.id, workLocationId))
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        eq(employeeProjectAssignments.projectId, projectId),
        eq(employeeProjectAssignments.active, true),
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId),
        eq(projects.status, "active"),
        eq(workLocations.projectId, projectId),
        eq(workLocations.organizationId, organizationId),
        eq(workLocations.status, "active")
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return row;
}


/** Active projects in one organization (management filter options). */
export async function listOrganizationProjects(
  organizationId: string
): Promise<{ id: string; name: string; code: string }[]> {
  const rows = await db
    .select({ id: projects.id, name: projects.name, code: projects.code })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.status, "active")
      )
    )
    .orderBy(asc(projects.name));

  return rows;
}

