import "server-only";

import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  employees,
  organizations,
  payrollComponents,
  payrollEvents,
  payrollItemComponents,
  payrollItems,
  payrollPeriods,
  payrollRuns,
  payslips,
  payslipDocuments,
  payslipDocumentVersions,
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
import {
  payslipDocumentSourceFrom,
  type PayslipDocumentSource,
} from "./payslip-document.guard";
import type { PayslipKind } from "./payslip-distribution.guard";

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
  payrollItemId: string | null;
  payrollPeriodId: string | null;
  employeeId: string;
  /** Historical employee number snapshot used for the PDF password contract. */
  employeeNumberSnapshot: string | null;
  payslipNumber: string;
  issuedAt: Date;
  status: PayslipStatus;
  kind: PayslipKind;
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
  payrollItemId: string | null;
  payrollPeriodId: string | null;
  employeeId: string;
  employeeNumberSnapshot: string | null;
  payslipNumber: string;
  issuedAt: Date;
  status: string;
}): PayslipRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    payrollItemId: row.payrollItemId,
    payrollPeriodId: row.payrollPeriodId,
    employeeId: row.employeeId,
    employeeNumberSnapshot: row.employeeNumberSnapshot,
    payslipNumber: row.payslipNumber,
    issuedAt: row.issuedAt,
    status: row.status as PayslipStatus,
    kind: row.payrollItemId ? "calculated" : "distribution",
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
  /** Null for Mode B (distribution) payslips — no payroll calculation exists. */
  grossAmount: number | null;
  totalEarnings: number | null;
  totalDeductions: number | null;
  netAmount: number | null;
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
      payrollPeriodId: payslips.payrollPeriodId,
      employeeId: payslips.employeeId,
      employeeNumberSnapshot: payslips.employeeNumberSnapshot,
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

/** All Mode A payslips for a run (management). */
export async function listPayslipsForRun(
  organizationId: string,
  payrollRunId: string
): Promise<PayslipRow[]> {
  const rows = await db
    .select({
      id: payslips.id,
      organizationId: payslips.organizationId,
      payrollItemId: payslips.payrollItemId,
      payrollPeriodId: payslips.payrollPeriodId,
      employeeId: payslips.employeeId,
      employeeNumberSnapshot: payslips.employeeNumberSnapshot,
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

/**
 * Every payslip directly linked to a payroll period (Mode A calculated +
 * Mode B distribution), newest first. Management view; organization-scoped.
 */
export async function listPayslipsForPeriod(
  organizationId: string,
  payrollPeriodId: string
): Promise<PayslipRow[]> {
  const rows = await db
    .select({
      id: payslips.id,
      organizationId: payslips.organizationId,
      payrollItemId: payslips.payrollItemId,
      payrollPeriodId: payslips.payrollPeriodId,
      employeeId: payslips.employeeId,
      employeeNumberSnapshot: payslips.employeeNumberSnapshot,
      payslipNumber: payslips.payslipNumber,
      issuedAt: payslips.issuedAt,
      status: payslips.status,
    })
    .from(payslips)
    .where(
      and(
        eq(payslips.organizationId, organizationId),
        eq(payslips.payrollPeriodId, payrollPeriodId)
      )
    )
    .orderBy(asc(payslips.payslipNumber));
  return rows.map(toPayslipRow);
}

/** Active employees available for a Mode B distribution payslip upload. */
export interface PayrollDistributionEmployee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
}

/**
 * Active, organization-scoped employees for the distribution upload picker.
 * Only identity fields needed to build the PDF password are returned.
 */
export async function listPayrollDistributionEmployees(
  organizationId: string
): Promise<PayrollDistributionEmployee[]> {
  const rows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      birthDate: employees.birthDate,
    })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        eq(employees.employmentStatus, "active")
      )
    )
    .orderBy(asc(employees.lastName), asc(employees.firstName));

  return rows;
}

export interface PayslipOverviewRow {
  id: string;
  payslipNumber: string;
  kind: PayslipKind;
  status: PayslipStatus;
  issuedAt: Date;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  payrollPeriodId: string | null;
  periodCode: string | null;
  periodName: string | null;
}

export const RECENT_PAYSLIPS_LIMIT = 100;

/**
 * Recent payslips across every period (Mode A calculated + Mode B
 * distribution), newest first, organization-scoped. Bounded to
 * `RECENT_PAYSLIPS_LIMIT` rows for the management overview page.
 */
