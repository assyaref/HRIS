# DBA Handoff Package — Migrations 0019–0022 (Production and Staging)

**Document type:** HANDOFF PACKAGE (read-only evidence collection). This is **not**
an approval, a change record, or an execution instruction. It does not authorize
any database action.

**Status:** OPEN — DBA collection requested. No evidence has been received.

**Companion documents (read these first):**

- `docs/employee-permanent-delete-dba-evidence-request.md` — the full request
  (items **E1–E6**, read-only templates **T1–T10**, STOP conditions §4).
- `docs/employee-permanent-delete-dba-evidence-intake.md` — the intake
  register this handoff feeds (decision gates **G1–G5**).
- `docs/employee-permanent-delete-0022-lineage-reconciliation-plan.md` — §3/§7.
- `docs/employee-permanent-delete-0022-staging-change-review.md` — static review.
- `docs/employee-permanent-delete-0022-approval-checklist.md` — Part A (staging),
  Part B (production), Part C (STOP).
- `docs/migration-reconciliation-runbook.md` — §B/§C/§D/§E/§F/§G/§H.

> **Guiding rule:** a missing journal entry does **not** prove a migration was
> never applied, and a journal entry does **not** prove a migration was applied.
> Only the environment's actual `drizzle.__drizzle_migrations` ledger plus its
> live catalog can establish what was applied.

---

## 1. Purpose and scope of the audit

The audit exists to establish, from evidence, the **actual applied state** of
migrations `0019`–`0022` in every environment before any reconciliation,
staging rehearsal, or production apply is scheduled.

- **In scope:** read-only capture of the Drizzle ledger and the live catalog for
  production and staging (and, per E1.3, any additional environment — DR,
  preview, CI), plus backup/restore readiness, deployment records, and change
  tickets.
- **Out of scope:** any `INSERT`/`UPDATE`/`DELETE`/DDL/`VACUUM`/`ANALYZE`,
  `drizzle-kit migrate`/`generate`/`push`, journal or ledger edits, RBAC
  seeding, deployment, or employee-data deletion.
- **Principal question:** are `0019` (`face_template_key_version`), `0020`
  (`user_password_lifecycle`), `0021` (`employee_deletion_controls`), and `0022`
  (`employee_retention_detach`) applied in each environment — proven from the
  live ledger **plus** the live catalog, not from repository files.
- **Secondary question:** is each existing object classifiable as
  `expected-approved` / `production-only` / `repository-only`? Any
  `unexplained` object is a STOP.

### 1.1 Repository anchors to compare against (REPOSITORY FACT, not live proof)

Drizzle records a ledger `hash` equal to `sha256(<raw .sql file bytes>)`. These
are the values a cleanly applied entry would show.

| Migration | File | SHA-256 |
| --- | --- | --- |
| 0019 | `db/migrations/0019_face_template_key_version.sql` | `21752cce27b490807854a5c27387d8525738d1a9fe718b9dada1e89b63042d27` |
| 0020 | `db/migrations/0020_user_password_lifecycle.sql` | `baf1887559aa0d8cb7905a17d5a71c8a8b506431624d9445747ca88d0f3a4eaa` |
| 0021 | `db/migrations/0021_employee_deletion_controls.sql` | `0e234c6ee9d2551686b28e93949f0d1c2573df8240bf0ded7a3eb92b52407764` |
| 0022 | `db/migrations/0022_employee_retention_detach.sql` | `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` |

---

## 2. URGENT — migration 0020 verification

**Migration 0020 (`user_password_lifecycle`) must be verified first.** It adds:

- `users.must_change_password` — `boolean NOT NULL DEFAULT false`
- `users.password_changed_at` — `timestamptz NULL`
- `users.last_login_at` — `timestamptz NULL`

The deployed application build is understood to read `users.must_change_password`
(the repository's `lib/auth/auth.ts` `requireUser` path and the employee-import
path). Migration `0020` is **unjournaled** and its production state is
**UNVERIFIED since commit 2026-10-10** (`7488053`).

**Urgent actions (read-only, production and staging):**

1. Run **T4** to confirm whether the three columns exist, with the declared
   types/defaults.
2. Identify the **deployed build/release ID** actually serving each environment
   (E4.2) and state whether that build reads `must_change_password` (E4.3).
