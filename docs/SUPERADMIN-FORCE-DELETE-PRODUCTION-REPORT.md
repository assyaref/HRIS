# Superadmin Force Delete — Production Release Report

**Report date:** 2026-10-21 (UTC)
**Last updated:** 2026-10-22 (UTC) — see §10 (review package, approval matrix,
lineage record, staging checklist, payroll scope decision, re-verification),
§11 (owner-approved payroll deletion scope: implemented, verified in
isolation), §12 (finalization: auditable file purge, full re-verification,
production data-state finding — still RELEASE BLOCKED), §13 (defect
audit: three real file-delete path defects found and fixed in `8a32176`,
full re-verification — still RELEASE BLOCKED) and **§14 (final operator
session: the one remaining recursive-delete defect found and fixed in
`a1e584b`, the filesystem backup corrected to an ACL-preserving archive,
the two orphan payslip PDFs attributed and left untouched, the production
build disturbed by an in-place build and restored, and the release-backup
integrity defect exposed — still RELEASE BLOCKED)**.
**Repository:** `/opt/hris`
**Requested release commit:** `4d41a5af`
**Base release-candidate commit:** `4d415afbbd43d8e53951a5af13d6aca95f10409d` (`4d415af`)
**Integration commit (local, unpushed):** `6e49e44fa8c8971e79d24793d4cb371fe595f6fe` (`6e49e44`)
**Latest local commit (unpushed):** `a1e584b` (`fix(announcements): refuse the private root as a recursive-delete target`)
**Branch:** `main` (local is ahead of `origin/main` = `e735f47`; 11 commits ahead)
**Production target:** PostgreSQL database `hris` on `127.0.0.1:5432`; Next.js service `hris.service`
**Final status:** **RELEASE BLOCKED**

> The requested commit `4d41a5af` **does not exist** in this repository
> (`git rev-parse 4d41a5af` → `fatal: ambiguous argument`). The only matching
> release candidate is `4d415af`. A follow-up local integration commit resolves
> the 0021 control-plane FK interaction (§3.2/§4); it was **not pushed or
> deployed**. The production release remains blocked on approvals and migration
> lineage.

---

## 1. Executive summary

The implementation, unit/integration verification, isolated migration
validation, and an isolated destructive rehearsal at the current HEAD **all
pass**. However, the production release **cannot be executed**:

1. **No production approval is recorded.** Staging Part A (`A1`–`A14`) and
   production Part B (`B1`–`B13`) are all unchecked/pending, and the policy §4
   retention sign-off is entirely pending. The owner's approval is recorded but
   does **not** substitute for the required DBA, Legal/Compliance, DPO,
   HR/Payroll, Security and Application Lead signatures.
2. **Migrations `0019`–`0022` are not applied and not journaled in production.**
   Production ledger has 18 rows (max `created_at = 1790661254287`); `0019`,
   `0021` and `0022` objects are absent. `0020` objects are present. The
   Drizzle lineage is unreconciled (`meta/_journal.json` stops at `0018`;
   files `0019`–`0022` are deliberately out-of-band).
3. **Payroll history is retained, not deleted.** Migration `0022` and the
   policy retain payroll/payslips via `SET NULL` + identity snapshots; the
   delete plan deletes **zero** payroll rows. The owner's statement accepting
   payroll-history deletion therefore **conflicts with the implemented and
   approved retention design**; deleting payroll requires a separate
   design/migration and the pending policy §4 (Legal/DPO/HR) sign-off.
4. **The deploy workflow auto-deploys any push to `main`, has no approval
   environment, no CI test gate, and no migration step.** `main` is not
   branch-protected. No push was made.

No production migration, endpoint invocation, employee deletion, or deployment
was performed. A fresh production backup was taken and restore-verified (safe,
read-only operation).

---

## 2. Release identifiers

| Item | Value |
| --- | --- |
| Requested commit | `4d41a5af` — **not found** |
| Base release candidate | `4d415afbbd43d8e53951a5af13d6aca95f10409d` |
| Integration commit | `6e49e44fa8c8971e79d24793d4cb371fe595f6fe` (`6e49e44`) — 0021 control integration + docs/tests; unpushed |
| Parent / `origin/main` | `e735f47d23e83da97cd1f97faead34221eaa18b5` |
| Working tree | clean at `a1e584b`; no secrets/unrelated files |
| Local vs remote | `main` **11 commits ahead** of `origin/main`; no push made |
| Deployed production build ID | **`J5cpppAYMdIb8Q5QViGP9`** — the build actually in the live checkout and serving since 2026-10-19 14:16:39 WIB; deployed from commit `e735f47d23e8` (§14.6, §14.7 correct the build ID previously reported as `kR0L8QnWCFjO3oU4Qb4w3`) |
| Release-candidate build ID (NOT deployed) | `2XVI_zWvnAHKK4HmkRCoQ` — built this session from `a1e584b`, preserved at `/opt/hris/.next.candidate-20261022T040211Z` |
| Production service | `hris.service` — `active (running)`, HTTP `/` → `307` |
| Production DB | `hris` @ `127.0.0.1:5432`, role `hris_app` (no credentials recorded here) |

`npm run build` was executed in the repository as required by the verification
suite. Because `/opt/hris` is also the live production checkout, the build
**replaced the live `.next` directory**. This session diagnosed the damage
precisely and restored the live checkout to the genuinely deployed build
(`J5cpppAYMdIb8Q5QViGP9`); the candidate build was moved aside rather than
deployed. The service was **not restarted** (`NRestarts=0`, start timestamp
unchanged), and every static asset the running server references now returns
`200` — see **§14.6** for the full diagnosis, the repair and the verification.
The previous release identifier `kR0L8QnWCFjO3oU4Qb4w3` referred to a
**mislabeled backup snapshot**, not to the running build (§14.7).

---

## 3. Phase 1 — audit findings

### 3.1 Implementation reviewed

- `features/employees/actions.ts` → `permanentlyDeleteEmployeeAction`
  (server-side Superadmin + `employees.permanent_delete` gate, DB-owned
  organization scope, typed employee-number confirmation, irreversibility
  acknowledgement, mandatory 10–2000 character reason, one transaction,
  success/denied/failed audit).
- `features/employees/permanent-delete-policy.ts` — protected vs deletable
  classification, self-link guard, scope resolution, Superadmin override.
- `features/employees/queries.ts` — dependency scan, explicit 11-table
  deletable plan (face templates before enrollments), retained snapshot plan,
  org-scoped statements, plan/policy fail-fast assertions.
- `features/employees/deletion-control.actions.ts` — legal holds and
  dual-control request/approval; executor is hard-disabled and contains no
  `DELETE`.
- `db/migrations/0021_employee_deletion_controls.sql` and
  `db/migrations/0022_employee_retention_detach.sql`.
- `lib/auth/audit.ts`, `lib/auth/permissions.ts` (system-only permission),
  deploy workflow, systemd unit, runbooks and evidence documents.

### 3.2 Foreign-key coverage

Production `hris` (baseline) has **24 employee FKs**: 22 `RESTRICT` + 2
`SET NULL`; **no `CASCADE`**. (Re-verified read-only 2026-10-21: the two
`SET NULL` are `employees.manager_id` (self-reference) and one
`employee_employment_history → employees` FK — see §10.6. The earlier wording
"2 self-referencing manager_id" described the count correctly but only one of
the two is self-referencing.)

After the revised, **not-yet-applied** `0021` + `0022` chain, an isolated
database has **26 employee FKs**:

- **15 `SET NULL`** — the 11 retained history tables (0022), 2 manager
  self-references, and the 2 control-plane employee references (released holds /
  terminal requests, 0021).
- **11 `RESTRICT`** — the explicitly deleted "deletable" tables.
- **0 `CASCADE`**.
- **11 retained-identity CHECKs**; **0 anonymous** retained rows.

The 11 protected tables are `attendance_records`, `attendance_events`,
`leave_balances`, `leave_requests`, `permission_requests`,
`employee_payroll_components`, `payroll_items`, `payslips`,
`payslip_documents`, `payslip_document_versions`,
`employee_employment_history`. The 11 deletable tables are
`employee_documents`, `employee_face_enrollments`,
`face_enrollment_templates`, `employee_project_assignments`,
`employee_addresses`, `employee_insurances`, `employee_bank_accounts`,
`employee_dependents`, `employee_educations`, `employee_custom_field_values`,
`announcement_recipients`.

**Control-plane integration (resolved in the local integration commit).** The
live `permanentlyDeleteEmployeeAction` now calls
`getEmployeeDeletionControlState(tx, employeeId, organizationId)` after locking
the employee row and inside the same transaction. An active hold or a
pending/approved deletion request refuses with `LEGAL_HOLD` /
`ACTIVE_DELETION_REQUEST`; CHECK constraint `23514` violations are mapped by
constraint name as the race backstop. Released holds and terminal requests
detach with identity snapshots; `employee_deletion_approvals.request_id` remains
`RESTRICT`. The revised 0021 checksum is
`585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452`;
the DBA must re-review it before any application. This does not affect current
production because 0021 is not applied.

### 3.3 Deletion-scope matrix (implemented design)

| Category | Tables | Employee row | Retained rows | Rows deleted |
| --- | --- | --- | --- | --- |
| Attendance | `attendance_records`, `attendance_events` | Deleted | Detached (`SET NULL`) + identity snapshot | 0 |
| Leave | `leave_balances`, `leave_requests` | Deleted | Detached + snapshot | 0 |
| Permission | `permission_requests` | Deleted | Detached + snapshot | 0 |
| Payroll | `employee_payroll_components`, `payroll_items` | Deleted | Detached + snapshot | **0** |
| Payslip | `payslips`, `payslip_documents`, `payslip_document_versions` | Deleted | Detached + snapshot; PDF password reconstructs | 0 |
| Employment history | `employee_employment_history` | Deleted | Detached + snapshot | 0 |
| Documents | `employee_documents` | Deleted | — | Deleted with employee |
| Face ID | `employee_face_enrollments`, `face_enrollment_templates` | Deleted | — | Deleted (template first) |
| Projects | `employee_project_assignments` | Deleted | — | Deleted |
| Other | addresses, insurances, bank accounts, dependents, educations, custom field values, announcement recipients | Deleted | — | Deleted |
| Direct reports | `employees.manager_id` | Retained | Manager link cleared (`SET NULL`) | 0 |
| Login account | `employees.user_id` → `users` | Retained | Link removed with employee row | 0 |
| Audit trail | `audit_logs` (no FK) | Retained | Survives employee | 0 |
| Legal holds | `employee_legal_holds` | Deleted | Active blocks; released detaches + snapshot | 0 |
| Deletion requests | `employee_deletion_requests` | Deleted | Pending/approved blocks; terminal detaches | 0 |
| Approvals | `employee_deletion_approvals` | Deleted | `RESTRICT`; never deleted/detached | 0 |

**Payroll history is retained, not deleted. Zero payroll rows are deleted by
the plan.**

### 3.4 Approval / evidence status found

Source: `docs/employee-permanent-delete-0022-approval-checklist.md`,
`docs/employee-permanent-delete-0022-staging-evidence-intake-register.md`,
`docs/employee-permanent-delete-0022-staging-readiness-audit.md`,
`docs/employee-permanent-delete-policy.md`,
`docs/employee-permanent-delete-dba-handoff.md`,
`docs/employee-permanent-delete-dba-evidence-intake.md`.

| Gate set | Status |
| --- | --- |
| Staging Part A `A1`–`A14` | all pending / unchecked |
| Production Part B `B1`–`B13` | all pending / unchecked |
| Staging gates `G1-S`–`G5-S` | all blocked |
| Production gates `G1-P`–`G4-P` | all blocked |
| 47-artifact evidence register | 0 received / 0 confirmed / 47 pending |
| Policy §4 sign-off (retention, legal hold, backup/PITR, security, final DPO/Data Owner) | all pending |
| DBA signed authorization / attestation | none present |
| Blockers `B-01`–`B-11`, `B-13`–`B-15` | open (`B-12` closed by documentation correction) |
| Owner approval | recorded, but does not replace the above signatures |

