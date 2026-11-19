import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { approvalSettings, approvalSteps, employees, users } from "@/db/schema";
import { createModuleReadiness } from "@/lib/db/module-readiness";

import { hrGate, needsManager, type ApprovalRequestType, type GateResult } from "./rules";

export const APPROVAL_CHAIN_MIGRATION = "0032_approval_chain";
export const APPROVAL_CHAIN_GUIDE = "docs/approval-chain.md";

/** Whether migration 0032 has been applied. */
export const isApprovalChainReady = createModuleReadiness(["approval_settings", "approval_steps"]);

/** Request types with the manager step switched on (empty before 0032). */
export async function managerStepTypes(organizationId: string): Promise<Set<ApprovalRequestType>> {
  if (!(await isApprovalChainReady())) return new Set();
  const rows = await db
    .select({ type: approvalSettings.requestType })
    .from(approvalSettings)
    .where(and(eq(approvalSettings.organizationId, organizationId), eq(approvalSettings.managerStep, true)));
  return new Set(rows.map((r) => r.type as ApprovalRequestType));
}

export interface ManagerInfo {
  managerUserId: string | null;
  managerName: string | null;
  employeeUserId: string | null;
}

/** The employee's direct manager account (active manager with a linked user). */
export async function resolveManager(organizationId: string, employeeId: string): Promise<ManagerInfo> {
  const managers = alias(employees, "managers");
  const rows = await db
    .select({
      employeeUserId: employees.userId,
      managerUserId: managers.userId,
      managerStatus: managers.employmentStatus,
      managerName: sql<string | null>`TRIM(${managers.firstName} || ' ' || ${managers.lastName})`,
    })
    .from(employees)
    .leftJoin(managers, and(eq(managers.id, employees.managerId), eq(managers.organizationId, organizationId)))
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
    .limit(1);
  const row = rows[0];
  if (!row) return { managerUserId: null, managerName: null, employeeUserId: null };
  const active = row.managerUserId && row.managerStatus === "active";
  return {
    managerUserId: active ? row.managerUserId : null,
    managerName: active ? row.managerName : null,
    employeeUserId: row.employeeUserId,
  };
}

export async function managerDecision(
  organizationId: string,
  type: ApprovalRequestType,
  requestId: string
): Promise<{ decision: "approved" | "rejected"; approverName: string | null; note: string | null; decidedAt: Date } | null> {
  if (!(await isApprovalChainReady())) return null;
  const rows = await db
    .select({
      decision: approvalSteps.decision,
      note: approvalSteps.note,
      decidedAt: approvalSteps.decidedAt,
      approverName: sql<string | null>`COALESCE(${users.name}, ${users.email})`,
    })
    .from(approvalSteps)
    .leftJoin(users, eq(users.id, approvalSteps.approverUserId))
    .where(
      and(
        eq(approvalSteps.organizationId, organizationId),
        eq(approvalSteps.requestType, type),
        eq(approvalSteps.requestId, requestId),
        eq(approvalSteps.step, "manager")
      )
    )
    .limit(1);
  const r = rows[0];
  return r ? { ...r, decision: r.decision as "approved" | "rejected" } : null;
}

/**
 * Final-approver gate for the existing review actions. Returns an error
 * message while the direct manager still has to approve; null otherwise.
 * Before migration 0032, or with the step off, it never blocks.
 */
export async function finalApprovalBlock(
  organizationId: string,
  type: ApprovalRequestType,
  requestId: string,
  employeeId: string | null,
  actorUserId: string
): Promise<string | null> {
  if (!employeeId) return null;
  const enabled = (await managerStepTypes(organizationId)).has(type);
  if (!enabled) return null;
  const [manager, step] = await Promise.all([
    resolveManager(organizationId, employeeId),
    managerDecision(organizationId, type, requestId),
  ]);
  const gate: GateResult = hrGate({
    enabled,
    managerUserId: manager.managerUserId,
    employeeUserId: manager.employeeUserId,
    managerDecision: step?.decision ?? null,
    actorUserId,
  });
  return gate.state === "waiting"
    ? `Menunggu persetujuan atasan langsung${manager.managerName ? ` (${manager.managerName})` : ""} terlebih dahulu.`
    : null;
}

