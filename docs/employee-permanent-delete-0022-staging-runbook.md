# Employee Permanent-Delete (Retention Detach) — Migration 0022 Staging Runbook

Status: **PROPOSED — planning artifact only. Migration `0022` is NOT applied to
any database, is NOT journaled, and no employee data has been deleted. The
permanent-delete executor of the control plane remains hard-disabled
(`DELETION_EXECUTION_ENABLED = false`, `RETENTION_ELIGIBLE_CATEGORIES = []`).**

This document is the staging-execution procedure for
`db/migrations/0022_employee_retention_detach.sql`. It records the verified
rehearsal plan (preflight, isolation, backup/restore, checksum, before/after
schema, transactional rollback, historical reporting, recovery, stop
conditions, evidence) and the approvals required before anything is executed.
Nothing here authorizes a production change.

Companion documents:

- `docs/employee-permanent-delete-0022-detach-design.md` — the dependency audit,
  the selected strategy (nullable reference + `ON DELETE SET NULL` + identity
  snapshots + retained-identity CHECK) and rollback notes (§6.1).
- `docs/employee-permanent-delete-policy.md` — the policy, tiers, safeguards and
  the §4 retention sign-off gate.
- `docs/employee-deletion-0021-staging-runbook.md` — the control-plane (`0021`)
  runbook and lineage-reconciliation plan.
- `docs/migration-reconciliation-runbook.md` — the master DBA/DevOps runbook.
  Its safety rules, isolation matrix (§C), backup checklist (§B), schema
  comparison method (§D), invariant checks (§E) and approval gates (§F) apply to
  this document and are not repeated in full here.

Classification: **a mix of READ-ONLY checks and STAGING-ONLY modifying commands.**
Every section is labelled. Every modifying command is environment-guarded and
requires `HRIS_ENV=staging` plus an explicit `STAGING_DATABASE_URL`; **no command
in this document may default to production.**

---

## 0. Non-negotiable rules

1. Do not apply `0022` — or any migration — to production from this worktree.
2. Do not run `DELETE` against any employee, do not free the executor, and do not
   populate `RETENTION_ELIGIBLE_CATEGORIES` in this workspace.
3. Do not run `drizzle-kit generate` or `drizzle-kit migrate`
   (`npm run db:generate` / `db:migrate`) from this worktree. The snapshot
   lineage is broken (§1.2) and `generate` would emit every schema change since
   snapshot `0014`.
4. Do not edit `db/migrations/meta/_journal.json`, rename/renumber migration
   files, or hand-edit `drizzle.__drizzle_migrations`. Journaling
   `0019`–`0022` happens only in the separately approved reconciliation change.
5. `0022` follows the established out-of-band convention: applied to **staging**
   manually by the DBA and journaled later by the approved reconciliation.
6. No modifying command may run without `HRIS_ENV=staging` and an explicit
   `STAGING_DATABASE_URL`. Never fall back to `DATABASE_URL`, `PGDATABASE`, or a
   default local database for a modifying step.
7. Use synthetic employees only. No production PII in staging evidence.
8. Deployment order is fixed: **migration first, then the compatible application
   build** (§3). Do not deploy the application before the migration and the
   historical-reporting checks are verified.
9. This document is a plan. **Do not execute the staging rehearsal (§5) without
   explicit authorization from the DBA and the Application Lead** (§4.1).

---

## 1. Verified audit state (as of 2026-10-15)

### 1.1 Artifacts under review

| Artifact | Path | State |
| --- | --- | --- |
| Migration | `db/migrations/0022_employee_retention_detach.sql` | Untracked (new), **NOT applied**, **NOT journaled**, gated |
| Design | `docs/employee-permanent-delete-0022-detach-design.md` | Untracked (new) |
| Drizzle schema | `db/schema/attendance.ts`, `leave.ts`, `payroll.ts`, `permission_requests.ts`, `employee_details.ts`, `index.ts` | Modified (tracked) |
| Snapshot/deletion plan | `features/employees/queries.ts`, `features/employees/actions.ts`, `features/employees/permanent-delete-policy.ts` | Modified (tracked) |
| Reporting queries | `features/attendance/queries.ts`, `features/leave/queries.ts|actions.ts`, `features/permission/queries.ts|actions.ts`, `features/payroll/queries.ts|actions.ts`, `app/api/payroll/payslips/[payslipId]/pdf/route.ts` | Modified (tracked) |
| Dialog | `features/employees/delete-employee-dialog.tsx` | Modified (tracked) |
| Tests | `tests/employees/employee-retention-detach.test.ts` | Untracked (new) |
| Control plane (unchanged) | `db/migrations/0021_employee_deletion_controls.sql`, `features/employees/deletion-control-policy.ts`, `deletion-control.actions.ts` | Untouched by `0022`; executor still disabled |

### 1.2 Migration lineage — current facts

| Item | State |
| --- | --- |
| `_journal.json` entries | 20 (idx 0–19); last = `0018_employee_custom_tabs` |
| Snapshot files | Stop at `0014_snapshot.json` (idx 0–14); no snapshots for idx 15–19 |
| Unjournaled SQL | `0019_face_template_key_version.sql`, `0020_user_password_lifecycle.sql`, `0021_employee_deletion_controls.sql`, **`0022_employee_retention_detach.sql`** |
| Production `0019` | **NOT APPLIED** (Phase-11 observation 2026-10-01) |
| Production `0020` | **UNVERIFIED** since commit 2026-10-10 (7488053); app already reads `users.must_change_password` |
| Production `0021`/`0022` | Not applied |