The 2026-10-21 rehearsal document is explicitly **evidence only, not a gate
pass** and states no staging/production approval was obtained.

---

## 4. Phase 2 — implementation changes

The 2026-10-21 local integration commit implements the control-plane fix and
keeps payroll retention intact:

- Revised `0021_employee_deletion_controls.sql`: released legal holds and
  terminal deletion requests now use nullable `employee_id` +
  `ON DELETE SET NULL` + identity snapshots. Two CHECK constraints still block
  an active hold and a pending/approved request at the database.
- Updated `db/schema/employee_deletion_controls.ts` to match.
- `getEmployeeDeletionControlState` in `queries.ts`; the live action pre-checks
  after row lock inside the transaction and maps CHECK violations by name.
- Legal-hold inserts now record employee-number/name snapshots; control-action
  TypeScript types accept the detached `employeeId: string | null`.
- Preflight report and delete dialog expose `legalHoldActive` and
  `blockingDeletionRequestCount` and gate submission on both.
- Tests expanded for the revised semantics; new disposable-database regression
  script `scripts/verify-employee-deletion-control-fks.sql`.
- Docs updated to match (`policy`, `0022 design`, `0021 runbook`).

**Payroll deletion was deliberately not implemented.** The confirmed policy,
detach design and `0022` retain payroll/payslips. Implementing payroll deletion
would contradict the design and the pending §4 Legal/DPO/HR sign-off.

The destructive endpoint otherwise retains its mandatory controls:
server-side Superadmin + system-only permission, DB-owned tenant scope, typed
employee-number confirmation, irreversibility acknowledgement, mandatory typed
reason, single transaction, success/denied/failed audit rows, and `NOT_FOUND`
idempotency on re-delete.

---

## 5. Phase 3 — verification evidence

All commands were run in `/opt/hris` on the local integration state on top of
`4d415af`.

| Check | Command | Result |
| --- | --- | --- |
| Unit/integration tests | `npm test` | **PASS** — tests 1941, suites 397, pass 1941, fail 0, cancelled 0, skipped 0 |
| TypeScript | `npx tsc --noEmit` | **PASS** — exit 0 |
| Lint | `npm run lint` | **PASS** — exit 0; 15 warnings, 0 errors |
| Production build | `npm run build` | **PASS** — exit 0 (verification build ID `i5k_XIErv8U7XlgA058rF`; `.next` then restored to deployed `kR0L8QnWCFjO3oU4Qb4w3`) |
| Migration `0021` apply | isolated DB | **PASS** — exit 0 |
| Migration `0022` apply | isolated DB | **PASS** — exit 0 (`UPDATE 30`, committed) |
| Migration repeatability | re-run revised `0021` + `0022` | **PASS** — both exit 0 |
| FK invariant | isolated DB catalog | 0 employee `CASCADE`; 15 `SET NULL` (11 protected + 2 manager + 2 control-plane); 11 `RESTRICT` (deletable); 11 retained-identity CHECKs |
| Anonymous retained rows | isolated DB | **0** |
| Control-plane DB regression | active hold / pending / approved / terminal | **PASS** — `CONTROL_FK_REGRESSION_PASS` |
| Destructive rehearsal | isolated DB, synthetic employees A/B/C | **PASS** — `HARNESS_RESULT=PASS`, 316 ms |

### 5.1 Test-count reconciliation

The base commit `4d415af` had 1,940 passing tests. The integration change adds
one test (1,941/1,941 across 397 suites). The suite is primarily
unit/source-contract testing and does not itself exercise a live database;
database behaviour is covered by the isolated rehearsals below.

### 5.2 Isolated rehearsal detail

- Disposable DB (control-FK regression):
  `hris_control_fk_20261021T024129Z` — 0021+0022 applied, repeated, and all
  four control scenarios passed (active hold blocks, pending request blocks,
  approved request blocks, released/terminal rows detach with snapshots).
- Disposable DB (destructive harness):
  `hris_force_delete_rehearsal_20261021T024301Z` — restored from
  `staging-db-20261021T005459Z-pre-0022.dump`; **not production**.
- Migration checksums:
  - `0021` = `585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452`
  - `0022` = `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c`
- Synthetic org `REH-FD-20261021-*`; employee A = target, B = control,
  C = rollback; 15 record types each.
- Result: A deleted; B and C intact. All 11 protected tables preserved totals
  with exactly one detached row carrying identity snapshots. Deletable tables
  lost only A's rows. Payslip PDF password reconstructed from snapshots.
  Detached rows remained listed/searchable by snapshot identity. One
  `employee.permanently_deleted` `SUCCESS` audit row carried the reason and
  removed/retained/snapshotted scope.
- Injected `BEFORE DELETE` trigger on a deletable table: employee C, its
  snapshots and deletables fully rolled back; a `FAILED` audit row was written;
  trigger removed.
- **Payroll/payslip rows were retained, not deleted**, confirming the
  implemented scope.

Evidence file checksums (operator workspace `/tmp/opencode`, not repo):

| File | SHA-256 |
| --- | --- |
| `control-fk-apply-0021.log` | `5945e055551e374d656db0d199b0de70c23bdb48db82714ddb9f65a0b452fbaa` |
| `control-fk-apply-0022.log` | `abc1868cd8b4470cb167c31f1288c642394e9dda5a7b5cf631c6d2cd4b2b5d52` |
| `control-fk-rerun-0021.log` | `0d7f966dc1fc974dc23d72633a078a085ad3930059b3a5790dc5748e58987cc0` |
| `control-fk-rerun-0022.log` | `10888de1f66925dfd08ff410d45d8934e02b4ed586673b34b02c8606898c1676` |
| `control-fk-regression.out` | `e84e025555cc617f7f5eb8ed7e894ced563004dc581b300357eec970753f5e1f` |
| `rehearsal-current-v2.out` | `4be8a3aa4d1d7dfa964ded35f6d2131efcd1c75363ecf56111c0d0a87954fed9` |

---

## 6. Phase 4 — backup and production readiness

### 6.1 Fresh production backup (created and restore-verified)

| Item | Value |
| --- | --- |
| Dump | `/var/lib/postgresql/hris-backups/production-db-20261021T014224Z-pre-superadmin-force-delete.dump` |
| Format | PostgreSQL custom (`pg_dump -Fc`), database `hris` |
| Size | 349,481 bytes |
| SHA-256 | `510e2810c9612a58fec52c407288019ea055dbe7e26ca5315d86c07d812dd6db` |
| Restore target | `hris_backup_verify_20261021T014228Z` (disposable) |
| Restore result | **PASS** — table data entries restored |
| Count comparison | pre-backup = restored: employees 12, organizations 3, users 6, audit_logs 442, `drizzle.__drizzle_migrations` 18 |
| Ledger watermark | `max(created_at) = 1790661254287` (unchanged) |

Backup/restore is verified. The dump is mode `0600`, owned by `postgres`.

### 6.2 Production migration state (read-only)

| Object | Present |
| --- | --- |
| `employee_custom_tabs` (`0018`) | yes |
| `face_enrollments` key-version column (`0019`) | **no** |
| `users.password_changed_at` (`0020`) | yes |
| `employee_legal_holds` / `employee_deletion_requests` / `employee_deletion_approvals` (`0021`) | **no** |
| `attendance_records.employee_number_snapshot` / `payslips.employee_name_snapshot` (`0022`) | **no** |
| Ledger rows | 18 |

### 6.3 Deployment boundary

The official workflow is migration-first, DBA-controlled, then application
deploy. It cannot start:

- `.github/workflows/deploy.yml` triggers on any push to `main` (and manual
  dispatch), with **no environment approval**, **no CI test gate**, and **no
  migration step**; it SSHes to the VPS and calls `hris-deploy`.
- `main` branch protection is **not enabled** (GitHub API returns
  “Branch not protected”).
- `hris-deploy` requires the target commit to be reachable from `origin/main`.
  The release candidate `4d415af` is **not pushed**.
- Migrations `0019`–`0022` are deliberately not journaled and require an
  approved Drizzle lineage reconciliation before a DBA applies them.
- No production endpoint test, synthetic production employee, login, or
  Superadmin authorization test was performed, because the operational
  procedure and approvals required to do so are absent.

**Action taken at the boundary: stopped. No push, no migration, no deploy, no
production deletion.**

---

## 7. Remaining blockers and responsible owners

| # | Blocker | Required action | Owner |
| --- | --- | --- | --- |
| 1 | Staging Part A `A1`–`A14` unsigned | Record DBA (`A1`) and Application Lead (`A2`) authorization, change record (`A3`), isolation (`A4`), backup/restore (`A5`), checksum re-verification (`A6`), lineage acceptance (`A7`), pinned build (`A8`), rollback/historical-reporting plans (`A9`/`A10`), acknowledgements (`A11`–`A14`) | DBA + Application Lead |
| 2 | 47 evidence artifacts 0/47 | Collect, checksum and independently review the requested artifacts; close `B-01`–`B-11`, `B-13`–`B-15` | DBA / Security / App Lead |
| 3 | Staging rehearsal not authorized | Execute the authorized rehearsal per runbook §5 and record evidence (the isolated operator rehearsal is **not** a gate pass) | DBA + Application Lead |
| 4 | Production Part B `B1`–`B13` unsigned | Record DBA SQL review, Legal/Compliance, DPO, HR/Payroll, Application Lead and lineage reconciliation approvals; no subset is valid | DBA, Legal, DPO, HR/Payroll, App Lead |
| 5 | Policy §4 retention sign-off pending | Decide and record retention schedule, retention-eligible categories, legal-hold procedure, backup/PITR, security controls and final Data Owner/DPO authorization | HR/Payroll, Legal, DBA, Security, DPO |
| 6 | Production lineage unreconciled | Approve and execute the Drizzle lineage repair; journal `0019`–`0022` through the approved channel (never hand-edit the ledger) | DBA |
| 7 | `0019`/`0021`/`0022` not applied in production | Apply the approved migrations in the DBA-controlled window, migration-first, with verified backup and rollback plan | DBA |
| 8 | Revised 0021 not yet re-reviewed | DBA must re-review revised 0021 (new checksum `585dd2d7…`) and accept the active-block / terminal-detach semantics before any application. Code integration and isolated regression are done | DBA + Security |
| 9 | Payroll-scope conflict | If permanent payroll-history deletion is truly required, obtain §4 Legal/DPO/HR approval, produce a new reviewed design + additive migration, update the delete plan and tests, and re-run rehearsal. Until then the implemented scope **retains** payroll | Data Owner / DPO / Legal / HR-Payroll + App Lead |
| 10 | Release candidate not on `origin/main` | Commit/review the exact release commit and push through the approved path. Optionally enable branch protection/deployment environment approval before pushing | Application Lead |
| 11 | No deploy-time test/migration gate | Approve a deployment procedure that applies migrations first and gates code deploy on health/ledger verification | DBA + Application Lead |

---

## 8. What was verified vs not verified

**Verified**

- Integration state on top of `4d415af`: 1,941/1,941 tests, TypeScript, lint
  (0 errors), production build.
- Revised migrations `0021`/`0022`: apply, repeatability, FK/check invariants,
  no `CASCADE`, no anonymous retained rows — on a disposable database.
- Control-plane live semantics at the DB layer: active hold blocks,
  pending/approved request blocks, released/terminal history detaches with
  snapshots.
- Destructive flow with synthetic data: delete, retain/detach, snapshots,
  isolation of control employees, injected-failure rollback, audit.
- Fresh production backup created and restored with matching counts/ledger.
- Production service health and deployed build identity (no restart).
- Production migration state and absence of `0019`/`0021`/`0022`.

**Not verified / not performed**

- No production migration.
- No production deployment or push.
- No production login/Superadmin authorization test.
- No production deletion or synthetic production employee.
- No DBA, Legal, DPO, HR/Payroll, Security or Application Lead signature.
- No approved staging/production rehearsal; only disposable-database runs.
- No claim that payroll history is deleted: it is **retained**.

---

## 9. Final status

**RELEASE BLOCKED**