export async function listRecentPayslips(
  organizationId: string
): Promise<PayslipOverviewRow[]> {
  const employeeName = sql<string>`coalesce(
    ${payrollItems.employeeNameSnapshot},
    ${employees.firstName} || ' ' || ${employees.lastName}
  )`;
  const employeeNumber = sql<string>`coalesce(
    ${payslips.employeeNumberSnapshot},
    ${payrollItems.employeeNumberSnapshot},
    ${employees.employeeNumber}
  )`;
  const resolvedPeriodId = sql<string>`coalesce(
    ${payrollRuns.payrollPeriodId},
    ${payslips.payrollPeriodId}
  )`;

  const rows = await db
    .select({
      id: payslips.id,
      payslipNumber: payslips.payslipNumber,
      payrollItemId: payslips.payrollItemId,
      status: payslips.status,
      issuedAt: payslips.issuedAt,
      employeeId: payslips.employeeId,
      employeeNumber,
      employeeName,
      payrollPeriodId: resolvedPeriodId,
      periodCode: payrollPeriods.code,
      periodName: payrollPeriods.name,
    })
    .from(payslips)
    .leftJoin(payrollItems, eq(payrollItems.id, payslips.payrollItemId))
    .leftJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
    .leftJoin(
      payrollPeriods,
      or(
        eq(payrollPeriods.id, payrollRuns.payrollPeriodId),
        eq(payrollPeriods.id, payslips.payrollPeriodId)
      )
    )
    .innerJoin(employees, eq(employees.id, payslips.employeeId))
    .where(eq(payslips.organizationId, organizationId))
    .orderBy(desc(payslips.issuedAt))
    .limit(RECENT_PAYSLIPS_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    payslipNumber: row.payslipNumber,
    kind: row.payrollItemId ? "calculated" : "distribution",
    status: row.status as PayslipStatus,
    issuedAt: row.issuedAt,
    employeeId: row.employeeId,
    employeeNumber: row.employeeNumber,
    employeeName: row.employeeName,
    payrollPeriodId: row.payrollPeriodId ?? null,
    periodCode: row.periodCode,
    periodName: row.periodName,
  }));
}

export interface PayslipDocumentSummary {
  payslipId: string;
  payslipDocumentId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  version: number;
  source: PayslipDocumentSource;
  createdAt: Date;
}

/**
 * Current document + latest version metadata for every payslip in a run
 * (management view). Returns a map keyed by `payslipId`; payslips without a
 * document are absent.
 *
 * Organization-scoped. The `payslip_documents` row is the current pointer and
 * the highest `payslip_document_versions` row describes it; version history
 * itself is never exposed beyond the current version number/source.
 */
export async function listPayslipDocumentSummariesForRun(
  organizationId: string,
  payrollRunId: string
): Promise<Map<string, PayslipDocumentSummary>> {
  const documentRows = await db
    .select({
      payslipId: payslipDocuments.payslipId,
      payslipDocumentId: payslipDocuments.id,
      originalFilename: payslipDocuments.originalFilename,
      mimeType: payslipDocuments.mimeType,
      fileSize: payslipDocuments.fileSize,
      sha256: payslipDocuments.sha256,
      createdAt: payslipDocuments.createdAt,
    })
    .from(payslipDocuments)
    .innerJoin(payslips, eq(payslips.id, payslipDocuments.payslipId))
    .innerJoin(payrollItems, eq(payrollItems.id, payslips.payrollItemId))
    .where(
      and(
        eq(payslipDocuments.organizationId, organizationId),
        eq(payrollItems.payrollRunId, payrollRunId),
        eq(payrollItems.organizationId, organizationId)
      )
    );

  if (documentRows.length === 0) {
    return new Map();
  }

  const documentIds = documentRows.map((row) => row.payslipDocumentId);

  const versionRows = await db
    .select({
      payslipDocumentId: payslipDocumentVersions.payslipDocumentId,
      version: payslipDocumentVersions.version,
      source: payslipDocumentVersions.source,
    })
    .from(payslipDocumentVersions)
    .where(
      and(
        eq(payslipDocumentVersions.organizationId, organizationId),
        inArray(payslipDocumentVersions.payslipDocumentId, documentIds)
      )
    )
    .orderBy(asc(payslipDocumentVersions.version));

  const latestByDocument = new Map<
    string,
    { version: number; source: string }
  >();

  for (const row of versionRows) {
    latestByDocument.set(row.payslipDocumentId, {
      version: row.version,
      source: row.source,
    });
  }

  const summaries = new Map<string, PayslipDocumentSummary>();

  for (const row of documentRows) {
    const latest = latestByDocument.get(row.payslipDocumentId);

    summaries.set(row.payslipId, {
      payslipId: row.payslipId,
      payslipDocumentId: row.payslipDocumentId,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      sha256: row.sha256,
      version: latest?.version ?? 1,
      source: payslipDocumentSourceFrom(latest?.source),
      createdAt: row.createdAt,
    });
  }

  return summaries;
}

/**
 * Current document + latest version metadata for every payslip directly linked
 * to a payroll period (both Mode A calculated and Mode B distribution).
 * Returns a map keyed by `payslipId`; payslips without a document are absent.
 * Organization-scoped.
 */