3. If a build that reads `must_change_password` is deployed **while the columns
   are absent**, report this immediately as an **active incident** — not a
   routine migration — and **STOP** (`…-dba-evidence-request.md` §4.4;
   approval-checklist Part C).
4. If the columns exist, report the read-only value distribution (E4.4) and any
   application behavior that depends on them.

**Disposition (G1)** is one of: `routine` (columns exist, build identified, read
path consistent) or `incident` (build reads a missing column, or the build
cannot be identified). Decision authority: **DBA + Application Lead**.

---

## 3. Evidence references and read-only SQL templates

Capture every item **once per environment** and number every answer by item ID.
The read-only SQL templates live in
`docs/employee-permanent-delete-dba-evidence-request.md` §8. **Templates T1–T10
contain only `SELECT`/`SHOW`/`current_setting` statements and must not be
extended with any destructive or trigger-disabling statement.** The application
team does **not** run these; the DBA runs them in the approved read-only channel.

| Item group | What it covers | Template(s) |
| --- | --- | --- |
| E1 Environment identity | DB name, server version, timezone, encoding, extensions; redacted endpoint role class; full environment inventory | T1 |
| E2 Ledger rows | `id, hash, created_at` rows; count + min/max `created_at`; hash→file mapping; append-only check | T2 |
| E3.1 0019 catalog | `face_enrollment_templates.key_version` default/null/type | T3 |
| E3.2 / E4.1 0020 catalog | `users` password-lifecycle columns | T4 |
| E3.3 0021 catalog | 3 control-plane tables + 6 indexes + FK actions | T5 |
| E3.4 0022 catalog | 11 PROTECTED tables — nullability, FK action, retained-identity CHECK, snapshots | T6, T7, T9 |
| E3.5 Full inventory | every application table for classification | T8 |
| E3.6 Ledger-less live DDL | objects with no mapped ledger row (0015/0016 pattern) | cross-check T2 vs T8 |
| E4 0020 behavior | columns + deployed build + incident flag + value distribution | T4 + external records |
| E5 Backup/PITR | verified backup, verification log, restore test, PITR posture, private-file restore | T10 + external records |
| E6 Checksums/deploy/tickets | DBA-held checksums 0015–0022, release manifests, change tickets, controller review | external records |

Notes on specific items:

- **E1.2** reports the endpoint only as **host class / cluster role** — never a
  raw connection string.
- **E2.3** requires mapping each ledger `hash` to a reviewed SQL file via
  `sha256(raw .sql)`, and flagging any unmapped hash. The DBA corroborates the
  mapping against their own records.
- **E3.4** flags any `confdeltype = 'c'` (CASCADE) or a missing
  `<table>_retained_identity_check` as a STOP. PROTECTED tables:
  `attendance_records`, `attendance_events`, `leave_balances`, `leave_requests`,
  `permission_requests`, `employee_payroll_components`, `payroll_items`,
  `payslips`, `payslip_documents`, `payslip_document_versions`,
  `employee_employment_history`.
- **E3.6** records live-but-unledgered objects as an observation — the ledger is
  **never** "fixed" by editing it.

---

## 4. Required evidence for production and staging

Every item below is required **separately** for **production** and **staging**.
Staging evidence may not substitute for production, or vice versa. Result
vocabulary: `CONFIRMED` / `NOT CONFIRMED` / `UNAVAILABLE` / `PENDING`
(`…-intake.md` §0).

