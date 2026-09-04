import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  organizations,
  payrollComponents,
  payrollEvents,
  payrollItemComponents,
  payrollItems,
  payrollPeriods,
  payrollRuns,
  payslips,
  users,
} from "@/db/schema";
import type {
  PayrollComponentMethod,
  PayrollComponentType,
  PayrollItemStatus,
  PayrollPeriodStatus,
  PayrollRunStatus,
  PayslipStatus,
} from "./constants";

/**
 * Payroll data access (Phase 8) — server-only.
 *
 * Every query is organization-scoped. Callers always pass
 * `currentUser.organizationId`; a requested id from another organization
 * resolves to `null` and pages respond with `forbidden()` so existence is
 * never leaked.
 */

export interface PayrollPeriodRow {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  paymentDate: Date;
  status: PayrollPeriodStatus;
  createdAt: Date;
}

export interface PayrollRunRow {
  id: string;
  organizationId: string;
  payrollPeriodId: string;
  status: PayrollRunStatus;
  calculatedAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  lockedAt: Date | null;
  createdAt: Date;
}

export interface PayrollPeriodWithRun extends PayrollPeriodRow {
  run: PayrollRunRow | null;
  organizationName: string;
}

export interface PayrollItemRow {
  id: string;
  organizationId: string;
  payrollRunId: string;
  employeeId: string;
  employeeNumberSnapshot: string;
  employeeNameSnapshot: string;
  grossAmount: number;
  totalEarnings: number;
  totalDeductions: number;
  netAmount: number;
  status: PayrollItemStatus;
}

export interface PayrollItemComponentRow {
  id: string;
  payrollItemId: string;
  componentCodeSnapshot: string;
  componentNameSnapshot: string;
  componentTypeSnapshot: PayrollComponentType;
  amount: number;
  notes: string | null;
}

export interface PayrollComponentRow {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: PayrollComponentType;
  calculationMethod: PayrollComponentMethod;
  defaultAmount: number;
  active: string;
  description: string | null;
}

export interface PayslipRow {
  id: string;
  organizationId: string;
  payrollItemId: string;
  employeeId: string;
  payslipNumber: string;
  issuedAt: Date;
  status: PayslipStatus;
}

export interface PayrollEventRow {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  eventAt: Date;
  actorEmail: string | null;
}

interface PayrollPeriodViewRow {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  paymentDate: Date;
  status: string;
  createdAt: Date;
  runId: string | null;
  runStatus: string | null;
  runCalculatedAt: Date | null;
  runApprovedAt: Date | null;
  runLockedAt: Date | null;
  organizationName: string;
}

function toPayrollRunRow(row: PayrollPeriodViewRow): PayrollRunRow | null {
  if (!row.runId) return null;
  return {
    id: row.runId,
    organizationId: row.organizationId,
    payrollPeriodId: row.id,
    status: row.runStatus as PayrollRunStatus,
    calculatedAt: row.runCalculatedAt,
    submittedAt: null,
    approvedAt: row.runApprovedAt,
    lockedAt: row.runLockedAt,
    createdAt: row.createdAt,
  };
}

function toPayrollPeriodWithRun(row: PayrollPeriodViewRow): PayrollPeriodWithRun {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    paymentDate: row.paymentDate,
    status: row.status as PayrollPeriodStatus,
    createdAt: row.createdAt,
    organizationName: row.organizationName,
    run: toPayrollRunRow(row),
  };
}

function toPayrollComponentRow(row: {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: string;
  calculationMethod: string;
  defaultAmount: number;
  active: string;
  description: string | null;
}): PayrollComponentRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    type: row.type as PayrollComponentType,
    calculationMethod: row.calculationMethod as PayrollComponentMethod,
    defaultAmount: row.defaultAmount,
    active: row.active,
    description: row.description,
  };
}

function toPayrollItemRow(row: {
  id: string;
  organizationId: string;
  payrollRunId: string;
  employeeId: string;
  employeeNumberSnapshot: string;
  employeeNameSnapshot: string;
  grossAmount: number;
  totalEarnings: number;
  totalDeductions: number;
  netAmount: number;
  status: string;
}): PayrollItemRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    payrollRunId: row.payrollRunId,
    employeeId: row.employeeId,
    employeeNumberSnapshot: row.employeeNumberSnapshot,
    employeeNameSnapshot: row.employeeNameSnapshot,
    grossAmount: row.grossAmount,
    totalEarnings: row.totalEarnings,
    totalDeductions: row.totalDeductions,
    netAmount: row.netAmount,
    status: row.status as PayrollItemStatus,
  };
}

