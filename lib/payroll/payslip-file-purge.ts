import "server-only";

import { removeStoredPayslipPdf, storedPayslipPdfExists } from "./payslip-pdf.ts";

/**
 * Payslip PDF file purge — the storage half of the owner-approved payroll
 * deletion scope.
 *
 * When an employee is permanently deleted, the database transaction removes
 * `payslips` / `payslip_documents` / `payslip_document_versions` rows, which
 * orphans the encrypted PDF files under the payslip private root. This module
 * removes exactly those files — AFTER the transaction commits, never before —
 * and reports a per-key result so the outcome can be audited and retried.
 *
 * SAFETY CONTRACT
 * ---------------
 * - Scope: ONLY the storage keys collected inside the deletion transaction for
 *   the deleted employee (org+employee scoped SELECT before the DELETE). This
 *   module never enumerates the storage tree and never deletes a file it was
 *   not explicitly given.
 * - Key validation: every key passes through the storage module's
 *   `resolveStoragePath` validation (server-generated `<uuid>.pdf`, resolved
 *   inside the private root), so a tampered key is rejected and reported — it
 *   can never make the purge touch a path outside the root.
 * - Best-effort, individually: a failure on one key never aborts the loop and
 *   never deletes anything extra; the result carries `failed` entries for the
 *   operator sweep script (`scripts/purge-deleted-employee-pdfs.mjs`) to
 *   retry.
 * - Idempotent: purging an already-purged (missing) key reports `missing`,
 *   not an error.
 *
 * BACKUP / RECOVERY LIMITATION
 * ----------------------------
 * The PDF files live outside the database and are NOT covered by `pg_dump`
 * backups. A purged file is UNRECOVERABLE unless a separate filesystem backup
 * of `/opt/hris-private/payslips` exists. The deletion is therefore
 * irreversible at both levels (rows + files); the verified pre-deletion
 * database backup restores rows, not files.
 */
export interface PayslipFilePurgeFailure {
  storageKey: string;
  error: string;
}

export interface PayslipFilePurgeResult {
  /** Files that existed on disk and were removed by this purge. */
  purged: string[];
  /** Files that were already absent (previously purged / never written). */
  missing: string[];
  /** Keys that were rejected or failed — never silently dropped. */
  failed: PayslipFilePurgeFailure[];
}

/**
 * Remove the given stored payslip PDFs, one key at a time.
 *
 * Never throws for a single key: validation problems and I/O errors become
 * `failed` entries. (An internal, unexpected exception escaping the loop is
 * still possible in theory; callers treat a throw as "purge incomplete" and
 * audit it, never as a failed deletion — the database rows are already
 * committed at that point.)
 */
export async function purgeStoredPayslipPdfs(
  storageKeys: readonly string[]
): Promise<PayslipFilePurgeResult> {
  const result: PayslipFilePurgeResult = {
    purged: [],
    missing: [],
    failed: [],
  };

  for (const storageKey of storageKeys) {
    try {
      if (await storedPayslipPdfExists(storageKey)) {
        await removeStoredPayslipPdf(storageKey);
        result.purged.push(storageKey);
      } else {
        result.missing.push(storageKey);
      }
    } catch (error) {
      result.failed.push({
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