| # | Required evidence (per environment) | Request item |
| --- | --- | --- |
| 1 | Environment identity: DB name, full server version, timezone, encoding, extensions | E1.1 |
| 2 | Redacted endpoint identity + role class (prod/staging/DR/preview/CI) | E1.2 |
| 3 | Full environment inventory (incl. DR/preview/CI) | E1.3 |
| 4 | Full ledger rows `id, hash, created_at` | E2.1 |
| 5 | Ledger row count + `min/max(created_at)` | E2.2 |
| 6 | Ledger hash→reviewed-file mapping + unmapped-hash flags | E2.3 |
| 7 | Ledger rows mapping to `0019`–`0022` (id, created_at), if any | E2.4 |
| 8 | Ledger append-only confirmation (no update/delete) | E2.5 |
| 9 | 0019: `key_version` default/null/type | E3.1 |
| 10 | 0020: `users` password-lifecycle columns | E3.2 |
| 11 | 0021: 3 tables + 6 indexes + FK actions | E3.3 |
| 12 | 0022: 11 PROTECTED tables — nullability, FK action, CHECK, snapshots | E3.4 |
| 13 | Full application table inventory (classification input) | E3.5 |
| 14 | Live-but-unledgered object list (0015/0016 pattern) | E3.6 |
| 15 | Deployed build ID / release record | E4.2 |
| 16 | Does deployed build read `must_change_password`? incident flag | E4.3 |
| 17 | `must_change_password` value distribution (read-only counts) | E4.4 |
| 18 | Most recent verified backup: label, UTC time, location, retention, manifest | E5.1 |
| 19 | Backup verification output (checksum/verification log) | E5.2 |
| 20 | Restore test into an isolated disposable DB: log, target, reconciliation | E5.3 |
| 21 | PITR posture: `wal_level`, `archive_mode`, tool, retention, RPO/RTO | E5.4 |
| 22 | Private-file storage backup + restore verification | E5.5 |
| 23 | Explicit statement: restore-tested backup exists? | E5.6 |
| 24 | DBA-held checksums for `0015`–`0022` | E6.1 |
| 25 | Deployment records / release manifests / CI build IDs | E6.2 |
| 26 | Change/ticket IDs for out-of-band / ledger-less DDL | E6.3 |
| 27 | Deployment-controller review (any unreviewed `db:migrate`?) | E6.4 |

The complete per-item registers (with `Evidence ref`, `Captured (UTC)`, `TZ`,
`Collector`, `Reviewer`, `Checksum`, `Result`, `Discrepancy`, `Follow-up`) are
in `docs/employee-permanent-delete-dba-evidence-intake.md` §2 (production) and §3
(staging). The cross-environment inventory is §4 there.

---

## 5. Evidence filenames, labeling, storage, and redaction

### 5.1 Filename convention

Name each artifact:

```
EVD-<env>-<item>-<YYYYMMDDTHHMMSSZ>-<seq>.<ext>
```

- `<env>` — `production`, `staging`, `dr`, `preview`, `ci` (lowercase).
- `<item>` — request item with dots replaced by dashes, e.g. `E2-1`, `E3-4`,
  `E5-3`. Use `E3-4-<table>` for per-object breakdowns.
- `<YYYYMMDDTHHMMSSZ>` — capture timestamp in UTC (ISO-8601 compact).
- `<seq>` — two-digit sequence (`01`, `02`, …) when one item yields several files.
- `<ext>` — `txt`, `csv`, `json`, `log`, or `md`.

Examples: `EVD-production-E2-1-20261015T160000Z-01.csv`,
`EVD-staging-E3-4-20261015T161500Z-02.txt`,
`EVD-production-E5-3-20261016T090000Z-01.log`.

Use these exact `Evidence ref` values in the intake register so the two documents
line up.

### 5.2 Labeling (every artifact)

Each artifact (or its covering note) must state: **environment**, **database
name**, **capture timestamp (UTC)** and server/report timezone, **collector**,
**reviewer**, and the **change/ticket ID**.

### 5.3 Storage, checksums, and collection timestamps

- Raw evidence is stored **only** in the organization's **approved
  restricted-access evidence location** (access-controlled repository or
  secret-free evidence store) — **not** in this Git repository, not in chat, and
  not in a shared folder with broad access.
- Compute a **SHA-256** for every file artifact and record it in the intake
  register's `Checksum` column (direct console text uses `n/a`, but note the
  console/session ID). Compare the checksum after transfer into the evidence
  store.
- Record the **collection timestamp (UTC)** on every item. Do not backfill or
  approximate timestamps.
- Attach the raw, unedited output. Do not paste only summaries in place of raw
  artifacts.

### 5.4 Redaction requirements

- **No passwords, tokens, API keys, connection strings, or other secrets** in any
  artifact.
- **No unnecessary PII.** Employee names, numbers, birth dates, and other
  personal data are redacted unless a specific item requires them; report counts
  instead of raw personal values wherever possible (E4.4).
- Endpoints appear **only** as host class / cluster role (E1.2), never as a raw
  connection string.