The release is blocked at the production approval and migration-lineage
boundary, not at the code/test boundary. Production must not be migrated,
deployed, or used for a deletion test until the blockers in §7 are recorded,
the revised 0021 is DBA-reviewed, and the payroll-scope conflict is resolved by
the responsible owners.

---

## 10. Addendum 2026-10-21 — review package, approval matrix, lineage record, staging checklist, payroll scope, re-verification

This addendum records the work done after commits `6e49e44` and `831027b`.
**No code, migration, journal, ledger or production object was changed.** The
only working-tree changes are documentation. Nothing was pushed.

### 10.1 Deliverables produced

| # | Deliverable | Path | Status |
| --- | --- | --- | --- |
| 1 | DBA review package for revised `0021` | `docs/employee-deletion-0021-dba-review-package.md` | **READY FOR REVIEW — BLOCKED** (no DBA signature) |
| 2 | Consolidated approval matrix (Part A, Part B, §4) | `docs/employee-deletion-approval-matrix.md` | **0 recorded / all BLOCKED** |
| 3 | Lineage reconciliation record (employee dependencies + payroll scope) | `docs/employee-deletion-lineage-reconciliation-record-20261021.md` | Repo + isolated DB complete; live environment **BLOCKED** |
| 4 | Staging rehearsal checklist (fixtures, invariants, evidence) | `docs/employee-deletion-staging-rehearsal-checklist-20261021.md` | **PREPARED — NOT AUTHORIZED** |
| 5 | Payroll deletion scope decision record | `docs/employee-deletion-payroll-scope-decision-record.md` | **DEFERRED / BLOCKED** — payroll retained |
| 6 | This addendum | `docs/SUPERADMIN-FORCE-DELETE-PRODUCTION-REPORT.md` §10 | Recorded |

### 10.2 Fresh verification run (this session, same tree)

Commands run in `/opt/hris` at HEAD `831027b` (docs-only changes after the code
commit `6e49e44`):

| Check | Command | Result |
| --- | --- | --- |
| Unit/integration tests | `npm test` | **PASS** — tests 1941, suites 397, pass 1941, fail 0, cancelled 0, skipped 0, duration 6.2 s |
| TypeScript | `npx tsc --noEmit` | **PASS** — exit 0 |
| Lint | `npm run lint` | **PASS** — exit 0; 15 warnings, 0 errors |
| Production build | `npm run build` (isolated copy of HEAD) | **PASS** — exit 0, “Compiled successfully in 14.2 s”, 37/37 static pages, verification `BUILD_ID = jZtVF-pkftgNIBoRE_LT-` |

Verification log SHA-256 (operator workspace `/tmp/opencode`, not repo):

| Log | SHA-256 |
| --- | --- |
| `verify-20261021-tests.log` | `714927abd6524067b16be4b9e781c95e0c098bbd7511759bb065ec47912824fc` |
| `verify-20261021-tsc.log` | `418a5c17f33c70e99b0cc0a07fce69191489cfedc94164bfa903785777c5bd4b` |
| `verify-20261021-lint.log` | `7e311f2a68e03c36eb2c3e169bac61ace6bf9ecb859c7be11239654810bd877f` |
| `verify-20261021-build.log` | `9af16ad9abba976696eda2e323d1c95d29c768ed89541dbced1c2ea24b03e5db` |

**Build isolation (improvement over §2).** The build was run in a copy of HEAD
at `/tmp/opencode/build-verify-20261021T035417Z` with hardlinked
`node_modules` and a symlink to `.env.production`, so the live production
`.next` was **not** replaced this time. Verified after the build: live
`/opt/hris/.next/BUILD_ID` is still `kR0L8QnWCFjO3oU4Qb4w3`, `hris.service` is
`active`, `GET /` returns `307` (and `200` when following redirects). No
service restart occurred.

### 10.3 Fresh isolated migration regression

Disposable DB `hris_control_fk_20261021T035639Z`, restored from the staging dump
`staging-db-20261021T005459Z-pre-0022.dump` (**not production**), then:

- `0021` apply → **exit 0**; `0022` apply → **exit 0**.
- Re-apply `0021` → **exit 0**; re-apply `0022` → **exit 0** (idempotent).
- FKs referencing `employees`: **24 → 26** (15 `SET NULL`, 11 `RESTRICT`,
  **0 `CASCADE`**).
- `RETAINED_IDENTITY_CHECKS=11`, `LIVE_CONTROL_CHECKS=2`, `CONTROL_TABLES=3`,
  `ANONYMOUS_RETAINED_ROWS=0`.
- `scripts/verify-employee-deletion-control-fks.sql` → **`CONTROL_FK_REGRESSION_PASS`**
  (catalog + 4 scenarios).

Evidence directory `/tmp/opencode/migreg-20261021-20261021T035639Z/`; key
SHA-256: `05-apply-0021.log` `5945e055…`, `06-apply-0022.log` `abc1868c…`,
`07-rerun-0021.log` `0d7f966d…`, `08-rerun-0022.log` `10888de1…`,
`09-invariants.out` `2cfc4adb…`, `10-post-fk-to-employees.txt` `a1022523…`,
`11-control-fk-regression.out` `96976f07…`. Combined index:
`/tmp/opencode/evidence-combined-20261021.sha256`
(`a0660b249aeaae9429c50ef6931ae17aea548b1d55d7898ae88f274c3199f6ab`).

### 10.4 Payroll scope — requirement vs result

- Requirement: permanently delete payroll history.
- Observed (fresh, disposable DB `hris_force_delete_rehearsal_20261021T040023Z`):
  `employee_payroll_components 3→3`, `payroll_items 3→3`, `payslips 3→3`,
  `payslip_documents 3→3`, `payslip_document_versions 3→3`,
  **`payroll rows deleted = 0`**; `HARNESS_RESULT=PASS` (377 ms);
  1 detached payroll/payslip row per table with identity snapshots;
  `PAYROLL_ROWS_WITHOUT_IDENTITY_SNAPSHOT=0`.
- Decision gate: implement payroll deletion only if the policy decision is
  recorded **and** the scope is explicitly approved. **Both are absent**
  (policy §4.1 0/6; Part B / §4 signatures 0), so **payroll deletion was not
  implemented and no code was changed**. See
  `docs/employee-deletion-payroll-scope-decision-record.md`.

Evidence SHA-256: `05-harness.out` `e7cc226e…`, `06-post-payroll-scope.txt`
`6e130c61…`, `07-payroll-rows-deleted.txt` `cf4cb738…`.

### 10.5 Read-only production re-check (2026-10-21, operator observation — not a DBA attestation)

| Object / marker | Value |
| --- | --- |
| `drizzle.__drizzle_migrations` | 18 rows; `max(created_at) = 1790661254287` |
| FKs referencing `employees` | **24** = 22 `r` + 2 `n` + 0 `c` |
| `employee_legal_holds` / `_deletion_requests` / `_deletion_approvals` | **absent** (0021 not applied) |
| `face_enrollment_templates.key_version` default | `'v1'::text` **present** ⇒ 0019 not applied |
| `users.password_changed_at` | present (0020 applied) |
| `attendance_records.employee_number_snapshot` | **absent** ⇒ 0022 not applied |
| `hris.service` | `active (running)` |
| Live `BUILD_ID` | `kR0L8QnWCFjO3oU4Qb4w3` (unchanged; no restart) |
| `origin/main` | `e735f47d…` (local `main` not pushed) |

Staging ledger/catalog remains uncaptured → `B-02`, `B-03`, `B-05` stay OPEN.

### 10.6 Approval state (unchanged by this addendum)

`docs/employee-deletion-approval-matrix.md` records: Part A **0/14**, Part B
**0/13**, policy §4 **0/6**, gates `G1-S`–`G5-S` **BLOCKED**, gates
`G1-P`–`G4-P` **BLOCKED**, evidence artifacts **0/47**, blockers **14 OPEN /
1 CLOSED (`B-12`)**, DBA attestation **none**. No signature was fabricated; all
blank name/signature/timestamp cells remain blank.

### 10.7 Outstanding owners / actions

| # | Action | Owner | Unblocks |
| --- | --- | --- | --- |
| 1 | Review revised `0021` (`585dd2d7…c452`, package §9): checksum, `23514` semantics, nullable `employee_id`, rollback limits | DBA (+ Security) | `A6`, `B1`, `B-14` |
| 2 | Return staging + production ledger/catalog evidence (`0019`–`0022`) | DBA | `B-02`, `B-03`, `B-05` |
| 3 | Capture staging backup + restore test + PITR posture | DBA | `A5`, `B-06`, `G4-S` |
| 4 | Attest staging isolation, guard, synthetic-data-only | DBA + operator | `B-01`, `B-08`, `B-13`, `G5-S` |
| 5 | Open change record; record rollback + historical-reporting plans and STOP ack | DBA + Application Lead | `A3`, `A9`–`A11`, `B-10` |
| 6 | Pin build + migration-first order + compatibility statement | Application Lead | `A8`, `B-07` |
| 7 | Record control-plane disabled config + test evidence | Application Lead | `A14`, `B-09` |
| 8 | Collect, checksum and independently review `A1`–`H3` artifacts | DBA / Security / App Lead | 47/47 register |
| 9 | Sign `A1`/`A2` **last**, after `B-01`…`B-10` are evidenced | DBA + Application Lead | `B-11`; rehearsal authorization |
| 10 | Run the authorized staging rehearsal per the checklist | DBA + App Lead | `B-15`; `B1` evidence |
| 11 | Record policy §4 decisions (retention schedule, eligible categories, legal hold, backup/PITR, security, Data Owner) | HR/Payroll, Legal, DBA, Security, DPO | §4; `B2`–`B4`, `B7`–`B9` |
| 12 | Execute lineage reconciliation R2 → R4 → R5 and journal `0019`–`0022` | DBA | `B6` |
| 13 | Approve production window (write-freeze, payroll cutoff, RPO/RTO) and post-deploy verification plan | DBA + App Lead + Payroll/HR | `B10`, `B13` |
| 14 | Decide payroll deletion (retain vs delete) with a written scope; if delete, new design + additive migration + tests + rehearsal | Data Owner / DPO / Legal / HR-Payroll + App Lead | payroll scope |
| 15 | Approve branch protection / deployment-environment gate; push release commit through the approved path | Application Lead | deployment boundary |

### 10.8 Status after this addendum

**RELEASE BLOCKED.**

The code/test boundary remains green (1,941/1,941 tests, clean TypeScript,
lint 0 errors, successful production build; isolated migrations apply,
re-apply and pass the FK/control-plane regression). The release is blocked at
the **approval, lineage and staging-rehearsal boundary**. Production has not
been migrated, deployed or used for a deletion test; no push was made.

---

## 11. Addendum 2026-10-21 (later session) — OWNER-APPROVED PAYROLL DELETION SCOPE: implemented, verified, still RELEASE BLOCKED

This addendum records the work done after commits `6e49e44`, `831027b` and
`00e4655`. **Production was not migrated, deployed, pushed or used for any
deletion test. The deployed build `kR0L8QnWCFjO3oU4Qb4w3` is preserved and the
service stayed healthy.** The only persistent-environment write was none; all
databases used for destructive testing were disposable and have been dropped.

### 11.1 Owner scope approval (recorded separately from all other approvals)

The project owner explicitly approved, on 2026-10-21 (UTC):

1. proceeding with the Superadmin Force Delete release;
2. the intended permanent employee deletion scope; and
3. **including payroll history in the deletion scope**.

Record: `docs/employee-deletion-owner-scope-approval-20261021.md` —
**OWNER APPROVAL ONLY.** It is not a DBA attestation, not a Legal/DPO/HR/
Payroll/Security sign-off, not staging-rehearsal authorization, and not
production authorization. Part A (0/14), Part B (0/13), policy §4 (0/6), all
evidence gates and all blockers remain exactly as recorded in
`docs/employee-deletion-approval-matrix.md` (§6a there records the owner scope
approval; §0 totals are unchanged).

This resolves the §1 item-3 scope conflict at the **owner level**: payroll
history is now an owner-approved **deletable** category.

