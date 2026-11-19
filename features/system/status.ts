import "server-only";

import { sql } from "drizzle-orm";

import journal from "@/db/migrations/meta/_journal.json";
import { db } from "@/db";
import { migrationStatus, type MigrationStatus } from "@/lib/db/migration-status";

import { isApprovalChainReady } from "@/features/approval-chain/chain";
import { isAgendaReady } from "@/features/agenda/module";
import { isComplianceModuleReady } from "@/features/compliance/module";
import { isDocumentsModuleReady, isLetterTemplatesReady } from "@/features/documents/module";
import { isHelpdeskModuleReady } from "@/features/helpdesk/module";
import { isOrgMasterReady } from "@/features/org-master/module";
import { isProfileChangeModuleReady } from "@/features/profile-changes/module";
import { isTimeModuleReady } from "@/features/time/module";
import { isTimesheetModuleReady } from "@/features/timesheets/module";

/** Modules that ship before their additive migration. */
const MODULES: { name: string; migration: string; ready: () => Promise<boolean> }[] = [
  { name: "MCU & Training", migration: "0023_compliance_mcu_training", ready: isComplianceModuleReady },
  { name: "Kalender, Shift, Lembur", migration: "0024_time_management", ready: isTimeModuleReady },
  { name: "Perubahan Data Karyawan", migration: "0025_profile_change_requests", ready: isProfileChangeModuleReady },
  { name: "Tanya Admin (Helpdesk)", migration: "0026_helpdesk", ready: isHelpdeskModuleReady },
  { name: "Surat & PKWT", migration: "0027_documents", ready: isDocumentsModuleReady },
  { name: "Templat Surat", migration: "0028_letter_templates", ready: isLetterTemplatesReady },
  { name: "Timesheet", migration: "0029_timesheets", ready: isTimesheetModuleReady },
  { name: "Master Organisasi", migration: "0030_org_master", ready: isOrgMasterReady },
  { name: "Agenda", migration: "0031_agenda", ready: isAgendaReady },
  { name: "Persetujuan Bertingkat", migration: "0032_approval_chain", ready: isApprovalChainReady },
];

export interface SystemStatus {
  database: { ok: boolean; latencyMs: number | null; version: string | null; size: string | null; error: string | null };
  migrations: { items: MigrationStatus[]; applied: number; pending: number; skipped: number };
  modules: { name: string; migration: string; ready: boolean }[];
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const started = Date.now();
  try {
    const info = await db.execute(sql`
      SELECT current_setting('server_version') AS version,
             pg_size_pretty(pg_database_size(current_database())) AS size,
             to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS tracked
    `);
    const latencyMs = Date.now() - started;
    const row = info.rows[0] as { version: string; size: string; tracked: boolean };
    let appliedWhen: number[] = [];
    if (row.tracked) {
      const rows = await db.execute(sql`SELECT created_at FROM drizzle.__drizzle_migrations`);
      appliedWhen = (rows.rows as { created_at: string | number }[]).map((r) => Number(r.created_at));
    }
    const modules = await Promise.all(
      MODULES.map(async (m) => ({ name: m.name, migration: m.migration, ready: await m.ready().catch(() => false) }))
    );
    return {
      database: { ok: true, latencyMs, version: row.version, size: row.size, error: null },
      migrations: migrationStatus(journal.entries, appliedWhen),
      modules,
    };
  } catch (error) {
    return {
      database: { ok: false, latencyMs: null, version: null, size: null, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" },
      migrations: migrationStatus(journal.entries, []),
      modules: MODULES.map((m) => ({ name: m.name, migration: m.migration, ready: false })),
    };
  }
}