- Secret-manager inventories are supplied with values redacted.
- Evidence containing secrets or unnecessary PII is itself a STOP (request §4.11)
  — redact and re-capture rather than submit.

---

## 6. Repository-only evidence cannot establish live database state

Repository facts (journal entries, snapshots, SQL file bytes, SHA-256 values)
are **necessary but not sufficient**. They are inputs to compare **against** live
evidence — never a substitute for it.

- A SQL file present in `db/migrations/` does not prove it was applied.
- Absence from `db/migrations/meta/_journal.json` does **not** prove it was not
  applied — see the `0015`/`0016` precedent, where DDL can be live with no ledger
  row because the migrator silently skips entries whose `when` is `≤` the ledger
  max `created_at`.
- Only the environment's own `drizzle.__drizzle_migrations` rows **plus** its live
  catalog establish what is applied.
- No item may be marked `CONFIRMED` on a repository-side inference. Missing
  evidence stays `PENDING` or becomes `UNAVAILABLE`; it is never inferred or
  guessed.

**Do not** treat any repository artifact, test result, or static review as
runtime proof of live database state.

---

## 7. Approval path and STOP conditions

### 7.1 Approvals (separate and non-transferable)

Evidence capture is read-only and may run in parallel for both environments.
**This handoff authorizes nothing. A staging pass authorizes nothing beyond
"rehearsed on staging."**

- **Staging (approval-checklist Part A, A1–A14):** **DBA + Application Lead** —
  including DBA/Application Lead authorization, change record, verified staging
  isolation, pre-apply backup restore-rehearsed into a disposable DB, reviewed
  artifact checksum re-verified (`724db82d…65c`), lineage assessment accepted,
  pinned compatible build (migration-first order), rollback rehearsal,
  historical-reporting validation, evidence/STOP acknowledgement, staging guard
  (`HRIS_ENV=staging`, explicit `STAGING_DATABASE_URL`, no `DATABASE_URL`
  fallback), synthetic data only, control plane disabled
  (`DELETION_EXECUTION_ENABLED=false`, `RETENTION_ELIGIBLE_CATEGORIES=[]`).
- **Production (Part B, B1–B13):** **DBA, Legal/Compliance, DPO, HR/Payroll,
  Application Lead, and the migration-lineage reconciliation owner** — rehearsal
  evidence accepted, retention/detach legal sign-off, DPO snapshot-handling
  decision, retention schedule per category, compatible build + ordered rollout,
  lineage reconciliation executed and `0019`–`0022` journaled through the
  approved channel, Data Owner/DPO authorization, backup/PITR acceptance,
  security controls, write-freeze/window/rollback owner/RPO-RTO,
  deployment-controller verification, monitoring/alerting, post-deployment
  read-only verification.

The evidence gathered here is an **input** to both paths — not an approval of
either. The policy §4 retention sign-off is **not** required for the staging
rehearsal; that exception does **not** carry to production.

### 7.2 STOP conditions (any one halts the workstream)

STOP means **do not deploy, do not retry a migration, do not edit the journal or
ledger, and escalate to the DBA + Application Lead while preserving evidence.**
Per `…-dba-evidence-request.md` §4, the approval checklist Part C, and master
runbook §H:

1. Required evidence is missing, incomplete, or unverified for any environment.
2. Any environment contains an object that cannot be classified
   `expected-approved` / `production-only` / `repository-only` (i.e. any
   `unexplained` object).
3. Any ledger hash cannot be mapped to a reviewed SQL file, or a checksum
   mismatch for `0019`–`0022` against the §1.1 anchors.
4. Migration `0020` status is uncertain: columns absent while a build reading
   `must_change_password` is deployed, or the deployed build cannot be identified.
5. `0019`/`0020` state remains `unexplained` after E3/E4 capture.
6. An unexpected `ON DELETE CASCADE` (`confdeltype = 'c'`) or a missing
   `<table>_retained_identity_check` on a PROTECTED table.
7. A ledger row was updated/deleted (ledger not append-only), or a
   retry/partial DDL failure already occurred.
8. Environment isolation cannot be proven (staging shares a cluster, role,
   secret, storage root, or production network route with production).
9. No restore-tested backup exists for the environment, or the pre-apply backup
   cannot be verified.
