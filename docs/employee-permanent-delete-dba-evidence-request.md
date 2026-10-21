# DBA Evidence Request — Migrations 0019–0022 (Production and Staging)

**Document type:** READ-ONLY EVIDENCE REQUEST. This is **not** an approval, a
change record, or an execution instruction.

**Status:** OPEN — awaiting DBA response. No item below has been answered.

> **Guiding rule:** a missing journal entry does **not** prove a migration was
> never applied, and a journal entry does **not** prove a migration was applied.
> Only the environment's actual `drizzle.__drizzle_migrations` ledger plus its
> live catalog can establish what was applied. Every conclusion must be
> evidence-based.

Related:
- `docs/employee-permanent-delete-0022-lineage-reconciliation-plan.md` §3/§7
- `docs/migration-reconciliation-runbook.md` §B (backups), §C (staging), §D
  (schema capture), §E (reconciliation), §F (approval), §G (production), §H
  (STOP conditions)
- `docs/employee-permanent-delete-0022-approval-checklist.md`
- `docs/employee-permanent-delete-0022-staging-change-review.md`

---

## 1. Scope and rules of engagement

- **Read-only only.** Every command the DBA runs in response to this request
  must be a `SELECT`, `SHOW`, or read-only `pg_catalog`/`information_schema`
  query. **No** `INSERT`/`UPDATE`/`DELETE`/`DDL`/`VACUUM`/`ANALYZE`; no
  `drizzle-kit migrate` or `generate`; no ledger edits; no schema or data
  changes.
- **Separate evidence per environment.** Capture **production** and **staging**
  independently and label each artifact with the environment name, database
  name, capture timestamp (UTC), operator, and change/ticket ID.
- **Use an approved read-only channel** (DBA console, replica, or backup
  console). The application team supplies no connection string. Do not use or
  read `.env.production`.
- **Redact secrets.** Evidence must not contain passwords, tokens, keys,
  connection strings, or unnecessary PII. Secret-manager inventories are
  supplied with values redacted.
- **Number every answer** to the item IDs below so gaps are visible.
- **Stop on ambiguity.** A missing answer, an unexplained object, or a checksum
  mismatch is a STOP (§9), not a guess.

### Artifact anchors (REPOSITORY FACT — for the DBA to compare against)

| Migration | File | SHA-256 |
| --- | --- | --- |
| 0019 | `db/migrations/0019_face_template_key_version.sql` | `21752cce27b490807854a5c27387d8525738d1a9fe718b9dada1e89b63042d27` |
| 0020 | `db/migrations/0020_user_password_lifecycle.sql` | `baf1887559aa0d8cb7905a17d5a71c8a8b506431624d9445747ca88d0f3a4eaa` |
| 0021 | `db/migrations/0021_employee_deletion_controls.sql` | `0e234c6ee9d2551686b28e93949f0d1c2573df8240bf0ded7a3eb92b52407764` |
| 0022 | `db/migrations/0022_employee_retention_detach.sql` | `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` |

Drizzle records a ledger `hash` equal to `sha256(<raw .sql file bytes>)`. The
values above are therefore the hashes a cleanly applied entry would show.

---

## 2. Evidence request items

Answer every item **once per environment** (production and staging).

### E1 — Environment identity

- **E1.1** Database name, server version (full), timezone, encoding, and
  installed extensions relevant to the application.
- **E1.2** Endpoint identity in redacted form (host class / cluster role only —
  **no** raw connection string), and whether the endpoint is production,
  staging, DR, preview, or CI.
- **E1.3** Full environment inventory: are there environments beyond
  production and staging (DR replica, preview, CI database, other) that could
  hold divergent schema/ledger state? List each.

### E2 — Migration ledger rows

- **E2.1** Exact contents:
  `select id, hash, created_at from drizzle.__drizzle_migrations order by id;`
- **E2.2** Summary: row count, `min(created_at)`, `max(created_at)`.
- **E2.3** Can each ledger `hash` be mapped to a reviewed SQL file using
  `sha256(raw .sql)`? Provide the DBA's own mapping where available, and flag
  any hash that does not map to a known file.
- **E2.4** For any ledger row whose hash maps to `0019`–`0022`, state the `id`
  and `created_at`.
- **E2.5** Confirm whether the ledger is append-only as observed (no rows
  updated or deleted).

