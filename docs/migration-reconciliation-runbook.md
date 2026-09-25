# EMD HRIS Migration Reconciliation Operational Runbook

**Classification:** READ-ONLY OPERATIONAL RUNBOOK — RELEASE BLOCKER
**Source commit:** `b05442f6db3b7bd3606fa2a50eca340447d8ad2a`
**Application:** EMD HRIS
**Scope:** DBA and DevOps reconciliation, backup, staging rehearsal, schema comparison, data validation, recovery planning, and deployment readiness

## Safety status and non-negotiable rules

**Current decision: STOP. The requested commit is not approved for production deployment.**

This document is an operational checklist and evidence specification. It does not authorize a deployment, a migration, a production write, a production restore, or a destructive operation.

- Do not run any migration from this worktree.
- Do not run `db:migrate`, `drizzle-kit migrate`, `drizzle-kit push`, an equivalent SQL runner, or an unapproved ad hoc DDL/DML statement against any production database.
- Do not modify production, the production database, production storage, production service configuration, or the deployment controller while preparing this runbook.
- Do not modify `db/migrations/meta/_journal.json`.
- Do not rename, renumber, rewrite, or retroactively journal any migration or snapshot.
- Do not commit or push anything as part of this reconciliation.
- Do not use a production credential, connection string, host, key, token, or private file in staging.
- Every executable example in this runbook is explicitly marked **STAGING-ONLY** and must use an approved isolated staging endpoint.
- All backup artifacts, schema captures, query results, and restore reports must use UTC timestamps, the source commit, the environment name, and the operator or change ticket.
- Treat payroll, employee master data, identity documents, payslips, biometrics, and audit data as confidential. Do not put raw PII, passwords, tokens, encryption keys, or document contents in tickets or logs.

The repository is currently dirty. The migration files `0011` through `0016` and the modified journal are working-tree artifacts, not files in commit `b05442f6db3b7bd3606fa2a50eca340447d8ad2a`. The release decision must use an immutable checkout or archive of the target commit and a separately reviewed reconciliation artifact.

---

## A. Preconditions

Complete every item before any production change is considered. An unchecked item is a blocker, not a reason to improvise.

### A.1 Change control and ownership

- [ ] Open a change record with a unique change ID, scope, risk rating, maintenance window, rollback decision owner, and named incident commander.
- [ ] Identify the DBA owner, Application owner, Payroll/HR owner, and Security owner by name and contact method.
- [ ] Record the exact application commit under review: `b05442f6db3b7bd3606fa2a50eca340447d8ad2a`.
- [ ] Confirm that the release artifact is built from that immutable commit, not from the dirty checkout.
- [ ] Freeze unrelated schema, migration, seed, feature-flag, and deployment changes during reconciliation.
- [ ] Define the payroll cutoff, write-freeze period, permitted recovery point objective, and recovery time objective.
- [ ] Confirm that no payroll run, payslip publication, employee import, bulk upload, or other high-volume write is in progress during the capture window.

### A.2 Source integrity

- [ ] Obtain a clean read-only checkout or archive of the target commit for evidence collection.
- [ ] Preserve the current dirty worktree as evidence; do not clean, reset, stash, or discard it without DBA and Application approval.
- [ ] Record the output of the repository inventory for the target commit and separately inventory uncommitted migration artifacts.
- [ ] Confirm that no migration file, snapshot, or journal file is being edited while the inventory is being reconciled.
- [ ] Obtain the current deployment controller and its checksum or immutable copy. The host controller is outside Git and therefore is not pinned by the application commit.
- [ ] Confirm the exact PostgreSQL major/minor version, extensions, server timezone, and database encoding for the production capture and the staging restore.

### A.3 Backup readiness

- [ ] A physical PostgreSQL base backup or provider snapshot with WAL/PITR coverage is available and its completion status is confirmed.
- [ ] A logical PostgreSQL export is available as an independent, portable artifact.
- [ ] SHA-256 checksums and a signed or access-controlled manifest exist for every database and file artifact.
- [ ] The pre-change database backup has been restored into an approved isolated staging target and the restore report is attached to the change record.
- [ ] The matching private-file snapshot has been restored into staging and its manifest has been verified.
- [ ] The backup window is recent enough for the approved RPO and is not crossing an unresolved payroll or retention boundary.

### A.4 Staging readiness

- [ ] Staging PostgreSQL is a separate database or cluster with no route, peer, trigger, job, or shared ownership to production.
- [ ] Staging private storage is a separate filesystem, volume, bucket, or namespace and is not a symlink, bind mount, or shared path to production storage.
- [ ] Staging environment variables and secret values are unique to staging and are not copied from `.env.production`.
- [ ] Dedicated staging owner, migration, application read/write, read-only verification, and backup/restore roles exist.
- [ ] No staging role is a member of a production role and no staging service can authenticate to production.
- [ ] The staging application is configured for disabled outbound notifications, no production webhooks, no production email, and no production object-storage write path.
- [ ] The staging service account can read/write only its staging private root and cannot traverse production private paths.

### A.5 Data handling

- [ ] Prefer synthetic or irreversibly masked staging data. If a production snapshot is required for reconciliation, restrict it to named operators and record its handling.
- [ ] Do not paste employee names, NIK, bank details, document filenames, payslip passwords, encryption keys, or raw file contents into the runbook or ticket.
- [ ] Define a secure evidence location with access logging for schema captures, query output, manifests, and restore reports.

---

## B. Backup checklist

### B.1 PostgreSQL backup recommendation

Use **both** of the following for a release of this size and risk:

