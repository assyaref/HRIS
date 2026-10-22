# Deleted-Employee File Purge — Runbook and Safety Record

**Document type:** OPERATIONAL RUNBOOK + SAFETY RECORD for the file half of the
owner-approved payroll deletion scope.
**Status:** **IMPLEMENTED and rehearsed in isolation.** Production execution is
**NOT authorized yet** (see `docs/employee-deletion-approval-matrix.md`).
**Date:** 2026-10-21 (UTC) · **Repo:** `/opt/hris`, local `main`.

Related: `docs/employee-deletion-payroll-scope-decision-record.md` (scope),
`docs/employee-deletion-owner-scope-approval-20261021.md` (owner approval),
`lib/payroll/payslip-file-purge.ts` (in-flow purge),
`scripts/purge-deleted-employee-pdfs.mjs` (operator sweep),
`tests/employees/employee-file-purge.test.ts` (contracts).

---

## 1. What is file-purged when an employee is permanently deleted

| Artifact | Storage location | Removal | When |
| --- | --- | --- | --- |
| Stored payslip PDFs (`payslip_documents`, `payslip_document_versions`) | `/opt/hris-private/payslips/<uuid>.pdf` | in-flow, per key | after the deletion transaction commits |
| Employee private documents (`employee_documents`) | `/opt/hris-private/employee-documents/<org>/<employee>/…` | in-flow, whole folder | after the commit (pre-existing behaviour, now audited) |

Deliberately **never** touched:

- Attendance photos — stored in the DATABASE (`attendance_photos`, bytea), and
  their parent `attendance_records` rows are RETAINED (detached), not deleted.
- Announcement attachments — organization-level, not employee-scoped.
- `employees.profile_photo_url` — a URL text column; no file storage exists
  behind it (verified: no upload path writes files, no production values).
- Every other employee's payslip/document files.

## 2. In-flow purge (automatic, part of `permanentlyDeleteEmployeeAction`)

Order of operations (all source-pinned by
`tests/employees/employee-file-purge.test.ts` and
`tests/employees/employee-permanent-delete.test.ts`):

1. **STEP 1.5 (inside the transaction, before any payroll row is deleted):**
   `collectEmployeePayslipFileKeys(tx, employeeId, orgId)` collects the
   DISTINCT storage keys from `payslip_documents` and
   `payslip_document_versions`, scoped by BOTH `employee_id` and
   `organization_id`. Once the rows are deleted the keys are unrecoverable,
   which is why they are read first.
2. The **SUCCESS audit row** (`employee.permanently_deleted`) records the exact
   `payslipFileKeys` scope — this is what makes every later purge
   attributable.
3. **Post-commit:** the employee document folder is removed
   (`deleteEmployeeDocumentStorage`, outcome captured, never swallowed).
   The target is resolved by a dedicated strict resolver: both path segments
   must be database UUIDs and the result must resolve **strictly inside** the
   private root — never the root itself, because `rm(root, { recursive: true })`
   would erase every employee's documents. A refused path is reported as
   `{ removed: false, error }` and therefore lands in the file-purge audit
   row. An **already-absent** folder reports `removed: true`: there is
   nothing left to remove, so it is a no-op success, not a failure.
4. **Post-commit:** `purgeStoredPayslipPdfs(keys)` removes each PDF
   individually: a valid key whose file exists → `purged`; a valid key whose
   file is absent → `missing` (idempotent); an invalid/tampered key or an
   I/O error → `failed` (reported, never thrown). A tampered key is rejected
   by the storage resolver (`^[0-9a-f-]{36}\.pdf$`, resolved inside the private
   root) and can NEVER make the purge touch a path outside the root.
5. A dedicated **audit row** `employee.permanently_deleted_files`
   (`EMPLOYEE_PERMANENT_DELETE_FILE_PURGE`) records per-key
   purged/missing/failed lists, the key-scope count, the document-folder
   outcome, and a `SUCCESS`/`PARTIAL` result. It is best-effort: a lost audit
   write is logged and never changes the deletion result (the rows are already
   committed).

**Failure semantics:** a purge failure never rolls anything back and never
changes the operator-visible result — it is recorded as `PARTIAL` on the
file-purge audit row, and the sweep script (§3) is the retry path.

## 3. Operator sweep script (retry / verification)

```
node scripts/purge-deleted-employee-pdfs.mjs            # DRY-RUN (default, safe)
node scripts/purge-deleted-employee-pdfs.mjs --execute \
     --confirm PURGE-DELETED-EMPLOYEE-PDFS             # real purge
```

Scope contract (enforced in code):

- **Delete scope = ONLY the payslip keys recorded on `SUCCESS`
  `employee.permanently_deleted` audit rows** (plus, with `--execute`, the
  `<org>/<employee>` document folders of exactly those audited deletions).
  Attribution never comes from the filesystem layout alone.
- Files still referenced by live `payslip_documents` /
  `payslip_document_versions` rows are classified `referenced_live` and never
  touched.
- Unreferenced files WITHOUT a deletion-audit attribution are classified
  `unattributed_orphan`, printed, and **never deleted** — their removal is a
  separate, explicitly approved decision (they predate this feature).
- `--execute` without the exact typed confirmation refuses (exit 1).
- **Every recursive delete in this script targets a path that resolves
  STRICTLY INSIDE its private root.** A payslip key must match
  `^[0-9a-f-]{36}\.pdf$` and resolve strictly inside the payslip root; a
  document folder must be `<uuid>/<uuid>` and resolve strictly inside the
  documents root. The root itself is refused too — `rm(root, { recursive:
  true })` would erase every employee's documents. Escaping paths are skipped
  **unconditionally** (never conditionally on whether they happen to exist),
  and the already-validated absolute path is used at the delete site rather
  than being re-resolved there.