### E3 — Schema/catalog checks for 0019–0022 objects

Provide object existence, definition, nullability, defaults, and constraint
actions for the objects each migration introduces or changes. Use the read-only
templates in §8.

- **E3.1 (0019)** Does `face_enrollment_templates.key_version` still carry a
  **DEFAULT**? Report `column_default`, `is_nullable`, `data_type`.
  *(DEFAULT present ⇒ 0019 DDL likely not applied.)*
- **E3.2 (0020)** Do these columns exist, with the stated types/defaults?
  - `users.must_change_password` — `boolean NOT NULL DEFAULT false`
  - `users.password_changed_at` — `timestamptz NULL`
  - `users.last_login_at` — `timestamptz NULL`
- **E3.3 (0021)** Do these tables exist, with the declared FK actions?
  - `employee_legal_holds`, `employee_deletion_requests`,
    `employee_deletion_approvals`
  - `organization_id`/`employee_id` → `ON DELETE RESTRICT`;
    `*_user_id` → `ON DELETE SET NULL`.
  Do the declared indexes exist
  (`employee_legal_holds_employee_idx`,
  `employee_legal_holds_active_hold_unique`,
  `employee_deletion_requests_org_employee_idx`,
  `employee_deletion_requests_status_idx`,
  `employee_deletion_approvals_request_approver_unique`,
  `employee_deletion_approvals_request_idx`)?
- **E3.4 (0022)** For each of the 11 PROTECTED tables
  (`attendance_records`, `attendance_events`, `leave_balances`,
  `leave_requests`, `permission_requests`, `employee_payroll_components`,
  `payroll_items`, `payslips`, `payslip_documents`,
  `payslip_document_versions`, `employee_employment_history`):
  - Is `employee_id` **nullable**?
  - Is the employee FK `<table>_employee_id_employees_id_fk` present with
    `confdeltype = 'n'` (**SET NULL**)? Flag any `'c'` (**CASCADE**) as a STOP.
  - Does `<table>_retained_identity_check` exist?
  - Do the snapshot columns (`employee_number_snapshot`,
    `employee_name_snapshot`, and where relevant `birth_date_snapshot`) exist?
- **E3.5** Enumerate **every** user table in the application schema so the
  application team can classify each object as
  `expected-approved` / `production-only` / `repository-only` / `unexplained`
  (`unexplained` = STOP).
- **E3.6** For any object that exists with **no mapped ledger row**, record it
  as *live-but-unledgered* (the documented `0015`/`0016` pattern). Do **not**
  "fix" it by editing the ledger.

### E4 — Migration 0020 `must_change_password` behavior

- **E4.1** Confirmation of E3.2 for production **and** staging.
- **E4.2** Which application build/version is actually deployed in each
  environment? Provide the deployed build ID / release record.
- **E4.3** Does the deployed build read `users.must_change_password`?
  (The repository's `lib/auth/auth.ts` `requireUser` and the employee-import
  path reference this column.) If the columns are **absent** while such a build
  is deployed, state that explicitly — it is an **active incident**, not a
  routine migration.
- **E4.4** If the columns exist, is `must_change_password` populated
  consistently, and does any application behavior depend on it? Provide the
  DBA's read-only count of rows by value if permitted.

### E5 — Backup / PITR readiness and restore-test evidence

- **E5.1** Most recent verified physical/logical backup: label, capture
  timestamp (UTC), storage location (redacted), retention, and manifest /
  SHA-256.
- **E5.2** Backup verification output (checksum/verification log).
- **E5.3** A **restore test** into an isolated disposable database:
  restore log, target identity, row-count/checksum reconciliation, and
  timestamp.
- **E5.4** PITR posture: WAL archiving status, `wal_level`, `archive_mode`,
  backup tool (e.g. pgBackRest/WAL-G), retention window, and RPO/RTO.
- **E5.5** Private-file storage backup and restore verification (the detach
  design retains identity snapshots; confirm file storage is consistent).
- **E5.6** State explicitly whether a restore-tested backup exists for **each**
  environment. If not, that is a STOP.

### E6 — Checksums, deployment records, and DBA change tickets

- **E6.1** Any migration checksums the DBA holds for the applied history
  (independent of the repository) for `0015`, `0016`, `0017`, `0018`, and
  `0019`–`0022`.
