# Drizzle migration-lineage reconciliation — execution record (2026-10-23)

Status: **EXECUTED as a validated procedure** — drilled end-to-end against a
disposable restored copy of production (`hris_lineage_drill_20261023T035500Z`,
fresh dump `production-db-20261023T035111Z-pre-release-execution.dump`, sha256
`c3094a46042ca797246be35aafe096d97af71ec26faaef101eb624f7a703f3af`) before any
production change. Production was read-only during the drill and remained at
ledger 18 rows / no 0021 tables / no 0022 constraints throughout.

This record closes the lineage-reconciliation blocker of
`SUPERADMIN-FORCE-DELETE-PRODUCTION-REPORT.md` §15.7 row 8 by executing the
documented Path A procedure (`superadmin-force-delete-deployment-runbook.md`
§M-2): reconcile first (this change), then apply by tool in the approved
window.

## 1. What the reconciliation changes

### 1.1 Ledger backfill (production SQL, executed in the deployment window)

`drizzle.__drizzle_migrations` gains two rows for the already-applied
out-of-band migrations 0015/0016, using their journal `when`
(`1790152070913` — LOWER than the newest ledger row `1790661254287`, so the
migrator's newest-row selection semantics are unchanged):

```sql
BEGIN;
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT 'f52993b2b104c45859c6aaf925d7a4fccc937c39618728f38a73db9846d6fbd7', 1790152070913
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
  WHERE hash = 'f52993b2b104c45859c6aaf925d7a4fccc937c39618728f38a73db9846d6fbd7');
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT 'e4644352081da09ae8feed9a3ec1a90fa4797e258f9e140a67e08e3032cacc1d', 1790152070913
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
  WHERE hash = 'e4644352081da09ae8feed9a3ec1a90fa4797e258f9e140a67e08e3032cacc1d');
COMMIT;
```

Hashes are the sha256 of the exact repository files
(`db/migrations/0015_user_account_name.sql`,
`db/migrations/0016_employee_master_data.sql`), matching how the drizzle
migrator computes and records migration hashes. The inserts are idempotent
(NOT EXISTS guards) and run **after** current id 18, with the historical
`created_at`, exactly as the runbook prescribes.

### 1.2 Journal entries (this commit)

`db/migrations/meta/_journal.json` appends four entries with fresh, distinct,
strictly increasing `when` values, all **> 1790661254287** (the drill-proven
freshness requirement — a stale or tied `when` is silently skipped forever):

| idx | tag | when | note |
| --- | --- | --- | --- |
| 20 | `0019_face_template_key_version` | 1792727893035 | applies `DROP DEFAULT` on `face_enrollment_templates.key_version` |
| 21 | `0020_user_password_lifecycle` | 1792727894035 | no-op apply (columns already exist; `ADD COLUMN IF NOT EXISTS`) |
| 22 | `0021_employee_deletion_controls` | 1792727895035 | release migration, sha256 `585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452` (pinned, unchanged) |
| 23 | `0022_employee_retention_detach` | 1792727896035 | release migration, sha256 `3750812f76be5cef1f3356eaf7872208494a31b26b4a2d5ef7433c1ae69160b5` (pinned, unchanged) |

The migration **files are not modified** — the 0021/0022 hashes pinned in the
DBA review package and runbook remain exactly as reviewed. Their
"DELIBERATELY NOT JOURNALED" headers describe the pre-reconciliation state;
this change IS the approved lineage-reconciliation step those headers defer
to ("Apply through the approved DBA change after the lineage is
reconciled").

### 1.3 0019 disposition — journalled and applied (was "pending indefinitely")

`0019_face_template_key_version` (single DDL statement: drop the `'v1'`
default so every template insert must state its actual key version) is now
journalled and applies with this release. Safety re-verified on 2026-10-23:

- Both the currently deployed build (`e735f47d23e8`, `J5cpppAYMdIb8Q5QViGP9`)
  and the release candidate (`8a078c4`) supply `keyVersion` explicitly on
  **every** `face_enrollment_templates` insert
  (`features/employees/face-enrollment.actions.ts`, both call sites,
  byte-identical between the two commits) — the only insert paths in the
  codebase (verified by grep; the remaining references are reads/purges).
- The migration is idempotent (`DROP DEFAULT` succeeds regardless), DDL-only,
  no data rewrite, no key material (per its header), and was previously tested
  against `hris_security_rotation_staging`.
- This makes the lineage fully consistent: every migration file 0000–0022 is
  journalled, every journal entry has a ledger row, and the migrator's
  newest-row watermark advances correctly.

## 2. Drill evidence (disposable copy, 2026-10-23)

Exact production procedure executed against the drill DB (restored **with
production ownership**: database and all tables owned by `hris_app`):

1. Preconditions: ledger 18 rows, `max(created_at)=1790661254287`, employees
   12/organizations 3/users 6/audit_logs 442 — identical to production.
2. Backfill SQL → ledger 20 rows (ids 19/20 = `f52993b2…`/`e4644352…`,
   `created_at=1790152070913`), `max(created_at)` unchanged.
3. `drizzle-kit migrate` equivalent (drizzle-orm node-postgres migrator, the
   same code path `npm run db:migrate` uses) with `DATABASE_URL` pointed at
   the drill DB → **MIGRATE_OK**: applies 0019→0020→0021→0022 in journal
   order; ledger 24 rows with hashes `21752cce…`, `baf18875…`, `585dd2d7…`,
   `3750812f…` at the fresh `when` values.
4. Post-apply invariants (all verified by catalog query on the drill DB):
   - 3 control tables exist (`employee_legal_holds`,
     `employee_deletion_requests`, `employee_deletion_approvals`).
   - 6 `*_retained_identity_check` CHECK constraints; 6 retained tables
     `employee_id NULLABLE` + FK `ON DELETE SET NULL` (`confdeltype='n'`).
   - 5 payroll tables FK `ON DELETE RESTRICT` (`confdeltype='r'`) +
     `employee_id NOT NULL`.
   - `face_enrollment_templates.key_version` default dropped.
   - Snapshot backfill complete: 0 live rows missing
     `employee_number_snapshot`; 0 anonymous rows (both NULL).
   - Row counts unchanged: 12/3/6/442.
5. Idempotency: second migrate run → **no-op**, ledger still 24.
6. Schema diff production-vs-drill (`pg_dump -s`): every difference is
   attributable to 0019/0021/0022 (snapshot columns, retained CHECKs, control
   tables, dropped default) — no unexpected change.

Destructive synthetic-data drill on the migrated copy (synthetic
`DRILLO` org / `DRILL-0001` employee only; real rows untouched):

| Scenario | Result |
| --- | --- |
| ACTIVE legal hold → employee DELETE | **refused** by `employee_legal_holds_active_requires_employee` (CHECK fires via the SET NULL cascade) — deletion blocked at the database level |
| Second concurrent ACTIVE hold | **refused** by partial unique `employee_legal_holds_active_hold_unique` (23505) |
| PENDING deletion request → DELETE | **refused** by `employee_deletion_requests_active_requires_employee` |
| REJECTED request + leftover `payroll_items` row | **refused** by `payroll_items_employee_id_employees_id_fk` RESTRICT (23503) — missed-row backstop |
| Raw DELETE that skips the app's snapshot step | **refused** by `attendance_records_retained_identity_check` — the schema fails closed even against hand-rolled SQL |
| Full app-plan-compliant deletion (snapshot freeze → payroll chain children-first → employee) | **succeeds**; retained rows detached with identity snapshots (`DRILL-0001|Drill Synthetic`); hold/request history detached with immutable snapshots; payroll chain fully removed; **0 anonymous retained rows** |
| Real production rows | untouched (12 employees before and after; all synthetic rows scoped to the `DRILLO` organization) |

## 3. Production execution

Executed in the deployment window (see the final report addendum for the
signed production results). The exact drilled sequence:

1. Fresh verified backups (DB dump + ACL-correct filesystem archive).
2. `psql -v ON_ERROR_STOP=1 -f reconcile-0015-0016-ledger.sql` (§1.1, as
   superuser).
3. `npm run db:migrate` from `/opt/hris` (post-reconciliation worktree, app
   role via `.env.production`).
4. §2 catalog verification re-run against production.
5. Application deployment (atomic, out-of-tree built), then post-deploy smoke
   tests.

## 4. Remaining known limitation (documented, not blocking)

`meta/` snapshot files still stop at `0014_snapshot.json`, so
`npm run db:generate` (drizzle-kit generate) remains **unsafe** from this
worktree — it would diff against the 0014 snapshot and emit duplicate DDL for
everything after 0014. This does not affect `db:migrate` (which only reads the
journal + ledger), the deployed application, or this release. Remediation
(rebuild the meta snapshot chain by replaying migrations on a scratch
database, one snapshot per journal idx) is a separate, reviewed change for a
future session; until it lands, new migrations must continue to be written
by hand as 0019–0022 were.