- Per-item resilience: one un-removable path is recorded as `left_behind`,
  the sweep continues, and the run exits 1 so monitoring sees it. The
  `left_behind` list is de-duplicated, so the reported count is the **true
  number of files** left behind, not the number of times a file was detected.
- **Post-purge verification:** after `--execute` the script re-scans, asserts
  the attributable set is gone, and prints remaining counts.
- Machine-parseable output: `DELETED_EMPLOYEE_FILE_PURGE …` lines; storage keys
  are opaque server-generated UUID file names (no PII is printed).

`HRIS_PAYSLIP_PRIVATE_ROOT` / `HRIS_EMPLOYEE_DOCUMENTS_ROOT` may override the
roots **for this script only** — they exist so the sweep can be rehearsed
against a sandbox tree + disposable database before ever pointing it at the
production private tree. The application storage modules keep their hardcoded
roots.

## 4. Backup / recovery limitation (must be acknowledged before --execute)

- The PDF files live outside the database and are **not covered by `pg_dump`**.
  The verified pre-deletion database backup restores the ROWS, never the
  files.
- A purged file is **UNRECOVERABLE** unless a separate filesystem backup of
  `/opt/hris-private` exists. Take/confirm one before any production
  `--execute`.
- Deletion is irreversible at both levels. Dry-run first, keep the output as
  evidence, and record the run in the change record.

## 5. Post-purge verification (what "done" means)

1. Sweep `--execute` output shows `left_behind=0` and
   `post_purge_verification attributable_remaining=0` (exit 0).
2. A follow-up dry-run shows `attributable_present=0`.
3. The file-purge audit row for each deletion shows
   `result=SUCCESS` (no `payslipFileFailures`, `documentFolderRemoved=true`).
4. Unattributed orphans (if any) are unchanged in size/mtime.

## 6. Rehearsal evidence (isolated, 2026-10-21)

| Proof | Where | Result |
| --- | --- | --- |
| Key collection inside the transaction (1 distinct key; document+version share it → dedup) | phase-1 DB rehearsal `hris_force_delete_rehearsal_20261021T102744Z` | PASS (`HARNESS_RESULT=PASS`, `collected-keys.json`) |
| Real purge module against the REAL payslip root: synthetic key purged; valid-but-missing key → `missing`; tampered `../../…` key → `failed` ("Invalid payslip storage key."); every pre-existing file byte-for-byte untouched | phase-2 file rehearsal `/tmp/opencode/rehearsal-payroll-scope/file-purge-rehearsal.ts` | `FILE_PURGE_REHEARSAL_RESULT=PASS` |
| Sweep dry-run against PRODUCTION (read-only): 0 attributable, 2 pre-existing orphans classified `unattributed_orphan` report-only | `/tmp/opencode/sweep-dryrun` output | PASS |
| Sweep `--execute` happy path (sandbox root + disposable DB with a real SUCCESS audit): attributable key + deleted-employee folder purged, unattributed file untouched, verification clean | `/tmp/opencode/sweep-execute-happy2.out` | PASS |
| Sweep `--execute` resilience: one un-removable folder recorded as `left_behind`, attributable key still purged, exit 1 | `/tmp/opencode/sweep-execute-happy.out` | PASS |
| `--execute` without typed confirmation refuses | exit 1 | PASS |
| **Document-folder path proof** (2026-10-22): the employee's own folder is removed while a sibling employee's folder survives; employee ids `..`, `../..`, `""`, `.`, `../../../../etc` are refused with a reported reason and remove nothing; the private root stays intact; refused stores write nothing | `/tmp/opencode/release-verify-20261022T011700Z/document-folder-proof.ts` | `DOCFOLDER_RESULT=PASS` |
| **Sweep sandbox proof** (2026-10-22): sandbox roots + a disposable DB whose `audit_logs.entity_id` is deliberately `text` (a loosened schema production cannot produce) — attributable keys and deleted-employee folders purged; live-referenced file, unattributed orphan and unrelated tenant folder preserved; **both escape targets preserved**; `--execute` without confirmation refused (exit 1, nothing purged); an un-removable file reported as `left_behind=1` with its path, exit 1 | `/tmp/opencode/release-verify-20261022T011700Z/sweep-sandbox-verify.sh` | `SWEEP_SANDBOX_RESULT=PASS` |
| **Defects found and fixed** (2026-10-22, commit `8a32176`): (1) the document-folder removal could resolve to the private root itself and `rm -r` it; (2) the sweep's escape check was inverted, so an *existing* escaping folder path reached `rm -r`; (3) the sweep double-counted a file left behind. All three are unreachable under the current `uuid` column types but were latent — the code's own invariant was not enforced | `/opt/hris` commit `8a32176` | Fixed + regression-tested (1,981/1,981) |

All synthetic files were cleaned up; the two pre-existing production orphan
PDFs (`6de46bf1…pdf`, `aff343f2…pdf`) are **untouched** (SHA-256
`bcfdd5b9…ce598f`, `f220c0f2…f3aa13a`) and remain classified
`unattributed_orphan` — removing them is a separate decision, not part of any
employee deletion.

## 7. Approval state

The purge procedure is **implemented and rehearsed**, but executing it against
production private trees (either in-flow via a production deletion, or via the
sweep script) remains gated on the same release blockers as the deletion
itself: DBA + Security review of this runbook and the revised migrations,
Legal/DPO/HR-Payroll scope confirmation, and the approved change record. The
project owner's scope approval (owner level only) does not waive them.
