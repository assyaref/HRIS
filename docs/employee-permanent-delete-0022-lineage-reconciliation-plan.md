# Migration 0019–0022 — Lineage Reconciliation Plan (PROPOSED)

**Status:** PROPOSED. Nothing executed. This document **proposes** a
reconciliation; it does not edit the journal, snapshots, migration history, or
any database. It is an input to a separate, approved DBA change record.

> **Guiding rule:** a missing journal entry does **not** prove a migration was
> never applied, and a journal entry does **not** prove a migration was applied.
> Only the environment's actual Drizzle ledger plus its live catalog can
> establish what was applied. Every conclusion below is marked either
> **REPOSITORY FACT** (provable from files) or **MUST CONFIRM** (requires the
> live database).

Related: `docs/employee-deletion-0021-staging-runbook.md` §2 (R0–R5),
`docs/migration-reconciliation-runbook.md` §E/F/H,
`docs/employee-permanent-delete-0022-staging-runbook.md` §1.2.

---

## 0. Concise DBA evidence request

The read-only evidence that must come from the DBA before any reconciliation
ordering is chosen is specified in
`docs/employee-permanent-delete-dba-evidence-request.md`. In brief, **for each
environment (production and staging, plus any other discovered)**:

1. Drizzle ledger rows — `select id, hash, created_at from
   drizzle.__drizzle_migrations order by id` — plus count and max `created_at`.
2. Read-only schema/catalog checks for the objects introduced or changed by
   `0019`–`0022`.
3. Confirmation whether `0020`'s `users.must_change_password` /
   `password_changed_at` / `last_login_at` columns exist, and which deployed
   application build reads them.
4. Environment identity and staging-isolation evidence (redacted).
5. Backup/PITR readiness and a restore-tested backup.
6. Available migration checksums, deployment records, and DBA change tickets.

That document also states the read-only SQL templates, why a missing journal
entry does **not** prove a migration was never applied, the STOP conditions, and
the separate staging vs production approval paths. This section is a pointer
only; it changes no finding in §1–§11 below.

---

## 1. Known from repository files (REPOSITORY FACT)

### 1.1 Journal

- `db/migrations/meta/_journal.json` has **20 entries**, `idx` 0–19.
- The last entry is `idx 19` = `0018_employee_custom_tabs` (`when` =
  `1790661254287`).
- Journal entries present for `0011_payslip_document_versions`, `0012`,
  `0013`, `0014`, `0011_nasty_khan`, `0015`, `0016`, `0017`, `0018`.
- A pre-release backup of the journal exists:
  `_journal.json.pre-release-a-0018.20260930T053047Z.bak` (ends at `idx 18` =
  `0017_employee_delete_safety_reconciliation`).

### 1.2 Snapshots

- Snapshot metadata **stops at `0014_snapshot.json`**; there is **no snapshot**
  for journal `idx` 15–19 (`0011_nasty_khan`, `0015`, `0016`, `0017`, `0018`).
- Chain defects (verified by reading `id`/`prevId`):
  - `0011_snapshot.json` `id=710d22b1…`, `prevId=d70a7b76…` — but
    `d70a7b76…` is the **`id` of `0014_snapshot.json`** (mis-attributed;
    `0011` points forward to `0014`).
  - `0012_snapshot.json` `prevId=4221b242…` — **not present anywhere** in the
    snapshot set (dangling predecessor).
  - `0013_snapshot.json` `prevId=ee8fa05b…` = `0012`'s `id`; `0014`
    `prevId=b2995da7…` = `0013`'s `id` — both depend on the broken `0012`.
- Duplicate numeric prefix: `0011_nasty_khan` and
  `0011_payslip_document_versions`.

### 1.3 Unjournaled SQL files

The following SQL files exist in `db/migrations/` but have **no journal entry**:

| Prefix | File | Declared transactional | Static guard style |
| --- | --- | --- | --- |
| 0019 | `0019_face_template_key_version.sql` | no explicit BEGIN (single `ALTER`) | `DROP DEFAULT` (idempotent) |
| 0020 | `0020_user_password_lifecycle.sql` | no explicit BEGIN (3× `ADD COLUMN IF NOT EXISTS`) | idempotent |
| 0021 | `0021_employee_deletion_controls.sql` | `BEGIN … COMMIT` | `CREATE TABLE/INDEX IF NOT EXISTS` |
| 0022 | `0022_employee_retention_detach.sql` | `BEGIN … COMMIT` | `IF EXISTS`/`IF NOT EXISTS`/`IS NULL` + catalog-guarded CHECKs |

