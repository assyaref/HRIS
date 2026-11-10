import "server-only";

import { count, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  announcements,
  auditLogs,
  employeeDocuments,
  employees,
  organizations,
  payslipDocuments,
  payslipDocumentVersions,
} from "@/db/schema";
import { deleteAnnouncementStorage } from "@/lib/announcements/attachment-storage";
import { deleteEmployeeDocumentFile } from "@/lib/employee-documents/storage";
import { purgeStoredPayslipPdfs } from "@/lib/payroll/payslip-file-purge";

/**
 * Super Administrator "delete organization with all its data".
 *
 * Contract:
 * - Employees are NOT removed here. They must be permanently deleted first
 *   through the employee deletion flow, which honours legal holds, purges each
 *   employee's document folder and audits per employee. This function refuses
 *   while any employee row remains.
 * - Every other row scoped to the organization (users, roles, projects, work
 *   locations, leave/permission/attendance/payroll history, announcements, …)
 *   is deleted in ONE transaction. Tables are discovered from the database
 *   (every table with an `organization_id` column) so new modules are covered,
 *   and deletion order is resolved by retrying FK-blocked tables inside
 *   savepoints until everything is gone.
 * - Audit logs are KEPT: their organization reference is detached (set null)
 *   so the trail survives the tenant.
 * - Stored files (payslip PDFs, employee documents, announcement attachments)
 *   are removed after the commit, best-effort, and reported to the caller.
 */

export interface ForceDeleteOutcome {
  ok: true;
  deletedRows: Record<string, number>;
  detachedAuditLogs: number;
  files: { removed: number; failed: number };
}

export type ForceDeleteResult =
  | ForceDeleteOutcome
  | { ok: false; reason: "employees.present"; employeeCount: number }
  | { ok: false; reason: "unresolvable"; tables: string[] };

const SKIPPED_TABLES = new Set(["audit_logs", "organizations"]);

function pgCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export async function countOrganizationEmployees(
  organizationId: string
): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(employees)
    .where(eq(employees.organizationId, organizationId));
  return Number(rows[0]?.value ?? 0);
}

async function listOrganizationScopedTables(): Promise<string[]> {
  const result = await db.execute<{ table_name: string }>(sql`
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'organization_id'
       and t.table_type = 'BASE TABLE'
     order by c.table_name
  `);
  return result.rows
    .map((row) => row.table_name)
    .filter((name) => !SKIPPED_TABLES.has(name));
}

export async function forceDeleteOrganizationData(
  organizationId: string
): Promise<ForceDeleteResult> {
  const employeeCount = await countOrganizationEmployees(organizationId);
  if (employeeCount > 0) {
    return { ok: false, reason: "employees.present", employeeCount };
  }

  // File references are collected before the rows disappear.
  const [payslipKeys, payslipVersionKeys, documentKeys, announcementIds] =
    await Promise.all([
      db
        .select({ key: payslipDocuments.storageKey })
        .from(payslipDocuments)
        .where(eq(payslipDocuments.organizationId, organizationId)),
      db
        .select({ key: payslipDocumentVersions.storageKey })
        .from(payslipDocumentVersions)
        .where(eq(payslipDocumentVersions.organizationId, organizationId)),
      db
        .select({ key: employeeDocuments.storageKey })
        .from(employeeDocuments)
        .where(eq(employeeDocuments.organizationId, organizationId)),
      db
        .select({ id: announcements.id })
        .from(announcements)
        .where(eq(announcements.organizationId, organizationId)),
    ]);

  const tables = await listOrganizationScopedTables();

  const txResult = await db.transaction(async (tx) => {
    const detached = await tx
      .update(auditLogs)
      .set({ organizationId: null })
      .where(eq(auditLogs.organizationId, organizationId));

    const deletedRows: Record<string, number> = {};
    let remaining = tables;
    while (remaining.length > 0) {
      const blocked: string[] = [];
      for (const table of remaining) {
        try {
          const result = await tx.transaction(async (savepoint) =>
            savepoint.execute(
              sql`delete from ${sql.identifier(table)} where organization_id = ${organizationId}`
            )
          );
          const affected = result.rowCount ?? 0;
          if (affected > 0) {
            deletedRows[table] = (deletedRows[table] ?? 0) + affected;
          }
        } catch (error) {
          if (pgCode(error) === "23503") {
            blocked.push(table);
            continue;
          }
          throw error;
        }
      }
      if (blocked.length === remaining.length) {
        return { ok: false as const, tables: blocked };
      }
      remaining = blocked;
    }

    await tx.delete(organizations).where(eq(organizations.id, organizationId));
    return {
      ok: true as const,
      deletedRows,
      detachedAuditLogs: detached.rowCount ?? 0,
    };
  });

  if (!txResult.ok) {
    return { ok: false, reason: "unresolvable", tables: txResult.tables };
  }

  // Files: best-effort after commit (rows are already gone).
  let removed = 0;
  let failed = 0;
  const payslipPurge = await purgeStoredPayslipPdfs([
    ...payslipKeys.map((row) => row.key),
    ...payslipVersionKeys.map((row) => row.key),
  ]).catch(() => null);
  if (payslipPurge) {
    removed += payslipPurge.purged.length;
    failed += payslipPurge.failed.length;
  } else if (payslipKeys.length + payslipVersionKeys.length > 0) {
    failed += payslipKeys.length + payslipVersionKeys.length;
  }
  for (const row of documentKeys) {
    await deleteEmployeeDocumentFile(row.key);
    removed += 1;
  }
  for (const row of announcementIds) {
    const outcome = await deleteAnnouncementStorage(row.id);
    if (outcome.removed) removed += 1;
    else failed += 1;
  }

  return {
    ok: true,
    deletedRows: txResult.deletedRows,
    detachedAuditLogs: txResult.detachedAuditLogs,
    files: { removed, failed },
  };
}