1. **Physical backup with WAL/PITR as the primary recovery control.** Use the hosting provider's native snapshot/PITR service when available, or a PostgreSQL physical base backup plus continuous WAL archiving. This provides the fastest and most complete cluster recovery, including database state, catalogs, and physical consistency.
2. **Logical backup as the independent portability and inspection control.** Use a PostgreSQL logical export such as `pg_dump`/`pg_dumpall` or the provider's equivalent. The logical export must include schema, data, roles and grants, extensions, sequences, functions, comments, constraints, indexes, foreign keys, and any large objects required by the application. A logical export is not a substitute for physical backup/PITR.

A copy of the application `.next` directory is not a database backup. The observed deployment controller backs up application artifacts; it is not evidence that PostgreSQL or private files were captured.

### B.2 Database backup capture record

The DBA must record the following for the production capture without placing credentials in the runbook:

- [ ] Change ID, operator, environment, source commit, and purpose.
- [ ] `BACKUP_START_UTC` and `BACKUP_END_UTC` in ISO-8601 UTC format.
- [ ] PostgreSQL server version, database name, server timezone, and relevant extensions.
- [ ] Physical snapshot ID or base-backup identifier and WAL/PITR start and end markers.
- [ ] Logical export identifier, format, size, and creation tool/version.
- [ ] The last known migration-ledger identifier and hash captured at backup time.
- [ ] SHA-256 checksum for each logical artifact and the provider or backup-platform verification result for the physical artifact.
- [ ] Encryption-at-rest, access-control, immutability, and off-site storage evidence.
- [ ] Restore test ID and result.
- [ ] Retention class and `RETENTION_UNTIL_UTC`.

Use a stable naming convention such as `<ENVIRONMENT>-db-<YYYYMMDD>T<HHMMSS>Z-pre-migration`; the name is an artifact label, not a command.

### B.3 Database backup verification

- [ ] The physical backup is marked complete by the backup platform, not merely queued.
- [ ] WAL continuity covers the intended recovery window and has no unexplained gap.
- [ ] The logical archive can be listed and inspected by the approved restore tooling.
- [ ] SHA-256 is calculated after transfer to the evidence repository and compared with the manifest.
- [ ] The artifact is readable only by the approved DBA/restore roles.
- [ ] The backup contains no unencrypted temporary files, shell history credentials, or unrelated host data.
- [ ] The database size, relation count, and major table counts are recorded in aggregate form.
- [ ] The migration ledger is captured as evidence, including row ID, hash, and creation time, without treating the journal file as the ledger.

### B.4 Database restore test

Perform the restore only in an approved disposable staging environment. Do not restore over an existing production database or an unverified staging database.

- [ ] Create a fresh isolated staging database or cluster with a non-production owner and credentials.
- [ ] Restore the physical backup or replay it to the approved point in time, then verify the provider's backup verification result.
- [ ] Restore the logical export into a separate staging database using a DBA-approved restore procedure.
- [ ] Confirm the restore completed without owner, privilege, extension, sequence, or constraint errors.
- [ ] Run `pg_isready` and a read-only identity query against staging.
- [ ] Capture tables, columns, types, defaults, nullability, indexes, foreign keys, constraints, extensions, roles, and migration-ledger output.
- [ ] Run the invariant checks in section E against the restored copy.
- [ ] Record the restore duration, warnings, counts, and artifact checksums.
- [ ] Keep the restored copy read-only until the DBA and Application owners approve the next test.

**STAGING-ONLY — read-only identity check**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c 'select current_database() as database_name, current_user as database_user, current_setting('"'"'server_version'"'"') as server_version, current_setting('"'"'TimeZone'"'"') as timezone;'
```

**STAGING-ONLY — logical restore rehearsal**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
  --dbname "$STAGING_DATABASE_URL" "$STAGING_LOGICAL_BACKUP_FILE"
```