export async function listPayslipDocumentSummariesForPeriod(
  organizationId: string,
  payrollPeriodId: string
): Promise<Map<string, PayslipDocumentSummary>> {
  const documentRows = await db
    .select({
      payslipId: payslipDocuments.payslipId,
      payslipDocumentId: payslipDocuments.id,
      originalFilename: payslipDocuments.originalFilename,
      mimeType: payslipDocuments.mimeType,
      fileSize: payslipDocuments.fileSize,
      sha256: payslipDocuments.sha256,
      createdAt: payslipDocuments.createdAt,
    })
    .from(payslipDocuments)
    .innerJoin(payslips, eq(payslips.id, payslipDocuments.payslipId))
    .where(
      and(
        eq(payslipDocuments.organizationId, organizationId),
        eq(payslips.organizationId, organizationId),
        eq(payslips.payrollPeriodId, payrollPeriodId)
      )
    );

  if (documentRows.length === 0) {
    return new Map();
  }

  const documentIds = documentRows.map((row) => row.payslipDocumentId);

  const versionRows = await db
    .select({
      payslipDocumentId: payslipDocumentVersions.payslipDocumentId,
      version: payslipDocumentVersions.version,
      source: payslipDocumentVersions.source,
    })
    .from(payslipDocumentVersions)
    .where(
      and(
        eq(payslipDocumentVersions.organizationId, organizationId),
        inArray(payslipDocumentVersions.payslipDocumentId, documentIds)
      )
    )
    .orderBy(asc(payslipDocumentVersions.version));

  const latestByDocument = new Map<
    string,
    { version: number; source: string }
  >();

  for (const row of versionRows) {
    latestByDocument.set(row.payslipDocumentId, {
      version: row.version,
      source: row.source,
    });
  }

  const summaries = new Map<string, PayslipDocumentSummary>();

  for (const row of documentRows) {
    const latest = latestByDocument.get(row.payslipDocumentId);

    summaries.set(row.payslipId, {
      payslipId: row.payslipId,
      payslipDocumentId: row.payslipDocumentId,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      sha256: row.sha256,
      version: latest?.version ?? 1,
      source: payslipDocumentSourceFrom(latest?.source),
      createdAt: row.createdAt,
    });
  }

  return summaries;
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
 *
 * Supports both Mode A (`calculated`) and Mode B (`distribution`) payslips.
 * Calculated payslips read the historical item/run snapshot; distribution
 * payslips have no item, so employee identity falls back to the live
 * organization-scoped `employees` row and the amounts/component list are null
 * and empty respectively.
 */
export async function getPublishedPayslipDetail(
  organizationId: string,
  payslipId: string
): Promise<PayslipDetailRow | null> {
  const employeeName = sql<string>`coalesce(
    ${payrollItems.employeeNameSnapshot},
    ${employees.firstName} || ' ' || ${employees.lastName}
  )`;
  const employeeNumber = sql<string>`coalesce(
    ${payslips.employeeNumberSnapshot},
    ${payrollItems.employeeNumberSnapshot},
    ${employees.employeeNumber}
  )`;

  const rows = await db
    .select({
      id: payslips.id,
      organizationId: payslips.organizationId,
      payrollItemId: payslips.payrollItemId,
      payrollPeriodId: payslips.payrollPeriodId,
      employeeId: payslips.employeeId,
      employeeNumberSnapshot: payslips.employeeNumberSnapshot,
      payslipNumber: payslips.payslipNumber,
      issuedAt: payslips.issuedAt,
      status: payslips.status,
      employeeNumber,
      employeeName,
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
    .leftJoin(payrollItems, eq(payrollItems.id, payslips.payrollItemId))
    .leftJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
    .leftJoin(
      payrollPeriods,
      or(
        eq(payrollPeriods.id, payrollRuns.payrollPeriodId),
        eq(payrollPeriods.id, payslips.payrollPeriodId)
      )
    )
    .innerJoin(
      employees,
      and(
        eq(employees.id, payslips.employeeId),
        eq(employees.organizationId, organizationId)
      )
    )
    .innerJoin(
      organizations,
      eq(organizations.id, payslips.organizationId)
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

  if (
    !row ||
    !row.periodCode ||
    !row.periodName ||
    !row.periodStart ||
    !row.periodEnd ||
    !row.paymentDate
  ) {
    return null;
  }

  const componentRows = row.payrollItemId
    ? await db
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
        )
    : [];

  return {
    id: row.id,
    organizationId: row.organizationId,
    payrollItemId: row.payrollItemId,
    payrollPeriodId: row.payrollPeriodId,
    employeeId: row.employeeId,
    employeeNumberSnapshot: row.employeeNumberSnapshot,
    payslipNumber: row.payslipNumber,
    issuedAt: row.issuedAt,
    status: row.status as PayslipStatus,
    kind: row.payrollItemId ? "calculated" : "distribution",
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