All four declare in their headers that they are **deliberately unjournaled**
pending the approved reconciliation change.

### 1.4 Current checksums (computed in this audit, 2026-10-15)

Drizzle's `readMigrationFiles` computes a migration's ledger `hash` as
`sha256(<raw .sql file bytes>)` (confirmed in
`node_modules/drizzle-orm/migrator.cjs:49-57`), i.e. the same value as
`sha256sum` of the file. The SHA-256 below is therefore also the hash a cleanly
journaled-then-applied entry would record in `drizzle.__drizzle_migrations`.

| Migration | File | SHA-256 | Lines |
| --- | --- | --- | ---: |
| 0019 | `0019_face_template_key_version.sql` | `21752cce27b490807854a5c27387d8525738d1a9fe718b9dada1e89b63042d27` | 61 |
| 0020 | `0020_user_password_lifecycle.sql` | `baf1887559aa0d8cb7905a17d5a71c8a8b506431624d9445747ca88d0f3a4eaa` | 52 |
| 0021 | `0021_employee_deletion_controls.sql` | `585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452` | 141 |
| 0022 | `0022_employee_retention_detach.sql` | `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` | 570 |

**0022 comparison:** the freshly computed checksum is
`724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c`, which is
**byte-for-byte identical** to the previously reviewed value. **No discrepancy
exists**; the artifact under review is unchanged and the review anchor in
`docs/employee-permanent-delete-0022-staging-change-review.md` remains valid.

### 1.5 Drizzle tooling constraints (grounded in the installed packages)

Verified by reading the installed `drizzle-orm` / `drizzle-kit` sources in
`node_modules` (not from memory):

- `migrate` is **journal-driven, not snapshot-driven**. `readMigrationFiles`
  reads only `meta/_journal.json` entries and, per entry, the matching
  `<tag>.sql` file (`node_modules/drizzle-orm/migrator.cjs:36-62`). It never
  reads `meta/*_snapshot.json`.
- The ledger is
  `drizzle.__drizzle_migrations(id serial, hash text, created_at bigint)`
  (`node_modules/drizzle-orm/pg-core/dialect.js:44-55`).
- Apply rule: for each journal entry, apply it and insert a ledger row **only
  if** `last_ledger.created_at < journal.when` (`dialect.js:56-71`). Entries
  whose `when` is **≤** the max ledger `created_at` are **silently skipped**.
  This is the mechanism by which `0011_nasty_khan`/`0015`/`0016`
  (`when = 1790152070913`) can have live DDL with no ledger row.
- `hash = sha256(raw SQL file)` (`migrator.cjs:56`), identical to `sha256sum`.
- **Consequence for 0019–0022:** they are absent from `_journal.json`, so
  `drizzle-kit migrate` **cannot** apply them today. Adding them with their
  existing `when` values would be unsafe under the skip rule; a safe entry needs
  a `when` strictly greater than the max live ledger `created_at`.
- **`generate`/`push` is broken** and snapshot-driven: snapshots stop at `0014`
  and the last journal entry (`0018`) has no snapshot, so `generate` would emit
  every schema change since `0014`. Do not run it.

### 1.6 Baseline lineage facts recorded by prior runbooks

From `docs/migration-reconciliation-runbook.md` §E.1 and
`docs/employee-deletion-0021-staging-runbook.md` §1.2:

- The reference commit `b05442f6…` tracked no SQL for `0011_nasty_khan`,
  `0011_payslip_document_versions`, `0012`, `0013`, `0014`, `0015`, `0016`;
  its journal did not contain the payslip/announcement entries.
- `0015`/`0016` journal entries share `when = 1790152070913`, which is **≤** the
  recorded production ledger max (`1790661254287`); the migrator skips entries
  whose `when` ≤ ledger max — the documented mechanism by which DDL can be live
  without a ledger row.
- `drizzle-kit migrate` is mechanically possible but currently a no-op;
  `drizzle-kit generate` is **broken** (missing snapshot for the last journal
  entry) and must not be run.

---

## 2. Migration evidence matrix