**STAGING-ONLY — physical backup verification**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
pg_verifybackup "$STAGING_PHYSICAL_BACKUP_DIRECTORY"
```

The DBA must adapt restore options to the backup format and approved staging topology. These examples must never be run with a production endpoint.

### B.5 Retention proposal

Retention values are a proposed baseline and require DBA, Security, Payroll/HR, and legal/compliance approval:

- [ ] Pre-release physical and logical backups: retain through the rollback window and at least 90 days after release, or longer if a legal hold or investigation applies.
- [ ] Daily database backups: at least 35 days.
- [ ] Weekly database backups: at least 12 weeks.
- [ ] Monthly database backups: at least 12 months.
- [ ] Private HR files and payslips: retain according to the approved HR/payroll/legal retention schedule; never use the database backup retention period as a substitute for document-retention policy.
- [ ] Keep an immutable/off-site copy separate from the host being deployed.
- [ ] Record deletion approval, legal holds, and destruction timestamps.
- [ ] Test restoration from each required retention class, not only the newest backup.

### B.6 Private file storage backup

The repository identifies these private storage roots:

| Data | Repository path or storage model | Backup requirement |
|---|---|---|
| Employee documents | `/opt/hris-private/employee-documents/<organization_id>/<employee_id>/<uuid>.<extension>` | Capture the entire root, preserving relative paths, permissions, timestamps, and file bytes. Reconcile every `employee_documents.storage_key`. |
| Payslips | `/opt/hris-private/payslips/<uuid>.pdf` | Capture encrypted PDF bytes exactly as stored. Reconcile `payslip_documents` and `payslip_document_versions`, including size and SHA-256. |
| Announcement attachments, if that feature is enabled | `/opt/hris-private/announcements/<announcement_id>/<uuid>.<extension>` | Capture the complete private root and reconcile `announcement_attachments.storage_key`, size, and SHA-256. |
| Face templates | PostgreSQL `face_enrollment_templates.secret` (`bytea`) | Covered by the database backup; protect the encryption key separately and never restore it into staging from production secrets. |
| Temporary attendance photos | PostgreSQL `attendance_photos.data` (`bytea`) | Covered by the database backup; apply the approved retention and expiry policy. |

- [ ] Take a filesystem snapshot or encrypted archive while writes are quiesced, or document the consistency window and the write-freeze procedure.
- [ ] Include all private roots, not only payslips or only employee documents.
- [ ] Preserve opaque server-generated storage keys; do not rename files from their original keys during backup or restore.
- [ ] Produce a manifest containing relative path, size, SHA-256, mode/owner, source backup ID, and capture timestamp.
- [ ] Verify that no file is outside the approved private roots and that no symlink escapes those roots.
- [ ] Do not open, decrypt, re-encrypt, or expose payslip contents during inventory. Any authorized PDF validation must use a controlled test identity and must not log passwords.
- [ ] Retain file manifests separately from the encrypted file archive and apply the approved encryption and access policy.

### B.7 Private file restore verification

- [ ] Restore the file archive into `<STAGING_PRIVATE_ROOT>`, never into a production path.
- [ ] Confirm the staging service account can traverse and read the staging root and cannot traverse the production root.
- [ ] Reconcile database rows to files using relative `storage_key` values.
- [ ] For payslips, compare restored file size and SHA-256 with `payslip_documents` and every `payslip_document_versions` row.
- [ ] For announcement attachments, compare restored size and SHA-256 with the database metadata.
- [ ] For employee documents, compare restored size with `employee_documents.file_size` and calculate an external SHA-256 manifest because the schema has no stored document checksum.
- [ ] Count referenced files, missing files, orphan files, duplicate storage keys, and path-escape attempts. Do not delete an orphan during reconciliation; quarantine and escalate it.
- [ ] Test authenticated download behavior for a synthetic or approved test record in staging, including organization and employee isolation.
- [ ] Confirm restored files are not web-accessible and are served only through the application authorization route.

**STAGING-ONLY — private-file manifest checks**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
sha256sum "$STAGING_FILE_MANIFEST"
stat -c '%n %s %a %U:%G' "$STAGING_PRIVATE_ROOT"
```

---

## C. Staging checklist

### C.1 Isolation matrix

| Control | Required staging state | Evidence |
|---|---|---|
| PostgreSQL | Separate cluster or database, separate owner, no production network route | DBA attestation and endpoint inventory |
| File storage | Separate root/volume/bucket and separate encryption metadata | Filesystem or object-store configuration |
| Environment variables | Unique staging names and values; no `.env.production` copy | Secret-manager inventory with values redacted |
| Application identity | Staging-only service account and signing/session secrets | Service configuration review |
| Database roles | Dedicated owner, migration, app read/write, read-only, and backup roles | Role/grant export from staging |
| Network | Production database and storage endpoints denied | Firewall/route evidence |
| External integrations | Notifications, email, webhooks, and payment integrations disabled or pointed to test sinks | Configuration review |
| Data | Synthetic/masked where possible; restricted snapshot if unavoidable | Data handling approval |

### C.2 Staging environment variables

Use a dedicated staging secret store. At minimum, define staging-specific values for:

- [ ] `STAGING_DATABASE_URL` with placeholder host, database, user, and password values.
- [ ] `STAGING_PRIVATE_ROOT` pointing only to the isolated staging file root.
- [ ] `STAGING_FACE_TEMPLATE_ENCRYPTION_KEY`, generated for staging and unrelated to production.
- [ ] `STAGING_APP_PORT` and a staging-only health endpoint or port.
- [ ] Staging log and audit destinations.
- [ ] Staging notification, email, and webhook settings with production delivery disabled.
- [ ] Staging database pool limits and statement/lock timeouts.
- [ ] A staging build identifier tied to the target commit and a unique staging release ID.

Do not reuse the production database URL, face encryption key, session secret, SSH key, SMTP credential, storage credential, or any other production secret. The presence of an ignored production environment file in the repository host is not permission to copy it.

### C.3 Dedicated roles

The following is a role design to be provisioned by the DBA in staging; it is not an instruction to create production roles:

| Role | Allowed responsibility | Prohibited responsibility |
|---|---|---|
| `<STAGING_DB_OWNER>` | Own staging database objects and coordinate restore | Production login or production object ownership |
| `<STAGING_MIGRATION_ROLE>` | Execute an approved staging-only schema rehearsal | Superuser, production access, automatic deployment access |
| `<STAGING_APP_RW>` | Application DML on approved staging schemas | DDL, role management, production access |
| `<STAGING_READONLY>` | Schema, ledger, catalog, and invariant SELECTs | Any DML/DDL |
| `<STAGING_BACKUP_ROLE>` | Backup and restore operations in staging | Application login or production backup access |

- [ ] No staging role is a member of a production role.
- [ ] No staging application role owns tables or has database-owner privileges.
- [ ] The read/write role cannot create roles, alter the database, disable extensions, or read another environment's secret.
- [ ] The read-only role cannot write even inside staging.
- [ ] Role grants are captured in the staging evidence package.

### C.4 Staging entry checks

