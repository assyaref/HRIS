# Superadmin Force Delete — Production Release Report

**Report date:** 2026-10-21 (UTC)
**Last updated:** 2026-10-21 (UTC) — see §10 (review package, approval matrix,
lineage record, staging checklist, payroll scope decision, re-verification) and
**§11 (owner-approved payroll deletion scope: implemented, verified in
isolation, still RELEASE BLOCKED)**.
**Repository:** `/opt/hris`
**Requested release commit:** `4d41a5af`
**Base release-candidate commit:** `4d415afbbd43d8e53951a5af13d6aca95f10409d` (`4d415af`)
**Integration commit (local, unpushed):** `6e49e44fa8c8971e79d24793d4cb371fe595f6fe` (`6e49e44`)
**Branch:** `main` (local is ahead of `origin/main` = `e735f47`)
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
| Working tree | integration changes + this report committed locally; no secrets/unrelated files |
| Local vs remote | `main` ahead of `origin/main`; no push made |
| Deployed production build ID (restored/verified) | `kR0L8QnWCFjO3oU4Qb4w3` |
| Verification build ID (not deployed, 2026-10-21 integration build) | `i5k_XIErv8U7XlgA058rF` |
| Production service | `hris.service` — `active (running)`, HTTP `/` → `307` |
| Production DB | `hris` @ `127.0.0.1:5432`, role `hris_app` (no credentials recorded here) |

`npm run build` was executed in the repository as required by the verification
suite. Because `/opt/hris` is also the live production checkout, the
verification build temporarily replaced `.next`. It was moved aside to
`.next.verification-<timestamp>` and the previously deployed build archive
(`/opt/hris-backups/releases/20261019-141513-kR0L8QnWCFjO3oU4Qb4w3/.next`) was
restored. The service was **not restarted**; health remained `307` and the
restored `BUILD_ID` is `kR0L8QnWCFjO3oU4Qb4w3`.

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
| 6 | Payslip PDF storage purge procedure for deleted employees (orphaned files) | Security + DBA + App Lead |
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
