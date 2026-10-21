/**
 * DELETED-EMPLOYEE FILE PURGE — node:test suite (source contracts).
 *
 * Pins the owner-approved payroll-deletion STORAGE half: when an employee is
 * permanently deleted, the database transaction orphans the employee's stored
 * payslip PDFs (and their private document folder). The purge must be:
 *
 *   - EXACTLY SCOPED: only the storage keys collected inside the deletion
 *     transaction, org+employee scoped, never an enumeration of the tree;
 *   - POST-COMMIT: never before the transaction commits;
 *   - KEY-VALIDATED: a tampered key is rejected and reported, and can never
 *     make the purge touch a path outside the payslip private root;
 *   - AUDITABLE: the SUCCESS row records the key scope; a dedicated
 *     file-purge row records purged/missing/failed per key;
 *   - RECOVERABLE-IN-KNOWLEDGE: failures are reported, never swallowed, so
 *     the operator sweep script can retry them;
 *   - DOCUMENTED: files are outside the pg_dump backup; a purged file is
 *     unrecoverable without a separate filesystem backup.
 *
 * The behavioral (filesystem) proof runs in the isolated rehearsal phase 2
 * (`/tmp/opencode/rehearsal-payroll-scope/file-purge-rehearsal.ts`) against
 * synthetic files only; this suite pins the source contracts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const actionsSource = stripComments(
  readRepoFile("features/employees/actions.ts")
);
const queriesSource = stripComments(readRepoFile("features/employees/queries.ts"));
const purgeModuleSource = stripComments(
  readRepoFile("lib/payroll/payslip-file-purge.ts")
);
const payslipPdfSource = stripComments(
  readRepoFile("lib/payroll/payslip-pdf.ts")
);
const documentStorageSource = stripComments(
  readRepoFile("lib/employee-documents/storage.ts")
);
const auditSource = stripComments(readRepoFile("lib/auth/audit.ts"));
const sweepScriptSource = readRepoFile("scripts/purge-deleted-employee-pdfs.mjs");

describe("file purge: key collection (inside the deletion transaction)", () => {
  it("collectEmployeePayslipFileKeys reads BOTH payslip file tables, org+employee scoped", () => {
    const helper = queriesSource.slice(
      queriesSource.indexOf(
        "export async function collectEmployeePayslipFileKeys"
      )
    );
    assert.notEqual(
      queriesSource.indexOf(
        "export async function collectEmployeePayslipFileKeys"
      ),
      -1
    );
    for (const table of ["payslipDocuments", "payslipDocumentVersions"]) {
      assert.equal(
        helper.includes(`.from(${table})`),
        true,
        `${table} storage keys must be collected`
      );
      assert.equal(
        helper.includes(`eq(${table}.employeeId, employeeId)`) &&
          helper.includes(`eq(${table}.organizationId, organizationId)`),
        true,
        `${table} collection must be scoped by employee AND organization`
      );
    }
  });

  it("the keys are de-duplicated (a document and its current version share a key)", () => {
    const helper = queriesSource.slice(
      queriesSource.indexOf(
        "export async function collectEmployeePayslipFileKeys"
      )
    );
    assert.equal(
      helper.includes("...new Set(["),
      true,
      "duplicate storage keys must collapse to one purge attempt"
    );
  });

  it("the action collects the keys on the transaction handle BEFORE the payroll rows are deleted", () => {
    const transactionAt = actionsSource.indexOf("db.transaction");
    const collectAt = actionsSource.indexOf("collectEmployeePayslipFileKeys(");
    const deletableAt = actionsSource.indexOf(
      "deleteEmployeeDeletableRecords("
    );
    assert.equal(transactionAt < collectAt, true);
    assert.equal(collectAt < deletableAt, true);
  });

  it("the SUCCESS audit row carries the exact payslip file key scope", () => {
    assert.equal(
      actionsSource.includes("payslipFileKeys: outcome.payslipFileKeys,"),
      true,
      "the SUCCESS audit must record the collected keys"
    );
    const auditHelper = actionsSource.slice(
      actionsSource.indexOf("async function auditPermanentEmployeeDelete(")
    );
    assert.equal(
      auditHelper.includes("...(input.payslipFileKeys") &&
        auditHelper.includes("{ payslipFileKeys: input.payslipFileKeys }"),
      true,
      "the audit metadata must include the key list"
    );
  });
});

describe("file purge: the purge module (lib/payroll/payslip-file-purge.ts)", () => {
  it("purges ONLY the keys it is given — never enumerates the storage tree", () => {
    assert.equal(
      purgeModuleSource.includes("export async function purgeStoredPayslipPdfs("),
      true
    );
    for (const forbidden of ["readdir", "glob", "rmSync", "rmdir"]) {
      assert.equal(
        purgeModuleSource.includes(forbidden),
        false,
        `the purge must not enumerate or bulk-remove the tree (no ${forbidden})`
      );
    }
    assert.equal(
      purgeModuleSource.includes("for (const storageKey of storageKeys)"),
      true,
      "every key is handled individually, in order"
    );
  });

  it("validates each key through the storage resolver before touching the file", () => {
    assert.equal(
      purgeModuleSource.includes("storedPayslipPdfExists(storageKey)"),
      true,
      "existence is probed through the validated resolver first"
    );
    assert.equal(
      purgeModuleSource.includes("removeStoredPayslipPdf(storageKey)"),
      true,
      "removal goes through the same validated resolver"
    );
  });

  it("a single-key failure never aborts the loop and is reported per key", () => {
    const loopBody = purgeModuleSource.slice(
      purgeModuleSource.indexOf("for (const storageKey of storageKeys)")
    );
    assert.equal(
      loopBody.includes("result.failed.push({"),
      true,
      "failures are collected, not thrown"
    );
    assert.equal(
      purgeModuleSource.includes("failed: PayslipFilePurgeFailure[]"),
      true,
      "the result type carries per-key failures"
    );
  });

  it("distinguishes purged from already-missing (idempotent re-runs)", () => {
    assert.equal(
      purgeModuleSource.includes("result.missing.push(storageKey);"),
      true,
      "an absent file is reported missing, not as a failure"
    );
  });

  it("documents the backup/recovery limitation of file deletion", () => {
    // The limitation lives in the module's header comment — read the RAW source.
    const rawPurgeModuleSource = readRepoFile("lib/payroll/payslip-file-purge.ts");
    assert.equal(
      rawPurgeModuleSource.includes("pg_dump"),
      true,
      "the module must state that files are outside the database backup"
    );
    assert.equal(
      rawPurgeModuleSource.includes("UNRECOVERABLE"),
      true,
      "the module must state that a purged file is unrecoverable"
    );
  });
});

describe("file purge: storage-layer safety", () => {
  it("storedPayslipPdfExists validates the server-generated key pattern first", () => {
    const helper = payslipPdfSource.slice(
      payslipPdfSource.indexOf(
        "export async function storedPayslipPdfExists"
      )
    );
    assert.equal(
      helper.includes("resolveStoragePath(storageKey)"),
      true,
      "the probe resolves through the validated path resolver"
    );
    assert.equal(
      payslipPdfSource.includes(
        "/^[0-9a-f-]{36}\\.pdf$/i"
      ),
      true,
      "the storage key pattern contract stays pinned"
    );
  });

  it("deleteEmployeeDocumentStorage reports its outcome instead of swallowing it", () => {
    assert.equal(
      documentStorageSource.includes(
        "export interface EmployeeDocumentStorageRemoval"
      ),
      true,
        "the removal outcome must be typed for the audit trail"
    );
    assert.equal(
      documentStorageSource.includes("removed: boolean") &&
        documentStorageSource.includes("error: string | null"),
      true,
      "the outcome carries removed + error"
    );
    assert.equal(
      documentStorageSource.includes("return { removed: true, error: null };"),
      true,
      "a successful (or already-absent) folder removal reports removed=true"
    );
    assert.equal(
      documentStorageSource.includes("return {\n      removed: false,"),
      true,
      "an I/O error reports removed=false with the message"
    );
  });

  it("the document folder removal and the purge both happen after the commit", () => {
    const successAt = actionsSource.indexOf('result: "SUCCESS"');
    const folderAt = actionsSource.indexOf("deleteEmployeeDocumentStorage(");
    const purgeAt = actionsSource.indexOf("purgeStoredPayslipPdfs(");
    assert.equal(successAt < folderAt, true);
    assert.equal(folderAt < purgeAt, true);
  });
});

describe("file purge: audit trail", () => {
  it("writes a dedicated post-commit audit row with the per-key outcome", () => {
    assert.equal(
      auditSource.includes('"employee.permanently_deleted_files"'),
      true,
      "the audit action is typed in the catalog"
    );
    const helper = actionsSource.slice(
      actionsSource.indexOf(
        "async function auditPermanentEmployeeDeleteFilePurge("
      )
    );
    for (const field of [
      "payslipFilesPurged",
      "payslipFilesMissing",
      "payslipFileFailures",
      "documentFolderRemoved",
      "documentFolderError",
      "payslipFileScopeCount",
    ]) {
      assert.equal(
        helper.includes(field),
        true,
        `the file-purge audit must carry ${field}`
      );
    }
  });

  it("the file-purge audit row is best-effort and never changes the deletion result", () => {
    const helper = actionsSource.slice(
      actionsSource.indexOf(
        "async function auditPermanentEmployeeDeleteFilePurge("
      )
    );
    assert.equal(
      helper.includes("console.error") && helper.includes("catch (error)"),
      true,
      "a lost audit write is logged, never thrown"
    );
  });

  it("denied and failed deletions never purge anything", () => {
    const successBlockAt = actionsSource.indexOf('outcome.code === "SUCCESS"');
    const purgeAt = actionsSource.indexOf("purgeStoredPayslipPdfs(");
    assert.equal(
      successBlockAt < purgeAt,
      true,
      "the purge exists only inside the SUCCESS branch"
    );
    const deniedBlock = actionsSource.slice(
      actionsSource.indexOf('outcome.code === "DENIED"'),
      actionsSource.indexOf("return toPermanentDeleteError(")
    );
    assert.equal(
      deniedBlock.includes("purgeStoredPayslipPdfs"),
      false,
      "the DENIED path must not purge files"
    );
  });
});

describe("file purge: operator sweep script (scripts/purge-deleted-employee-pdfs.mjs)", () => {
  it("exists and is a dry-run by default", () => {
    assert.equal(
      sweepScriptSource.includes("DRY-RUN") ||
        sweepScriptSource.includes("dry-run"),
      true,
      "the script must document its dry-run default"
    );
    assert.equal(
      sweepScriptSource.includes("--execute"),
      true,
      "purging requires the explicit --execute flag"
    );
    assert.equal(
      sweepScriptSource.includes("--confirm"),
      true,
      "--execute must be paired with a typed confirmation"
    );
  });

  it("derives its delete scope ONLY from the deletion audit trail", () => {
    assert.equal(
      sweepScriptSource.includes("employee.permanently_deleted"),
      true,
      "attributable keys come from the SUCCESS deletion audits"
    );
    assert.equal(
      sweepScriptSource.includes("payslipFileKeys"),
      true,
      "the audit key list is the scope"
    );
  });

  it("never deletes unattributed orphans — reports them only", () => {
    assert.equal(
      sweepScriptSource.includes("unattributed"),
      true,
      "unattributed orphan PDFs must be classified and left alone"
    );
    const executeBlock = sweepScriptSource.slice(
      sweepScriptSource.indexOf("--execute")
    );
    assert.equal(
      executeBlock.includes("unattributed") &&
        executeBlock.toLowerCase().includes("report"),
      true,
      "the execute path must document that unattributed files are untouched"
    );
  });

  it("verifies the purge afterwards (post-purge verification)", () => {
    assert.equal(
      sweepScriptSource.includes("post-purge") ||
        sweepScriptSource.includes("POST_PURGE") ||
        sweepScriptSource.includes("verification"),
      true,
      "the script must re-scan and verify after purging"
    );
  });
});