### 11.2 Implementation of the approved scope (local, unpushed)

| Artifact | Change |
| --- | --- |
| `features/employees/permanent-delete-policy.ts` | `Payroll`, `Payslip` → DELETABLE; protected = Attendance, Leave, Permission, Employment history |
| `features/employees/queries.ts` | delete plan: fixed execution order (`Payslip` before `Payroll`), child-first reversal (payslip versions → documents → payslips; face templates before enrollments), extended module-load guards (order, exact partition, snapshot-plan/policy agreement); retained snapshot plan = the six retained tables |
| `db/schema/payroll.ts` | the five payroll tables restored to `NOT NULL` + `ON DELETE RESTRICT`; retention-only snapshot columns/CHECKs removed; PDF-password snapshots (0013/0014) and `payroll_items` creation snapshots kept |
| `db/migrations/0022_employee_retention_detach.sql` | **rewritten** (checksum `3750812f76be5cef1f3356eaf7872208494a31b26b4a2d5ef7433c1ae69160b5`): retention detach for the six retained tables only; payroll tables restored to RESTRICT + NOT NULL with retention-only artifacts dropped; closing verification asserts retained-table AND deleted-payroll-table invariants |
| `features/employees/actions.ts` | transaction unchanged; comments corrected |
| `features/payroll/*` | removed references to the deleted retention-only snapshot columns; payslip names resolve from `payroll_items` creation snapshots + live employee |
| `features/employees/delete-employee-dialog.tsx` | retained-records copy corrected (payroll history is deleted, not retained) |
| tests | `employee-retention-detach`, `employee-permanent-delete`, `employee-deletion-controls` updated; **new** `tests/employees/employee-payroll-deletion-scope.test.ts` |
| docs | owner approval record (new), payroll scope decision record (rewritten), approval matrix (§6a), 0021 DBA review package (§10 revised-0022 addendum), lineage record, staging checklist |

Exact implemented scope (proven in §11.4): **deleted with the employee** —
`payslip_document_versions`, `payslip_documents`, `payslips`, `payroll_items`
(+ `payroll_item_components` via the pre-existing item CASCADE),
`employee_payroll_components`, plus the profile deletables;
**retained, detached with identity snapshots** — `attendance_records`,
`attendance_events`, `leave_balances`, `leave_requests`,
`permission_requests`, `employee_employment_history`;
**retained untouched** — `payroll_periods`, `payroll_runs`,
`payroll_components`, `payroll_events` (organization-level) and every other
employee's rows. Known effects (payroll reports lose the deleted employee's
lines; stored payslip PDF files are orphaned and need a separate approved
purge step; deletion is irreversible) are recorded in
`docs/employee-deletion-payroll-scope-decision-record.md` §4.

### 11.3 Verification results (this session, actual)

| Check | Command | Result |
| --- | --- | --- |
| Unit/integration tests | `npm test` | **PASS** — tests **1,956**, suites 401, pass 1,956, fail 0, cancelled 0, skipped 0 |
| TypeScript | `npx tsc --noEmit` | **PASS** — exit 0 |
| Lint | `npm run lint` | **PASS** — exit 0; 15 warnings, 0 errors |
| Production build | `npm run build` (isolated copy `/tmp/opencode/build-verify-payroll-scope-20261021T055752Z`) | **PASS** — exit 0, 37/37 static pages, verification `BUILD_ID = vXFvOg4GJHGJuufKTg4s0`; live `/opt/hris/.next/BUILD_ID` unchanged (`kR0L8QnWCFjO3oU4Qb4w3`) |
| Migration apply | `0021` then revised `0022` on disposable DB `hris_control_fk_20261021T060118Z` (staging restore) | **PASS** — both exit 0 |
| Migration re-apply | `0021`, `0022` again | **PASS** — both exit 0 (idempotent) |
| FK catalog | post-apply inventory | **26 employee FKs = 10 `SET NULL` (6 retained + 2 manager + 2 control-plane) + 16 `RESTRICT` (11 deletable + 5 payroll) + 0 `CASCADE`; 6 retained-identity CHECKs; payroll `employee_id` NOT NULL 5/5; 0 retention-only payroll snapshot columns; 0 anonymous retained rows** |
| Control-plane DB regression | `scripts/verify-employee-deletion-control-fks.sql` | **PASS** — `CONTROL_FK_REGRESSION_PASS` |
| Destructive rehearsal (payroll scope) | adapted harness on `hris_force_delete_rehearsal_20261021T061529Z` | **PASS** — `HARNESS_RESULT=PASS` (421 ms), see §11.4 |
| Production backup + restore verify | fresh `pg_dump` + restore into disposable DB | **PASS** — see §11.5 |

Evidence directory (operator workspace `/tmp/opencode`, not repo):
`migreg-payroll-scope-20261021T060118Z/` (apply/rerun logs, `06-invariants.out`,
`07-control-fk-regression.out`), `payroll-scope-rehearsal-20261021T061529Z/`
(`04-harness.out` SHA-256 `4600920619687103d4648d45011718c17dd02e0e395033ea00a08c980ae8f510`,
`05-post-payroll-scope.txt` `eb9691d33fb72ec2667cefd137d317a48711be400acff655ec9c6edefcc0c1f3`).
All disposable databases created for this work were dropped after evidence
capture.

### 11.4 Destructive rehearsal — exact deleted/retained proof (disposable DB)

Synthetic employees A (target) / B (control) / C (rollback), full record sets
incl. payroll chain; real application helpers driven inside one transaction.

| Table | A (deleted) | B/C (must survive) | Result |
| --- | --- | --- | --- |
| `payslip_document_versions` / `payslip_documents` / `payslips` | **1 row each deleted** | 1 row each intact | PASS |
| `payroll_items` | **1 row deleted** | 1 row each intact | PASS |
| `payroll_item_components` | **1 row deleted (item CASCADE)** | 1 row each intact | PASS |
| `employee_payroll_components` | **1 row deleted** | 1 row each intact | PASS |
| retained six tables | **1 row each detached, identity snapshots set, 0 anonymous** | 1 row each intact | PASS |
| profile deletables (6 tables) | **1 row each deleted** | 1 row each intact | PASS |
| `employees` | **row deleted** | intact | PASS |
| `payroll_periods` / `payroll_runs` / `payroll_components` | **untouched** | — | PASS |

Audit: exactly one `SUCCESS` row; `removedSummary = {Payslip: 3, Payroll: 2,
Documents: 1, Face ID: 2, Projects: 1, Other related records: 2}`;
retained categories = exactly Attendance/Leave/Permission/Employment history
(**Payroll/Payslip NOT listed as retained**); snapshotted tables = exactly the
six retained tables. Rollback (injected `BEFORE DELETE` trigger, employee C):
**the entire transaction rolled back including C's full payroll/payslip chain**;
no SUCCESS audit for C. Authorization/tenant-isolation/idempotency guards
unchanged and re-proven by the unit suite (1,956 tests) and the module-load
plan guards.

### 11.5 Fresh production backup + restore verification (read-only on production)

| Item | Value |
| --- | --- |
| Dump | `/var/lib/postgresql/hris-backups/production-db-20261021T061854Z-pre-superadmin-force-delete-payroll-scope.dump` |
| Size / SHA-256 | 349,481 bytes / `2e4aee6b6bfadfc62e414d3b07478c027eaac103c715015f1ca0064fb93ff6b5` |
| Permissions | `0600`, owner `postgres` |
| Restore target | `hris_backup_verify_20261021T061854Z` (disposable; dropped after verification) |
| Result | **PASS** — employees 12, organizations 3, users 6, audit_logs 442, ledger 18, `max(created_at) = 1790661254287` — identical to production |

### 11.6 Approval state after this addendum (unchanged for third parties)

| Gate set | State |
| --- | --- |
| Owner scope approval (release + deletion scope + payroll in scope) | **RECORDED — owner level only** |
| Staging Part A `A1`–`A14` | **0/14 — BLOCKED** |
| Production Part B `B1`–`B13` | **0/13 — BLOCKED** |
| Policy §4.1 retention sign-off | **0/6 — BLOCKED** |
| Evidence register / gates | **0/47 — BLOCKED** |
| DBA review of revised `0021` | **NOT SIGNED** |
| **DBA review of revised `0022` (new checksum `3750812f…0b5`)** | **NOT SIGNED — required before any application** |
| Staging rehearsal authorization | **BLOCKED** |
| Push / deploy / production migration / production deletion | **NOT PERFORMED — BLOCKED** |

### 11.7 Outstanding blockers and responsible approvers (payroll-scope release)

| # | Blocker | Responsible |
| --- | --- | --- |
| 1 | Review revised `0022` (checksum `3750812f…0b5`, package §10) and revised `0021` (`585dd2d7…c452`) | DBA (+ Security) |
| 2 | §4 retention/payroll sign-off (retention schedule, eligible categories, legal hold, backup/PITR, security, final DPO/Data Owner authorization) | HR/Payroll, Legal, DPO, Security, DBA |
| 3 | Staging evidence (`B-01`–`B-15`), Part A signatures, authorized staging rehearsal | DBA + Application Lead |
| 4 | Lineage reconciliation (R2→R4→R5) and journaling of `0019`–`0022` | DBA |
| 5 | Production Part B, write-freeze/payroll cutoff window, RPO/RTO | DBA + App Lead + Payroll/HR |
| 6 | Payslip PDF storage purge **execution** (procedure implemented + rehearsed 2026-10-21 — see §12.4; production run pending approval) | Security + DBA + App Lead |
| 7 | Branch protection / deployment gate; push of the release candidate | Application Lead |

### 11.8 Final status after this addendum

**RELEASE BLOCKED.**

The code/test boundary is green with the **owner-approved payroll deletion
scope fully implemented and proven**: 1,956/1,956 tests, clean TypeScript, lint
0 errors, successful isolated production build (live build untouched),
revised `0021`+`0022` apply/re-apply/idempotency PASS, FK invariants exact
(26 = 10 `n` + 16 `r`, 0 `c`), control-plane regression PASS, destructive
payroll-scope rehearsal PASS with exact deleted/retained/rollback evidence,
fresh production backup restore-verified. Production has **not** been
migrated, deployed, pushed or used for a deletion test. The release remains
blocked on the DBA review of the revised migrations, the Legal/DPO/HR-Payroll
sign-offs, lineage reconciliation, and the authorized staging rehearsal. No
approval, attestation, signature or gate was fabricated.

---

## 12. Addendum 2026-10-21 (finalization session) — FILE PURGE, full re-verification, production data-state finding

This addendum records the finalization session on top of commits `9f15938` +
`8c17edf`. **Production was not pushed, migrated, deployed or deleted from.**
The deployed build `kR0L8QnWCFjO3oU4Qb4w3` is preserved; `hris.service`
stayed `active` with `GET /` → `307` throughout; the migration ledger remains
18 rows.

### 12.1 Production data-state verification (operator observation — not a DBA attestation)

The owner states the application "is not yet using real operational data".
The operator CANNOT verify that claim and records what is actually observable
in the production database (read-only, 2026-10-21):

| Observation | Value |
| --- | --- |
| Employees | **12**, all with names (e.g. real-looking personal names), employee numbers (03233, 170865, …) |
| Organizations | **3**, with real company names (KSO - PT. Len Railway Systems & PT. Tritama Aji Laksana; SUPRACO; System) |
| Users | **6**, with emails on real-looking domains (sadmin@…, hr@…, admin@…) |
| Attendance / payroll / audit | attendance_records 2, payroll_items 1, audit_logs **442** |
| Payslip private tree | 2 stored PDFs (~984 KB each) + 1 legacy workspace dir |

**Conclusion recorded for governance:** the production database contains
personal-looking data of identifiable people and companies. Regardless of the
owner's statement, the operator treats it as REAL data: no production
deletion, no destructive production test, no synthetic test subject created
in production. The owner's "no real data" statement **does not relax any
release gate** below.

### 12.2 Owner authorization recorded (owner level only)