function toPayslipRow(row: {
  id: string;
  organizationId: string;
  payrollItemId: string;
  employeeId: string;
  payslipNumber: string;
  issuedAt: Date;
  status: string;
}): PayslipRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    payrollItemId: row.payrollItemId,
    employeeId: row.employeeId,
    payslipNumber: row.payslipNumber,
    issuedAt: row.issuedAt,
    status: row.status as PayslipStatus,
  };
}

function toPayrollItemComponentRow(row: {
  id: string;
  payrollItemId: string;
  componentCodeSnapshot: string;
  componentNameSnapshot: string;
  componentTypeSnapshot: string;
  amount: number;
  notes: string | null;
}): PayrollItemComponentRow {
  return {
    id: row.id,
    payrollItemId: row.payrollItemId,
    componentCodeSnapshot: row.componentCodeSnapshot,
    componentNameSnapshot: row.componentNameSnapshot,
    componentTypeSnapshot: row.componentTypeSnapshot as PayrollComponentType,
    amount: row.amount,
    notes: row.notes,
  };
}

export interface PayslipDetailRow extends PayslipRow {
  employeeNumber: string;
  employeeName: string;
  periodCode: string;
  periodName: string;
  periodStart: Date;
  periodEnd: Date;
  paymentDate: Date;
  grossAmount: number;
  totalEarnings: number;
  totalDeductions: number;
  netAmount: number;
  organizationName: string;
  components: PayrollItemComponentRow[];
}

/** List payroll periods for an organization, newest first. */
export async function listPayrollPeriods(
  organizationId: string
): Promise<PayrollPeriodWithRun[]> {
  const rows = await db
    .select({
      id: payrollPeriods.id,
      organizationId: payrollPeriods.organizationId,
      code: payrollPeriods.code,
      name: payrollPeriods.name,
      periodStart: payrollPeriods.periodStart,
      periodEnd: payrollPeriods.periodEnd,
      paymentDate: payrollPeriods.paymentDate,
      status: payrollPeriods.status,
      createdAt: payrollPeriods.createdAt,
      runId: payrollRuns.id,
      runStatus: payrollRuns.status,
      runCalculatedAt: payrollRuns.calculatedAt,
      runApprovedAt: payrollRuns.approvedAt,
      runLockedAt: payrollRuns.lockedAt,
      organizationName: organizations.name,
    })
    .from(payrollPeriods)
    .innerJoin(
      organizations,
      eq(organizations.id, payrollPeriods.organizationId)
    )
    .leftJoin(payrollRuns, eq(payrollRuns.payrollPeriodId, payrollPeriods.id))
    .where(eq(payrollPeriods.organizationId, organizationId))
    .orderBy(desc(payrollPeriods.periodStart));

  return rows.map(toPayrollPeriodWithRun);
}