10. The deployment controller or any external job could apply schema changes
    outside an approved change record.
11. Evidence contains secrets, connection strings, or unnecessary PII.

Any `NOT CONFIRMED` or `UNAVAILABLE` on a required item is a STOP until the
owning decision gate resolves it (`…-intake.md` §0 rule 6). Record the
discrepancy and follow-up; do not silently continue.

---

## 8. DBA return checklist

Complete one return checklist per environment. Mark each required evidence item
`DONE` / `PARTIAL` / `UNAVAILABLE` / `DISCREPANCY`, cite the `EVD-…` filename(s),
and note any mismatch against the contract.

| # | Evidence item | File(s) | Status | Discrepancy / note |
| --- | --- | --- | --- | --- |
| E1.1 | Environment identity | | ☐ | |
| E1.2 | Redacted endpoint + role class | | ☐ | |
| E1.3 | Full environment inventory | | ☐ | |
| E2.1 | Ledger rows `id, hash, created_at` | | ☐ | |
| E2.2 | Ledger count + min/max `created_at` | | ☐ | |
| E2.3 | Hash→file mapping + unmapped flags | | ☐ | |
| E2.4 | Ledger rows for `0019`–`0022` (id, created_at) | | ☐ | |
| E2.5 | Ledger append-only confirmation | | ☐ | |
| E3.1 | 0019 `key_version` default/null/type (T3) | | ☐ | |
| **E3.2** | **0020 URGENT: `users` password-lifecycle columns (T4)** | | ☐ | |
| E3.3 | 0021 tables + indexes + FK actions | | ☐ | |
| E3.4 | 0022 11 PROTECTED tables (nullability/FK/CHECK/snapshots) | | ☐ | |
| E3.5 | Full application table inventory | | ☐ | |
| E3.6 | Live-but-unledgered object list | | ☐ | |
| E4.1 | 0020 column confirmation (repeat of E3.2) | | ☐ | |
| E4.2 | Deployed build/release ID | | ☐ | |
| E4.3 | Build reads `must_change_password`? incident flag? | | ☐ | |
| E4.4 | `must_change_password` value distribution | | ☐ | |
| E5.1 | Most recent verified backup (label/time/location/manifest) | | ☐ | |
| E5.2 | Backup verification output | | ☐ | |
| E5.3 | Restore test into disposable DB | | ☐ | |
| E5.4 | PITR posture (`wal_level`, `archive_mode`, tool, RPO/RTO) | | ☐ | |
| E5.5 | Private-file storage restore verification | | ☐ | |
| E5.6 | Explicit: restore-tested backup exists? | | ☐ | |
| E6.1 | DBA-held checksums for `0015`–`0022` | | ☐ | |
| E6.2 | Deployment records / release manifests / CI build IDs | | ☐ | |
| E6.3 | Change/ticket IDs for out-of-band / ledger-less DDL | | ☐ | |
| E6.4 | Deployment-controller review | | ☐ | |

**DBA confirmation:** every artifact above is read-only, redacted, stored in the
approved restricted-access evidence location, and checksum- and
timestamp-labelled. Artifacts are **not** pasted into chat and are **not**
committed to Git.

**Return routing:** return the checklist, the `EVD-…` references, and the raw
artifacts (via the approved restricted-access location only) to the Application
Lead for entry into
`docs/employee-permanent-delete-dba-evidence-intake.md`. Then the DBA +
Application Lead resolve decision gates **G1–G5** (§5 there). Until then, every
gate remains `BLOCKED`.

---

## 9. Explicit non-actions in producing this handoff

- No database was contacted; no query was executed.
- No migration, journal, snapshot, ledger, schema, RBAC seed, deployment, or
  employee deletion was run; `.env.production` was not read.
- No secret or connection string was accessed or guessed.
- All existing working-tree changes were preserved; no application code,
  migration history, journal, or snapshot was edited.
- No evidence was marked verified; every item above remains outstanding until a
  raw read-only artifact is attached and independently reviewed.

**Conclusion:** this handoff gives the DBA exactly what to collect, in what
format, per environment, where to store it, how to redact it, and when to STOP.
Repository-only evidence cannot establish live database state. Until the evidence
is returned and classified, no reconciliation ordering, no staging rehearsal, and
no production apply may be scheduled.