The owner re-authorized proceeding with "all remaining work". Recorded as
owner approval only in `docs/employee-deletion-owner-scope-approval-20261021.md`
(§1); it grants no DBA, Legal, DPO, HR/Payroll, Security, staging or
production authorization, and the approval matrix totals are unchanged
(Part A 0/14, Part B 0/13, §4 0/6, gates BLOCKED, 47-artifact register 0/47).

### 12.3 Technical completion this session — auditable file purge

Implemented (local, unpushed):

| Piece | What |
| --- | --- |
| `lib/payroll/payslip-file-purge.ts` | per-key purge of stored payslip PDFs: existing→`purged`, absent→`missing` (idempotent), invalid/tampered/I-O→`failed`; key validation makes path escape impossible; no tree enumeration |
| `lib/payroll/payslip-pdf.ts` | `storedPayslipPdfExists` (validated existence probe) |
| `lib/employee-documents/storage.ts` | `deleteEmployeeDocumentStorage` now reports `{removed, error}` instead of swallowing |
| `features/employees/queries.ts` | `collectEmployeePayslipFileKeys` — DISTINCT keys from `payslip_documents` + `payslip_document_versions`, org+employee scoped, to be called INSIDE the deletion transaction before the rows are deleted |
| `features/employees/actions.ts` | STEP 1.5 collects the keys in-tx; SUCCESS audit records the key scope; post-commit STEP A (document folder, outcome captured) + STEP B (payslip purge, best-effort, failures never change the result) + STEP C (dedicated `employee.permanently_deleted_files` audit row with purged/missing/failed + folder outcome, `SUCCESS`/`PARTIAL`) |
| `lib/auth/audit.ts` | new audit action `employee.permanently_deleted_files` |
| `scripts/purge-deleted-employee-pdfs.mjs` | operator sweep: dry-run default; `--execute` requires `--confirm PURGE-DELETED-EMPLOYEE-PDFS`; delete scope ONLY from SUCCESS `employee.permanently_deleted` audits (organization_id read from the audit COLUMN, never metadata); live-referenced files never touched; `unattributed_orphan` files reported and never deleted; per-item resilience (`left_behind`); post-purge re-scan; sandbox-rehearsable roots |
| `tests/employees/employee-file-purge.test.ts` | 19 source-contract tests pinning collection scope, dedup, ordering (after commit), key validation, audit fields, failure semantics, sweep guards |

Full procedure + safety record: `docs/employee-deletion-file-purge-runbook.md`
(includes the backup/recovery limitation: files are NOT in `pg_dump`; a purged
file is unrecoverable without a filesystem backup).

### 12.4 Rehearsal and verification evidence (this session, actual commands/results)

| Check | Command | Result |
| --- | --- | --- |
| Full test suite | `npm test` | **PASS — 1,978/1,978 tests, 406 suites, 0 fail** (was 1,956; +22 file-purge/audit tests) |
| TypeScript | `npx tsc --noEmit` | **PASS — exit 0** |
| Lint | `npm run lint` | **PASS — exit 0; 0 errors, 15 warnings** |
| Production build (isolated copy) | `npm run build` in `/tmp/opencode/build-verify-filepurge-20261021T121*Z` | **PASS — exit 0, 37/37 static pages, verification BUILD_ID `IjfjwkOHcBOyCgLWlZc7E`**; live `.next` untouched (`kR0L8QnWCFjO3oU4Qb4w3`) |
| Migration apply/re-apply | `0021`, `0022` on disposable DB `hris_control_fk_20261021T120007Z` | **PASS** — apply exit 0 ×2, re-apply exit 0 ×2 (idempotent) |
| Post-apply FK invariants | catalog | **26 employee FKs = 10 `SET NULL` + 16 `RESTRICT` + 0 `CASCADE`; 6 retained-identity CHECKs** |
| Control-plane regression | `scripts/verify-employee-deletion-control-fks.sql` | **`CONTROL_FK_REGRESSION_PASS`** |
| Destructive rehearsal phase 1 (DB) | harness on `hris_force_delete_rehearsal_20261021T102744Z` | **`HARNESS_RESULT=PASS` (443 ms)** — payroll chain deleted exactly; retained 6 tables detached+snapshotted; B/C intact; org-level payroll intact; C's chain fully rolled back on injected failure; NEW: wrong typed confirmation refused; cross-tenant attempt NOT_FOUND; re-delete NOT_FOUND; ACTIVE legal hold refuses the live path AND the raw `DELETE` (CHECK 23514); PENDING request refuses, REJECTED request does not |
| Destructive rehearsal phase 2 (files) | `file-purge-rehearsal.ts` (real `purgeStoredPayslipPdfs`, real payslip root, synthetic keys) | **`FILE_PURGE_REHEARSAL_RESULT=PASS`** — collected key purged; valid-but-missing key → `missing`; tampered `../../…` key → `failed` ("Invalid payslip storage key."); every pre-existing file byte-for-byte untouched |
| Sweep dry-run (PRODUCTION, read-only) | `node scripts/purge-deleted-employee-pdfs.mjs` | **PASS** — `attributable=0`, `unattributed_orphan=2` (pre-existing test PDFs), report-only |
| Sweep `--execute` happy path | sandbox root + disposable DB (real SUCCESS audit) | **PASS** — attributable key + deleted-employee document folder purged (`purged=2, left_behind=0`), unattributed file untouched, `post_purge_verification attributable_remaining=0` |
| Sweep `--execute` resilience | one un-removable folder | **PASS** — recorded `left_behind=1` with path, attributable key still purged, exit 1 |
| Sweep refusal guard | `--execute` without confirmation | **PASS — refuses, exit 1** |
| Production backup + restore | fresh `pg_dump`/`pg_restore` | **PASS** — `production-db-20261021T120334Z-pre-superadmin-force-delete-finalization.dump` (SHA-256 `fd79366e8777883c8bf38eeec1679e81be827b1219d57615201a5c173c03a3cb`, 0600 postgres); restore verified employees 12 / organizations 3 / users 6 / audit_logs 442 / ledger 18, `max(created_at)=1790661254287` |
| Delete-plan coverage vs live production catalog | read-only FK enumeration | **every one of the 24 production employee FKs is classified** (16 deleted-with-employee incl. 5 payroll; 6 retained-detach; 2 manager self-references SET NULL; +2 control-plane FKs arrive with 0021) — no unmapped reference |
| Schema unchanged by the destructive rehearsal | before/after catalog on the rehearsal DB | identical (26 FKs, 10 `n` / 16 `r`, 6 retained CHECKs, 0 CASCADE) |

Key artifacts (operator workspace `/tmp/opencode`, not repo):
`payroll-scope-rehearsal2-20261021T102744Z/` (`04-harness.out` SHA-256
`6afc9783…76ae3`, `05-file-purge-rehearsal.out` `6ec67384…f396`,
`06-post-rehearsal-invariants.txt` `0709a7cd…d2b2f`, `collected-keys.json`
`ee2f6c3c…19a84`); `migreg-final-20261021T120007Z/`. All disposable databases
were dropped; synthetic files cleaned up; the two pre-existing production
orphan PDFs are untouched (`bcfdd5b9…ce598f`, `f220c0f2…f3aa13a`).

### 12.5 Staging rehearsal status — NOT AUTHORIZED (unchanged)

There is still **no confirmed staging target** for this feature (Part A `A4`
isolation evidence absent; staging ledger/catalog uncaptured — `B-02`, `B-03`,
`B-05` open) and `A1`/`A2` are unsigned, so **the authorized staging rehearsal
was NOT executed**. The disposable-database rehearsals above are operator
evidence only, not a gate pass. The staging checklist
(`docs/employee-deletion-staging-rehearsal-checklist-20261021.md`) now also
pins the file-purge and sweep-script steps (§5.3, steps 14a/14b) so the
authorized run covers them.

### 12.6 Production release status — NOT EXECUTED (gates missing)

No push (`origin/main` = `e735f47`, local ahead), no production migration
(ledger 18), no deployment (build `kR0L8QnWCFjO3oU4Qb4w3` serving), no
production deletion. The deploy workflow still lacks an approval environment,
CI test gate and a migration step, and `main` is not branch-protected.

### 12.7 Outstanding blockers and responsible approvers (unchanged owners)

| # | Outstanding action | Responsible |
| --- | --- | --- |
| 1 | DBA + Security review of revised `0021` (`585dd2d7…c452`) AND revised `0022` (`3750812f…0b5`) — review package ready (`docs/employee-deletion-0021-dba-review-package.md` §9 rows 1–7, §10.5 rows 8–12) | DBA + Security |
| 2 | Policy §4 sign-off: retention schedule, eligible categories, legal-hold procedure, backup/PITR, security controls, final DPO/Data Owner authorization (0/6) | HR/Payroll, Legal, DPO, Security, DBA |
| 3 | Staging evidence (47-artifact register, `B-01`–`B-15`), staging isolation attestation, Part A `A1`–`A14` signatures, then the authorized staging rehearsal (incl. file-purge steps 14a/14b) | DBA + Application Lead |
| 4 | Drizzle lineage reconciliation (R2→R4→R5) and journaling of `0019`–`0022` | DBA |
| 5 | Production Part B `B1`–`B13`, write-freeze/payroll-cutoff window, RPO/RTO acceptance | DBA + Application Lead + Payroll/HR |
| 6 | File-purge production execution approval (runbook §7; includes the filesystem-backup position for `/opt/hris-private`) | Security + DBA + App Lead |
| 7 | Disposition of the 2 pre-existing unattributed orphan payslip PDFs (report-only today) | Data Owner + Security |
| 8 | Branch protection / deployment-environment approval; push of the release candidate; migration-first deploy order | Application Lead |

### 12.8 Final status after this session

**RELEASE BLOCKED.**

The engineering scope is complete and proven end-to-end in isolation:
1,978/1,978 tests, clean TypeScript, lint 0 errors, isolated production build,
idempotent revised migrations, exact FK invariants, control-plane regression,
a destructive rehearsal covering payroll deletion + retention + rollback +
authorization denials + cross-tenant + idempotency + control-plane blocks, and
an audit-attributable file purge (in-flow + sweep) proven against the real
storage root with pre-existing files untouched. Production is verified
untouched and freshly backed up with a restore-checked dump. The release
remains blocked on external approvals: DBA/Security SQL review, Legal/DPO/
HR-Payroll §4 sign-off, staging evidence + authorization, lineage
reconciliation and the approved deployment workflow. No approval, attestation,
gate or deployment was fabricated.

---

## 13. Addendum 2026-10-22 (defect audit + full re-verification) — FILE-DELETE PATH HARDENING

This addendum records the session on top of commit `2b2d316`. The owner
authorized the operator to complete all remaining routine work without
further approval-waiting. **Production was not pushed, migrated, deployed, or
deleted from.** The deployed build `kR0L8QnWCFjO3oU4Qb4w3` is preserved;
`hris.service` stayed `active` with `GET /` → `307` throughout; the migration
ledger remains 18 rows; the two pre-existing orphan payslip PDFs are
byte-for-byte unchanged.

### 13.1 What this session found and fixed

A line-by-line defect audit of the file-purge half of the force-delete flow
found **three real defects** plus one documentation defect. All were fixed in
local commit **`8a32176`** (`fix(employees): harden recursive file-delete path
resolution`, 3 files, +201/−23) and covered by new regression tests.