/** One payroll period scoped to the organization (or null). */
export async function getPayrollPeriodInOrganization(
  organizationId: string,
  periodId: string
): Promise<PayrollPeriodWithRun | null> {
  const rows = await db
    .select({
      id: payrollPeriods.id,
      organizationId: payrollPeriods.organizationId,
      code: payrollPeriods.code,
      name: payrollPeriods.name,
      periodStart: payrollPeriods.periodStart,
      periodEnd: payrollPeriods.periodEnd,
      paymentDate: payrollPeriods.paymentDate,
      status: payrollPeriods.status,
      createdAt: payrollPeriods.createdAt,
      runId: payrollRuns.id,
      runStatus: payrollRuns.status,
      runCalculatedAt: payrollRuns.calculatedAt,
      runApprovedAt: payrollRuns.approvedAt,
      runLockedAt: payrollRuns.lockedAt,
      organizationName: organizations.name,
    })
    .from(payrollPeriods)
    .innerJoin(
      organizations,
      eq(organizations.id, payrollPeriods.organizationId)
    )
    .leftJoin(payrollRuns, eq(payrollRuns.payrollPeriodId, payrollPeriods.id))
    .where(
      and(
        eq(payrollPeriods.id, periodId),
        eq(payrollPeriods.organizationId, organizationId)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return toPayrollPeriodWithRun(row);
}

/** Active payroll components for an organization. */
export async function listPayrollComponents(
  organizationId: string
): Promise<PayrollComponentRow[]> {
  const rows = await db
    .select({
      id: payrollComponents.id,
      organizationId: payrollComponents.organizationId,
      code: payrollComponents.code,
      name: payrollComponents.name,
      type: payrollComponents.type,
      calculationMethod: payrollComponents.calculationMethod,
      defaultAmount: payrollComponents.defaultAmount,
      active: payrollComponents.active,
      description: payrollComponents.description,
    })
    .from(payrollComponents)
    .where(
      and(
        eq(payrollComponents.organizationId, organizationId),
        eq(payrollComponents.active, "true")
      )
    )
    .orderBy(asc(payrollComponents.type), asc(payrollComponents.code));
  return rows.map(toPayrollComponentRow);
}

/** All payroll items for a run (org-scoped via the run). */
export async function listPayrollItemsForRun(
  organizationId: string,
  payrollRunId: string
): Promise<PayrollItemRow[]> {
  const rows = await db
    .select({
      id: payrollItems.id,
      organizationId: payrollItems.organizationId,
      payrollRunId: payrollItems.payrollRunId,
      employeeId: payrollItems.employeeId,
      employeeNumberSnapshot: payrollItems.employeeNumberSnapshot,
      employeeNameSnapshot: payrollItems.employeeNameSnapshot,
      grossAmount: payrollItems.grossAmount,
      totalEarnings: payrollItems.totalEarnings,
      totalDeductions: payrollItems.totalDeductions,
      netAmount: payrollItems.netAmount,
      status: payrollItems.status,
    })
    .from(payrollItems)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
    .where(
      and(
        eq(payrollItems.payrollRunId, payrollRunId),
        eq(payrollRuns.organizationId, organizationId)
      )
    )
    .orderBy(asc(payrollItems.employeeNameSnapshot));
  return rows.map(toPayrollItemRow);
}

/** One payroll item scoped to the org (or null). */
export async function getPayrollItemInOrganization(
  organizationId: string,
  payrollItemId: string
): Promise<PayrollItemRow | null> {
  const rows = await db
    .select({
      id: payrollItems.id,
      organizationId: payrollItems.organizationId,
      payrollRunId: payrollItems.payrollRunId,
      employeeId: payrollItems.employeeId,
      employeeNumberSnapshot: payrollItems.employeeNumberSnapshot,
      employeeNameSnapshot: payrollItems.employeeNameSnapshot,
      grossAmount: payrollItems.grossAmount,
      totalEarnings: payrollItems.totalEarnings,
      totalDeductions: payrollItems.totalDeductions,
      netAmount: payrollItems.netAmount,
      status: payrollItems.status,
    })
    .from(payrollItems)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
    .where(
      and(
        eq(payrollItems.id, payrollItemId),
        eq(payrollRuns.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  return row ? toPayrollItemRow(row) : null;
}

/** Component rows (breakdown) for one payroll item (org-scoped). */
export async function listPayrollItemComponents(
  organizationId: string,
  payrollItemId: string
): Promise<PayrollItemComponentRow[]> {
  const rows = await db
    .select({
      id: payrollItemComponents.id,
      payrollItemId: payrollItemComponents.payrollItemId,
      componentCodeSnapshot: payrollItemComponents.componentCodeSnapshot,
      componentNameSnapshot: payrollItemComponents.componentNameSnapshot,
      componentTypeSnapshot: payrollItemComponents.componentTypeSnapshot,
      amount: payrollItemComponents.amount,
      notes: payrollItemComponents.notes,
    })
    .from(payrollItemComponents)
    .innerJoin(payrollItems, eq(payrollItems.id, payrollItemComponents.payrollItemId))
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
    .where(
      and(
        eq(payrollItemComponents.payrollItemId, payrollItemId),
        eq(payrollRuns.organizationId, organizationId)
      )
    )
    .orderBy(
      asc(payrollItemComponents.componentTypeSnapshot),
      asc(payrollItemComponents.componentCodeSnapshot)
    );
  return rows.map(toPayrollItemComponentRow);
}

/** Append-only workflow events for a period (org-scoped). */
export async function listPayrollEvents(
  organizationId: string,
  periodId: string
): Promise<PayrollEventRow[]> {
  const rows = await db
    .select({
      id: payrollEvents.id,
      eventType: payrollEvents.eventType,
      fromStatus: payrollEvents.fromStatus,
      toStatus: payrollEvents.toStatus,
      reason: payrollEvents.reason,
      eventAt: payrollEvents.eventAt,
      actorEmail: users.email,
    })
    .from(payrollEvents)
    .leftJoin(users, eq(users.id, payrollEvents.actorUserId))
    .where(
      and(
        eq(payrollEvents.organizationId, organizationId),
        eq(payrollEvents.payrollPeriodId, periodId)
      )
    )
    .orderBy(asc(payrollEvents.eventAt));
  return rows;
}

/** My published payslips (employee self-service). */
export async function listMyPublishedPayslips(
  organizationId: string,
  employeeId: string
): Promise<PayslipRow[]> {
  const rows = await db
    .select({
      id: payslips.id,
      organizationId: payslips.organizationId,
      payrollItemId: payslips.payrollItemId,
      employeeId: payslips.employeeId,
      payslipNumber: payslips.payslipNumber,
      issuedAt: payslips.issuedAt,
      status: payslips.status,
    })
    .from(payslips)
    .where(
      and(
        eq(payslips.organizationId, organizationId),
        eq(payslips.employeeId, employeeId),
        eq(payslips.status, "published")
      )
    )
    .orderBy(desc(payslips.issuedAt));
  return rows.map(toPayslipRow);
}

/** All payslips for a run (management). */
export async function listPayslipsForRun(
  organizationId: string,
  payrollRunId: string
): Promise<PayslipRow[]> {
  const rows = await db
    .select({
      id: payslips.id,
      organizationId: payslips.organizationId,
      payrollItemId: payslips.payrollItemId,
      employeeId: payslips.employeeId,
      payslipNumber: payslips.payslipNumber,
      issuedAt: payslips.issuedAt,
      status: payslips.status,
    })
    .from(payslips)
    .innerJoin(payrollItems, eq(payrollItems.id, payslips.payrollItemId))
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
    .where(
      and(
        eq(payrollItems.payrollRunId, payrollRunId),
        eq(payrollRuns.organizationId, organizationId)
      )
    )
    .orderBy(asc(payslips.payslipNumber));
  return rows.map(toPayslipRow);
}

/** All payroll components (active + inactive) for the management UI. */
export async function listAllPayrollComponents(
  organizationId: string
): Promise<PayrollComponentRow[]> {
  const rows = await db
    .select({
      id: payrollComponents.id,
      organizationId: payrollComponents.organizationId,
      code: payrollComponents.code,
      name: payrollComponents.name,
      type: payrollComponents.type,
      calculationMethod: payrollComponents.calculationMethod,
      defaultAmount: payrollComponents.defaultAmount,
      active: payrollComponents.active,
      description: payrollComponents.description,
    })
    .from(payrollComponents)
    .where(eq(payrollComponents.organizationId, organizationId))
    .orderBy(asc(payrollComponents.type), asc(payrollComponents.code));
  return rows.map(toPayrollComponentRow);
}

/** One payroll component, org-scoped (or null). */
export async function getPayrollComponentInOrganization(
  organizationId: string,
  componentId: string
): Promise<PayrollComponentRow | null> {
  const rows = await db
    .select({
      id: payrollComponents.id,
      organizationId: payrollComponents.organizationId,
      code: payrollComponents.code,
      name: payrollComponents.name,
      type: payrollComponents.type,
      calculationMethod: payrollComponents.calculationMethod,
      defaultAmount: payrollComponents.defaultAmount,
      active: payrollComponents.active,
      description: payrollComponents.description,
    })
    .from(payrollComponents)
    .where(
      and(
        eq(payrollComponents.id, componentId),
        eq(payrollComponents.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  return row ? toPayrollComponentRow(row) : null;
}

/** Component breakdown rows for an entire run (avoid N+1 on run pages). */
export async function listPayrollRunItemComponents(
  organizationId: string,
  payrollRunId: string
): Promise<PayrollItemComponentRow[]> {
  const rows = await db
    .select({
      id: payrollItemComponents.id,
      payrollItemId: payrollItemComponents.payrollItemId,
      componentCodeSnapshot: payrollItemComponents.componentCodeSnapshot,
      componentNameSnapshot: payrollItemComponents.componentNameSnapshot,
      componentTypeSnapshot: payrollItemComponents.componentTypeSnapshot,
      amount: payrollItemComponents.amount,
      notes: payrollItemComponents.notes,
    })
    .from(payrollItemComponents)
    .innerJoin(payrollItems, eq(payrollItems.id, payrollItemComponents.payrollItemId))
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
    .where(
      and(
        eq(payrollItems.payrollRunId, payrollRunId),
        eq(payrollRuns.organizationId, organizationId)
      )
    )
    .orderBy(
      asc(payrollItemComponents.payrollItemId),
      asc(payrollItemComponents.componentTypeSnapshot),
      asc(payrollItemComponents.componentCodeSnapshot)
    );
  return rows.map(toPayrollItemComponentRow);
}

/**
 * One published payslip with the underlying item/period data and component
 * breakdown (org-scoped). Returns null when the id is not in the organization
 * or the payslip is not published (callers respond with forbidden()).
 */
export async function getPublishedPayslipDetail(
  organizationId: string,
  payslipId: string
): Promise<PayslipDetailRow | null> {
  const rows = await db
    .select({
      id: payslips.id,
      organizationId: payslips.organizationId,
      payrollItemId: payslips.payrollItemId,
      employeeId: payslips.employeeId,
      payslipNumber: payslips.payslipNumber,
      issuedAt: payslips.issuedAt,
      status: payslips.status,
      employeeNumber: payrollItems.employeeNumberSnapshot,
      employeeName: payrollItems.employeeNameSnapshot,
      periodCode: payrollPeriods.code,
      periodName: payrollPeriods.name,
      periodStart: payrollPeriods.periodStart,
      periodEnd: payrollPeriods.periodEnd,
      paymentDate: payrollPeriods.paymentDate,
      grossAmount: payrollItems.grossAmount,
      totalEarnings: payrollItems.totalEarnings,
      totalDeductions: payrollItems.totalDeductions,
      netAmount: payrollItems.netAmount,
      organizationName: organizations.name,
    })
    .from(payslips)
    .innerJoin(payrollItems, eq(payrollItems.id, payslips.payrollItemId))
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
    .innerJoin(
      payrollPeriods,
      eq(payrollPeriods.id, payrollRuns.payrollPeriodId)
    )
    .innerJoin(
      organizations,
      eq(organizations.id, payrollPeriods.organizationId)
    )
    .where(
      and(
        eq(payslips.id, payslipId),
        eq(payslips.organizationId, organizationId),
        eq(payslips.status, "published")
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const componentRows = await db
    .select({
      id: payrollItemComponents.id,
      payrollItemId: payrollItemComponents.payrollItemId,
      componentCodeSnapshot: payrollItemComponents.componentCodeSnapshot,
      componentNameSnapshot: payrollItemComponents.componentNameSnapshot,
      componentTypeSnapshot: payrollItemComponents.componentTypeSnapshot,
      amount: payrollItemComponents.amount,
      notes: payrollItemComponents.notes,
    })
    .from(payrollItemComponents)
    .where(eq(payrollItemComponents.payrollItemId, row.payrollItemId))
    .orderBy(
      asc(payrollItemComponents.componentTypeSnapshot),
      asc(payrollItemComponents.componentCodeSnapshot)
    );

  return {
    id: row.id,
    organizationId: row.organizationId,
    payrollItemId: row.payrollItemId,
    employeeId: row.employeeId,
    payslipNumber: row.payslipNumber,
    issuedAt: row.issuedAt,
    status: row.status as PayslipStatus,
    employeeNumber: row.employeeNumber,
    employeeName: row.employeeName,
    periodCode: row.periodCode,
    periodName: row.periodName,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    paymentDate: row.paymentDate,
    grossAmount: row.grossAmount,
    totalEarnings: row.totalEarnings,
    totalDeductions: row.totalDeductions,
    netAmount: row.netAmount,
    organizationName: row.organizationName,
    components: componentRows.map(toPayrollItemComponentRow),
  };
}