**Consequence:** migrations `0019`–`0021` require lineage reconciliation (the
`0021` runbook §2 / master runbook §E) before journaling. `0022` is not journaled
and must **not** be applied to production until the lineage decision and all §4
production approvals are recorded.

### 1.3 Consistency findings — migration `0022` vs Drizzle schema (verified)

| Check | Result |
| --- | --- |
| PROTECTED tables | 11: `attendance_records`, `attendance_events`, `leave_balances`, `leave_requests`, `permission_requests`, `employee_payroll_components`, `payroll_items`, `payslips`, `payslip_documents`, `payslip_document_versions`, `employee_employment_history` |
| Protected `employee_id` | becomes **nullable** on all 11 |
| Protected FK action | `ON DELETE RESTRICT` → **`ON DELETE SET NULL`** on all 11 (constraint name preserved: `<table>_employee_id_employees_id_fk`) |
| Retained-identity CHECK | `<table>_retained_identity_check` on all 11: `employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL` |
| New snapshot columns | `employee_number_snapshot` + `employee_name_snapshot` added on 10 tables (all except `payroll_items`) |
| `payslips` | adds **only** `employee_name_snapshot`; `employee_number_snapshot` (0013) and `birth_date_snapshot` (0014) are not redefined |
| `payroll_items` | **no new columns** (already NOT NULL creation-time snapshots); only nullability + FK + CHECK change |
| DELETABLE tables | 11: `employee_documents`, `employee_face_enrollments`, `face_enrollment_templates`, `employee_project_assignments`, `employee_addresses`, `employee_insurances`, `employee_bank_accounts`, `employee_dependents`, `employee_educations`, `employee_custom_field_values`, `announcement_recipients` — **untouched**, retain `RESTRICT` + `NOT NULL` |
| CASCADE / disabled constraints | **None.** No `ON DELETE CASCADE`, no `session_replication_role`, no `DISABLE TRIGGER`, no unguarded `DROP CONSTRAINT` |
| Destructive DDL/DML | **None.** No `DELETE`, `TRUNCATE`, `DROP COLUMN`; only `ADD COLUMN IF NOT EXISTS`, NULL-filling `COALESCE` backfill, nullability widening, FK swap, guarded CHECKs |
| Journal | `0022` absent from `_journal.json` |
| Transaction | exactly one `BEGIN;` … `COMMIT;` |
| Closing verification | **Lifecycle-independent** over all 11 protected tables: backfill completeness (`employee_id IS NOT NULL AND employee_number_snapshot IS NULL` = 0), non-anonymous retention (`employee_id IS NULL AND employee_number_snapshot IS NULL` = 0), nullable `employee_id`, `ON DELETE SET NULL` FK (`confdeltype = 'n'`), retained-identity CHECK present. No assertion depends on whether a deletion has occurred. |
| Control plane | `0021` untouched; its `RESTRICT` employee FKs still physically block deletion once applied |

### 1.4 Repository-side verification performed (this worktree, no database touched)

| Check | Result |
| --- | --- |
| `tests/employees/employee-retention-detach.test.ts` + `employee-permanent-delete.test.ts` + `employee-deletion-controls.test.ts` | **257 pass / 0 fail** (retention-detach 45, incl. the lifecycle-independence block) |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors, **15 warnings** (all pre-existing patterns; the two dead locals formerly at `features/payroll/payslip-document.actions.ts` were removed) |
| Full suite (`npm test`) | **1,933 pass / 0 fail** (baseline 1,925 + 8 new lifecycle tests) |
| Migration inspected against the PostgreSQL catalog (read-only) | **Claim withdrawn 2026-10-16.** The prior "done (parent task)" note carried **no** labelled artifact and **no** environment label, so it is not evidence (intake §0 rule 2; handoff §6) and must not be relied on. A live, labelled catalog capture is requested via pack `C1`–`C9` (templates `TS-S4`, `TS-S6`–`TS-S9`) and must be `CONFIRMED` before any staging gate. This runbook claims no catalog inspection. |

**NOT performed (do not claim otherwise):** application of `0022` to any
database; any staging rehearsal; any destructive deletion; any migration
journaling; any production deployment. Runtime idempotency (§2) and the
historical-reporting behaviour (§5.8) are **unproven at runtime** until §5 is
executed on staging.

---

## 2. Idempotency review of `0022` (static; not proven at runtime)

Every schema change in `0022` is guarded:

| Statement class | Guard | Re-run behaviour |
| --- | --- | --- |
| `ADD COLUMN IF NOT EXISTS` | `IF NOT EXISTS` | no-op if present |
| Backfill `UPDATE … COALESCE(col, e.col) WHERE (col IS NULL OR …)` | fills NULLs only | already-filled rows no longer match; never overwrites a snapshot |
| `ALTER COLUMN employee_id DROP NOT NULL` | PostgreSQL no-op if already nullable | safe |
| FK swap (`DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT`) | drop-then-add | drop is a no-op; the FK is re-created with the same definition |
| `<table>_retained_identity_check` | `DO` block guarded by `pg_constraint` existence | no-op if present |

**Selected lifecycle contract — `0022` is repeatable at every lifecycle point.**
The closing verification `DO` block checks **lifecycle-independent** invariants
(backfill completeness, non-anonymous retained rows, nullable references,
`ON DELETE SET NULL` FKs, retained-identity CHECKs), not the presence or absence
of detached rows. The previous revision's
`count(*) WHERE employee_id IS NULL = 0` assertion was only valid *before* the
first deletion and falsely made the migration one-time; it has been removed. No
integrity guarantee was weakened (§2.1).

