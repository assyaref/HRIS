import "server-only";

import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { dayWindow } from "@/features/approvals/queries";

export const AUDIT_PAGE_SIZE = 50;

export interface AuditFilters {
  q?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page: number;
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: Date;
}

/** Escape LIKE wildcards in user input. */
const likeTerm = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Organization-scoped audit trail, newest first, paginated. */
export async function listAuditTrail(
  organizationId: string,
  filters: AuditFilters
): Promise<{ rows: AuditRow[]; total: number; page: number; totalPages: number }> {
  const conditions = [eq(auditLogs.organizationId, organizationId)];
  if (filters.q) {
    const term = likeTerm(filters.q);
    const match = or(ilike(auditLogs.action, term), ilike(users.email, term));
    if (match) conditions.push(match);
  }
  if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
  if (filters.from || filters.to) {
    const [after, before] = dayWindow(
      auditLogs.createdAt,
      filters.from ?? "1970-01-01",
      filters.to ?? "9999-12-30"
    );
    if (filters.from) conditions.push(after);
    if (filters.to) conditions.push(before);
  }
  const where = and(...conditions);

  const [totalRow] = await db
    .select({ value: count() })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(where);
  const total = Number(totalRow?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), totalPages);

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorEmail: users.email,
      metadata: auditLogs.metadata,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(AUDIT_PAGE_SIZE)
    .offset((page - 1) * AUDIT_PAGE_SIZE);

  return { rows, total, page, totalPages };
}

/** Distinct entity types present in this organization's trail (filter list). */
export async function listAuditEntityTypes(organizationId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ entityType: auditLogs.entityType })
    .from(auditLogs)
    .where(eq(auditLogs.organizationId, organizationId))
    .orderBy(sql`1`);
  return rows.map((r) => r.entityType);
}
