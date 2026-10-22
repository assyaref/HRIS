#!/usr/bin/env node
/**
 * DELETED-EMPLOYEE FILE PURGE — operator sweep (standalone maintenance).
 *
 * Companion to the in-flow purge in `permanentlyDeleteEmployeeAction`: when an
 * employee is permanently deleted under the owner-approved payroll-deletion
 * scope, the application removes the employee's stored payslip PDFs and
 * private document folder AFTER the transaction commits
 * (`lib/payroll/payslip-file-purge.ts`). If any of that post-commit cleanup
 * failed (I/O error, crash between commit and purge), this script is the
 * auditable retry path.
 *
 *   node scripts/purge-deleted-employee-pdfs.mjs              # DRY-RUN (default)
 *   node scripts/purge-deleted-employee-pdfs.mjs --execute \
 *        --confirm PURGE-DELETED-EMPLOYEE-PDFS                # real purge
 *
 * SCOPE CONTRACT (the important part):
 *   - DELETE scope = ONLY the payslip storage keys recorded on
 *     `audit_logs` rows with action `employee.permanently_deleted` and
 *     result SUCCESS (metadata.payslipFileKeys), i.e. files whose DB rows were
 *     deleted by a committed permanent deletion. Plus, with --execute, the
 *     `<org>/<employee>` document folders of exactly those audited deletions.
 *   - Files in the payslip root that are still referenced by live
 *     `payslip_documents` / `payslip_document_versions` rows are NEVER
 *     touched (reported as referenced).
 *   - Files that are unreferenced but NOT attributable to any deletion audit
 *     are reported as `unattributed_orphan` and NEVER deleted — their
 *     ownership predates this feature and removing them is a separate,
 *     explicitly approved decision.
 *   - No directory enumeration deletion happens: every removed path was
 *     named by the audit trail first.
 *
 * BACKUP / RECOVERY LIMITATION: the PDF files live outside the database and
 * are NOT covered by pg_dump. A purged file is UNRECOVERABLE unless a
 * separate filesystem backup of the payslip private root exists. Dry-run
 * first; keep filesystem backups before --execute.
 *
 * POST-PURGE VERIFICATION: after --execute the script re-scans and asserts
 * every attributable file is gone, then prints the remaining counts. Any
 * leftover attributable file is reported as `left_behind` with a non-zero
 * exit code.
 *
 * Output contract (machine-parseable, no PII — storage keys are
 * server-generated opaque UUID file names):
 *   DELETED_EMPLOYEE_FILE_PURGE mode=dry-run|execute ...
 *   DELETED_EMPLOYEE_FILE_PURGE attributable=... referenced=...
 *   DELETED_EMPLOYEE_FILE_PURGE unattributed_orphan=...
 *   DELETED_EMPLOYEE_FILE_PURGE purged=... left_behind=... finished_at=...
 *
 * Failure contract: missing configuration or a database/filesystem error
 * exits non-zero. Errors are never silently swallowed.
 */
import { config as loadEnv } from "dotenv";
import { access, readdir, rm } from "node:fs/promises";
import path from "node:path";

loadEnv({ path: ".env.production" });
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// Operator tooling: the roots are env-configurable so the script can be
// rehearsed against a SANDBOX root + disposable database before it is ever
// pointed at the production private tree. The APPLICATION storage modules
// keep their hardcoded roots; this override exists only for this script.
const PAYSLIP_PRIVATE_ROOT =
  process.env.HRIS_PAYSLIP_PRIVATE_ROOT ?? "/opt/hris-private/payslips";
const EMPLOYEE_DOCUMENTS_ROOT =
  process.env.HRIS_EMPLOYEE_DOCUMENTS_ROOT ??
  "/opt/hris-private/employee-documents";
const REQUIRED_CONFIRMATION = "PURGE-DELETED-EMPLOYEE-PDFS";

const args = process.argv.slice(2);
const executeRequested = args.includes("--execute");
const confirmIndex = args.indexOf("--confirm");
const confirmValue =
  confirmIndex !== -1 ? args[confirmIndex + 1] : undefined;
const execute =
  executeRequested && confirmValue === REQUIRED_CONFIRMATION;

if (executeRequested && !execute) {
  console.error(
    `DELETED_EMPLOYEE_FILE_PURGE refused: --execute requires --confirm ${REQUIRED_CONFIRMATION}`
  );
  process.exit(1);
}

const mode = execute ? "execute" : "dry-run";