**Documented conditions under which a re-run is safe:**

1. The re-run uses the **same reviewed artifact** (verified checksum, §5.1/§5.4).
2. The apply is a single transaction with `ON_ERROR_STOP=1` (§5.6); the file is
   self-transactional (`BEGIN … COMMIT`).
3. The re-run is used to recover a partial/failed attempt **or** to re-apply the
   already-applied schema. Because every statement is a no-op on an
   already-migrated schema, this is safe **both before and after** the first
   permanent deletion.

| Lifecycle point | Re-run of `0022` |
| --- | --- |
| Fresh pre-0022 schema, no deletion | Safe — idempotent schema change; verification passes with zero detached rows. |
| `0022` applied, no deletion yet | Safe — all statements no-op; verification passes. |
| **After retained records were detached by a permanent deletion** | **Safe** — detached rows carry their identity snapshot and satisfy the retained-identity CHECK; the backfill skips them; the verification no longer asserts zero detached rows. |
| Recovery from a partially applied migration | Safe — one transaction means PostgreSQL is all-or-nothing; a failure leaves no partial state; re-run the same reviewed artifact. |

### 2.1 Why a re-run is safe after a permanent deletion

After the compatible application deletes an employee, retained rows have
`employee_id IS NULL` with a populated `employee_number_snapshot`. On re-run:

- the backfill `UPDATE … WHERE t.employee_id = e.id` does not match detached
  rows and never overwrites existing snapshots (`COALESCE`);
- `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` and the `DO`-block
  guards are no-ops;
- `ALTER COLUMN employee_id DROP NOT NULL` and the `ON DELETE SET NULL` FK
  re-add accept NULL references;
- the closing verification's checks all hold with detached rows present
  (`confdeltype = 'n'`, nullable `employee_id`, CHECK present).

The invariant that keeps this honest is that a detached row can never be
anonymous: the retained-identity CHECK makes an identity-less detachment fail
closed, so `employee_id IS NULL AND employee_number_snapshot IS NULL` is always
zero after `0022`.

**Not claimed:** runtime idempotency remains **UNPROVEN** until §5.6/§5.7 record
it on a disposable staging clone. Static SQL review and the repository tests do
not prove execution. The migration header's and design document's former wording
("verified by rehearsal" / "rehearsing it twice") was unsupported and has been
corrected; **no staging rehearsal and no migration application has occurred.**

---

## 3. Required deployment order and gating

Fixed order, enforced by the change record:

1. **Apply `0022` to staging first** (§5.6), before any compatible application
   build that reads or writes the new snapshot columns is deployed.
   Rationale: the compatible build references `employeeNameSnapshot`
   (`payslips`, `payslip_documents`, `payslip_document_versions`, attendance,
   leave, permission, employment history) in selects/inserts and in the snapshot
   plan; against a pre-0022 schema those statements fail at runtime. Applying the
   migration first is backward-compatible (the pre-existing application simply
   keeps failing closed on delete via the `RESTRICT` FK → `23503` → rollback →
   retained-completion message).
2. **Run the §5.5 after-schema checks and the §5.8 historical-reporting checks.**
3. **Only then deploy the compatible application build** to staging and re-run
   the §5.8 checks through the application.
4. **No application deployment** to any environment until step 2 is verified and
   recorded. No production migration before every §4.2 approval is recorded.

---

## 4. Prerequisite approvals

### 4.1 Staging execution (BLOCKING, before §5 runs)

| Approval | Owner | Scope |
| --- | --- | --- |
| Change record opened (ID, window, rollback owner, incident commander) | DBA + Application Lead | master runbook §A.1 |
| **DBA approval** of the SQL + rehearsal plan | DBA | §1.3, §2, §5 |
| **Application Lead approval** of the compatible build + deployment order | Application Lead | §3 |
| Staging isolation verified | DBA + Application Lead | §5.2 / master runbook §C |
| Pre-apply backup captured and restore-verified | DBA | §5.3 |

Staging does **not** require the policy §4 retention sign-off because `0022` is
non-destructive to retained data and enables no tier-2 capability — but record
that exception explicitly in the change record. (Contrast: applying `0021` as
part of a destructive release does require §4.)

### 4.2 Production application (BLOCKING, not authorized by this document)

All of the following must be recorded before `0022` is applied to production:

| # | Approval | Owner |
| --- | --- | --- |
| 1 | Migration SQL review + rehearsal evidence (§5) accepted | DBA |
| 2 | Retention/detach acceptable for every protected category in-jurisdiction | Legal / Compliance |
| 3 | Personal-data handling of retained snapshots accepted | DPO |
| 4 | Retention schedule per category and permissible deletion window | HR / Payroll (+ Legal) |
| 5 | Compatible application build + ordered rollout accepted | Application Lead |
| 6 | Lineage reconciliation decision executed; `0019`–`0022` journaled through the approved channel | DBA (reconciliation owner) |

No production apply, no journaling, and no executor enablement may proceed on a
subset of these.

---

## 5. Staging execution procedure for `0022`

**Read-only** subsections: §5.1, §5.2, §5.4, §5.5 (both before and after),
§5.8 evidence capture via queries. **Modifying (staging-only)** subsections:
§5.3 (backup capture writes a file; restore test writes to a disposable DB),
§5.6 (apply), §5.7 (rollback rehearsal on a disposable DB), §5.9 (recovery).

