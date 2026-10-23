# Disposition of the two orphan payslip PDFs — owner decision (2026-10-23)

## 1. Decision

The project owner has explicitly confirmed (release mandate, 2026-10-23) that
the two orphan payslip PDF files are **obsolete test artifacts**, were never
intended for production use, and **can be ignored or deleted**. This document
records that decision and the controlled removal executed under it.

The owner's decision resolves the disposition question raised by
`SUPERADMIN-FORCE-DELETE-PRODUCTION-REPORT.md` §14.3 / §14.9 row 7 / §15.7
row 11 (OPEN — "Data Owner + Security"). It does **not** waive any other
control: the removal below touched exactly two files and nothing else.

## 2. Identification (re-verified before removal)

Both files were re-identified and re-verified on 2026-10-23 before removal —
the same two artifacts attributed in report §14.3 (sha256 values match):

| File (exact path) | Size | SHA-256 |
| --- | --- | --- |
| `/opt/hris-private/payslips/6de46bf1-04b7-4b1e-b69d-1922842d3f24.pdf` | 987,397 B | `bcfdd5b9a812486fe3a57c02cf311d21599463459a6743063f11eeaa90ce598f` |
| `/opt/hris-private/payslips/aff343f2-0d95-4ea9-80e8-dc422fa4a4d8.pdf` | 984,005 B | `f220c0f2c90b0ad3c57fdbceeb1bcc94d5770425481395fe135d9611fe3aa13a` |

Per the §14.3 forensics (unchanged at removal time): both are single-page,
image-only PDFs (no text layer) whose original filename was
"Penawaran Harga Pengganti Neon Box.pdf" — a price-quotation document, **not
payroll output** — attributed to revoked payslips `PS-Test01-0001` /
`PS-Test01-0002` of soft-deleted **test employees** (TEST-001 "Test Employee",
TEST-002 "Test Create", organization "System"), produced by the payroll
re-encryption development harness
(`.phase24c-r4-r17-20260916-154330/` provenance folder, preserved).

## 3. Safety verification immediately before removal (2026-10-23)

- `node scripts/purge-deleted-employee-pdfs.mjs` (dry-run, production
  read-only): `attributable=0 attributable_present=0 attributable_missing=0
  referenced_live=0 unattributed_orphan=2 deleted_employee_document_folders=0
  purged=0 left_behind=0` — the two files above are the only orphans and the
  sweep proposes no deletions.
- Production database (read-only): `payslips=0`, `payslip_documents=0`,
  `payslip_document_versions=0`, `audit_logs` with action
  `employee.permanently_deleted` = 0 — **no live payroll record references
  either file**; there is no active payroll workflow or retention requirement
  binding them (they are test fixtures, not employee payroll records).
- Recovery point verified: both files are contained in the byte-verified
  filesystem backups
  `hris-private-20261022T034129Z-pre-superadmin-force-delete.tar.gz` (sha256
  `cee357e1…55e6f`) and the **scheduled** backup
  `hris-private-20261023T090825Z-scheduled.tar.gz` (sha256 `b55de02e…913d5`,
  timer-triggered 2026-10-23 16:08 WIB, restore-verified byte-identical with
  ACLs intact) — the removal is recoverable from either archive.

## 4. Controlled removal (executed 2026-10-23 11:27:50 UTC)

- Forensic evidence (paths, size, mode, owner, mtime, sha256 of both files)
  captured to the operator workspace before deletion
  (`/tmp/opencode/orphan-pdf-deletion-evidence.txt`) and reproduced in the
  release report addendum.
- Deleted **exactly** the two absolute paths above with
  `rm -f -- <path> <path>` (no wildcards, no directory removal).

## 5. Post-removal verification

| Check | Result |
| --- | --- |
| `/opt/hris-private` total files | 10 → **8** (exactly two files gone) |
| `payslips/*.pdf` | **0** remain |
| Provenance/audit folder `payslips/.phase24c-r4-r17-20260916-154330/` (metadata, V1 source, re-encryption harnesses) | **preserved untouched** |
| Unrelated `payslips-test/payslip-test-001.pdf` | **untouched** |
| Announcements / employee-documents trees | untouched |
| Sweep dry-run after removal | `unattributed_orphan=0`, `attributable=0`, `referenced_live=0`, `purged=0` — the private tree is clean |
| Database | untouched (no rows deleted — the payslip tables were already empty) |
| Backups | untouched (both archives still contain the files, per §3) |

## 6. Audit trail

- Owner decision: recorded here and in
  `docs/SUPERADMIN-FORCE-DELETE-PRODUCTION-REPORT.md` (release-execution
  addendum, 2026-10-23).
- The removal is **not** an execution of
  `scripts/purge-deleted-employee-pdfs.mjs` (whose `--execute` scope remains
  permanent-deletion audits only, and whose `report_only_never_deleted`
  policy for *unattributable* files remains in force for anything found in
  the future); it is a one-time, owner-authorized disposition of two fully
  attributed test artifacts, executed by explicit path.