/** Records the manager's decision (one per request). */
export async function recordManagerDecision(
  organizationId: string,
  type: ApprovalRequestType,
  requestId: string,
  approverUserId: string,
  decision: "approved" | "rejected",
  note: string | null
): Promise<boolean> {
  const inserted = await db
    .insert(approvalSteps)
    .values({ organizationId, requestType: type, requestId, step: "manager", approverUserId, decision, note })
    .onConflictDoNothing()
    .returning({ id: approvalSteps.id });
  return inserted.length > 0;
}

/** Manager decisions for many requests of one type (inbox labels). */
export async function managerDecisions(organizationId: string, type: ApprovalRequestType, requestIds: string[]): Promise<Map<string, string>> {
  if (requestIds.length === 0 || !(await isApprovalChainReady())) return new Map();
  const rows = await db
    .select({ requestId: approvalSteps.requestId, decision: approvalSteps.decision })
    .from(approvalSteps)
    .where(
      and(
        eq(approvalSteps.organizationId, organizationId),
        eq(approvalSteps.requestType, type),
        inArray(approvalSteps.requestId, requestIds)
      )
    );
  return new Map(rows.map((r) => [r.requestId, r.decision]));
}

/** Active direct reports of the employee linked to `userId`. */
export async function directReportIds(organizationId: string, userId: string): Promise<string[]> {
  const managers = alias(employees, "managers");
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .innerJoin(managers, eq(managers.id, employees.managerId))
    .where(
      and(
        eq(employees.organizationId, organizationId),
        eq(managers.organizationId, organizationId),
        eq(managers.userId, userId),
        eq(employees.employmentStatus, "active")
      )
    );
  return rows.map((r) => r.id);
}

/**
 * Of the given pending requests, those still waiting for their direct
 * manager ("type:id" keys). Empty when the module or the step is off.
 */
export async function awaitingManager(
  organizationId: string,
  items: { type: ApprovalRequestType; id: string; employeeId: string | null }[]
): Promise<Set<string>> {
  const out = new Set<string>();
  const enabled = await managerStepTypes(organizationId);
  const relevant = items.filter((i) => enabled.has(i.type) && i.employeeId);
  if (relevant.length === 0) return out;
  const managers = alias(employees, "managers");
  const employeeIds = [...new Set(relevant.map((i) => i.employeeId!))];
  const people = await db
    .select({ id: employees.id, userId: employees.userId, managerUserId: managers.userId, managerStatus: managers.employmentStatus })
    .from(employees)
    .leftJoin(managers, and(eq(managers.id, employees.managerId), eq(managers.organizationId, organizationId)))
    .where(and(eq(employees.organizationId, organizationId), inArray(employees.id, employeeIds)));
  const byId = new Map(people.map((p) => [p.id, p]));
  const decisions = new Map<string, Map<string, string>>();
  for (const type of enabled) {
    decisions.set(type, await managerDecisions(organizationId, type, relevant.filter((i) => i.type === type).map((i) => i.id)));
  }
  for (const item of relevant) {
    const p = byId.get(item.employeeId!);
    const managerUserId = p?.managerUserId && p.managerStatus === "active" ? p.managerUserId : null;
    const decision = decisions.get(item.type)?.get(item.id) ?? null;
    if (
      needsManager({
        enabled: true,
        managerUserId,
        employeeUserId: p?.userId ?? null,
        managerDecision: decision as "approved" | "rejected" | null,
      })
    ) {
      out.add(`${item.type}:${item.id}`);
    }
  }
  return out;
}