### 5.0 Reusable staging guard

Every **modifying** command below must begin with this guard. It refuses unless
the environment is explicitly staging and the URL is a staging URL; it never
falls back to production.

```sh
# STAGING GUARD — required for every modifying command
[ "${HRIS_ENV:?HRIS_ENV must be set}" = "staging" ] || { echo "REFUSING: HRIS_ENV is not staging" >&2; exit 1; }
[ -n "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL must be set}" ] || exit 1
case "$STAGING_DATABASE_URL" in
  *prod*|*production*|*PROD*) echo "REFUSING: STAGING_DATABASE_URL looks like production" >&2; exit 1 ;;
esac
```

Do not export `DATABASE_URL` from `.env.production` into a rehearsal shell.

### 5.1 Preflight (repository side — READ-ONLY, no database)

- [ ] Record the reviewed commit SHA.
- [ ] Record `sha256sum` of the reviewed artifact set (repository side):
  - `db/migrations/0022_employee_retention_detach.sql`
  - `db/migrations/0021_employee_deletion_controls.sql`
  - `db/schema/attendance.ts`, `db/schema/leave.ts`, `db/schema/payroll.ts`,
    `db/schema/permission_requests.ts`, `db/schema/employee_details.ts`,
    `db/schema/index.ts`
  - `features/employees/queries.ts`, `features/employees/actions.ts`,
    `features/employees/permanent-delete-policy.ts`,
    `features/employees/delete-employee-dialog.tsx`,
    `features/employees/deletion-control-policy.ts`
  - `features/attendance/queries.ts`, `features/leave/queries.ts`,
    `features/leave/actions.ts`, `features/permission/queries.ts`,
    `features/permission/actions.ts`, `features/payroll/queries.ts`,
    `features/payroll/actions.ts`, `features/payroll/payslip-document.actions.ts`,
    `features/payroll/payslip-document.guard.ts`,
    `app/api/payroll/payslips/[payslipId]/pdf/route.ts`
  - `db/migrations/meta/_journal.json`
  - `tests/employees/employee-retention-detach.test.ts`

```sh
# READ-ONLY
git rev-parse HEAD
sha256sum \
  db/migrations/0022_employee_retention_detach.sql \
  db/migrations/0021_employee_deletion_controls.sql \
  db/schema/attendance.ts db/schema/leave.ts db/schema/payroll.ts \
  db/schema/permission_requests.ts db/schema/employee_details.ts db/schema/index.ts \
  features/employees/queries.ts features/employees/actions.ts \
  features/employees/permanent-delete-policy.ts \
  features/employees/delete-employee-dialog.tsx \
  features/payroll/payslip-document.actions.ts \
  tests/employees/employee-retention-detach.test.ts \
  db/migrations/meta/_journal.json
```

- [ ] Confirm `_journal.json` is byte-identical to the reviewed version and
  still contains **no** `0019`/`0020`/`0021`/`0022` entries.
- [ ] Confirm `DELETION_EXECUTION_ENABLED = false` and
  `RETENTION_ELIGIBLE_CATEGORIES = []` in the build (pinned by
  `employee-deletion-controls.test.ts`).
- [ ] Re-run and attach the repo-side checks (`node --test
  tests/employees/employee-retention-detach.test.ts`, full `npm test`,
  `npx tsc --noEmit`, `npm run lint`).

### 5.2 Staging isolation verification (READ-ONLY)

Follow master runbook §C.1–C.4. Minimum evidence:

```sh
# READ-ONLY (staging side)
[ "${HRIS_ENV:-}" = "staging" ] || echo "NOTE: set HRIS_ENV=staging in the app env"
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SELECT current_database(), inet_server_addr(), inet_server_port(), version();
-- No role, schema, tablespace or extension may be shared with production.
SELECT rolname, rolsuper FROM pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY 1;
ROLLBACK;
SQL
```

- [ ] Separate cluster / private root from production; staging-only secrets.
- [ ] `HRIS_ENV=staging` guard active; production endpoints denied from staging.
- [ ] Synthetic employee data only; no production PII.
- [ ] The DB is a verified restore of a production backup **or** a clean
  reconstruction, with the restore report attached (master runbook §B.4, §E.4).

### 5.3 Backup and restore verification (STAGING-ONLY)

**Backup capture (writes a file; reads the staging DB):**

```sh
# STAGING GUARD
[ "${HRIS_ENV:?}" = "staging" ] || exit 1
[ -n "${STAGING_DATABASE_URL:?}" ] || exit 1
case "$STAGING_DATABASE_URL" in *prod*|*production*) exit 1 ;; esac

pg_dump --format=custom \
  --file "staging-db-$(date -u +%Y%m%dT%H%M%SZ)-pre-0022.dump" \
  "$STAGING_DATABASE_URL"
sha256sum staging-db-*-pre-0022.dump
```

- [ ] Label `<ENVIRONMENT>-db-<YYYYMMDD>T<HHMMSS>Z-pre-0022`; record SHA-256.

**Restore verification (writes to a DISPOSABLE database):**