**STAGING-ONLY — verify the target before any staging test**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c 'select current_database() as database_name, current_user as database_user, inet_server_addr() as server_address, inet_server_port() as server_port;'
```

Before executing any staging example, the operator must independently confirm that `STAGING_DATABASE_URL` resolves to the approved staging host and database. Abort if the endpoint, role, or environment cannot be proven.

### C.5 Staging application checks

- [ ] Build and start the target commit in staging using staging-only environment variables.
- [ ] Confirm the application does not load a production `.env` file.
- [ ] Confirm the application cannot reach the production private file root.
- [ ] Confirm no production outbound notification, email, webhook, or analytics destination is configured.
- [ ] Confirm the staging health check validates the application process, not merely an open HTTP port.
- [ ] Run non-destructive login, employee read, employee master-data read, payroll read, and payslip authorization smoke tests using approved test identities.
- [ ] Do not run migration, seed, import, payroll calculation, payslip publication, or destructive CRUD actions until the separate change approval explicitly permits them in staging.

---

## D. Schema comparison checklist

### D.1 Production schema capture packet

The DBA must obtain a read-only schema capture through the approved production backup/console process. This runbook intentionally provides no production connection command. The capture packet must include:

- [ ] Database identity: database name, server version, server timezone, encoding, and relevant extensions.
- [ ] All user tables in the application schema, including tables added by unjournaled or manually applied migrations.
- [ ] Every column: ordinal position, name, fully qualified type, user-defined type, nullable/not-null state, default expression, identity/generated state, collation, and comment.
- [ ] Primary keys, unique constraints, check constraints, exclusion constraints, foreign keys, deferrability, validation state, update rule, and delete rule.
- [ ] Every index: table, name, method, uniqueness, predicate, included columns, validity, and definition.
- [ ] Sequences and identity metadata where applicable.
- [ ] Views, materialized views, functions, triggers, rules, extensions, row-level-security flags, and policies if present.
- [ ] Table and column ownership, privileges, and grants required to understand the application role.
- [ ] Comments and migration provenance where available.
- [ ] The complete Drizzle migration ledger: row ID, hash, and creation time from the database ledger table, not only the repository journal.
- [ ] The exact repository journal, SQL file hashes, snapshot IDs, and snapshot `prevId` values for comparison.
- [ ] A canonicalized, checksum-protected representation of the capture and the tool/version used to produce it.

Do not capture row-level payroll or employee data in the schema packet. Capture aggregate counts separately under the approved data-handling controls.

### D.2 Staging catalog capture

The following capture is for the restored staging clone only. Run it only after confirming that `STAGING_DATABASE_URL` is isolated.

**STAGING-ONLY — read-only catalog and ledger capture**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '2s';
SELECT current_database() AS database_name,
       current_user AS database_user,
       version() AS server_version,
       current_setting('TimeZone') AS timezone;
SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       c.relkind,
       c.relrowsecurity,
       c.relforcerowsecurity
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname;
SELECT table_schema,
       table_name,
       ordinal_position,
       column_name,
       udt_schema,
       udt_name,
       data_type,
       is_nullable,
       column_default,
       is_identity,
       is_generated,
       collation_name
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, ordinal_position;
SELECT schemaname,
       tablename,
       indexname,
       indexdef
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, indexname;
SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       con.conname AS constraint_name,
       con.contype AS constraint_type,
       con.convalidated,
       con.condeferrable,
       con.condeferred,
       pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname, con.conname;
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY id;
ROLLBACK;
SQL
```

If the ledger table is absent, record that as a schema or restore failure. Do not create it during the comparison.

### D.3 Expected schema contract

The expected schema must be separated into committed, uncommitted, and unproven layers:

