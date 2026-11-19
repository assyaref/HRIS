import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { employees, leaveRequests, leaveTypes, overtimeRequests, permissionRequests } from "@/db/schema";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";

import { isTimeModuleReady } from "@/features/time/module";

import { directReportIds, managerDecisions, managerStepTypes } from "./chain";
import type { ApprovalRequestType } from "./rules";

export interface TeamRequest {
  type: ApprovalRequestType;
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  subject: string;
  period: string;
  submittedAt: Date;
  /** Manager decision already recorded (approved = waiting for HR). */
  managerDecision: string | null;
}

const name = sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`;
const dt = (column: Parameters<typeof sql>[1]) => sql<string>`to_char(${column} AT TIME ZONE ${APP_TIME_ZONE}, 'DD Mon HH24:MI')`;

/**
 * Pending requests of the user's direct reports for every request type with
 * the manager step on, with the manager decision if already given.
 */
export async function listTeamRequests(organizationId: string, managerUserId: string): Promise<{ enabled: ApprovalRequestType[]; reports: number; items: TeamRequest[] }> {
  const [enabled, reports] = await Promise.all([managerStepTypes(organizationId), directReportIds(organizationId, managerUserId)]);
  if (reports.length === 0 || enabled.size === 0) return { enabled: [...enabled], reports: reports.length, items: [] };

  const [leave, permission, overtime] = await Promise.all([
    enabled.has("leave")
      ? db
          .select({
            id: leaveRequests.id,
            employeeId: employees.id,
            employeeName: name,
            employeeNumber: employees.employeeNumber,
            subject: leaveTypes.name,
            start: sql<string>`to_char(${leaveRequests.startDate}, 'YYYY-MM-DD')`,
            end: sql<string>`to_char(${leaveRequests.endDate}, 'YYYY-MM-DD')`,
            days: leaveRequests.totalDays,
            submittedAt: leaveRequests.submittedAt,
          })
          .from(leaveRequests)
          .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
          .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
          .where(and(eq(leaveRequests.organizationId, organizationId), eq(leaveRequests.status, "pending"), inArray(leaveRequests.employeeId, reports)))
          .orderBy(desc(leaveRequests.submittedAt))
      : Promise.resolve([]),
    enabled.has("permission")
      ? db
          .select({
            id: permissionRequests.id,
            employeeId: employees.id,
            employeeName: name,
            employeeNumber: employees.employeeNumber,
            subject: permissionRequests.permissionType,
            start: dt(permissionRequests.startAt),
            end: dt(permissionRequests.endAt),
            submittedAt: permissionRequests.submittedAt,
          })
          .from(permissionRequests)
          .innerJoin(employees, eq(employees.id, permissionRequests.employeeId))
          .where(and(eq(permissionRequests.organizationId, organizationId), eq(permissionRequests.status, "pending"), inArray(permissionRequests.employeeId, reports)))
          .orderBy(desc(permissionRequests.submittedAt))
      : Promise.resolve([]),
    enabled.has("overtime") && (await isTimeModuleReady())
      ? db
          .select({
            id: overtimeRequests.id,
            employeeId: employees.id,
            employeeName: name,
            employeeNumber: employees.employeeNumber,
            day: overtimeRequests.overtimeDate,
            start: overtimeRequests.startTime,
            end: overtimeRequests.endTime,
            reason: overtimeRequests.reason,
            submittedAt: overtimeRequests.createdAt,
          })
          .from(overtimeRequests)
          .innerJoin(employees, eq(employees.id, overtimeRequests.employeeId))
          .where(and(eq(overtimeRequests.organizationId, organizationId), eq(overtimeRequests.status, "pending"), inArray(overtimeRequests.employeeId, reports)))
          .orderBy(desc(overtimeRequests.createdAt))
      : Promise.resolve([]),
  ]);

  const [leaveSteps, permissionSteps, overtimeSteps] = await Promise.all([
    managerDecisions(organizationId, "leave", leave.map((r) => r.id)),
    managerDecisions(organizationId, "permission", permission.map((r) => r.id)),
    managerDecisions(organizationId, "overtime", overtime.map((r) => r.id)),
  ]);

  const items: TeamRequest[] = [
    ...leave.map((r) => ({
      type: "leave" as const,
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      employeeNumber: r.employeeNumber,
      subject: r.subject,
      period: r.start === r.end ? `${r.start} (${r.days} hari)` : `${r.start} → ${r.end} (${r.days} hari)`,
      submittedAt: r.submittedAt,
      managerDecision: leaveSteps.get(r.id) ?? null,
    })),
    ...permission.map((r) => ({
      type: "permission" as const,
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      employeeNumber: r.employeeNumber,
      subject: r.subject,
      period: `${r.start} → ${r.end}`,
      submittedAt: r.submittedAt,
      managerDecision: permissionSteps.get(r.id) ?? null,
    })),
    ...overtime.map((r) => ({
      type: "overtime" as const,
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      employeeNumber: r.employeeNumber,
      subject: r.reason,
      period: `${r.day} · ${r.start}–${r.end}`,
      submittedAt: r.submittedAt,
      managerDecision: overtimeSteps.get(r.id) ?? null,
    })),
  ].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
  return { enabled: [...enabled], reports: reports.length, items };
}