Status vocabulary: **Repo-confirmed** = provable from files in this worktree;
**DBA-confirm** = requires read-only live evidence; **recorded lead** = prior
runbook observation, not re-verified here.

### 2.1 Primary scope — migrations 0019–0022

| # | Filename | SHA-256 | Journal (repo) | Snapshot (repo) | Environment application status |
| --- | --- | --- | --- | --- | --- |
| 0019 | `0019_face_template_key_version.sql` | `21752cce…2d27` | **ABSENT** | **none** (no `0019_snapshot.json`) | Production: recorded lead **NOT APPLIED** (2026-10-01) → **DBA-confirm**. Staging: unknown → **DBA-confirm**. |
| 0020 | `0020_user_password_lifecycle.sql` | `baf18875…4eaa` | **ABSENT** | **none** | Production: **UNVERIFIED** since 2026-10-10 (`7488053`); app may already read `users.must_change_password` → **DBA-confirm, urgent**. Staging: unknown → **DBA-confirm**. |
| 0021 | `0021_employee_deletion_controls.sql` | `585dd2d7…c452` | **ABSENT** | **none** | Production: recorded lead not applied → **DBA-confirm**. Staging: unknown → **DBA-confirm**. |
| 0022 | `0022_employee_retention_detach.sql` | `724db82d…65c` | **ABSENT** | **none** | Production: recorded lead not applied → **DBA-confirm**. Staging: recorded lead not applied → **DBA-confirm**. |

### 2.2 Lineage context — earlier journal entries, idx 12–19 (not re-hashed by this audit)