| Layer | Expected objects | Reconciliation status |
|---|---|---|
| Committed baseline | `organizations`, `users`, `employees`, `projects`, `work_locations`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`, `audit_logs`, `employee_project_assignments`, `attendance_events`, `attendance_records`, `leave_balances`, `leave_request_events`, `leave_requests`, `leave_types`, `permission_request_events`, `permission_requests`, payroll tables through `0010`, `employee_face_enrollments`, `face_enrollment_templates`, `attendance_photos`, `payslip_documents`, and `employee_payroll_components` | Tracked by committed migrations `0000`–`0010`; compare all catalog objects. |
| Employee Master Data 2.0 schema declarations | Nineteen nullable employee columns plus `employee_addresses`, `employee_insurances`, `employee_bank_accounts`, `employee_dependents`, `employee_educations`, `employee_documents`, `employee_employment_history`, `employee_custom_field_definitions`, and `employee_custom_field_values` | Present in the target commit's schema files, but no corresponding migration is present in the target commit. |
| Payslip schema declarations | Nullable mode linkage fields, `payslip_document_versions`, employee-number snapshot, and birth-date snapshot | Present in the target commit's schema files, but dependent SQL is only in dirty/untracked worktree files. |
| Dirty-worktree-only schema | `announcements`, `announcement_recipients`, `announcement_attachments`, and `users.name` | Not part of the target commit; do not promote without separate approval. |

Key expected rules include:

- UUID primary keys with `gen_random_uuid()` defaults where declared.
- Organization-scoped records and organization foreign keys for HRIS domain tables.
- `employees.employee_number` and `employees.nik` uniqueness within an organization.
- `users.email` uniqueness, nullable `password_hash`, and nullable `users.name` only if the separately approved user-management change is included.
- Employee manager and work-location foreign keys with `ON DELETE SET NULL`.
- Employee master-data unique rules for address type, insurance, and one primary bank account.
- Custom-field uniqueness by organization, employee, and definition, with typed value columns.
- Payslip mode semantics: exactly one linkage is expected by application rules even where the database permits both or neither to be null.
- Payslip document uniqueness, version uniqueness, positive version numbers, and valid source values.
- Payroll assignment non-negative amount and valid effective-date range checks.
- All indexes and foreign-key delete/update actions must be compared, not only table and column names.

### D.4 Schema comparison method

- [ ] Normalize catalog output with a documented, versioned tool and preserve the raw output separately.
- [ ] Compare table presence, column order, exact types, nullability, defaults, indexes, constraints, foreign keys, and ownership.
- [ ] Compare database-enforced rules separately from application-enforced rules.
- [ ] Compare the production ledger to the target commit's migration files and to the dirty-worktree inventory.
- [ ] Classify every difference as `expected-approved`, `production-only`, `repository-only`, or `unexplained`.
- [ ] Require DBA and Application sign-off for every non-empty classification; an unexplained difference is a STOP.
- [ ] Do not use schema synchronization, automatic push, or a generated migration to hide a difference.
- [ ] Do not delete an unexpected production object merely to make the comparison pass.
- [ ] Confirm that the staging schema remains read-only until the comparison and invariant gates are complete.

---

## E. Migration reconciliation procedure

### E.1 Migration inventory

The inventory below is the minimum required reconciliation record. `b054` means the exact target commit; `WT` means the current dirty working tree. The WT columns are evidence only and must not be treated as release content.

| Prefix | SQL file | `b054` tracked | `b054` journal | WT tracked | WT journal | Snapshot state | Finding |
|---|---|---:|---:|---:|---:|---|---|
| 0000 | `0000_lyrical_sleeper.sql` | Yes | Yes | Yes | Yes | `0000_snapshot.json` | Baseline core schema. |
| 0001 | `0001_conscious_human_fly.sql` | Yes | Yes | Yes | Yes | `0001_snapshot.json` | Baseline password column. |
| 0002 | `0002_busy_banshee.sql` | Yes | Yes | Yes | Yes | `0002_snapshot.json` | Baseline assignments and attendance. |
| 0003 | `0003_light_la_nuit.sql` | Yes | Yes | Yes | Yes | `0003_snapshot.json` | Baseline leave and permission requests. |
| 0004 | `0004_spooky_unus.sql` | Yes | Yes | Yes | Yes | `0004_snapshot.json` | Payroll and base payslips. |
| 0005 | `0005_employee_face_enrollments.sql` | Yes | Yes | Yes | Yes | `0005_snapshot.json` | Face enrollment metadata. |
| 0006 | `0006_plain_wolf_cub.sql` | Yes | Yes | Yes | Yes | `0006_snapshot.json` | Face template vault. |
| 0007 | `0007_sloppy_pyro.sql` | Yes | Yes | Yes | Yes | `0007_snapshot.json` | Temporary attendance photos. |
| 0008 | `0008_furry_miek.sql` | Yes | Yes | Yes | Yes | `0008_snapshot.json` | Employee NIK and birth date. |
| 0009 | `0009_petite_dakota_north.sql` | Yes | Yes | Yes | Yes | `0009_snapshot.json` | Payslip documents. |
| 0010 | `0010_gray_terrax.sql` | Yes | Yes | Yes | Yes | `0010_snapshot.json` | Employee payroll components. |
| 0011 | `0011_nasty_khan.sql` | No | No | No; untracked | Yes | `0011_snapshot.json` exists, but its lineage is not attributable to this tag | Announcement tables; duplicate numeric prefix. |
| 0011 | `0011_payslip_document_versions.sql` | No | No | No; untracked | No | No distinct snapshot for this tag | Payslip document version table and guarded legacy backfill. |
| 0012 | `0012_jittery_grim_reaper.sql` | No | No | No; untracked | No | `0012_snapshot.json` exists, but its `prevId` is missing | Payslip period linkage and backfill. |
| 0013 | `0013_payslip_employee_number_snapshot.sql` | No | No | No; untracked | No | `0013_snapshot.json` exists in WT | Payslip employee-number snapshot and guarded backfill. |
| 0014 | `0014_payslip_birth_date_snapshot.sql` | No | No | No; untracked | No | `0014_snapshot.json` exists in WT | Payslip birth-date snapshot and guarded backfill. |
| 0015 | `0015_user_account_name.sql` | No | No | No; untracked | Yes | No `0015_snapshot.json` | Nullable `users.name`; the corresponding schema edit is also WT-only. |
| 0016 | `0016_employee_master_data.sql` | No | No | No; untracked | Yes | No `0016_snapshot.json` | Nineteen nullable employee columns and nine master-data tables. |

Additional required findings:

- [ ] The only duplicate numeric prefix is `0011` (`0011_nasty_khan` and `0011_payslip_document_versions`).
- [ ] The current WT journal omits `0011_payslip_document_versions`, `0012_jittery_grim_reaper`, `0013_payslip_employee_number_snapshot`, and `0014_payslip_birth_date_snapshot`.
- [ ] The current WT journal has no `breakpoints` field on its `0015` and `0016` entries; metadata is noncanonical.
- [ ] Snapshot `0011` has a `prevId` corresponding to the later `0014` state, so its filename cannot be treated as a valid independent `0011` snapshot.
- [ ] Snapshot `0012` has a `prevId` that is not present in the available snapshot set.
- [ ] Snapshots `0013` and `0014` form a chain dependent on the broken `0012` predecessor.
- [ ] No valid snapshots exist for `0015` or `0016`.
- [ ] The payslip SQL comments say the data backfills must not be applied automatically; the surrounding DDL and column additions are still not a complete, journaled lineage.
- [ ] A production note in the dirty worktree claims that `0015` and `0016` objects exist in production while their ledger hashes are absent. Treat that as an unverified lead, not as proof; verify it against the production ledger and schema capture.

For each SQL file, attach a SHA-256 from the immutable source, the exact journal tag, the expected snapshot ID, and the production ledger hash. Do not infer a Drizzle ledger hash from an arbitrary checksum until the ledger algorithm has been confirmed by the DBA.

### E.2 Dependency review

- [ ] Confirm every foreign-key and data dependency for the payslip migrations: `payslips`, `payslip_documents`, `payslip_document_versions`, `payroll_items`, `payroll_runs`, and `payroll_periods`.
- [ ] Confirm the employee master-data migration depends on the `employees` and `work_locations` tables and that the schema/index definitions match exactly.
- [ ] Confirm the announcement migration is not accidentally mixed into the payslip lineage.
- [ ] Confirm the user-name migration is included only if the separately approved user-management schema is part of the release.
- [ ] Review all DDL for non-idempotent `CREATE`, `ALTER`, index, and constraint operations.
- [ ] Review all data backfills for transaction size, lock duration, null handling, and repeat-run behavior.
- [ ] Confirm that no migration silently drops, truncates, rewrites, or re-encrypts payroll or document data.
- [ ] Record every assumption and unresolved dependency for DBA and Application review.

### E.3 Candidate chain for a clean database

This is an **analytical ordering only**. It is not an execution instruction and must not be run from the current worktree.

**Candidate dependency order for a genuinely empty staging database:**

```text
0000 through 0010
0011_payslip_document_versions
0012_jittery_grim_reaper
0013_payslip_employee_number_snapshot
0014_payslip_birth_date_snapshot
announcement tables currently named 0011_nasty_khan
0015_user_account_name
0016_employee_master_data
```

The current numeric names are not an acceptable final chain because `0011` is duplicated and the journal/snapshot lineage is broken. A normalized chain may use fresh monotonic identifiers, but that is a separate, approved design change. It requires coherent regenerated journal and snapshot metadata and must not be performed by renaming or editing files in this worktree.

Before any clean reconstruction, the DBA and Application owners must decide whether the announcement and user-name changes are in scope. If they are not in scope, exclude them and record the exclusion in the expected-schema contract.

### E.4 Clean-database reconstruction procedure

The following procedure is for a disposable staging database after all approvals and after the migration artifacts have been repaired outside this runbook.

- [ ] Start with a newly created, empty staging database and confirm it has no application tables or Drizzle ledger rows.
- [ ] Use an immutable, separately reviewed candidate artifact set; do not use the current dirty journal or snapshots.
- [ ] Apply the candidate chain only in staging under an approved change record.
- [ ] Record the exact applied tags, timestamps, and ledger hashes.
- [ ] Stop on the first error; do not edit the journal, delete a ledger row, rename a tag, or retry a partially applied DDL statement.
- [ ] Capture the reconstructed schema and compare every catalog object against the production capture.
- [ ] Compare the clean database to the application schema declarations at the target commit and to any separately approved dirty-worktree additions.
- [ ] Require a zero-difference result for all approved schema and ledger expectations.
- [ ] If a difference remains, classify it and stop; do not use `drizzle-kit push` or an automatic comparison fix.

### E.5 Data invariant verification

Run the following checks against the restored production clone and the clean staging reconstruction. All checks must be read-only and must return zero unexplained violations. If an expected table is missing, record a schema failure rather than creating the table during the check.

#### Payroll

- [ ] Every payroll period, run, component, assignment, item, item component, and event has a consistent organization where the schema provides one.
- [ ] Each organization/period has no more than one payroll run.
- [ ] Each payroll run/employee pair has no more than one payroll item.
- [ ] Money arithmetic reconciles: gross, total earnings, total deductions, and net follow the approved payroll formula.
- [ ] Component snapshot amounts reconcile to item totals according to the approved earning/deduction contract.
- [ ] Employee payroll assignment amounts are non-negative and effective ranges are valid.
- [ ] Active assignment uniqueness is respected.
- [ ] Approved/locked/finalized records and their event history are not unexpectedly deleted or changed.
- [ ] Payroll status transitions have the required event and audit evidence.
- [ ] Cross-organization references in payroll tables return zero.

#### Payslips and payslip documents

- [ ] Each payslip belongs to the same organization and employee as its linked payroll item or period.
- [ ] Each payslip has exactly one valid application mode: calculated item linkage or distribution period linkage.
- [ ] Issued payslips have the required employee-number snapshot and birth-date snapshot; legacy nulls are explicitly listed and approved.
- [ ] `payslips.payroll_period_id` is correctly backfilled for calculated rows where applicable.
- [ ] Every published payslip has exactly one current document unless an approved business exception exists.
- [ ] Current document organization, payslip, and employee values match the payslip.
- [ ] Document version numbers are positive, unique, contiguous from the expected starting point, and the maximum version is the current version.
- [ ] Current document metadata agrees with the latest version metadata.
- [ ] Restored payslip file size and SHA-256 agree with the database metadata.
- [ ] Revoked payslips retain their historical rows, documents, and version references according to policy.
- [ ] Payslip backfill null counts and duplicate counts are zero after the approved reconstruction.

#### Employees

- [ ] Every employee belongs to an existing organization.
- [ ] `user_id`, `work_location_id`, and `manager_id` references, when present, belong to the same organization.
- [ ] No employee is their own manager and no manager cycle exists.
- [ ] Employee numbers and NIK values obey organization-scoped uniqueness.
- [ ] Status values and contract, resignation, and termination dates follow the approved HR contract.
- [ ] User-to-employee links are one-to-one as required by the application.
- [ ] Deactivation does not remove payroll, attendance, leave, audit, document, or employment-history history.

#### Employee master data

- [ ] All nine employee master-data tables exist in the approved expected schema.
- [ ] Every child row has a valid employee and organization relationship.
- [ ] Address, insurance, and primary-bank uniqueness rules hold.
- [ ] Required master-data fields are populated according to the approved validation policy.
- [ ] Manager, location, and employment-history references are organization-safe.
- [ ] No child row is orphaned or linked across organizations.

#### Custom fields

- [ ] Definitions have unique `(organization_id, field_key)` values and valid field types/statuses.
- [ ] Values have unique `(organization_id, employee_id, field_definition_id)` rows.
- [ ] Exactly the expected typed value column is populated for each field type; unrelated typed columns are null.
- [ ] Required active fields have values for applicable employees.
- [ ] Archived definitions retain their historical values and are not physically removed.
- [ ] Cross-organization definition/value/employee mismatches return zero.

#### Documents and private files

- [ ] Every employee-document row resolves to a file inside the staging private root.
- [ ] File sizes match and externally calculated hashes are recorded; the absence of a database checksum is treated as a control gap, not silently ignored.
- [ ] Employee-document paths cannot escape the root and no original filename is used as the storage key.
- [ ] Payslip and announcement metadata/file hashes match.
- [ ] Missing, duplicate, orphan, and path-escape findings are zero or have an approved incident record.
- [ ] No file is publicly readable and all access tests are organization/employee scoped.
- [ ] The staging file permissions and service identity are verified.

#### Employment history

- [ ] History rows belong to the same organization and employee as the parent employee.
- [ ] `effective_from` values are ordered and do not create impossible overlapping current states unless the business rule permits it.
- [ ] The latest history state agrees with the current employee employment fields.
- [ ] Manager and work-location changes are represented without losing prior values.
- [ ] Deactivation or termination has an expected history row.
- [ ] No history row is unexpectedly deleted; the database's cascade behavior is treated as a retention risk requiring Application/HR approval before any employee deletion.

### E.6 Representative invariant query

The following is a **STAGING-ONLY** starting point. Extend it with the domain-specific checks above and save the result as evidence. It must not be run against production.

**STAGING-ONLY — read-only cross-tenant and payroll checks**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '2s';
WITH checks(check_name, violations) AS (
  SELECT 'employee_user_cross_org', count(*)
  FROM employees AS e
  JOIN users AS u ON u.id = e.user_id
  WHERE u.organization_id IS DISTINCT FROM e.organization_id
  UNION ALL
  SELECT 'employee_location_cross_org', count(*)
  FROM employees AS e
  JOIN work_locations AS l ON l.id = e.work_location_id
  WHERE l.organization_id IS DISTINCT FROM e.organization_id
  UNION ALL
  SELECT 'employee_manager_cross_org', count(*)
  FROM employees AS e
  JOIN employees AS m ON m.id = e.manager_id
  WHERE m.organization_id IS DISTINCT FROM e.organization_id
  UNION ALL
  SELECT 'employee_document_cross_org', count(*)
  FROM employee_documents AS d
  JOIN employees AS e ON e.id = d.employee_id
  WHERE d.organization_id IS DISTINCT FROM e.organization_id
  UNION ALL
  SELECT 'payslip_mode_missing', count(*)
  FROM payslips
  WHERE payroll_item_id IS NULL
    AND payroll_period_id IS NULL
  UNION ALL
  SELECT 'payslip_item_math', count(*)
  FROM payroll_items
  WHERE gross_amount <> total_earnings
     OR net_amount <> greatest(0, total_earnings - total_deductions)
)
SELECT check_name, violations
FROM checks
WHERE violations <> 0
ORDER BY check_name;
ROLLBACK;
SQL
```