```sh
# STAGING GUARD — restore into a throwaway DB, never the live staging DB
[ "${HRIS_ENV:?}" = "staging" ] || exit 1
createdb "$DISPOSABLE_RESTORE_URL_DB"        # a disposable staging instance
pg_restore --dbname "$DISPOSABLE_RESTORE_URL" --clean --if-exists \
  staging-db-*-pre-0022.dump
psql "$DISPOSABLE_RESTORE_URL" -X -c "SELECT count(*) FROM employees;"
dropdb "$DISPOSABLE_RESTORE_URL_DB"
```

- [ ] The dump restores without error and yields the expected row counts before
  proceeding.
- [ ] Record restore duration and the checksum re-verification.

### 5.4 Migration checksum verification (READ-ONLY)

- [ ] Recompute the SHA-256 of `db/migrations/0022_employee_retention_detach.sql`
  and confirm it equals the value recorded in §5.1 (and in the DBA review
  record). Any mismatch is a STOP.
- [ ] Confirm the artifact is not modified by line endings or an editor.

```sh
# READ-ONLY
sha256sum db/migrations/0022_employee_retention_detach.sql
```

### 5.5 Before / after schema checks (READ-ONLY)

**BEFORE applying `0022`** (establishes the pre-state contract):

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

-- 1. Protected employee FKs must all be RESTRICT ('r') with employee_id NOT NULL.
SELECT c.conrelid::regclass::text AS table_name,
       c.conname,
       a.attnotnull                AS employee_id_not_null,
       c.confdeltype               AS fk_action   -- 'r'=RESTRICT 'n'=SET NULL
FROM pg_constraint c
JOIN pg_attribute a
  ON a.attrelid = c.conrelid AND a.attname = 'employee_id' AND a.attnum > 0
WHERE c.contype = 'f'
  AND c.conname IN (
    'attendance_records_employee_id_employees_id_fk',
    'attendance_events_employee_id_employees_id_fk',
    'leave_balances_employee_id_employees_id_fk',
    'leave_requests_employee_id_employees_id_fk',
    'permission_requests_employee_id_employees_id_fk',
    'employee_payroll_components_employee_id_employees_id_fk',
    'payroll_items_employee_id_employees_id_fk',
    'payslips_employee_id_employees_id_fk',
    'payslip_documents_employee_id_employees_id_fk',
    'payslip_document_versions_employee_id_employees_id_fk',
    'employee_employment_history_employee_id_employees_id_fk'
  )
ORDER BY 1;
-- EXPECTED: 11 rows, employee_id_not_null = true, fk_action = 'r'.

-- 2. No retained-identity CHECK may exist yet.
SELECT conrelid::regclass::text, conname FROM pg_constraint
WHERE contype = 'c' AND conname LIKE '%\_retained_identity_check' ORDER BY 1;
-- EXPECTED: 0 rows.

-- 3. Snapshot column inventory BEFORE (payslips number+birth; payroll_items number+name).
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('employee_number_snapshot','employee_name_snapshot','birth_date_snapshot')
ORDER BY 1, 2;

-- 4. Deletable employee FKs are RESTRICT + NOT NULL (unchanged by 0022).
SELECT c.conrelid::regclass::text AS table_name, c.confdeltype
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.conname IN (
    'employee_documents_employee_id_employees_id_fk',
    'employee_face_enrollments_employee_id_employees_id_fk',
    'face_enrollment_templates_employee_id_employees_id_fk',
    'employee_project_assignments_employee_id_employees_id_fk',
    'employee_addresses_employee_id_employees_id_fk',
    'employee_insurances_employee_id_employees_id_fk',
    'employee_bank_accounts_employee_id_employees_id_fk',
    'employee_dependents_employee_id_employees_id_fk',
    'employee_educations_employee_id_employees_id_fk',
    'employee_custom_field_values_employee_id_employees_id_fk',
    'announcement_recipients_employee_id_employees_id_fk'
  )
