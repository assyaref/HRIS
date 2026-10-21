# Payroll Deletion Scope — Decision Record and Reconciliation

**Document type:** POLICY / SCOPE DECISION RECORD.
**Status:** **RESOLVED (owner-approved) — payroll-history deletion IMPLEMENTED
and verified in isolated databases.** Production application remains BLOCKED
on the third-party approvals listed in §8.
**Date:** 2026-10-21 (UTC) · **Repo:** `/opt/hris`, local `main`, work on top of
`00e4655` (not pushed)
**Supersedes:** the 2026-10-21 morning state of this record ("DEFERRED /
BLOCKED — payroll retained"), which is preserved verbatim in §9 (History).

Related: `docs/employee-deletion-owner-scope-approval-20261021.md` (the
owner-level scope approval); `docs/employee-permanent-delete-policy.md` §4,
§7.3.1, §7.4, §7.7; `docs/employee-deletion-approval-matrix.md` §3;
`docs/employee-deletion-lineage-reconciliation-record-20261021.md` §4;
`docs/employee-permanent-delete-0022-detach-design.md` (retention-era design,
superseded for the payroll tables by this record).

---

## 1. The two facts that had to be reconciled

| # | Fact | Source |
| --- | --- | --- |
| 1 | The release request required **permanent deletion of payroll history** (payroll components, payroll items, payslips, payslip documents/versions). | Release request / task instruction |
| 2 | Until 2026-10-21 the destructive flow reported **`payroll rows deleted = 0`**; payroll rows were retained and detached. | Isolated rehearsal 2026-10-21 (§9) and `docs/SUPERADMIN-FORCE-DELETE-PRODUCTION-REPORT.md` §3.3 |

Both facts were true. They were a **scope conflict** between the requested
behaviour and the then-implemented retention design.

## 2. Resolution — the owner approved the deletion scope

On 2026-10-21 (UTC) the project owner explicitly approved:

> "…proceeding with the Superadmin Force Delete release, including the intended
> permanent employee deletion scope and the request to include payroll history
> in the deletion scope."

Full record: `docs/employee-deletion-owner-scope-approval-20261021.md`
(**owner approval only** — it does not satisfy or replace any DBA,
Legal/Compliance, DPO, HR/Payroll, Security or Application Lead approval).

The decision gate of the earlier revision of this record required (a) a
recorded policy decision and (b) an explicit scope approval. The owner's
authorization satisfies (b) at the **data-owner level** for the engineering
change; condition (a) as a *multi-role §4 sign-off* remains formally pending
(§8) and is **not** waived by the owner.

## 3. Implemented scope (exact)

| Category | Tables | Disposition |
| --- | --- | --- |
| **RETAINED, detached with identity snapshots** | `attendance_records`, `attendance_events`, `leave_balances`, `leave_requests`, `permission_requests`, `employee_employment_history` | `employee_id` nullable + `ON DELETE SET NULL` + `employee_number_snapshot`/`employee_name_snapshot` + `<table>_retained_identity_check` (migration 0022) |
| **DELETED with the employee (explicit plan, children first)** | `payslip_document_versions` → `payslip_documents` → `payslips` → `payroll_items` (cascades `payroll_item_components`) → `employee_payroll_components` | `employee_id` **NOT NULL** + `ON DELETE RESTRICT` (deletion backstop); removed explicitly by the delete plan in the order shown (Payslip category strictly before Payroll, because `payslips.payroll_item_id` is RESTRICT) |
| **Also deleted (unchanged from before)** | documents, face enrollments/templates (template first), project assignments, addresses, insurances, bank accounts, dependents, educations, custom field values, announcement recipients | explicit plan, org-scoped |
| **RETAINED untouched (organization-level)** | `payroll_periods`, `payroll_runs`, `payroll_components`, `payroll_events` | no `employee_id` reference; never touched by the plan |
| **Creation-time snapshots preserved** | `payroll_items.employee_number_snapshot`/`employee_name_snapshot` (NOT NULL), `payslips.employee_number_snapshot`, `payslips.birth_date_snapshot` (PDF password contract, migrations 0013/0014) | unchanged |

Retention-only artifacts **removed** from the design (they existed only in the
unapplied retention-era `0022` draft and the unpushed schema code):

- `employee_payroll_components.employee_number_snapshot` / `employee_name_snapshot`
  and `employee_payroll_components_retained_identity_check`;
- `payslips.employee_name_snapshot` and `payslips_retained_identity_check`;
- `payslip_documents.employee_number_snapshot` / `employee_name_snapshot`
  and `payslip_documents_retained_identity_check`;
- `payslip_document_versions.employee_number_snapshot` / `employee_name_snapshot`
  and `payslip_document_versions_retained_identity_check`;
- `payroll_items_retained_identity_check`.

Because `0022` was never applied to production (or any persistent environment —
the staging dump is explicitly *pre-0022*), these columns/CHECKs never existed
outside disposable databases; removing them from the draft restores the
production baseline for the payroll tables.

## 4. Known effects and limitations (accepted by the owner's scope decision)

1. **Payroll run/period reports change retroactively.** Deleting an employee's
   `payroll_items` removes their line from run/period reporting. The run and
   period rows themselves survive (organization-level records).
2. **Issued payslips and their document/version chains are destroyed** with the
   employee, including the metadata rows that point at stored PDFs.
3. **Stored payslip PDF files are removed by the auditable file purge.**
   The deletion transaction orphans the encrypted PDFs; the in-flow purge
   removes exactly the keys collected inside the transaction
   (`collectEmployeePayslipFileKeys`), after the commit and per key, with a
   dedicated `employee.permanently_deleted_files` audit row recording
   purged/missing/failed. The operator sweep
   `scripts/purge-deleted-employee-pdfs.mjs` (dry-run default, typed
   confirmation, audit-attributed scope, unattributed orphans never deleted,
   post-purge verification) is the retry path. Full contract + evidence:
   `docs/employee-deletion-file-purge-runbook.md`. Production execution of the
   purge remains gated on the same approvals as the release itself.
4. **`payroll_item_components` rows are deleted via the pre-existing
   `ON DELETE CASCADE` from `payroll_items`.** This is the only cascade the
   deletion relies on, it is pre-existing production schema, it is exercised
   only after the employee's own item rows are deleted explicitly, and the
   rehearsal proves other employees' rows are untouched.
5. **Deletion is irreversible.** Rollback of migration `0022` restores the
   schema but never the deleted rows; restoring data requires the verified
   backup.

## 5. Code and migration changes (all local, unpushed; production untouched)

| Artifact | Change |
| --- | --- |
| `features/employees/permanent-delete-policy.ts` | `Payroll` and `Payslip` moved from PROTECTED to DELETABLE; comments updated |
| `features/employees/queries.ts` | delete plan rebuilt with a fixed execution order (`Payslip` before `Payroll`) and child-first reversal for `Payslip`/`Face ID`; module-load guards extended (order guard, exact partition, snapshot-plan/policy agreement); retained snapshot plan reduced to the six retained tables |
| `db/schema/payroll.ts` | payroll tables restored to `NOT NULL` + `ON DELETE RESTRICT`; retention-only snapshot columns/CHECKs removed; comments updated |
| `db/migrations/0022_employee_retention_detach.sql` | rewritten: retention detach for the six retained tables only; payroll tables restored to RESTRICT + NOT NULL with retention-only artifacts dropped; closing verification asserts BOTH the retained-table invariants (nullable, `SET NULL`, CHECK present) AND the deleted-table invariants (NOT NULL, RESTRICT, no retention CHECK) |
| `features/employees/actions.ts` | transaction unchanged (plan-driven); comments corrected |
| `features/payroll/queries.ts`, `actions.ts`, `payslip-document.actions.ts` | removed references to the deleted retention-only snapshot columns; payslip display names resolve from `payroll_items` creation snapshots + live employee |
| `features/employees/delete-employee-dialog.tsx` | retained-records copy corrected (payroll history is deleted, not retained) |
| Tests | `employee-retention-detach.test.ts`, `employee-permanent-delete.test.ts`, `employee-deletion-controls.test.ts` updated; **new** `tests/employees/employee-payroll-deletion-scope.test.ts` (14 tests pinning the exact scope) |

Migration checksums (SHA-256, for DBA review):

| Migration | Checksum |
| --- | --- |
| `0021_employee_deletion_controls.sql` (unchanged from the prior review package) | `585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452` |
| `0022_employee_retention_detach.sql` (**revised — requires DBA (re-)review**) | `3750812f76be5cef1f3356eaf7872208494a31b26b4a2d5ef7433c1ae69160b5` |

## 6. Verification evidence (isolated databases only, 2026-10-21)

| Check | Result |
| --- | --- |
| `npm test` | **PASS** — 1,956 tests, 401 suites, 0 fail (was 1,941 before the scope change; +14 new payroll-scope tests, +1 restructured retention test) |
| `npx tsc --noEmit` | **PASS** — exit 0 |
| `npm run lint` | **PASS** — exit 0; 15 warnings, 0 errors |
| `npm run build` (isolated copy `/tmp/opencode/build-verify-payroll-scope-20261021T055752Z`) | **PASS** — exit 0, 37/37 static pages, verification `BUILD_ID = vXFvOg4GJHGJuufKTg4s0`; live `.next` untouched (`kR0L8QnWCFjO3oU4Qb4w3`) |
| `0021` + `0022` apply on disposable DB `hris_control_fk_20261021T060118Z` (staging restore) | **PASS** — both exit 0 |
| `0021` + `0022` re-apply (idempotency) | **PASS** — both exit 0 |
| FK catalog after 0021+0022 | **26 employee FKs = 10 `SET NULL` (6 retained + 2 manager + 2 control-plane) + 16 `RESTRICT` (11 deletable + 5 payroll) + 0 `CASCADE`** |
| Retained-identity CHECKs | **6** (only the retained tables) |
| Payroll `employee_id` NOT NULL | **5/5 tables** |
| Retention-only payroll snapshot columns | **0 remain**; `payslips.employee_number_snapshot` (0013) and `birth_date_snapshot` (0014) intact |
| Anonymous retained rows | **0** |
| `scripts/verify-employee-deletion-control-fks.sql` | **`CONTROL_FK_REGRESSION_PASS`** |
| **Destructive payroll-scope rehearsal** `hris_force_delete_rehearsal_20261021T061529Z` | **`HARNESS_RESULT=PASS` (421 ms)** — see §7 |
| Fresh production backup + restore verification | **PASS** — see §6.1 |

### 6.1 Fresh production backup (safe, read-only on production)

| Item | Value |
| --- | --- |
| Dump | `/var/lib/postgresql/hris-backups/production-db-20261021T061854Z-pre-superadmin-force-delete-payroll-scope.dump` |
| Size / SHA-256 | 349,481 bytes / `2e4aee6b6bfadfc62e414d3b07478c027eaac103c715015f1ca0064fb93ff6b5` |
| Permissions | mode `0600`, owner `postgres` |
| Restore target | `hris_backup_verify_20261021T061854Z` (disposable; dropped after verification) |
| Restore result | **PASS** — employees 12, organizations 3, users 6, audit_logs 442, ledger 18 rows, `max(created_at) = 1790661254287` — identical to production |

## 7. Destructive rehearsal — exact deleted/retained proof

Disposable DB `hris_force_delete_rehearsal_20261021T061529Z` (restored from
`staging-db-20261021T005459Z-pre-0022.dump`, **not production**), revised
`0021`+`0022` applied, then the real application helpers
(`evaluatePermanentEmployeeDeletion`, `listEmployeeDeletionDependencies`,
`snapshotEmployeeRetainedRecords`, `deleteEmployeeDeletableRecords`, the
scoped `DELETE` and the SUCCESS audit shape) driven for synthetic target
employee A; B = control, C = rollback. Harness:
`/tmp/opencode/rehearsal-payroll-scope/force-delete-rehearsal.ts` (operator
workspace, synthetic data only).

**Result: `HARNESS_RESULT=PASS` (421 ms).**

| Table | Pre (synthetic org) | Post | Deleted | Detached (retained) | B/C rows |
| --- | ---: | ---: | ---: | ---: | --- |
| `payslip_document_versions` | 3 | 2 | **1 (A)** | 0 | 1 each, intact |
| `payslip_documents` | 3 | 2 | **1 (A)** | 0 | 1 each, intact |
| `payslips` | 3 | 2 | **1 (A)** | 0 | 1 each, intact (B's PDF-password snapshots intact) |
| `payroll_items` | 3 | 2 | **1 (A)** | 0 | 1 each, intact |
| `payroll_item_components` (cascade) | 3 | 2 | **1 (A's, via item CASCADE)** | n/a | 1 each, intact |
| `employee_payroll_components` | 3 | 2 | **1 (A)** | 0 | 1 each, intact |
| `attendance_records` | 3 | 3 | 0 | **1 (A), with number snapshot** | 1 each, intact |
| `attendance_events` | 3 | 3 | 0 | **1 (A)** | 1 each, intact |
| `leave_balances` | 3 | 3 | 0 | **1 (A)** | 1 each, intact |
| `leave_requests` | 3 | 3 | 0 | **1 (A)** | 1 each, intact |
| `permission_requests` | 3 | 3 | 0 | **1 (A)** | 1 each, intact |
| `employee_employment_history` | 3 | 3 | 0 | **1 (A)** | 1 each, intact |
| profile deletables (documents, addresses, bank accounts, projects, face ID ×2) | 3 each | 2 each | **1 (A) each** | n/a | 1 each, intact |
| `employees` | 3 | 2 | **1 (A)** | n/a | 1 each, intact |
| `payroll_periods` / `payroll_runs` / `payroll_components` (org-level) | 1/1/1 | 1/1/1 | 0 | n/a | n/a |

Additional proofs in the same run:

- `removedSummary` = `{Payslip: 3, Payroll: 2, Documents: 1, Face ID: 2,
  Projects: 1, Other related records: 2}`; retained categories reported =
  exactly `Attendance, Leave, Permission, Employment history`;
  `snapshottedRetainedRecords` = exactly the six retained tables.
- Audit `SUCCESS` row carries the operator reason, removed/retained/snapshotted
  scope; **Payroll/Payslip are NOT listed as retained**.
- No detached payroll rows exist anywhere (`DETACHED_PAYROLL_ROWS=0`); retained
  detached rows = 3 sampled tables with identity snapshots; search by snapshot
  number matches A's retained attendance row.
- **Rollback (employee C, injected `BEFORE DELETE` trigger on
  `employee_addresses`):** the whole transaction rolled back — C's employee
  row, retained-table snapshots (still NULL), profile deletables, **and C's
  entire payroll/payslip chain (incl. item components) restored**; no SUCCESS
  audit row for C.
- Direct post-run SQL: `REH_DETACHED_PAYROLL_ROWS=0`, `AUDIT_SUCCESS=1`,
  `REH_EMPLOYEES=2` (B and C).

Evidence files (`/tmp/opencode/payroll-scope-rehearsal-20261021T061529Z/`,
operator workspace, not repo):

| File | SHA-256 |
| --- | --- |
| `04-harness.out` | `4600920619687103d4648d45011718c17dd02e0e395033ea00a08c980ae8f510` |
| `05-post-payroll-scope.txt` | `eb9691d33fb72ec2667cefd137d317a48711be400acff655ec9c6edefcc0c1f3` |

All disposable rehearsal/verification databases created by this work were
dropped after evidence capture. Production was never connected for writes.

## 8. What remains outstanding (unchanged by the owner approval)

| # | Outstanding item | Responsible |
| --- | --- | --- |
| 1 | DBA (re-)review of revised `0022` (checksum `3750812f…0b5`) and `0021` (`585dd2d7…c452`); no DBA signature exists | DBA (+ Security) |
| 2 | Legal/Compliance, DPO, HR/Payroll review of the payroll-deletion scope effects (§4) — policy §4 sign-off 0/6 | Legal / DPO / HR-Payroll |
| 3 | Staging Part A `A1`–`A14` (0/14) and the authorized staging rehearsal | DBA + Application Lead |
| 4 | Production Part B `B1`–`B13` (0/13), lineage reconciliation, branch/deploy gates | DBA + App Lead + others |
| 5 | Payslip PDF storage purge **execution** for deleted employees (procedure implemented + rehearsed, §4.3; runbook `docs/employee-deletion-file-purge-runbook.md`; production run pending approval) | Security + DBA + App Lead |
| 6 | Production apply/deploy/delete | Blocked until 1–5 |

## 9. History — previous state of this record (superseded)

The original revision of this record (2026-10-21 morning) concluded
**"DEFERRED / BLOCKED. Payroll history remains retained."** with
`payroll rows deleted = 0` proven on
`hris_force_delete_rehearsal_20261021T040023Z` (evidence
`/tmp/opencode/payroll-scope-20261021-20261021T040023Z/`, harness
`e7cc226e…`, post-scope `6e130c61…`, deleted-rows `cf4cb738…`). That state
was correct **at the time**: no scope approval existed. It is superseded by
the owner's explicit scope approval (§2) and the implemented change (§3–§7).
The superseded evidence remains valid as a record of the retention-era
behaviour; the disposable databases were dropped.

**Decision: RESOLVED (owner-approved scope), implemented and verified in
isolation. Production application BLOCKED on §8.**