- **E6.2** Deployment records / release manifests / CI build IDs for each
  environment, tied to the deployed schema.
- **E6.3** Change/ticket IDs for every out-of-band or manual DDL apply,
  including anything that produced the live-but-unledgered `0015`/`0016`
  objects. Identify operator, timestamp, and change record.
- **E6.4** Confirmation of the deployment controller: can any controller,
  systemd unit, timer, CI setting, or external job invoke `db:migrate` or apply
  schema changes outside an approved change record? Provide the configuration
  review (master runbook §G.2).

---

## 3. Why a missing journal entry does not prove a migration was never applied

The repository's `drizzle.__drizzle_migrations` ledger and
`db/migrations/meta/_journal.json` are two different things:

- `drizzle-kit migrate` is **journal-driven**, not snapshot-driven. It reads
  only `_journal.json`, and for each entry inserts a ledger row **only if**
  `last_ledger.created_at < journal.when`. Entries whose `when` is **≤** the
  max ledger `created_at` are **silently skipped**.
- The repository already contains the precedent: journal entries `0015`,
  `0016`, and `0011_nasty_khan` share `when = 1790152070913`, which is **≤** the
  recorded production ledger max `1790661254287`. DDL from those files can
  therefore be **live with no ledger row**.
- `0019`–`0022` are **absent from `_journal.json`**, so `drizzle-kit migrate`
  cannot apply them today. But absence from the journal only means the tool did
  not drive them; it does **not** prove an operator did not apply equivalent DDL
  through another channel.

**Therefore:** the only authoritative way to know what is applied is the
environment's own ledger rows **plus** its live catalog. A repository-side
absence is a question to confirm, never a conclusion. Equally, a ledger row is
not evidence of live DDL unless the catalog matches.

---

## 4. Stop conditions (any one halts the workstream)

STOP means **do not deploy, do not retry a migration, do not edit the journal or
ledger, and escalate to the DBA + Application Lead while preserving evidence.**

1. Required evidence from §2 is **missing, incomplete, or unverified** for any
   environment.
2. Any environment's schema contains an object that cannot be classified as
   `expected-approved` / `production-only` / `repository-only` — i.e. any
   `unexplained` object.
3. Any ledger hash **cannot be mapped** to a reviewed SQL file, or a mismatched
   checksum for `0019`–`0022` is observed against the §1 anchors.
4. Migration `0020` status is **uncertain**: columns absent while a build that
   reads `must_change_password` is deployed, or the deployed build cannot be
   identified.
5. Any of `0019`/`0020` state remains `unexplained` after E3/E4 capture.
6. An unexpected `ON DELETE CASCADE` (`confdeltype = 'c'`) or a missing
   `<table>_retained_identity_check` is found on a PROTECTED table.
7. A ledger row appears **updated or deleted** (ledger not append-only), or a
   retry/partial DDL failure has already occurred.
8. Environment isolation cannot be proven: staging shares a cluster, role,
   secret, storage root, or production network route with production.
9. No **restore-tested** backup exists for the environment, or the pre-apply
   backup cannot be verified.
10. The deployment controller (or any external job) could apply schema changes
    outside an approved change record.
11. Evidence contains secrets, connection strings, or unnecessary PII.

---

## 5. Staging approval path vs production approval path (kept separate)

Evidence capture is read-only and may proceed for both environments in parallel.
**Approvals are separate and non-transferable.** A staging pass authorizes
nothing beyond "rehearsed on staging."

### 5.1 Staging path (per `employee-permanent-delete-0022-approval-checklist.md` Part A)

- Owners: **DBA + Application Lead**.
- Items: A1–A14 — DBA authorization, Application Lead authorization, change
  record, verified staging isolation, pre-apply backup **restore-rehearsed into
  a disposable DB**, reviewed-artifact checksum re-verified
  (`724db82d…65c`), lineage assessment accepted using this evidence request,
  pinned compatible build, rollback rehearsal, historical-reporting validation,
  evidence/stop-condition acknowledgement, staging guard (`HRIS_ENV=staging`,
  explicit `STAGING_DATABASE_URL`, no `DATABASE_URL` fallback), synthetic data
  only, and the control plane disabled
  (`DELETION_EXECUTION_ENABLED=false`, `RETENTION_ELIGIBLE_CATEGORIES=[]`).