| # | Defect | Impact | Fix |
| --- | --- | --- | --- |
| 1 | `lib/employee-documents/storage.ts` — `resolveWithinRoot` allowed the resolved path to **equal** the private root (`resolved !== root && !startsWith(...)` → a path equal to the root skipped the guard). `deleteEmployeeDocumentStorage` interpolated `${organizationId}/${employeeId}` into that resolver, so a malformed employee id (`..`) resolved **to the root itself**, and `rm(root, { recursive: true, force: true })` would have erased **every employee's documents**. | Loss of all employee documents for the whole instance | New dedicated `resolveEmployeeDocumentFolder()`: both segments must be database UUIDs, and the target must resolve **strictly inside** the root. A refusal is reported as `{removed: false, error}` so it lands in the audit trail, not swallowed |
| 2 | `scripts/purge-deleted-employee-pdfs.mjs` — `listOrphanDocumentFolders()` had an **inverted** escape check: an escaping path was skipped only when it did **not** exist (`escapes && !exists → continue`), so an escaping path that *did* exist was passed to `rm(..., { recursive: true })`. The root-equality case was also allowed. | Recursive delete of a path outside the documents root | Escaping paths are now skipped **unconditionally**; both segments are re-validated as UUIDs; the already-validated absolute path is used at the delete site instead of being re-resolved there |
| 3 | `scripts/purge-deleted-employee-pdfs.mjs` — a file that failed to be removed **and** was still present after the sweep was pushed twice, so `left_behind=N` overstated the number of files. | Operator miscount of files requiring a retry | `leftBehind` is de-duplicated before reporting; the count is now the true number of files |
| 4 | `lib/employee-documents/storage.ts` — the `EmployeeDocumentStorageRemoval.removed` doc comment claimed an already-absent folder reports `false`; the implementation and its test have always reported `true` (an absent folder is a no-op success). | Misleading contract for auditors/maintainers | Documentation corrected to match the pinned behaviour; `storeEmployeeDocument` now resolves the employee folder with the same strict resolver, so a stored document can never land outside the folder the removal path cleans up |

**Exploitability as shipped:** defects 1–3 were **not reachable in the
production schema** — `employees.id`, `organizations.id`,
`audit_logs.entity_id` and `audit_logs.organization_id` are all `uuid`
columns, so a traversal value cannot be stored, and the sweep's payslip keys
are pattern-validated to `uuid.pdf` before any path is built. They were
**latent**: the code's own safety invariant ("a recursive delete can never
target the root") was not actually enforced, so the guarantee rested on the
column types rather than on the code. The fixes make the code enforce it.

### 13.2 Fresh verification (this session, actual commands/results)

| Check | Command | Result |
| --- | --- | --- |
| Full test suite | `npm test` | **PASS — 1,981/1,981 tests, 406 suites, 0 fail** (was 1,978; +3 new path-safety tests) |
| TypeScript | `npx tsc --noEmit` | **PASS — exit 0** |
| Lint | `npm run lint` | **PASS — exit 0; 0 errors, 15 warnings** (unchanged, all pre-existing) |
| Production build (isolated copy) | `npm run build` in `/tmp/opencode/build-verify-20261022T01*Z/repo` | **PASS — exit 0, "Compiled successfully"; verification BUILD_IDs `7VlOP0qBbhVKeSgLNQBva`, `0soVFfnH_3kzeb_imTUmU`, `nXgPUaqpe1HX10vfUwhZC`**; live `.next` untouched (`kR0L8QnWCFjO3oU4Qb4w3`) |
| Migration apply/re-apply | `0021`, `0022` on disposable DB `hris_force_delete_rehearsal_20261022T011700Z` | **PASS** — each applied **twice** successfully (idempotent) |
| Post-apply FK invariants | catalog | **26 employee FKs = 10 `SET NULL` + 16 `RESTRICT` + 0 `CASCADE`; 6 retained-identity CHECKs** |
| Control-plane regression | `scripts/verify-employee-deletion-control-fks.sql` | **`CONTROL_FK_REGRESSION_PASS`** (its non-approved-database guard also refused correctly) |
| Destructive rehearsal (DB) | harness on `hris_force_delete_rehearsal_20261022T011700Z` | **`HARNESS_RESULT=PASS` (386 ms)** — payroll chain deleted exactly; 6 retained tables detached + identity-snapshotted; control employees intact; org-level payroll intact; full atomic rollback on injected failure; wrong typed confirmation, cross-tenant, repeat-delete, ACTIVE legal hold and PENDING request all refused |
| File-purge rehearsal (files) | `file-purge-rehearsal.ts` (real `purgeStoredPayslipPdfs`, real payslip root, synthetic keys) | **`FILE_PURGE_REHEARSAL_RESULT=PASS`** — collected key purged; valid-but-missing key → `missing`; tampered `../../…` key → `failed` ("Invalid payslip storage key."); all 3 pre-existing files byte-for-byte untouched |
| Runtime authorization proof | `authorization-proof.ts` against the disposable DB | **`AUTHZ_RESULT=PASS`** — tenant ADMIN and HR refused; a hostile grant of `employees.permanent_delete` to a tenant ADMIN still refused (`isSuperAdmin=false`); SYSTEM SUPERADMIN allowed; a cross-organization SUPERADMIN role does **not** confer the flag (org-scoped) |
| **NEW** Document-folder path proof | `document-folder-proof.ts` (real `deleteEmployeeDocumentStorage` + `storeEmployeeDocument`, real private root) | **`DOCFOLDER_RESULT=PASS`** — the employee's own folder is removed while a sibling employee's folder survives; employee ids `..`, `../..`, `""`, `.`, `../../../../etc` are all **refused with a reported reason** and remove nothing; the private root stays intact; refused stores write nothing; store and removal resolve the same folder |
| **NEW** Sweep sandbox proof | `sweep-sandbox-verify.sh` (sandbox roots + a disposable DB whose `audit_logs.entity_id` is deliberately `text`, i.e. a loosened schema the production DB cannot produce) | **`SWEEP_SANDBOX_RESULT=PASS`** — attributable keys and deleted-employee document folders purged; live-referenced file, unattributed orphan and an unrelated tenant folder all preserved; **both escape targets preserved** (a traversal payslip key and a traversal document folder); `--execute` without confirmation refused with exit 1 and nothing purged; an un-removable file reported as **`left_behind=1`** with its path and exit 1 |
| Sweep dry-run (PRODUCTION, read-only) | `node scripts/purge-deleted-employee-pdfs.mjs` | **PASS — exit 0**; `attributable=0`, `referenced_live=0`, `unattributed_orphan=2` (report-only, `report_only_never_deleted`), `purged=0`, `left_behind=0` |
| Production backup + restore | fresh `pg_dump` / `pg_restore` | **PASS** — `/var/lib/postgresql/hris-backups/production-db-20261022T011700Z-pre-superadmin-force-delete.dump`, SHA-256 `04b5cf941b067065b831a5d0c67b272271b49f81168cde0da10a9a89e1e4b5e5` (0600, postgres-owned); restore verified against a disposable DB with matching counts |
| Filesystem backup + restore | fresh `tar` of `/opt/hris-private` | **PASS** — `hris-private-20261022T011700Z.tar.gz`, SHA-256 `daeb22d397dc54de1e1b9bfbfd4f2b52967ab50ef855aff3eb08ca42b24bafba`; restore verified 10/10 files byte-identical |
| Production state re-check (read-only) | catalog | employees 12, organizations 3, users 6, audit_logs 442, `payslip_documents` 0, migration ledger **18 rows** (`0021`/`0022` still NOT applied) |
| Live service | `systemctl is-active` + `GET /` | `active`; `307` → `/login`; live BUILD_ID `kR0L8QnWCFjO3oU4Qb4w3` unchanged |
| Git | `git status` / `git log` | working tree **clean**; HEAD `8a32176`; **9 commits ahead** of `origin/main` (`e735f47`); nothing pushed |

Evidence workspace (operator workspace `/tmp/opencode`, not in the repo):
`release-verify-20261022T011700Z/` — `harness-2.out`, `authorization-proof-2.out`,
`file-purge-rehearsal-2.out`, `document-folder-proof.out`, `sweep-dry-run-2.out`,
`sweep-sandbox-verify.sh` + `sweep-sandbox-20261022T015059Z/`, the DB dump and
its `.sha256`, and the filesystem tarball.

### 13.3 Production release status — STILL NOT EXECUTED

Unchanged from §12.6: **no push** (`origin/main` is still `e735f47`), **no
production migration** (ledger 18 rows; `0021`/`0022` not applied), **no
deployment** (build `kR0L8QnWCFjO3oU4Qb4w3` still serving), **no production
deletion** of any kind. The owner authorization removes the operator-side
"waiting for approval" blocker for routine implementation, verification,
documentation and release preparation; it **does not** supply the third-party
sign-offs listed in §13.4, and **none of them is fabricated or assumed here**.

### 13.4 Outstanding blockers and responsible approvers (owners unchanged)

| # | Outstanding action | Responsible |
| --- | --- | --- |
| 1 | DBA + Security review of revised `0021` (`585dd2d7…c452`) AND revised `0022` (`3750812f…0b5`) — review package ready (`docs/employee-deletion-0021-dba-review-package.md` §9 rows 1–7, §10.5 rows 8–12) | DBA + Security |
| 2 | Policy §4 sign-off: retention schedule, eligible categories, legal-hold procedure, backup/PITR, security controls, final DPO/Data Owner authorization (0/6) | HR/Payroll, Legal, DPO, Security, DBA |
| 3 | Staging evidence (47-artifact register, `B-01`–`B-15`), staging isolation attestation, Part A `A1`–`A14` signatures, then the authorized staging rehearsal (incl. file-purge steps 14a/14b) | DBA + Application Lead |
| 4 | Drizzle lineage reconciliation (R2→R4→R5) and journaling of `0019`–`0022` | DBA |
| 5 | Production Part B `B1`–`B13`, write-freeze/payroll-cutoff window, RPO/RTO acceptance | DBA + Application Lead + Payroll/HR |
| 6 | File-purge production execution approval (runbook §7; includes the filesystem-backup position for `/opt/hris-private`) | Security + DBA + App Lead |
| 7 | Disposition of the 2 pre-existing unattributed orphan payslip PDFs (report-only today) | Data Owner + Security |
| 8 | Branch protection / deployment-environment approval; push of the release candidate; migration-first deploy order | Application Lead |

### 13.5 Final status after this session

**RELEASE BLOCKED — on external approvals only.**

The engineering scope is complete and proven end-to-end in isolation:
1,981/1,981 tests, clean TypeScript, lint 0 errors, isolated production build,
idempotent migrations, exact FK invariants, control-plane regression, a
destructive rehearsal covering payroll deletion + retention + rollback +
authorization denials + cross-tenant + idempotency + control-plane blocks, an
audit-attributable file purge (in-flow + sweep) proven against the real
storage root with pre-existing files untouched, and — new this session —
runtime proofs that **no recursive delete can target or escape a private
root**, in both the application action and the operator sweep.

Production is verified untouched (12/3/6/442, ledger 18, live build
`kR0L8QnWCFjO3oU4Qb4w3`, service `active`, both orphan PDFs byte-identical) and
freshly backed up with a restore-checked database dump and a byte-verified
filesystem archive. The release remains blocked on the external approvals in
§13.4. No approval, attestation, gate or deployment was fabricated.

---

## 14. Addendum 2026-10-22 (final operator session) — REMAINING RECURSIVE-DELETE DEFECT FIXED, FILESYSTEM BACKUP CORRECTED, PRODUCTION BUILD RESTORED

This addendum records the final operator session on top of `3c7fa5c`. **Nothing
was pushed, migrated, deployed, or deleted from production.** The owner
authorization of §12/§13 covers routine implementation, verification,
documentation and release preparation; it does not supply the third-party
sign-offs in §14.10, and none of them is fabricated or assumed here.

Headline outcomes:

1. **One more real recursive-delete defect was found and fixed** (`a1e584b`) —
   the only remaining one in the codebase, in the announcement attachment
   storage. It is proven, by runtime execution, to have been able to erase
   every announcement attachment on the instance.
2. **The filesystem backup method was wrong.** The incumbent archive restores
   file *content* but not POSIX **ACLs**, so the restored tree is **not
   usable by the application service account**. A corrected, ACL-preserving
   archive was created and verified to be functionally recoverable.
3. **The two orphan payslip PDFs were attributed** to specific revoked
   payslips of soft-deleted test employees, confirmed to have zero live
   references, and left byte-for-byte untouched.
4. **The production build was disturbed by this session's in-place
   `npm run build`** and was repaired. The repair exposed a **release-backup
   integrity defect**: the release snapshot on disk did **not** contain the
   build that production is actually running.
5. Tests **1,986/1,986**, lint 0 errors, TypeScript clean, production build
   successful. The release remains **RELEASE BLOCKED** on the same external
   approvals as before, plus two newly-documented backup-integrity blockers.