The absence of rows is a pass for the listed checks. It is not proof that the entire application is correct; Payroll/HR and Security must review the domain-specific evidence.

### E.7 Disposition decision

- [ ] All SQL files are accounted for as committed, intentionally excluded, or unresolved.
- [ ] Every journaled tag has a matching SQL file and an approved snapshot/lineage.
- [ ] Every SQL file is either intentionally excluded or represented in a reviewed candidate chain.
- [ ] Duplicate prefixes and missing/broken snapshots are resolved in a separate approved artifact, not hidden.
- [ ] Production schema and ledger differences are fully classified.
- [ ] Clean reconstruction and data invariants pass.
- [ ] Rollback/recovery is rehearsed and feasible.
- [ ] All approval gates in section F are signed.
- [ ] If any item is open, retain the release-blocker status.

---

## F. Approval gates

No single role may waive another role's gate. Record approver name, decision, UTC timestamp, evidence links, and unresolved exceptions.

| Gate | Owner | Required evidence | Decision |
|---|---|---|---|
| DBA | DBA lead | Physical/logical backup, checksums, restore test, production schema capture, ledger review, staging roles, clean reconstruction, recovery rehearsal | APPROVE/BLOCK |
| Application | Application lead | Target commit integrity, schema contract, migration compatibility, build/smoke tests, deployment-controller review, no automatic production migration assumption | APPROVE/BLOCK |
| Payroll/HR | Payroll/HR lead | Payroll arithmetic, payslip modes and snapshots, document/version history, employee master data, custom fields, employment history, retention and business acceptance | APPROVE/BLOCK |
| Security | Security lead | Credential isolation, private storage access/encryption, least privilege, secrets handling, audit evidence, tenant isolation, no production data exposure | APPROVE/BLOCK |