ORDER BY 1;
-- EXPECTED: 11 rows, all fk_action = 'r'.
ROLLBACK;
```

> **First-application contract.** The BEFORE "no retained-identity CHECK may
> exist yet" expectation (query #2) holds only for the first application. When
> re-applying as **recovery** for a partial/failed attempt, or re-running an
> already-applied schema, the CHECKs and snapshot columns already exist; record
> the observed state and compare it to the §1.3 contract instead of the
> empty-schema expectations. A re-run is safe at any lifecycle point (§2),
> including after detachments exist.

**AFTER applying `0022`:**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

-- 1. The same 11 protected FKs are now SET NULL ('n'), employee_id nullable.
--    (re-run the BEFORE query #1; EXPECTED: 11 rows, employee_id_not_null = false,
--     fk_action = 'n'; if any row is 'c' CASCADE, STOP.)
SELECT c.conrelid::regclass::text AS table_name, a.attnotnull, c.confdeltype
FROM pg_constraint c
JOIN pg_attribute a
  ON a.attrelid = c.conrelid AND a.attname = 'employee_id' AND a.attnum > 0
WHERE c.contype = 'f' AND c.conname LIKE '%\_employee_id_employees_id_fk'
ORDER BY 1;

-- 2. Exactly 11 retained-identity CHECKs exist with the expected definition.
SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'c' AND conname LIKE '%\_retained_identity_check'
ORDER BY 1;
-- EXPECTED: 11 rows; definition = CHECK (employee_id IS NOT NULL OR
--           employee_number_snapshot IS NOT NULL).

-- 3. Snapshot columns exist and are nullable on the 10 detached tables;
--    payslips gained only the name snapshot; payroll_items gained nothing.
SELECT table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('employee_number_snapshot','employee_name_snapshot','birth_date_snapshot')
ORDER BY 1, 2;

-- 4. No row was detached by the migration, and no retained row is anonymous.
SELECT 'attendance_records' AS t, count(*) FILTER (WHERE employee_id IS NULL) AS detached,
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL) AS anonymous
FROM attendance_records
UNION ALL SELECT 'attendance_events',
       count(*) FILTER (WHERE employee_id IS NULL),
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL)
FROM attendance_events
UNION ALL SELECT 'leave_balances',
       count(*) FILTER (WHERE employee_id IS NULL),
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL)
FROM leave_balances
UNION ALL SELECT 'leave_requests',
       count(*) FILTER (WHERE employee_id IS NULL),
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL)
FROM leave_requests
UNION ALL SELECT 'permission_requests',
       count(*) FILTER (WHERE employee_id IS NULL),
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL)
FROM permission_requests
UNION ALL SELECT 'employee_payroll_components',
       count(*) FILTER (WHERE employee_id IS NULL),
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL)
FROM employee_payroll_components
UNION ALL SELECT 'payroll_items',
       count(*) FILTER (WHERE employee_id IS NULL),
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL)
FROM payroll_items
UNION ALL SELECT 'payslips',
       count(*) FILTER (WHERE employee_id IS NULL),
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL)
FROM payslips
UNION ALL SELECT 'payslip_documents',
       count(*) FILTER (WHERE employee_id IS NULL),
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL)
FROM payslip_documents
UNION ALL SELECT 'payslip_document_versions',
       count(*) FILTER (WHERE employee_id IS NULL),
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL)
FROM payslip_document_versions
UNION ALL SELECT 'employee_employment_history',
       count(*) FILTER (WHERE employee_id IS NULL),
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL)
FROM employee_employment_history
ORDER BY 1;
-- EXPECTED (immediately after a FIRST apply, before any permanent deletion):
--   detached = 0 and anonymous = 0 everywhere. `anonymous = 0` is an invariant
--   that must hold at ALL times; `detached > 0` is legitimate once a permanent
--   deletion has executed and must NOT be treated as a failure on a re-run.

-- 5. Snapshot backfill coverage matches the live reference (id sample).
SELECT count(*) AS protected_rows,
       count(*) FILTER (WHERE employee_number_snapshot IS NULL) AS number_unfilled
FROM attendance_records;
ROLLBACK;
```

- [ ] Compare every captured result against the §1.3 contract and the BEFORE
  capture. Any mismatch (especially any `fk_action = 'c'`) is a STOP.
- [ ] Capture the full staging catalog packet (master runbook §D.2) and attach.

### 5.6 Apply (STAGING-ONLY — MODIFYING)

Run only after §5.0–§5.5 pass and with the §4.1 approvals recorded.

```sh
# STAGING GUARD
[ "${HRIS_ENV:?}" = "staging" ] || exit 1
[ -n "${STAGING_DATABASE_URL:?}" ] || exit 1
case "$STAGING_DATABASE_URL" in *prod*|*production*) exit 1 ;; esac

psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  --file db/migrations/0022_employee_retention_detach.sql
```

- [ ] Record start/end UTC, `psql` exit code, and full output.
- [ ] The file is self-transactional (`BEGIN…COMMIT`); do not wrap it in
  `psql -1`, and do not use `db:migrate`/`db:generate`.
- [ ] Immediately re-run the same command **once** to prove idempotency
  **before any permanent deletion has executed** (§2). Expected: zero errors; the
  `UPDATE`s match no rows; `DROP CONSTRAINT IF EXISTS`/`DO` guards are no-ops.
  Record both outputs as evidence.
- [ ] The pre-deletion re-run is the *first* idempotency evidence. `0022` is also
  re-runnable **after** the first permanent deletion (§2/§2.1); §5.8 step 4
  captures that second re-run on the post-deletion schema to prove the
  lifecycle-independent verification. Do not treat detached rows as a failure.

### 5.7 Transactional rollback tests (DISPOSABLE staging DB — MODIFYING)

Prove atomicity **without modifying the reviewed artifact**.

**Test A — migration atomicity (single transaction rolls back on failure):**

```sh
# STAGING GUARD — disposable DB only
[ "${HRIS_ENV:?}" = "staging" ] || exit 1
case "$DISPOSABLE_RESTORE_URL" in *prod*|*production*) exit 1 ;; esac

# 1. Baseline catalog fingerprint of the disposable clone.
psql "$DISPOSABLE_RESTORE_URL" -X -At -c \
  "SELECT md5(string_agg(x, E'\n' ORDER BY x)) FROM (
     SELECT c.conrelid::regclass::text||'|'||c.conname||'|'||pg_get_constraintdef(c.oid) AS x
     FROM pg_constraint c WHERE c.connamespace='public'::regnamespace
     UNION ALL
     SELECT a.attrelid::regclass::text||'|'||a.attname||'|'||a.attnotnull FROM pg_attribute a
     WHERE a.attnum>0 AND NOT a.attisdropped AND a.attrelid IN (
       SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)
   ) s;" > baseline.catalog.md5

# 2. Build a throwaway copy of the migration whose LAST statement before COMMIT
#    deliberately fails, so the whole transaction must roll back.
sed 's/^COMMIT;/SELECT 1\/0; -- forced failure \
COMMIT;/' db/migrations/0022_employee_retention_detach.sql > /tmp/0022.rollback-probe.sql
psql "$DISPOSABLE_RESTORE_URL" -X -v ON_ERROR_STOP=1 \
  --file /tmp/0022.rollback-probe.sql || echo "EXPECTED FAILURE (rollback path)"

# 3. Catalog fingerprint unchanged? Row counts unchanged?
psql "$DISPOSABLE_RESTORE_URL" -X -At -c "..." > after.catalog.md5
diff baseline.catalog.md5 after.catalog.md5 && echo "ROLLBACK OK: no schema change persisted"
```