| # | Filename | Journal (repo) | Snapshot (repo) | Application-status concern |
| --- | --- | --- | --- | --- |
| 0011 | `0011_nasty_khan.sql` | `idx 15`, `when=1790152070913` (**≤ ledger max**) | `0011_snapshot.json` mis-attributed (`prevId` = 0014's `id`) | DDL may be live with **no ledger row** (skip rule) → **DBA-confirm**. |
| 0015 | `0015_user_account_name.sql` | `idx 16`, `when=1790152070913` (**≤ ledger max**) | **none** | DDL may be live with **no ledger row** → **DBA-confirm**. |
| 0016 | `0016_employee_master_data.sql` | `idx 17`, `when=1790152070913` (**≤ ledger max**) | **none** | DDL may be live with **no ledger row** → **DBA-confirm**. |
| 0017 | `0017_employee_delete_safety_reconciliation.sql` | `idx 18` | **none** | **DBA-confirm**. |
| 0018 | `0018_employee_custom_tabs.sql` | `idx 19`, `when=1790661254287` | **none** | Production recorded **Applied**; ledger 18 rows hash-verified; max `created_at=1790661254287` → **DBA-confirm**. |
| 0012 | `0012_jittery_grim_reaper.sql` | `idx 12` | `0012_snapshot.json` `prevId` dangling | **DBA-confirm**. |
| 0013 | `0013_payslip_employee_number_snapshot.sql` | `idx 13` | `prevId` = 0012's `id` (broken chain) | **DBA-confirm**. |
| 0014 | `0014_payslip_birth_date_snapshot.sql` | `idx 14` | `prevId` = 0013's `id`; is 0011's mis-attributed target | **DBA-confirm**. |

### 2.3 Recorded environment leads (not proof)

These are prior observations carried forward as **leads**, not final proof, and
must be re-classified in §3:

| Artifact | Production (recorded) | Staging | Source |
| --- | --- | --- | --- |
| 0018 | Applied; ledger 18 rows, hash-verified; max `created_at = 1790661254287` | unknown | 0021 runbook §1.2 |
| 0019 | NOT APPLIED (Phase-11 observation 2026-10-01) | unknown | 0021 runbook §1.2 |
| 0020 | UNVERIFIED since commit 2026-10-10 (7488053) | unknown | 0021 runbook §1.2 / R1 |
| 0021 | Not applied | unknown | 0021 runbook §1.1 |
| 0022 | Not applied | not applied | 0022 runbook §1.1 |

> **Do not assume** "absent from the journal" or "unverified" means "not
> applied". The `0015`/`0016` precedent proves DDL can be live with no ledger
> row. Classification must be evidence-based (§3).

---

## 3. What must be confirmed against the actual database (MUST CONFIRM)

For **each environment** (production, staging, any other), capture through the
approved DBA read-only channel, and classify every object as
`expected-approved`, `production-only`, `repository-only`, or `unexplained`
(`unexplained` = STOP, master runbook §H):

1. **Ledger:** `select id, hash, created_at from drizzle.__drizzle_migrations
   order by id`. Record count, hashes, and max `created_at`. Map each hash to a
   reviewed SQL file using the established `sha256(raw .sql)` rule (§1.5), and
   have the DBA corroborate the mapping against their own records.
2. **0019 object state:** does `face_enrollment_templates.key_version` still
   carry a DEFAULT? (DEFAULT present ⇒ 0019 DDL likely not applied.)
3. **0020 object state:** do `users.must_change_password`,
   `users.password_changed_at`, `users.last_login_at` exist? If absent while a
   build that reads `must_change_password` is deployed, that is an active
   incident (0021 runbook R1 urgency note).
4. **0021 object state:** do `employee_legal_holds`,
   `employee_deletion_requests`, `employee_deletion_approvals` exist, with the
   declared FK actions and the partial unique index?
5. **0022 object state:** do the 11 protected tables carry nullable
   `employee_id`, `ON DELETE SET NULL` employee FKs, and
   `<table>_retained_identity_check`? Do the snapshot columns exist?
6. **Ledger-less live DDL:** for every object that exists but has no mapped
   ledger row, record it as live-but-unledgered (the `0015`/`0016` pattern) —
   never "fix" it by editing the ledger.
7. **Controller/automation:** confirm the deployment controller, systemd units,
   timers, CI settings, and any external job cannot apply migrations outside an
   approved change record (master runbook §G.2).

Until 1–6 are captured, **no reconciliation ordering may be chosen**.

---

## 4. Per-artifact disposition proposal

This is an **analytical** ordering, not an execution instruction. Numbering will
be normalized only in a separately approved artifact; the current files must not
be renamed or renumbered from this worktree.

| Migration | Current repository state | Proposed disposition |
| --- | --- | --- |
| 0019 | Unjournaled; production recorded NOT APPLIED | Confirm catalog (key_version DEFAULT). Then journal + apply through the repaired channel. |
| 0020 | Unjournaled; production UNVERIFIED; app may already read the columns | **Urgent** catalog confirmation. Classify, then journal + apply. If app is deployed and columns are missing ⇒ incident, not a routine migration. |
| 0021 | Unjournaled; not applied anywhere | Reconcile lineage first; apply to staging (additive), production only after policy §4 sign-off. |
| 0022 | Unjournaled; not applied anywhere; static review complete | Reconcile lineage first; staging rehearsal only after approval; production last. |

The candidate clean-database dependency order (master runbook §E.3) remains the
current analytical chain; it is **not** an execution plan and does not resolve
the duplicate `0011` prefix or the broken `0012`–`0014` chain.

---

## 5. How correct order and metadata can be restored safely

Follow master runbook §E and 0021 runbook §2 (R0–R5). Proposed sequence:

- **R0 — Freeze & change control.** Open a change record (ID, window, rollback
  owner, incident commander). Freeze all migration/schema/seed changes. Build the
  reconciliation artifact from one immutable commit; record SHA-256 for every SQL
  file, `_journal.json`, and snapshot.
- **R1 — Evidence capture (read-only).** Execute §3 for every environment.
  Classify each object; any `unexplained` item is a STOP.
- **R2 — Choose the repair strategy (recorded decision).**
  - **Option A (recommended): authoritative-baseline reconstruction.** Produce a
    new coherent journal + snapshot set in a separately reviewed artifact from the
    verified catalog, mark it pre-applied where appropriate, then append
    `0019`/`0020`/`0021`/`0022` (or post-squash equivalents) as fully journaled,
    fully snapshotted entries. Ledger stays append-only; `generate` works again.
  - **Option B: append-only journal repair.** Keep the historical chain; append
    fresh-`when` journal entries for `0019`–`0022` (all idempotent) so `migrate`
    records ledger rows; snapshots remain unrepaired, so `generate` stays broken.
  - Either way: never rewrite, renumber, or backfill ledger rows; never assign a
    `when` ≤ ledger max for DDL that is not yet live; never journal a live-DDL
    migration with a fresh `when` unless idempotency is verified.
- **R3 — Rehearse (staging only).** Restore the production backup into isolated
  staging; rebuild a clean database from the candidate chain; run the
  zero-difference schema comparison (production capture vs clean reconstruction
  vs repository schema at the reviewed commit); run data-invariant and
  deletion-control checks. Stop on first error.
- **R4 — Approve & execute (production, separate window).** All §F gates sign.
  The DBA applies journaled entries in the approved window; verify ledger count,
  hashes, and read-only schema/ledger post-deploy. Never by editing the ledger.
- **R5 — Journal 0021/0022.** Only after R3/R4 and the policy §4 sign-off, journal
  and apply through the same repaired channel, staging-first for `0022`.

**Safety rails for the repair itself**

- No file rename/renumber from a dirty worktree.
- No `drizzle-kit generate`/`push` from this worktree.
- No `session_replication_role`, no trigger disabling, no automatic schema sync.
- The repaired artifact is reviewed by DBA + Application Lead and pinned by
  SHA-256 before any apply.

---

## 6. Confidence levels

| Finding | Confidence | Basis |
| --- | --- | --- |
| SHA-256 of `0019`–`0022` | **High** | Direct `sha256sum` in this worktree. |
| `0022` matches the reviewed anchor; no discrepancy | **High** | Recomputed value equals the recorded value byte-for-byte. |
| Journal/snapshot repository facts (§1.1–1.3) | **High** | Direct file reads; `id`/`prevId` inspected. |
| Drizzle apply/hash/skip mechanics (§1.5) | **High** | Read from the installed package sources. |
| Minimum safe journal `when` (> max live ledger `created_at`) | **Medium** | Logic confirmed; the actual max value must come from the live ledger. |
| Any environment's applied state (§2.1–2.3) | **Low / UNVERIFIED** | No live read-only access was available; all environment rows are recorded leads. |
| Reconciliation strategy selection (Option A vs B) | **Medium** | Sound in principle; choice depends on captured live evidence. |

**Overall:** repository-side findings are high-confidence and complete for
`0019`–`0022`; **no environment-application claim is currently proven.**

---

## 7. Unresolved questions (need DBA / read-only evidence)

1. **Production ledger contents.** Exact `id, hash, created_at` rows, count, and
   max `created_at`; and confirmation that the ledger `hash` equals
   `sha256(raw .sql)` (§1.5) so file checksums can be mapped to ledger rows.
2. **`0020` production state (urgent).** Do `users.must_change_password`,
   `password_changed_at`, `last_login_at` exist, and which application build is
   actually deployed? A deployed build reading a missing column is an incident.
3. **`0019` production state.** Does `face_enrollment_templates.key_version`
   still carry a DEFAULT (DEFAULT present ⇒ DDL not applied)?
4. **`0021`/`0022` presence anywhere.** Do the control-plane and retained-identity
   objects exist in any environment, with the declared FK actions?
5. **Ledger-less live DDL (`0015`/`0016`, `0011_nasty_khan`).** Do their objects
   exist in production while their ledger hashes are absent?
6. **Out-of-band application records.** Which channel (psql/manual, which
   operator, which change ID) applied any out-of-band DDL, and can it be
   evidenced rather than inferred?
7. **Environment inventory.** Are there environments beyond production and
   staging (DR replicas, preview, CI databases) that could hold divergent state?
8. **Staging reachability/isolation.** Is an isolated staging database actually
   available for the disposable-copy rehearsal?
9. **Snapshot provenance.** Why `0011_snapshot.json` points to `0014`'s `id` and
   why `0012`'s `prevId` is missing — needed before any snapshot regeneration.
10. **Automation.** Do any controller, systemd unit, timer, CI setting, or
    external job invoke `db:migrate` outside an approved change record?

---

## 8. Proposed review sequence

Evidence-first, read-only until a separately approved apply:

1. **R0 — Freeze & change control.** Open the change record; freeze
   migration/schema/seed changes; pin the immutable commit and record SHA-256 of
   every SQL file, `_journal.json`, and snapshot.
2. **R1 — Read-only evidence capture (DBA).** Answer §7 for each environment:
   ledger dump + live catalog checks (`0019`/`0020`/`0021`/`0022` objects,
   ledger-less live DDL, controller/automation). Classify every object
   `expected-approved` / `production-only` / `repository-only` / `unexplained`;
   `unexplained` = STOP.
3. **Re-verify checksums against the captured ledger hashes.** Confirm the §1.4
   values and the `0022` anchor. Any mismatch is a STOP.
4. **R2 — Record the repair strategy** (Option A or B, §5) in the change record,
   explicitly documenting how "missing journal entry" is handled without
   fabricating historical application events.
5. **R3 — Disposable-copy rehearsal** (§9, below). No staging.
6. **Staging isolation + backup/restore** verified; then apply on isolated
   staging under the 0022 approval checklist (`A1`–`A14`).
7. **Production window** under all `B1`–`B13` gates (separate approval).

---

## 9. Disposable-copy validation (for the proposed reconciliation)

The repair must be proven on a throwaway database before staging is touched.
Validation requirements:

1. **Isolation.** A newly created, empty disposable PostgreSQL database with its
   own credentials; no production or staging endpoint reachable from the shell.
2. **Candidate artifact only.** Use the separately reviewed, checksum-pinned
   reconciliation artifact — never the dirty worktree's journal.
3. **Apply the candidate chain** with the real `drizzle-kit migrate` (or the
   approved DBA channel) and `ON_ERROR_STOP`; stop on first error; capture every
   applied tag, `when`, and the resulting ledger rows.
4. **Ledger behavior assertions.**
   - every intended entry is applied exactly once and records
     `hash = sha256(file)`;
   - no entry is silently skipped (verify each new `when` is strictly greater
     than the max prior ledger `created_at`);
   - a second `migrate` run is a no-op (proves the idempotent contract);
   - the ledger is **append-only** — no UPDATE/DELETE of existing rows.
5. **"No fabricated history" check.** Confirm the repair records only *new*
   application attempts that actually (idempotently) ran, or a documented
   pre-applied baseline — never an inserted ledger row asserted to represent a
   past application that cannot be evidenced. Capture the exact mechanism in the
   change record.
6. **Schema equivalence.** Zero-difference comparison between the disposable
   reconstruction and the captured live catalog (and the repository schema at
   the reviewed commit); any difference is classified and STOPped.
7. **Snapshot/generate check.** Confirm whether the chosen strategy restores a
   coherent snapshot chain; if not, record that `generate`/`push` remains a
   standing hazard and stays forbidden.
8. **Evidence pack.** Checksums, ledger dumps before/after, migrate output,
   re-run no-op output, and schema-diff results attached to the change record.

---

## 10. How the reconciliation handles the two defects without fabricating history

- **Missing journal entries (`0019`–`0022`).** Do **not** conclude they were
  never applied and do **not** write a ledger row claiming a past application.
  Instead: capture the live catalog first. Then, in the repaired artifact, add
  journal entries with a `when` **strictly greater** than the live max ledger
  `created_at`. Because `0019`–`0022` are idempotent, `migrate` will run them
  (a no-op where already live) and record a ledger row for a *current* attempt —
  a truthful record, not a back-dated one.
- **Broken snapshot references (`0011`/`0012`–`0014`, missing idx 15–19).**
  Snapshots are **not** needed by `migrate` (§1.5), so reconciliation for apply
  does not require repairing them. `generate` remains broken until snapshots are
  regenerated in the separately approved artifact. Never hand-edit a snapshot's
  `id`/`prevId`; regenerate the chain from a consistent baseline instead.

---

## 11. Explicit non-actions in this task

- Journal, snapshots, migration history, and every database were left
  **unmodified**.
- No apply of `0022` or `0019`–`0021`; no RBAC seed; no deployment; no employee
  record deleted or altered; retention executor left disabled;
  `RETENTION_ELIGIBLE_CATEGORIES` left empty.
- No runtime validation claimed.

**Conclusion:** the lineage is reconcilable, but only through a separate,
approved DBA change. Repository-side evidence is complete and high-confidence
(§1, §6); live environment state is **unproven** and enumerated in §7. Until
that read-only evidence is captured, classified (§3), and a repair strategy is
chosen (§5) and rehearsed on a disposable copy (§9), `0019`–`0022` remain
unjournaled and `0022` remains unapplied.

**No checkmark in this document represents an executed action.** No database,
journal, snapshot, migration history, RBAC seed, deployment, or employee record
was touched in producing this audit.