- Recorded staging exception: the policy §4 retention sign-off is **not**
  required for the staging rehearsal. It does **not** carry to production.

### 5.2 Production path (per the same checklist, Part B)

- Owners: **DBA, Legal/Compliance, DPO, HR/Payroll, Application Lead, and the
  migration-lineage reconciliation owner**.
- Items: B1–B13 — rehearsal evidence accepted, retention/detach legal sign-off,
  DPO snapshot-handling decision, retention schedule per category, compatible
  build + ordered rollout, **lineage reconciliation executed and `0019`–`0022`
  journaled through the approved channel**, Data Owner/DPO authorization,
  backup/PITR acceptance, security controls, write-freeze/window/rollback
  owner/RPO-RTO, deployment-controller verification, monitoring/alerting, and
  post-deployment read-only verification.
- No production apply, no journaling, and no executor enablement may proceed on
  a subset of these.

**Neither path is authorized by this request.** The DBA evidence is an input to
both, not an approval of either.

---

## 6. Evidence response format

For each environment, return a packet labelled with environment, database,
UTC timestamp, operator, and ticket ID, containing:

| Item | Answer / artifact | Evidence link or attachment |
| --- | --- | --- |
| E1 Environment identity | | |
| E2 Ledger rows + counts + mapping | | |
| E3 0019 catalog | | |
| E3 0020 catalog | | |
| E3 0021 catalog | | |
| E3 0022 catalog | | |
| E3.5 Full table inventory | | |
| E4 0020 behavior + deployed build | | |
| E5 Backup/PITR/restore test | | |
| E6 Checksums / deployments / tickets | | |

Mark each **CONFIRMED**, **NOT CONFIRMED**, or **UNAVAILABLE**, and attach the
raw read-only output.

---

## 7. Classifications and decisions blocked until the DBA responds

The application team will classify every object as
`expected-approved` / `production-only` / `repository-only` / `unexplained`.
Until the evidence above exists, the following decisions **cannot** be made:

- Whether `0019`–`0022` are applied in production and/or staging.
- Whether migration `0020` requires incident response or is a routine migration.
- Whether `0019`'s `key_version` DEFAULT has been removed (0019 applied) or not.
- Whether `0021`/`0022` control-plane and retained-identity objects already
  exist anywhere.
- Whether the reconciliation ordering (plan §4) can be chosen, and therefore
  whether `0022` can be scheduled for a staging rehearsal.
- Whether ledger `when` values for a safe repair can be computed (needs the live
  max `created_at`).
- Whether a restore-tested backup and staging isolation exist for the rehearsal.
- Whether any ledger-less live DDL (`0015`/`0016`, `0011_nasty_khan`) must be
  reconciled before `0019`–`0022`.

---

## 8. Read-only SQL templates (no destructive SQL)

> **Read-only.** Every template is `SELECT`/`SHOW`/`current_setting` only. The
> DBA runs them in the approved read-only channel, once per environment. The
> application team does not run these. Adapt schema qualification to the actual
> application schema if it is not `public`.

**T1 — Environment identity**

```sql
SHOW server_version;
SHOW TimeZone;

SELECT current_database()            AS database_name,
       current_user                  AS database_user,
       current_setting('server_version') AS server_version,
       current_setting('TimeZone')       AS server_timezone,
       inet_server_addr()            AS server_address,
       inet_server_port()            AS server_port;
```

**T2 — Ledger rows**

```sql
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY id;

SELECT count(*)         AS ledger_rows,
       min(created_at)  AS min_created_at,
       max(created_at)  AS max_created_at
FROM drizzle.__drizzle_migrations;
```

**T3 — 0019: `key_version` default**

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'face_enrollment_templates'
  AND column_name  = 'key_version';
```

**T4 — 0020: user password-lifecycle columns**

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'users'
  AND column_name IN ('must_change_password', 'password_changed_at', 'last_login_at')
ORDER BY column_name;
```

**T5 — 0021: control-plane tables and indexes**