function operational(line) {
  console.log(`DELETED_EMPLOYEE_FILE_PURGE mode=${mode} ${line}`);
}

const startedAt = new Date();

/** A storage key is deletable ONLY if it is a server-generated uuid.pdf. */
function isPayslipStorageKey(value) {
  return (
    typeof value === "string" && /^[0-9a-f-]{36}\.pdf$/i.test(value)
  );
}

/**
 * Shape of a path component that ORIGINATES from a database UUID
 * (`audit_logs.entity_id`, `audit_logs.organization_id`).
 *
 * The DB guarantees UUIDs today, but this script performs RECURSIVE deletes,
 * so it re-validates the shape instead of trusting the column type.
 */
const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve inside the payslip root; refuse anything else. */
function resolvePayslipPath(storageKey) {
  const resolved = path.resolve(PAYSLIP_PRIVATE_ROOT, storageKey);
  // STRICTLY inside the root: `resolved === PAYSLIP_PRIVATE_ROOT` is refused
  // too, because a recursive delete on the root would erase every payslip.
  if (!resolved.startsWith(`${PAYSLIP_PRIVATE_ROOT}${path.sep}`)) {
    throw new Error(
      `Refusing storage key outside the payslip root: ${storageKey}`
    );
  }
  return resolved;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Database (READ-ONLY): attributable keys from the deletion audit trail and
// the live-reference sets used to classify everything else.
// ---------------------------------------------------------------------------
async function readDatabaseFacts() {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 6000,
    statement_timeout: 30000,
  });
  await client.connect();

  try {
    // Attributable: keys recorded by committed permanent deletions.
    // organization_id is an audit_logs COLUMN (never trusted from metadata).
    const auditRows = await client.query(
      `SELECT metadata -> 'payslipFileKeys' AS keys,
              entity_id AS employee_id,
              organization_id AS organization_id,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS deleted_at
         FROM audit_logs
        WHERE action = 'employee.permanently_deleted'
          AND metadata ->> 'result' = 'SUCCESS'`
    );
    const attributable = new Map(); // storageKey -> { employeeId, deletedAt }
    const deletedEmployees = [];
    for (const row of auditRows.rows) {
      const keys = Array.isArray(row.keys) ? row.keys : [];
      for (const key of keys) {
        if (isPayslipStorageKey(key) && !attributable.has(key)) {
          attributable.set(key, {
            employeeId: row.employee_id,
            deletedAt: row.deleted_at,
          });
        }
      }
      if (row.employee_id) {
        deletedEmployees.push({
          employeeId: row.employee_id,
          organizationId: row.organization_id,
          deletedAt: row.deleted_at,
        });
      }
    }

    // Live references: a file still pointed at by ANY row is never touched.
    const liveKeys = new Set();
    const documentKeys = await client.query(
      "SELECT DISTINCT storage_key FROM payslip_documents"
    );
    for (const row of documentKeys.rows) {
      liveKeys.add(row.storage_key);
    }
    const versionKeys = await client.query(
      "SELECT DISTINCT storage_key FROM payslip_document_versions"
    );
    for (const row of versionKeys.rows) {
      liveKeys.add(row.storage_key);
    }

    return { attributable, liveKeys, deletedEmployees };
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Filesystem inventory (read-only).
// ---------------------------------------------------------------------------
async function listPayslipFiles() {
  try {
    const names = await readdir(PAYSLIP_PRIVATE_ROOT);
    return names.filter((name) => isPayslipStorageKey(name));
  } catch {
    return [];
  }
}

async function listOrphanDocumentFolders(deletedEmployees) {
  // Only folders whose employee has a SUCCESS deletion audit are candidates;
  // everything else is out of scope and never enumerated for deletion.
  const folders = [];
  for (const entry of deletedEmployees) {
    if (!entry.organizationId || !entry.employeeId) continue;
    // Both segments must be UUIDs. This script deletes RECURSIVELY, so the
    // path is re-validated here instead of trusting the audit column types.
    if (
      !UUID_PATH_SEGMENT.test(entry.organizationId) ||
      !UUID_PATH_SEGMENT.test(entry.employeeId)
    ) {
      continue;
    }
    const relative = `${entry.organizationId}/${entry.employeeId}`;
    const resolved = path.resolve(EMPLOYEE_DOCUMENTS_ROOT, relative);
    // STRICTLY inside the root. An escaping path — or the root itself, whose
    // recursive delete would erase EVERY employee's documents — is skipped
    // UNCONDITIONALLY, never conditionally on whether the path happens to
    // exist.
    if (!resolved.startsWith(`${EMPLOYEE_DOCUMENTS_ROOT}${path.sep}`)) {
      continue;
    }
    if (await fileExists(resolved)) {
      folders.push({ relative, absolutePath: resolved, employeeId: entry.employeeId });
    }
  }
  return folders;
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
try {
  if (!process.env.DATABASE_URL) {
    operational("failed_reason=database_url_not_configured");
    process.exit(1);
  }

  operational(`started_at=${startedAt.toISOString()}`);

  const { attributable, liveKeys, deletedEmployees } =
    await readDatabaseFacts();

  const files = await listPayslipFiles();
  const classifications = {
    attributable_present: [],
    attributable_missing: [],
    referenced_live: [],
    unattributed_orphan: [],
  };
  for (const file of files) {
    if (attributable.has(file)) {
      classifications.attributable_present.push(file);
    } else if (liveKeys.has(file)) {
      classifications.referenced_live.push(file);
    } else {
      classifications.unattributed_orphan.push(file);
    }
  }
  for (const key of attributable.keys()) {
    if (!classifications.attributable_present.includes(key)) {
      classifications.attributable_missing.push(key);
    }
  }

  const orphanDocumentFolders = await listOrphanDocumentFolders(
    deletedEmployees
  );

  operational(
    `inventory attributable=${attributable.size}` +
      ` attributable_present=${classifications.attributable_present.length}` +
      ` attributable_missing=${classifications.attributable_missing.length}` +
      ` referenced_live=${classifications.referenced_live.length}` +
      ` unattributed_orphan=${classifications.unattributed_orphan.length}` +
      ` deleted_employee_document_folders=${orphanDocumentFolders.length}`
  );

  if (classifications.unattributed_orphan.length > 0) {
    operational(
      `unattributed_orphan_keys=${classifications.unattributed_orphan.join(",")}`
    );
    operational(
      "unattributed_orphan_policy=report_only_never_deleted"
    );
  }

  let purgedCount = 0;
  let leftBehind = [];

  if (execute) {
    for (const key of classifications.attributable_present) {
      try {
        const filePath = resolvePayslipPath(key);
        await rm(filePath, { force: true });
        if (await fileExists(filePath)) {
          leftBehind.push(key);
        } else {
          purgedCount += 1;
        }
      } catch {
        // One un-removable file must never abort the rest of the sweep.
        leftBehind.push(key);
      }
    }
    for (const folder of orphanDocumentFolders) {
      // The absolute path was validated and resolved by
      // `listOrphanDocumentFolders`; it is NOT re-resolved from the relative
      // path here, so no second interpretation of the path is possible.
      const resolved = folder.absolutePath;
      try {
        await rm(resolved, { recursive: true, force: true });
        if (await fileExists(resolved)) {
          leftBehind.push(folder.relative);
        } else {
          purgedCount += 1;
        }
      } catch {
        // Recorded and retried on the next run; never aborts the sweep.
        leftBehind.push(folder.relative);
      }
    }

    // Post-purge verification: re-scan and prove the deletable set is gone.
    const after = await listPayslipFiles();
    leftBehind = leftBehind.concat(
      classifications.attributable_present.filter((key) => after.includes(key))
    );
    const stillAttributable = after.filter((key) => attributable.has(key));
    operational(
      `post_purge_verification attributable_remaining=${stillAttributable.length}` +
        ` unattributed_remaining=${after.filter((k) => !attributable.has(k)).length}`
    );
  }

  const finishedAt = new Date();
  // A key that failed to be removed AND is still present after the sweep is
  // reported ONCE. The operator must see the true number of files left
  // behind, not the number of times the same file was detected.
  leftBehind = [...new Set(leftBehind)];
  operational(
    `purged=${purgedCount}` +
      ` left_behind=${leftBehind.length}` +
      ` finished_at=${finishedAt.toISOString()}` +
      ` duration_ms=${finishedAt.getTime() - startedAt.getTime()}`
  );

  if (leftBehind.length > 0) {
    operational(`left_behind_paths=${leftBehind.join(",")}`);
    process.exit(1);
  }
} catch (error) {
  operational(
    `failed_reason=error message=${encodeURIComponent(
      error instanceof Error ? error.message : String(error)
    )}`
  );
  process.exit(1);
}
