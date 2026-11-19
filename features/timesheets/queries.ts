import "server-only";

import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { employeeProjectAssignments, employees, projects, timesheetEntries, users } from "@/db/schema";

export interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

/**
 * Active projects an entry may be booked on: the employee's active
 * assignments when they have any, otherwise every active project of the
 * organization.
 */
export async function listBookableProjects(organizationId: string, employeeId: string): Promise<ProjectOption[]> {
  const assigned = await db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(employeeProjectAssignments)
    .innerJoin(projects, eq(projects.id, employeeProjectAssignments.projectId))
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        eq(employeeProjectAssignments.active, true),
        eq(projects.status, "active")
      )
    )
    .orderBy(asc(projects.code));
  if (assigned.length > 0) return assigned;
  return db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.status, "active")))
    .orderBy(asc(projects.code));
}

export interface EntryRow {
  id: string;
  employeeId: string;
  workDate: string;
  weekStart: string;
  projectId: string | null;
  projectName: string | null;
  task: string;
  minutes: number;
  notes: string | null;
  status: string;
  reviewerName: string | null;
  reviewerNote: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
}

export async function listWeekEntries(
  organizationId: string,
  weekStart: string,
  employeeId?: string
): Promise<(EntryRow & { employeeNumber: string; employeeName: string })[]> {
  const reviewers = alias(users, "reviewers");
  const where: SQL[] = [eq(timesheetEntries.organizationId, organizationId), eq(timesheetEntries.weekStart, weekStart)];
  if (employeeId) where.push(eq(timesheetEntries.employeeId, employeeId));
  return db
    .select({
      id: timesheetEntries.id,
      employeeId: timesheetEntries.employeeId,
      employeeNumber: employees.employeeNumber,
      employeeName: sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`,
      workDate: timesheetEntries.workDate,
      weekStart: timesheetEntries.weekStart,
      projectId: timesheetEntries.projectId,
      projectName: sql<string | null>`CASE WHEN ${projects.id} IS NULL THEN NULL ELSE ${projects.code} || ' — ' || ${projects.name} END`,
      task: timesheetEntries.task,
      minutes: timesheetEntries.minutes,
      notes: timesheetEntries.notes,
      status: timesheetEntries.status,
      reviewerName: sql<string | null>`COALESCE(${reviewers.name}, ${reviewers.email})`,
      reviewerNote: timesheetEntries.reviewerNote,
      submittedAt: timesheetEntries.submittedAt,
      reviewedAt: timesheetEntries.reviewedAt,
    })
    .from(timesheetEntries)
    .innerJoin(employees, eq(employees.id, timesheetEntries.employeeId))
    .leftJoin(projects, eq(projects.id, timesheetEntries.projectId))
    .leftJoin(reviewers, eq(reviewers.id, timesheetEntries.reviewedBy))
    .where(and(...where))
    .orderBy(asc(employees.firstName), asc(timesheetEntries.workDate), asc(timesheetEntries.createdAt));
}

/** Submitted employee-weeks waiting for a decision (approvals inbox). */
export async function listSubmittedWeeks(organizationId: string) {
  return db
    .select({
      employeeId: timesheetEntries.employeeId,
      weekStart: timesheetEntries.weekStart,
      employeeNumber: employees.employeeNumber,
      employeeName: sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`,
      minutes: sql<number>`SUM(${timesheetEntries.minutes})::int`,
      submittedAt: sql<Date>`MAX(${timesheetEntries.submittedAt})`,
    })
    .from(timesheetEntries)
    .innerJoin(employees, eq(employees.id, timesheetEntries.employeeId))
    .where(and(eq(timesheetEntries.organizationId, organizationId), eq(timesheetEntries.status, "submitted")))
    .groupBy(timesheetEntries.employeeId, timesheetEntries.weekStart, employees.employeeNumber, employees.firstName, employees.lastName);
}

/** The employee's reviewed weeks (last 12 weeks of decisions). */
export async function listMyDecidedWeeks(organizationId: string, employeeId: string) {
  const rows = await db
    .select({
      weekStart: timesheetEntries.weekStart,
      status: sql<string>`CASE WHEN bool_or(${timesheetEntries.status} = 'rejected') THEN 'rejected' ELSE 'approved' END`,
      minutes: sql<number>`SUM(${timesheetEntries.minutes})::int`,
      reviewerNote: sql<string | null>`MAX(${timesheetEntries.reviewerNote})`,
      reviewedAt: sql<string>`MAX(${timesheetEntries.reviewedAt})`,
    })
    .from(timesheetEntries)
    .where(
      and(
        eq(timesheetEntries.organizationId, organizationId),
        eq(timesheetEntries.employeeId, employeeId),
        sql`${timesheetEntries.status} IN ('approved', 'rejected')`,
        sql`${timesheetEntries.reviewedAt} > now() - interval '84 days'`
      )
    )
    .groupBy(timesheetEntries.weekStart);
  return rows.map((r) => ({ ...r, reviewedAt: new Date(r.reviewedAt) }));
}