```sql
SELECT c.relname AS table_name, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('employee_legal_holds',
                    'employee_deletion_requests',
                    'employee_deletion_approvals')
ORDER BY c.relname;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('employee_legal_holds_employee_idx',
                    'employee_legal_holds_active_hold_unique',
                    'employee_deletion_requests_org_employee_idx',
                    'employee_deletion_requests_status_idx',
                    'employee_deletion_approvals_request_approver_unique',
                    'employee_deletion_approvals_request_idx')
ORDER BY indexname;
```

**T6 — 0022: nullability, FK action, and retained-identity CHECK per PROTECTED table**

```sql
WITH protected(table_name) AS (
  VALUES
    ('attendance_records'),
    ('attendance_events'),
    ('leave_balances'),
    ('leave_requests'),
    ('permission_requests'),
    ('employee_payroll_components'),
    ('payroll_items'),
    ('payslips'),
    ('payslip_documents'),
    ('payslip_document_versions'),
    ('employee_employment_history')
)
SELECT p.table_name,
       col.is_nullable AS employee_id_nullable,
       fk.conname      AS employee_fk,
       fk.confdeltype  AS employee_fk_on_delete,   -- 'n'=SET NULL, 'r'=RESTRICT, 'c'=CASCADE
       chk.conname     AS retained_identity_check
FROM protected p
LEFT JOIN information_schema.columns col
       ON col.table_schema = 'public'
      AND col.table_name   = p.table_name
      AND col.column_name  = 'employee_id'
LEFT JOIN pg_constraint fk
       ON fk.conrelid = to_regclass('public.' || p.table_name)
      AND fk.contype  = 'f'
      AND fk.conname  = p.table_name || '_employee_id_employees_id_fk'
LEFT JOIN pg_constraint chk
       ON chk.conrelid = to_regclass('public.' || p.table_name)
      AND chk.contype  = 'c'
      AND chk.conname  = p.table_name || '_retained_identity_check'
ORDER BY p.table_name;
```

**T7 — 0022: snapshot columns on PROTECTED tables**

```sql
WITH protected(table_name) AS (
  VALUES
    ('attendance_records'), ('attendance_events'), ('leave_balances'),
    ('leave_requests'), ('permission_requests'),
    ('employee_payroll_components'), ('payroll_items'), ('payslips'),
    ('payslip_documents'), ('payslip_document_versions'),
    ('employee_employment_history')
)
SELECT p.table_name, col.column_name, col.data_type, col.is_nullable
FROM protected p
JOIN information_schema.columns col
       ON col.table_schema = 'public'
      AND col.table_name   = p.table_name
      AND col.column_name IN ('employee_number_snapshot',
                              'employee_name_snapshot',
                              'birth_date_snapshot')
ORDER BY p.table_name, col.column_name;
```

**T8 — Full application table inventory (classification input)**

```sql
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relkind AS relation_kind,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
```

**T9 — All employee FKs on PROTECTED tables (detect unexpected CASCADE)**

```sql
SELECT conrelid::regclass AS table_name,
       conname,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND contype = 'f'
  AND conrelid::regclass::text IN (
    'attendance_records', 'attendance_events', 'leave_balances',
    'leave_requests', 'permission_requests', 'employee_payroll_components',
    'payroll_items', 'payslips', 'payslip_documents',
    'payslip_document_versions', 'employee_employment_history')
ORDER BY table_name, conname;
```

**T10 — Backup/PITR posture (read-only settings; external tooling supplied separately)**

```sql
SELECT current_setting('wal_level', true)      AS wal_level,
       current_setting('archive_mode', true)   AS archive_mode,
       current_setting('archive_command', true) AS archive_command;
```

> Templates T1–T10 contain **no destructive SQL** and must not be extended with
> `INSERT`/`UPDATE`/`DELETE`/DDL/`VACUUM`/`ANALYZE` or any
> `session_replication_role` / trigger-disabling statement.

---

## 9. Explicit non-actions in producing this request

- No database was contacted; no migration, journal, snapshot, or ledger was
  read or changed.
- `.env.production` was **not** read; no secret or connection string was
  accessed or guessed.
- No migration, RBAC seed, deployment, or employee deletion was run.
- No file in `db/migrations/` was edited.

**Conclusion:** this request defines exactly what the DBA must capture, in what
format, per environment, and the STOP conditions that apply. Until the evidence
is returned and classified, no reconciliation ordering, no staging rehearsal,
and no production apply may be scheduled.