### 14.1 The remaining recursive-delete defect (found, fixed, proven)

§13 audited the file-purge half of the force-delete flow. This session
audited **every** `recursive: true` delete in the codebase. All of them use
server-generated UUID temp directories (`lib/payroll/payslip-pdf.ts`,
`lib/payroll/payslip-pdf-reencrypt-core.ts`, `scripts/purge-deleted-employee-pdfs.mjs`
after `8a32176`) **except one**:

| # | Location | Defect | Impact | Fix (commit `a1e584b`) |
| --- | --- | --- | --- | --- |
| 1 | `lib/announcements/attachment-storage.ts` — `deleteAnnouncementStorage` | The resolver allowed the resolved path to **equal** the private root (`resolved !== root && !startsWith(...)`, so a path equal to the root skipped the guard). The folder removal is a **recursive** delete, `rm(..., { recursive: true, force: true })`, so an empty / `"."` announcement id resolved **to the root itself** and would have erased **every announcement attachment on the instance**. | Loss of all announcement attachments for the whole instance | New dedicated `resolveAnnouncementFolder()`: the segment must be a database UUID (`announcements.id` is a `uuid` column) and the target must resolve **strictly inside** the root — the root is refused outright. The **store** now resolves the folder through the same function, so an attachment can only be written to a folder the removal is allowed to delete. The removal reports `{removed, error}` instead of swallowing a refusal |
| 2 | `lib/employee-documents/storage.ts`, `lib/payroll/payslip-pdf.ts` | `resolveWithinRoot` / `resolveStoragePath` still made an exception for the root itself. Unreachable in the current call sites (the employee-document call sites use `unlink`/`readFile`, and the payslip key is UUID-pattern validated), but the exception is the exact pattern that produced defect #1. | Latent — the code's own invariant was not enforced | The root exception is removed everywhere; every private-root resolver in the codebase now refuses the root itself |

**Runtime proof (not a source assertion).** The module under test is the
**real, unmodified shipped file**; only its filesystem calls are redirected
onto a sandbox directory by a loader hook, so production is never written to.

| Scenario | Result |
| --- | --- |
| **Pre-fix module** (`git show HEAD:lib/announcements/attachment-storage.ts`) + `deleteAnnouncementStorage("")` | **`PREFIX_RESULT=VULNERABLE_ROOT_WIPED`** — the private root was recursively erased. The defect was real, not theoretical |
| **Fixed module** + `deleteAnnouncementStorage("")` | **refused** — `removed=false`, `error` set, nothing removed |
| Fixed module + `deleteAnnouncementStorage("")`/`"."`/`".."`/`"../.."`/`"/opt/hris-private/announcements"` | **all 5 refused with a reported reason**; the root and a sibling announcement's attachment survived |
| Fixed module + a valid announcement id | the announcement's **own** folder is removed; a sibling announcement's folder and attachment survive |
| Fixed module + `storeAnnouncementAttachment` with `..`/`../..`/`"."`/`""`/`"/etc"`/`"a/b"` | **all refused**; no folder written anywhere |
| Production announcements root during and after the proof | `entries=0` before **and** after, same mtime, same mode — untouched |