Approval means “the evidence is acceptable for the separately approved change,” not “a migration may be run.” Any exception must be documented with an owner, expiry, compensating control, and explicit DBA/Application/Payroll-HR/Security decision.

---

## G. Production deployment prerequisites

### G.1 Deployment readiness checklist

- [ ] A clean, immutable release artifact is built from the approved commit.
- [ ] The production schema capture and migration ledger are attached to the change record.
- [ ] The migration lineage has been repaired or explicitly waived by all four approval gates; the current known lineage defects are not waived by default.
- [ ] A clean staging database has been reconstructed from the approved candidate chain.
- [ ] Production and reconstructed-staging schema comparisons have zero unexplained differences.
- [ ] Payroll, payslip, employee, master-data, custom-field, document, and employment-history invariants pass.
- [ ] Database and private-file restore tests pass, including checksums and access controls.
- [ ] The production write-freeze, payroll cutoff, maintenance window, and communications plan are approved.
- [ ] The rollback/recovery decision is documented before deployment.
- [ ] The application health check includes database connectivity and an approved read-only schema/ledger check; an HTTP 200 alone is insufficient.
- [ ] Monitoring, audit logging, alerting, and incident contacts are active.
- [ ] No deployment automation is permitted to apply an unreviewed migration.

### G.2 Deployment controller verification