- [ ] Expected: the probe fails, and the catalog fingerprint + protected-table row
  counts are identical to baseline. Any persisted change means the transaction
  guarantee is broken → STOP.
- [ ] Delete the probe file; never run a modified artifact against live staging.

**Test B — application deletion transaction rolls back atomically:**

- [ ] Against the staged post-0022 schema, with a **synthetic** employee holding
  protected + deletable rows, drive `permanentlyDeleteEmployeeAction` and force a
  failure at a known point (e.g. a temporary constraint/trigger or a stubbed
  error). Verify that the identity snapshots, the deletable-record removals and
  the `employees` row all roll back together (no partial detach, no orphan).
- [ ] Verify the audit shows no SUCCESS row for the rolled-back attempt.

**Test C — pre-0022 compatibility fail-closed (compatibility fallback):**

- [ ] On a clone **without** `0022`, attempt the same delete; expect the `RESTRICT`
  FK rejection (`23503`), a full rollback, and the retained-completion message.
  This is the fail-closed ordering guarantee of §3.

### 5.8 Historical-reporting checks (STAGING-ONLY — MODIFYING data, then READ-ONLY assertions)

With **synthetic** employees only, after §5.6:

1. Seed a synthetic employee with attendance, attendance events, leave
   balance/request, permission request, payroll components/items, payslips +
   documents/versions, and employment history; also seed a second employee's
   records to prove isolation.
2. Execute one controlled permanent deletion through the application
   (SuperAdmin, typed confirmation, acknowledgement). Record the audit row
   `employee.permanently_deleted` (removed vs retained summaries and
   `snapshottedRetainedRecords`).
3. Assert, read-only:

```sql
BEGIN READ ONLY;
-- a. No retained history was lost: counts equal the pre-deletion counts.
SELECT 'attendance_records' AS t, count(*) FROM attendance_records WHERE organization_id = :org
UNION ALL SELECT 'attendance_events', count(*) FROM attendance_events WHERE organization_id = :org
UNION ALL SELECT 'leave_balances', count(*) FROM leave_balances WHERE organization_id = :org
UNION ALL SELECT 'leave_requests', count(*) FROM leave_requests WHERE organization_id = :org
UNION ALL SELECT 'permission_requests', count(*) FROM permission_requests WHERE organization_id = :org
UNION ALL SELECT 'employee_payroll_components', count(*) FROM employee_payroll_components WHERE organization_id = :org
UNION ALL SELECT 'payroll_items', count(*) FROM payroll_items WHERE organization_id = :org
UNION ALL SELECT 'payslips', count(*) FROM payslips WHERE organization_id = :org
UNION ALL SELECT 'employee_employment_history', count(*) FROM employee_employment_history WHERE organization_id = :org
ORDER BY 1;

-- b. The deleted employee's retained rows are detached WITH identity.
SELECT count(*) FILTER (WHERE employee_id IS NULL) AS detached,
       count(*) FILTER (WHERE employee_id IS NULL AND employee_number_snapshot IS NULL) AS anonymous
FROM attendance_records
WHERE organization_id = :org;         -- anonymous MUST be 0

-- c. No other employee's / tenant's rows were touched.
SELECT count(*) FROM leave_requests
WHERE organization_id = :org AND employee_id IS NULL;  -- must equal only the deleted employee's retained rows
ROLLBACK;
```

- [ ] **Management listings** (attendance `listOrganizationAttendance`,
  leave `listOrganizationLeaveRequests`, permission
  `listOrganizationPermissionRequests`, payroll `listRecentPayslips`) still
  return the detached rows, with identity resolved from the snapshots and
  `employeeId = null`.
- [ ] **Search** by the snapshot employee number/name matches the retained rows.
- [ ] **Payslip PDF** for a detached payslip is still downloadable via
  `app/api/payroll/payslips/[payslipId]/pdf/route.ts` (no live `employees`
  inner join), and its password resolves from
  `employee_number_snapshot` + `DDMMYYYY(birth_date_snapshot)`.
- [ ] **Payroll math** for retained rows is unchanged (snapshot-based runs).
- [ ] **Self-service** queries do not surface detached rows (deleted employee has
  no session).
- [ ] **Review actions**: a detached leave/permission request is refused safely
  with the "permanently deleted employee … can no longer be reviewed" path and
  mutates no detached balances.

4. **Post-deletion idempotency re-run (the lifecycle proof).** With the detached
   rows now present, re-apply the exact reviewed `0022` artifact **once more**:

   ```sh
   # STAGING GUARD
   [ "${HRIS_ENV:?}" = "staging" ] || exit 1
   [ -n "${STAGING_DATABASE_URL:?}" ] || exit 1
   case "$STAGING_DATABASE_URL" in *prod*|*production*) exit 1 ;; esac

   psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
     --file db/migrations/0022_employee_retention_detach.sql
   ```

   - [ ] Expected: exactly zero errors and a clean `COMMIT`. Detached rows
     (`employee_id IS NULL` with a populated identity snapshot) do **not** fail
     the migration; the closing verification accepts them. This is the evidence
     that `0022` is repeatable **after** deletion begins — the exact behaviour
     the previous revision lacked.
   - [ ] Re-run §5.8 assertion (b): `anonymous` must still be 0; `detached` is
     unchanged by the re-apply (the migration mutates no retained data).
   - [ ] Record both the post-deletion re-run output and the unchanged counts as
     evidence.