**Exploitability as shipped:** defect #1 was **not reachable in the production
schema** — `announcements.id` is a `uuid` column, and both call sites pass an
id read from the database. It was **latent**: the safety invariant ("a
recursive delete can never target the root") was enforced by the column type,
not by the code. The fix makes the code enforce it, and it is now the only
remaining class of this defect anywhere in the repository.

Regression coverage: `tests/announcements/announcement-attachment-storage.test.ts`
(5 new tests) pins that the announcement removal uses a dedicated strict
resolver, that the store and the removal agree, that refusals are reported
rather than swallowed, and that **no** private-root resolver in
`lib/announcements/`, `lib/employee-documents/` or `lib/payroll/` may make an
exception for the root itself.

### 14.2 The filesystem backup was not application-recoverable (defect + correction)

The incumbent filesystem archive
(`/tmp/opencode/release-verify-20261022T011700Z/hris-private-20261022T011700Z.tar.gz`,
created in the previous session) is a **plain** `tar -czf`. The private tree
`/opt/hris-private` is protected by **POSIX ACLs**, and the application service
account (`hris`, uid 995 / gid 985) reaches the payslip PDFs through those ACL
entries (`user:hris:--x` on the root, `user:hris:rwx` plus a default ACL on
`payslips/`, `user:hris:r--` on the PDFs). A plain tar **does not carry
ACLs**.

Verification of the incumbent archive (restore into an isolated directory):

| Check | Result |
| --- | --- |
| `gzip -t` / tar listing | OK, 26 members |
| Restored **content** vs source | 10/10 files byte-identical |
| Restored mode / uid / gid / size | identical |
| Restored **ACLs** | **LOST** — the `user:hris:*` entries and the default ACL are absent from the restore |
| Restored **mtime** | second-granularity only — sub-second precision truncated |
| **Functional recovery as the `hris` service account** | **FAILED** — `hris` cannot list or read the restored payslip PDFs |

**Corrected archive** (created this session, durably, outside the ephemeral
operator workspace):

| Item | Value |
| --- | --- |
| Path | `/opt/hris-backups/backups/hris-private-20261022T034129Z-pre-superadmin-force-delete.tar.gz` |
| Owner / mode | `root:root`, `0600` |
| Size | 2,964,811 bytes |
| SHA-256 | `cee357e13c224b74c16903244a95b495198bef94b443f06b2a36086b83855e6f` (sidecar `…tar.gz.sha256`, `root:root`, `0600`) |
| Creation command | `tar --acls --xattrs --numeric-owner -czf <archive> -C /opt hris-private` |
| Restore command | `tar -xzf <archive> -C <dir> --same-owner --preserve-permissions --acls --xattrs` (as root) |

Verification of the corrected archive:

| Check | Result |
| --- | --- |
| `gzip -t`, tar listing | OK, 26 members; `sha256sum -c` sidecar **OK** |
| Restored content vs source | **10/10 byte-identical** |
| Restored file/dir mode, uid, gid, size, mtime | **identical** (including sub-second mtime) |
| Restored ACLs | **identical** — access ACLs, default ACLs and the `user:hris:*` entries all preserved |
| **Functional recovery as the `hris` service account** | **PASS** — `hris` lists the payslip directory and reads both restored PDFs; `hris` traverses `employee-documents` |
| Sweep classification against the restored tree | **identical** to production (2 unattributed orphans, 0 attributable, 0 referenced) — the restored tree is a faithful operational copy |

**Process findings for the runbook (§14.10 blocker 6):**

- There is **no automated filesystem backup** on this host — no
  rsnapshot/borg/restic/rclone/duplicity, no cron entry, no systemd timer.
  Every filesystem archive so far lived in an ephemeral operator workspace
  under `/tmp/opencode` and would be lost on reboot.
- The backup procedure must switch to `--acls --xattrs --numeric-owner` and a
  root-owned, root-restored destination, and the runbook has been updated
  accordingly.

### 14.3 The two orphan payslip PDFs — attributed, preserved, disposition still required

Read-only investigation of the two files the sweep reports as
`unattributed_orphan`. No production row was modified and neither file was
moved, renamed, re-encrypted, decrypted in place or deleted; only sandbox
copies were decrypted/rendered.

| File | `6de46bf1-04b7-4b1e-b69d-1922842d3f24.pdf` | `aff343f2-0d95-4ea9-80e8-dc422fa4a4d8.pdf` |
| --- | --- | --- |
| Size / SHA-256 | 987,397 B / `bcfdd5b9a812486fe3a57c02cf311d21599463459a6743063f11eeaa90ce598f` | 984,005 B / `f220c0f2c90b0ad3c57fdbceeb1bcc94d5770425481395fe135d9611fe3aa13a` |
| Mode / owner / mtime / inode | `640` `hris-agent:hris-agent` / 2026-09-15 15:35:11 +0700 / 1975407 | `640` `hris-agent:hris-agent` / 2026-09-16 16:03:29 +0700 / 1975699 |
| `payslip_document` | `47ef4a74-c5b0-4ea9-a020-37b73b09b02c` | `f94b069d-8276-4489-915c-33e3303c4abb` |
| `payslip` | `0b8c7d86-3cfc-42eb-8c98-d944cba37151` = `PS-Test01-0001` (**revoked**) | `9fef42fa-dd50-4eb1-ae93-e825e188e0bd` = `PS-Test01-0002` (**revoked** 2026-09-21, reason `dasda`) |
| Employee | `f9ad9290-df97-490f-9895-74327d59f9e6` = TEST-002 "Test Create" (NIK `123`, DOB 2026-09-15) | `c5e206fd-4eec-423f-9249-a50d189535c4` = TEST-001 "Test Employee" (NIK `3201010101010001`, DOB 1998-07-05) |
| Organization | `3f66da05-2817-4ea8-98db-5b3094c09626` = "System" | "System" |
| Employee state | soft-deleted (`employee.deleted`) | soft-deleted **2026-09-22 03:25:36 UTC** (`employee.deleted`) |
| Decrypts with | V1 password `123152026` (NIK + DD + YYYY) | V2 password `320101010101000105071998` |
| Content | single-page, image-only PDF 595×842, **no text layer**; original filename "Penawaran Harga Pengganti Neon Box.pdf" | same original document |
| Live references | **0** matches across 350 public text/uuid/json columns; `payslip_documents`/`payslip_document_versions`/`payslips` are all empty in production; no journal/grep match in the repo, logs or backups | same |

**Why the sweep cannot attribute them.** Their employees were soft-deleted
(`employee.deleted`), not permanently deleted (`employee.permanently_deleted`,
of which production has **zero**). The sweep attributes a payslip PDF by
walking the permanent-deletion audit trail, so these two files are
structurally unattributable and are correctly held to the
`report_only_never_deleted` policy. They are **test fixtures from the
payroll-deletion development work**, whose provenance is preserved in
`/opt/hris-private/payslips/.phase24c-r4-r17-20260916-154330/`
(`metadata.txt`, `metadata-sync/payslip-document-before-sync.csv`, the V1
source `payslip-v1.pdf` with SHA-256 prefix `597b31bd…`, and the
`staging-v2/reencrypt-harness.mts` / `staging-v2/live-reencrypt-test.mts`
re-encryption harnesses).

**Disposition:** the sweep is correct to report them and must never delete
them. They still need an explicit owner decision (Data Owner + Security,
§14.10 blocker 7): either (a) accept them as permanent test residue outside
the payroll scope, or (b) approve a targeted, audit-logged removal — which is
a *different* operation from the employee-deletion file purge and would need
its own authorization. **No deletion was performed.**

**Preservation proof:** after the investigation, both files have identical
SHA-256, inode, mtime, size, mode and owner, and the whole
`/opt/hris-private` tree is **10/10 byte-identical** to its pre-investigation
state.

### 14.4 Production sweep dry-run (read-only) — proposed actions

`node scripts/purge-deleted-employee-pdfs.mjs` (no `--execute`), run twice
this session, before and after the code changes, with identical results:

| Field | Value |
| --- | --- |
| Exit code | `0` |
| `attributable` / `attributable_present` / `attributable_missing` | `0` / `0` / `0` |
| `referenced_live` | `0` |
| `unattributed_orphan` | `2` — `6de46bf1-04b7-4b1e-b69d-1922842d3f24.pdf`, `aff343f2-0d95-4ea9-80e8-dc422fa4a4d8.pdf` |
| `unattributed_orphan_policy` | `report_only_never_deleted` |
| `deleted_employee_document_folders` | `0` |
| `purged` / `left_behind` | `0` / `0` |

**Every proposed action is report-only.** No file and no folder is proposed
for deletion: there are no attributable keys, no deleted-employee document
folders, and the two orphans are explicitly excluded from deletion by policy.

**Refusal guard re-verified:** `--execute` without `--confirm` →
`DELETED_EMPLOYEE_FILE_PURGE refused: --execute requires --confirm
PURGE-DELETED-EMPLOYEE-PDFS`, exit `1`, nothing touched.

### 14.5 Production build disturbance, diagnosis and repair

**What happened.** `npm run build` was run in `/opt/hris`, which is the live
production checkout. `next build` replaces `.next` in place, so the live
checkout's build directory was overwritten with the candidate build
(`2XVI_zWvnAHKK4HmkRCoQ`).

**Diagnosis.** The running server (`MainPID 2613678`, started 2026-10-19
14:16:39 WIB, `NRestarts=0`) serves HTML that references 13 static assets.
Six of them returned `500` from the new build. Comparing every preserved
`.next*` directory in the repository against the live server's asset list
established two facts:

- The live server's asset manifest is **in memory** from its 2026-10-19
  startup — restoring files on disk does not change what it asks for.
- **The same six assets were already missing before this session's build.**
  The last build in place before it (preserved as
  `.next.verification-20261021T025033Z`) misses exactly the same six, as does
  the release snapshot. The missing assets belong to the build deployed on
  2026-10-19, which had already been replaced by the 2026-10-21 verification
  builds. **The 500s were pre-existing, not introduced by this session** —
  but this session's build made them worse by replacing the remaining files
  with a differently-named set.

**Repair.**

| Step | Action |
| --- | --- |
| 1 | The candidate build was moved aside to `/opt/hris/.next.candidate-20261022T040211Z` (`BUILD_ID 2XVI_zWvnAHKK4HmkRCoQ`) — preserved as the release-candidate artifact, **not deployed** |
| 2 | The genuinely deployed build was located at `/tmp/hris-deploy/20261019-141513-e735f47d23e8/source/.next` (`BUILD_ID J5cpppAYMdIb8Q5QViGP9`, deployed from commit `e735f47d23e8`) and restored into `/opt/hris/.next` |
| 3 | The deployed build was preserved **durably** at `/opt/hris-backups/releases/20261019-141513-e735f47d23e8-J5cpppAYMdIb8Q5QViGP9/` (it previously existed only in ephemeral `/tmp`) |
| 4 | The service was **not restarted** — `NRestarts=0`, `ExecMainStartTimestamp` unchanged, same `MainPID` |

**Verification after the repair.**

| Check | Result |
| --- | --- |
| `systemctl is-active hris.service` | `active` |
| `GET /` | `307` → `/login` |
| `GET /login` | `200` |
| Every static asset referenced by `/login` (13) | **13/13 → `200`** (6 were `500` before the repair) |
| Every static asset referenced across 9 routes (23 distinct) | **23/23 → `200`** |
| On-disk `/opt/hris/.next/BUILD_ID` | `J5cpppAYMdIb8Q5QViGP9` — the deployed build |
| Process | same `MainPID`, `NRestarts=0`, start timestamp unchanged — **no restart, no deploy** |
| Production DB | employees 12, organizations 3, users 6, audit_logs 442, `payslip_documents` 0, migration ledger **18** — unchanged |
| Private filesystem | both orphan PDFs byte-identical; announcements root still empty (0 entries) |

### 14.6 Release-backup integrity defect (new, material)

The release snapshot
`/opt/hris-backups/releases/20261019-141513-kR0L8QnWCFjO3oU4Qb4w3/.next`
does **not** contain the build that production is running. Its `BUILD_ID` is
`kR0L8QnWCFjO3oU4Qb4w3`, but its file contents are the **2026-10-16** build,
and the build actually deployed on 2026-10-19 is `J5cpppAYMdIb8Q5QViGP9`
(deployed from commit `e735f47d23e8`). Consequently the snapshot matches only
11 of the 23 assets the live server references.

**Consequence:** before this session, the deployed production build existed
**only** in an ephemeral `/tmp/hris-deploy/` directory. If the host had been
lost, the running build could **not** have been restored from the release
backup — the backup that claimed to preserve it preserved a different one.
This session has closed that gap by preserving the real deployed build at
`/opt/hris-backups/releases/20261019-141513-e735f47d23e8-J5cpppAYMdIb8Q5QViGP9/`.

**Required follow-up (owner/ops):** the release procedure must archive the
build that is actually deployed, verify that the archived `BUILD_ID` equals
the `BUILD_ID` reported by the running service, and must not keep the only
copy of a deployed build under `/tmp`. This report's previously published
build ID (`kR0L8QnWCFjO3oU4Qb4w3`) was taken from that mislabeled snapshot
and is corrected here to `J5cpppAYMdIb8Q5QViGP9`.

### 14.7 Fresh verification (this session, actual commands/results)

| Check | Command | Result |
| --- | --- | --- |
| Full test suite | `npm test` | **PASS — 1,986/1,986 tests, 407 suites, 0 fail** (was 1,981/406; +5 new path-safety tests) |
| TypeScript | `npx tsc --noEmit` | **PASS — exit 0** |
| Lint | `npm run lint` | **PASS — exit 0; 0 errors, 15 warnings** — all pre-existing, **none** in the changed files |
| Production build | `npm run build` | **PASS — exit 0**, 55 routes, no warnings; candidate `BUILD_ID 2XVI_zWvnAHKK4HmkRCoQ` (preserved, **not deployed**) |
| **NEW** Announcement-folder runtime proof (fixed module) | `announcement-folder-proof.ts` (real shipped module, filesystem redirected to a sandbox) | **`ANNPROOF_RESULT=PASS`** — own folder removed, sibling survives; `""`, `"."`, `".."`, `"../.."`, an absolute path → all **refused with a reason**; non-UUID ids refused by the store; the real announcements root unchanged (`entries=0`, same mtime/mode) |
| **NEW** Pre-fix vulnerability demonstration | `pre-fix-vulnerability-demo.ts` (module as of `HEAD` before the fix) | **`PREFIX_RESULT=VULNERABLE_ROOT_WIPED`** — the defect was real and is now closed |
| Filesystem backup + restore | `tar --acls --xattrs --numeric-owner` + root restore | **PASS** — `hris-private-20261022T034129Z-pre-superadmin-force-delete.tar.gz`, SHA-256 `cee357e13c224b74c16903244a95b495198bef94b443f06b2a36086b83855e6f`; 10/10 byte-identical, ACLs/modes/owners/mtimes identical, **`hris` service account can read the restored tree**, sweep classification identical |
| Incumbent (plain-tar) archive re-check | restore of the previous session's archive | **FAIL — confirmed not application-recoverable**: content 10/10 identical, but ACLs lost and the `hris` service account **cannot** read the restored payslips |
| Sweep dry-run (PRODUCTION, read-only) | `node scripts/purge-deleted-employee-pdfs.mjs` | **PASS — exit 0**; `attributable=0`, `referenced_live=0`, `unattributed_orphan=2` (report-only), `purged=0`, `left_behind=0` — identical before and after the code changes |
| Sweep refusal guard | `--execute` without `--confirm` | **PASS — refused, exit 1, nothing touched** |
| Production state re-check (read-only) | catalog | employees 12, organizations 3, users 6, audit_logs 442, `payslip_documents` 0, migration ledger **18 rows** (`0021`/`0022` still NOT applied) |
| Live service + assets | `systemctl is-active`, `GET /`, 23 asset requests | **PASS** — `active`, `307` → `/login`, **23/23 assets → `200`**, `NRestarts=0`, same PID, on-disk `BUILD_ID J5cpppAYMdIb8Q5QViGP9` |
| Orphan PDF preservation | `sha256sum`, `stat` | **PASS** — both files byte-identical, inode/mtime/mode/owner unchanged; `/opt/hris-private` tree 10/10 byte-identical |
| Disposable probe cleanup | `dropdb` | **PASS** — the disposable probe database `hris_orphan_probe2_034701Z` and the copied dump were removed; no `hris_*probe*` database remains |
| Git | `git status` / `git log` | working tree **clean**; HEAD `a1e584b`; **11 commits ahead** of `origin/main` (`e735f47`); **nothing pushed** |

Evidence workspace (operator workspace `/tmp/opencode`, not in the repo):
`fs-restore-verify-20261022T033954Z/` — `01`–`28` filesystem backup/restore
evidence, `30`–`32` sweep and production state, `40`–`46` test/lint/build/tsc
and the production asset check, `announcement-storage-proof/` (hooks, the
redirect shim, the proof, the pre-fix demonstration and their outputs), and
`orphan-investigation/` (per-file forensics, copies and rendered output — all
outside the private tree).

### 14.8 Production release status — STILL NOT EXECUTED

**No push** (`origin/main` is still `e735f47`), **no production migration**
(ledger 18 rows; `0021`/`0022` not applied), **no deployment** (the live build
`J5cpppAYMdIb8Q5QViGP9` is still serving), **no production deletion** of any
kind, **no service restart**. The candidate build was built, verified and
preserved **without** being put in front of users.

### 14.9 Outstanding blockers and responsible approvers

| # | Outstanding action | Responsible | Change |
| --- | --- | --- | --- |
| 1 | DBA + Security review of revised `0021` (`585dd2d7…c452`) AND revised `0022` (`3750812f…0b5`) — review package ready (`docs/employee-deletion-0021-dba-review-package.md` §9 rows 1–7, §10.5 rows 8–12) | DBA + Security | unchanged |
| 2 | Policy §4 sign-off: retention schedule, eligible categories, legal-hold procedure, backup/PITR, security controls, final DPO/Data Owner authorization (0/6) | HR/Payroll, Legal, DPO, Security, DBA | unchanged |
| 3 | Staging evidence (47-artifact register, `B-01`–`B-15`), staging isolation attestation, Part A `A1`–`A-14` signatures, then the authorized staging rehearsal (incl. file-purge steps 14a/14b) | DBA + Application Lead | unchanged |
| 4 | Drizzle lineage reconciliation (R2→R4→R5) and journaling of `0019`–`0022` | DBA | unchanged |
| 5 | Production Part B `B1`–`B-13`, write-freeze/payroll-cutoff window, RPO/RTO acceptance | DBA + Application Lead + Payroll/HR | unchanged |
| 6 | **Filesystem backup procedure must adopt `--acls --xattrs --numeric-owner` + root restore, land outside `/tmp`, and be automated** — the incumbent archive is not application-recoverable (§14.2). Runbook updated; the automation itself is still outstanding | DBA + Security + Ops | **strengthened** |
| 7 | Disposition of the 2 pre-existing unattributed orphan payslip PDFs — now attributed to revoked payslips of soft-deleted test employees (§14.3); still report-only | Data Owner + Security | **evidence added** |
| 8 | Branch protection / deployment-environment approval; push of the release candidate; migration-first deploy order | Application Lead | unchanged |
| 9 | **Release-backup integrity: archive the build actually deployed, verify archived `BUILD_ID` = the running service's `BUILD_ID`, and never keep the only copy under `/tmp`** (§14.6) | Ops + Application Lead | **NEW** |
| 10 | **Deployment procedure must not build in the live checkout** — a release build must be produced out-of-tree and installed atomically, so verification can never disturb the running service (§14.5) | Ops + Application Lead | **NEW** |

### 14.10 Final status after this session

**RELEASE BLOCKED — on external approvals only, plus the two new operational
gates in §14.9 rows 9–10.**

The engineering scope is complete and proven end-to-end: 1,986/1,986 tests,
clean TypeScript, lint 0 errors, a successful production build, idempotent
migrations, exact FK invariants, a destructive rehearsal covering payroll
deletion + retention + rollback + authorization denials + cross-tenant +
idempotency + control-plane blocks, an audit-attributable file purge proven
against the real storage root with pre-existing files untouched, runtime proofs
that **no recursive delete can target or escape a private root** in the
application action, the operator sweep **and** the announcement attachment
storage, a filesystem backup that is now **functionally recoverable by the
service account**, and a production sweep whose only proposed actions are
report-only.

Production is verified untouched (12/3/6/442, ledger 18, live build
`J5cpppAYMdIb8Q5QViGP9`, service `active` with `NRestarts=0` and **23/23**
static assets serving `200`, both orphan PDFs byte-identical). The release
remains blocked on the external approvals in §14.9. **No approval,
attestation, gate or deployment was fabricated.**