The inspected application deployment path does **not** automatically run a database migration:

- `.github/workflows/deploy.yml:3-8` triggers on pushes to `main` and manual dispatch.
- `.github/workflows/deploy.yml:23-46` SSHes to the VPS and passes the commit to `/usr/local/sbin/hris-deploy`.
- `.github/workflows/deploy.yml:50-67` performs an HTTP health check after the controller returns.
- The inspected host controller uses dependency installation, build, candidate start, artifact backup, artifact activation, and service health checks. It does not invoke the project migration script.
- `/etc/systemd/system/hris.service:10-13` starts `/usr/bin/npm start`; the effective service drop-in changes the runtime user but adds no migration hook.
- `package.json:25` defines `db:migrate`, but definition alone is not an invocation.
- The host controller is outside Git and is not cryptographically pinned to the target application commit. Its current contents and checksum must be independently approved.

**Controller conclusion:** no automatic `db:migrate` execution was found in the inspected production deployment controller. This does not rule out an external scheduled job, manual operator command, provider automation, or a different controller version. The DBA must verify the live controller, systemd units, timers, CI organization settings, and external jobs before release.

Because the controller does not perform the migration, a future approved database change requires a separate DBA-controlled migration window and change record. This runbook intentionally supplies no production migration command.

### G.3 Post-deployment verification plan

The post-deployment plan must be read-only until the Application and DBA owners release the write freeze:

- [ ] Confirm the deployed commit/build ID.
- [ ] Confirm service identity, private-root permissions, and staging/production separation.
- [ ] Run the approved read-only database connectivity and schema/ledger check.
- [ ] Compare the post-deploy ledger with the approved pre-deploy ledger and expected change set.
- [ ] Re-run aggregate invariant checks and compare them with the pre-deploy evidence.
- [ ] Verify employee, payroll, payslip, and document access through authorized test users without exposing PII.
- [ ] Confirm private-file counts, sizes, hashes, and missing/orphan findings.
- [ ] Confirm audit and deployment logs are complete and protected.
- [ ] Obtain DBA, Application, Payroll/HR, and Security confirmation before ending the write freeze.

---

## H. Explicit STOP conditions

**STOP means do not deploy, do not retry a migration, do not edit the journal, and escalate to the named owners.** Any one condition is sufficient.

- [ ] The target commit cannot be proven, the release artifact is built from a dirty checkout, or the migration inventory is still changing.
- [ ] Any command, connection string, host, credential, or storage path could target production.
- [ ] No verified physical/logical database backup exists, or any checksum or manifest is missing or mismatched.
- [ ] The database backup has not been restored successfully in an isolated staging target.
- [ ] The private-file backup has not been restored and reconciled in staging.
- [ ] A staging database, file root, environment variable, role, or service identity is shared with production.
- [ ] A production credential, encryption key, SSH key, token, or private file is present in staging or in an evidence artifact.
- [ ] The current duplicate `0011` prefix has not been resolved in a separately approved artifact.
- [ ] Any payslip migration `0011`–`0014` is unjournaled, has ambiguous lineage, or is being applied automatically.
- [ ] Any snapshot is missing, has a missing `prevId`, points to an unexpected predecessor, or is associated with the wrong tag.
- [ ] `0015_user_account_name` or `0016_employee_master_data` is included without a reviewed source, scope decision, and coherent lineage.
- [ ] The production ledger contains hashes that cannot be mapped to the reviewed SQL, or the production schema contains objects that cannot be explained.
- [ ] The clean staging reconstruction has any unexplained table, column, type, default, nullability, index, foreign-key, constraint, ownership, or ledger difference.
- [ ] A schema comparison tool proposes automatic synchronization, push, drop, truncate, rename, or destructive repair.
- [ ] Any payroll, payslip, employee, master-data, custom-field, document, or employment-history invariant is nonzero and not explicitly approved.
- [ ] A payslip document/version is missing, has a checksum mismatch, or cannot be tied to its database metadata.
- [ ] A private file is missing, orphaned, duplicated, outside its approved root, publicly readable, or readable by the wrong service identity.
- [ ] The deployment controller cannot be verified, is not the approved version, or could invoke a migration outside the reviewed change record.
- [ ] An external scheduler, provider job, manual process, or second deployment controller could apply schema changes without DBA approval.
- [ ] The write-freeze, payroll cutoff, rollback owner, recovery point, or recovery time objective is not approved.
- [ ] Any gate in section F is missing, conditional, expired, or signed by an unauthorized person.
- [ ] Logs, tickets, or evidence contain secrets, passwords, raw payslips, identity documents, NIK, bank data, or unnecessary PII.
- [ ] A partial DDL/DML failure has occurred. Do not rerun, edit the ledger, or improvise a repair; preserve evidence and follow the recovery procedure.

**Final release-blocker statement:** with the currently observed duplicate prefix, journal omissions, broken snapshot lineage, missing `0015`/`0016` snapshots, and unverified production-to-repository ledger differences, EMD HRIS commit `b05442f6db3b7bd3606fa2a50eca340447d8ad2a` is not ready for production deployment.