### 5.9 Recovery procedures

**Backward — revert the schema** (only meaningful before/around a withdrawal; if
any row is already detached, `SET NOT NULL` fails and the rows must be reviewed
by HR/Legal as retained history):

```sql
-- STAGING GUARD applies. Per protected table, child order irrelevant (no CASCADE).
BEGIN;
ALTER TABLE attendance_records ALTER COLUMN employee_id SET NOT NULL;   -- ×11 tables
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_employee_id_employees_id_fk;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_retained_identity_check;
-- ... repeat for the other 10 protected tables ...
COMMIT;
-- Snapshot columns may remain (additive, harmless, preserve captured audit value).
```

**Forward — re-run `0022` (preferred recovery).** Re-apply the same reviewed
artifact under the §2 conditions at **any** lifecycle point, including after a
permanent deletion has executed. The migration is one transaction, so a
partial/failed apply leaves no state; the closing verification is
lifecycle-independent and accepts detached retained rows. No migration variant is
required and the artifact must never be hand-edited. Capture §5.6 (pre-deletion)
and §5.8 step 4 (post-deletion) outputs as the idempotency evidence.

**Point-in-time recovery:** restore the pre-window backup (§5.3) into an isolated
instance via the existing DBA/PITR runbook. Note this restores any deletions
performed since; coordinate with HR — deleting the employee row is itself an
audited, intended change. A committed deletion is **not** reversible by schema
means; the audit row and retained history are the recovery narrative.

### 5.10 Evidence pack

Attach to the change record:

- preflight checksums + commit SHA; `_journal.json` byte check;
- staging isolation evidence (separate cluster/roles/secrets, `HRIS_ENV=staging`);
- pre-apply backup label + SHA-256 + restore-rehearsal output;
- migration checksum re-verification;
- BEFORE and AFTER catalog packets + the §1.3 contract comparison;
- apply output run #1 and the idempotency re-run output;
- rollback Test A/B/C output (catalog fingerprint diff, transaction evidence);
- historical-reporting assertions and UI smoke output (§5.8);
- confirmation the control plane stayed disabled and `0019`–`0021` remained
  untouched;
- sign-off: **DBA + Application Lead** (§4.1). This authorizes nothing beyond
  "0022 rehearsed on staging".

---

## 6. Read-only vs modifying command index

| Section | Type | Targets | Defaults to production? |
| --- | --- | --- | --- |
| §5.1 preflight | READ-ONLY (repo) | none | no |
| §5.2 isolation | READ-ONLY | `STAGING_DATABASE_URL` | no |
| §5.3 backup | MODIFYING (writes dump file; reads staging) | `STAGING_DATABASE_URL` | no (guarded) |
| §5.3 restore test | MODIFYING (disposable DB) | `DISPOSABLE_RESTORE_URL` | no (guarded) |
| §5.4 checksum | READ-ONLY | none | no |
| §5.5 schema checks | READ-ONLY | `STAGING_DATABASE_URL` | no |
| §5.6 apply | **MODIFYING** | `STAGING_DATABASE_URL` | never (guard refuses) |
| §5.7 rollback tests | **MODIFYING** | disposable clone only | never |
| §5.8 reporting checks | MODIFYING then READ-ONLY | `STAGING_DATABASE_URL` | never |
| §5.9 recovery | **MODIFYING** | `STAGING_DATABASE_URL` | never |

No command in this document may be run with `DATABASE_URL` set from
`.env.production`, and no modifying command may omit the §5.0 guard.

---

## 7. Stop conditions

Any one halts the workstream (escalate to the DBA + Application Lead):

- Staging cannot be proven isolated (shared endpoint, credential, role, storage,
  or production route reachable).
- Any preflight/migration checksum differs from the reviewed artifact.
- The §5.5 AFTER output differs from the §1.3 contract in any way — especially
  any `confdeltype = 'c'` (CASCADE) or any missing retained-identity CHECK.
- Any detached row has `employee_number_snapshot IS NULL` (anonymous retention).
- The §5.6 pre-deletion idempotency re-run errors, **or** the §5.8 step 4
  post-deletion re-run errors. `0022` must be repeatable at every lifecycle
  point, including after detachments exist (§2/§2.1); an error there means the
  lifecycle contract is broken → STOP.
- The §5.7 rollback fingerprint changes (transaction guarantee broken).
- A retained record disappears from any management listing, or a payslip PDF
  password cannot be resolved from snapshots.
- Any attempt to run `generate`/`push`, edit the journal, or edit ledger rows.
- `DELETION_EXECUTION_ENABLED` becomes `true`, or
  `RETENTION_ELIGIBLE_CATEGORIES` becomes non-empty.
- `0019`/`0020` production state is later found `unexplained`.

**Final statement:** migration `0022` remains unapplied and unjournaled. No
employee data has been deleted, no migration has been run, no RBAC seeding or
deployment has occurred, and no database was modified in producing this
document. The executor remains disabled and `RETENTION_ELIGIBLE_CATEGORIES` is
empty. Staging must not run without explicit DBA and Application Lead
authorization.
