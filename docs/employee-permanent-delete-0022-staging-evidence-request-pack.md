# Migration 0022 — Staging Evidence Request Pack (for DBA collection)

**Document type:** READ-ONLY EVIDENCE REQUEST, **staging scope only**. This is
**not** an approval, a change record, or an execution instruction. It authorizes
nothing and must not be read as one.

**Status:** OPEN — no evidence received. Every artifact row below is `PENDING`
and every gate it feeds stays `BLOCKED` (`docs/employee-permanent-delete-dba-evidence-intake.md`
§0 rule 2, §5; handoff §6). No row may be moved to `CONFIRMED` without an
attached, labelled, environment-bound raw artifact.

**Date prepared:** 2026-10-16
**Repository:** `/opt/hris` (git `main`, working tree; no commit made)
**Prepared from:** `docs/employee-permanent-delete-0022-staging-readiness-audit.md`
(OPEN, all gates `BLOCKED`) plus its six review inputs and supporting documents.

> **Hard boundary observed in producing this pack.** No database was contacted
> and **no query was executed** (read-only or otherwise). No migration, seed,
> deployment, journal, snapshot, ledger, or employee record was run, read, or
> changed. No secret, `.env.production`, or connection string was read or
> guessed. No gate was set to `PASS`; no artifact was marked verified. Every SQL
> statement in §7 is a **proposal for DBA review only** and has not been run.

---

## 0. Purpose, scope, and how this pack maps to the existing documents

The readiness audit (§5) requires live staging evidence before any rehearsal can
be authorized. This pack converts that requirement into a **staging-only,
per-artifact request the DBA can execute and return**, with an explicit artifact
ID, source, owner, verification method, status, stop condition, and redaction
flag for each item.

**In scope:** staging environment only, read-only collection, artifacts that
close staging gates `G1-S`–`G5-S` and Part A prerequisites `A1`–`A14`.

**Out of scope (unchanged by this pack):** any production evidence row (intake
§2, `G1-P`–`G4-P`, Part B `B1`–`B13`), any apply/rehearsal, any journaling, any
`generate`/`push`, any seed or deployment, any employee-data deletion.

| This pack section | Feeds (intake §3 / §5) | Feeds (approval checklist) | Feeds (runbook) |
| --- | --- | --- | --- |
| §2.A Environment identity + isolation | E1.1–E1.3, E6.4, **G5** | A4, A12 | §5.0, §5.2 |
| §2.B Migration ledger (rows, `created_at`, hash) | E2.1–E2.5, **G2**, **G3** | A7 | §5.4 |
| §2.C Catalog: constraints / FK / CHECK 0019–0022 | E3.1–E3.6, **G1**, **G2** | A6 (input), A14 | §5.5 |
| §2.D Actual status of migration `0020` | E3.2, E4.1–E4.4, **G1** | — (urgent §2 handoff) | §1.2 |
| §2.E Lineage + `max(created_at)` analysis for staging | E2.1–E2.5, E6.1, **G3**, **G2** | A7 | §1.2 |
| §2.F Backup + restore test into disposable DB | E5.1–E5.6, **G4** | A5 | §5.3 |
| §2.G Application build compatibility | E4.2, E6.2, **G1**, **G2** | A8, A14 | §3, §5.1 |
| §2.H Cross-cutting attestations | — | A11, A13 | §5.10, §7 |

**Repository-side facts already re-verified for this pack (read-only,
2026-10-16) — these are inputs to compare against, never live proof (handoff §6):**

| Fact | Value | Note |
| --- | --- | --- |
| `0019` SHA-256 | `21752cce27b490807854a5c27387d8525738d1a9fe718b9dada1e89b63042d27` | matches anchor |
| `0020` SHA-256 | `baf1887559aa0d8cb7905a17d5a71c8a8b506431624d9445747ca88d0f3a4eaa` | matches anchor |
| `0021` SHA-256 | `0e234c6ee9d2551686b28e93949f0d1c2573df8240bf0ded7a3eb92b52407764` | matches anchor |
| `0022` SHA-256 | `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` | matches anchor (review anchor) |
| `_journal.json` | 20 entries, last `idx 19 = 0018_employee_custom_tabs`; no `0019`–`0022` tags | repo fact only |
| Snapshots | 15 files, stop at `0014_snapshot.json` | repo fact only |
| Control plane | `DELETION_EXECUTION_ENABLED = false`, `RETENTION_ELIGIBLE_CATEGORIES = []` | repo fact only |

Revision 2026-10-21: `0021` was rewritten before first application. Its current SHA-256 is `585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452` (the earlier `0e234c6e…7764` is superseded); the DBA must re-review the revised artifact.

> **Rule restated for the DBA (evidence request §3):** a missing journal entry
> does **not** prove a migration was never applied, and a journal entry does
> **not** prove it was applied. Only the staging database's own
> `drizzle.__drizzle_migrations` rows **plus** its live catalog establish what is
> applied in staging. Repository checksums are comparison anchors, **not**
> evidence of any environment's applied state.

---

## 1. Rules of engagement for the DBA response

1. **Read-only only.** Every artifact must come from a `SELECT` / `SHOW` /
   `current_setting` query (§7 templates and evidence-request §8 `T1`–`T10`) or
   from a read-only external record (backup manifest, release record, ticket,
   controller configuration review). **No** `INSERT`/`UPDATE`/`DELETE`/DDL/
   `VACUUM`/`ANALYZE`, no `drizzle-kit migrate`/`generate`/push, no ledger or
   journal edits, no `session_replication_role`, no trigger disabling.
2. **Staging only.** Every artifact is captured against the **staging** database
   and labelled `staging`. A production artifact is never substituted for a
   staging artifact, and vice versa (intake §0 rule 3).
3. **Approved read-only channel.** The application team supplies **no**
   connection string. Do not read or use `.env.production`.
4. **Labeling.** Every artifact states: environment, database name, capture
   timestamp (UTC) and server/report timezone, collector, reviewer, and
   change/ticket ID (handoff §5.2).
5. **Filename pattern (staging register only):**
   `EVD-<item>-<YYYYMMDDTHHMMSSZ>-<seq>.<ext>` where `<item>` is the artifact ID
   in this pack with dots replaced by dashes (e.g. `EVD-E3-4-20261016T090000Z-01.txt`).
   Use these exact values as the `Evidence ref` in the intake **staging**
   register (intake §3).
6. **Storage and checksum.** Raw artifacts go only to the approved
   restricted-access evidence location — not to this Git repository, not to
   chat, not to a broadly shared folder. Compute SHA-256 per file artifact and
   record it in the intake register (handoff §5.3).
7. **Redaction before submission.** Apply the redaction codes in §5. Evidence
   containing secrets, connection strings, or unnecessary PII is itself a STOP
   (evidence request §4.11) — redact and re-capture, do not submit.
8. **Result vocabulary:** `CONFIRMED` / `NOT CONFIRMED` / `UNAVAILABLE` /
   `PENDING` (intake §0 rule 5). Any `NOT CONFIRMED` or `UNAVAILABLE` on a
   required item is a STOP until the owning gate resolves it (intake §0 rule 6).
9. **Stop on ambiguity.** A missing answer, an unexplained object, or a
   checksum mismatch is a STOP (§4 of the evidence request), not a guess.
10. **This pack authorizes nothing.** Evidence capture may proceed;
    authorization still requires approval-checklist Part A `A1`–`A14` recorded in
    a change record, and a staging pass authorizes nothing beyond "0022
    rehearsed on staging" (intake §7.1).

---

## 2. Evidence request (staging)

Status of **every** row at the time of writing: `PENDING`. `Redaksi` refers to
the codes defined in §5.

*Where `Env` and `Captured (UTC)` appear per row.* The artifact tables below are
declared pack-wide as **staging** (§1 rule 2) and encode capture time in the
filename pattern (§1 rule 5), but the per-row `Env` and `Captured (UTC)` cells
that make each row independently verifiable are carried in the intake register
(`docs/employee-permanent-delete-0022-staging-evidence-intake-register.md` §3).
An artifact whose `Env` is not `staging`, or whose `Captured (UTC)` is empty, is
rejected at intake.

### 2.A — Environment identity and staging isolation evidence

Feeds `G5`, `A4`, `A12`, intake §3 `E1.1`–`E1.3` + `E6.4`, master runbook §C.1–C.4.

| ID (artefak) | Required artifact (filename) | Sumber | Penanggung jawab | Metode verifikasi | Stop condition | Redaksi | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | DB name, full server version, timezone, encoding, extensions — `EVD-E1-1-<ts>-01.txt` | §7 TS-S1 (extends `T1`) | DBA | Label complete; statement set confirmed read-only by DBA; values reported verbatim; environment field says `staging` | `UNAVAILABLE`/missing label → STOP §4.1; identity cannot be established → STOP (env ambiguity) | R1 | PENDING |
| A2 | Redacted endpoint identity + role class (staging/DR/preview/CI) — `EVD-E1-2-<ts>-01.txt` | `T1` + §7 TS-S1, redacted to host class / cluster role | DBA | Endpoint appears **only** as host class + role class; must differ from the production class; no raw address, hostname, or URL | isolation cannot be proven (§4.8); any raw connection string/IP submitted → evidence-hygiene STOP §4.11 | R2 | PENDING |
| A3 | Staging row of the full environment inventory (incl. DR/preview/CI) — `EVD-E1-3-<ts>-01.txt` | intake §4 worksheet, staging row | DBA | Every discovered environment named with role class; staging row completed and ledger/catalog capture checkbox decided | any environment not listed or listed with no ledger/catalog capture → STOP §4.1/§4.8 | R1 | PENDING |
| A4 | Isolation-matrix attestation, all 7 controls (separate cluster/DB, separate file root, unique staging secrets, dedicated roles with no production membership, denied production routes, integrations disabled or test sinks, `HRIS_ENV=staging` guard) — `EVD-ISO-C1-<ts>-01.md` | master runbook §C.1; intake §5 `G5` table | DBA + Application Lead | Each control row has an `Attested?` mark **and** a cited evidence ref (A1/A2/A5/A7 or platform config); no blank cell | any unattested control, or any shared cluster/role/secret/storage root/production route → STOP §4.8 | R2, R6 | PENDING |
| A5 | Staging role and grant export (dedicated owner/migration/app-rw/readonly/backup roles) — `EVD-ROLE-C3-<ts>-01.csv` | master runbook §C.3; §7 TS-S2 | DBA | No staging role is a member of a production role; the read-only role cannot write; grants attached | any role membership overlap with production, or superuser used for collection → STOP §4.8 | R3 | PENDING |
| A6 | Staging guard attestation for the rehearsal shell (`HRIS_ENV=staging`, explicit `STAGING_DATABASE_URL`, **no `DATABASE_URL` fallback**) — `EVD-GUARD-A12-<ts>-01.md` | runbook §5.0; `A12` | operator (captured), DBA + Application Lead (reviewed) | Guard snippet present and evaluated in the session that will be used; variable **values** redacted; fallback absence stated explicitly | guard absent, ambiguous, or `DATABASE_URL` could resolve to production → STOP (environment ambiguity, audit §4) | R4 | PENDING |
| A7 | Deployment-controller review: no controller, systemd unit, timer, CI setting, or external job can invoke `db:migrate` / schema change outside an approved change record — `EVD-E6-4-<ts>-01.md` | `E6.4`; master runbook §G.2 | DBA | Configuration review attached (job list + schedule + trigger source), conclusion stated | any unreviewed automatic migration path → STOP §4.10 | R1, R5 | PENDING |

*A6 scope note (FASE 2 finding R-1, register §11):* the application itself has
**no** `STAGING_DATABASE_URL` concept — `db/index.ts` resolves the single secret
`database_url` (systemd credential) or `DATABASE_URL` via
`lib/config/credentials.ts`. `A6` therefore attests the **rehearsal shell**
(psql/`pg_dump`) guard only; application isolation is evidenced separately by
`A2`/`A4`/`A5`.

*A7 scope note (FASE 2 finding R-2):* the repository has no automatic migration
path (only the `package.json` `db:migrate` script); `.github/workflows/deploy.yml`
delegates to the external, non-repo `/usr/local/sbin/hris-deploy`, which must be
included in the controller review.

### 2.B — Migration ledger (`id`, `hash`, `created_at`) for staging

Feeds `G2`, `G3`, intake §3 `E2.1`–`E2.5`, runbook §5.4.

| ID (artefak) | Required artifact (filename) | Sumber | Penanggung jawab | Metode verifikasi | Stop condition | Redaksi | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | Full ledger rows `id, hash, created_at` ordered by id — `EVD-E2-1-<ts>-01.csv` | `T2` #1 / §7 TS-S3 #1 | DBA | Raw rows attached; row count equals the count reported in B2; ledger table existence confirmed (absence recorded as restore/schema failure — **never** created) | absent ledger table → record as failure, do not create (master §D.2); rows malformed → STOP §4.3 | — | PENDING |
| B2 | Ledger summary: row count, `min(created_at)`, `max(created_at)` — `EVD-E2-2-<ts>-01.txt` | `T2` #2 / §7 TS-S3 #2 | DBA | `min ≤ max`; count equals B1 row count; value reported in epoch ms and its UTC rendering | missing → `G3` cannot compute a safe repair `when` → STOP (audit §4 lineage undetermined) | — | PENDING |
| B3 | Hash → reviewed-file mapping + unmapped-hash flags — `EVD-E2-3-<ts>-01.csv` | `E2.3`; anchors in §0 above; DBA's own records | DBA (corroborate) + Application Lead (map) | Each ledger `hash` compared with `sha256(raw .sql)` of the reviewed files; unmapped list produced even if empty | any hash that cannot be mapped to a reviewed SQL file → STOP §4.3 | — | PENDING |
| B4 | Ledger rows (if any) that map to `0019`–`0022`: `id`, `created_at` — `EVD-E2-4-<ts>-01.txt` | `E2.4` | DBA | Absence reported as "no ledger row", **not** as "not applied"; presence reported with `id` + `created_at` | hash present but ≠ anchor → STOP §4.3 | — | PENDING |
| B5 | Append-only observation + method (no row updated or deleted) — `EVD-E2-5-<ts>-01.md` | `E2.5` | DBA | Statement of the method used (single snapshot, audit trail, or tooling review) and its limits; ledger write path reviewed | any evidence of an updated/deleted ledger row → STOP §4.7 | — | PENDING |

### 2.C — Schema/catalog evidence: constraints, FK, and CHECK for 0019–0022

Feeds `G1`, `G2`, intake §3 `E3.1`–`E3.6`, runbook §5.5 (BEFORE contract).

| ID (artefak) | Required artifact (filename) | Sumber | Penanggung jawab | Metode verifikasi | Stop condition | Redaksi | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | `0019`: `face_enrollment_templates.key_version` — `column_default`, `is_nullable`, `data_type` — `EVD-E3-1-<ts>-01.txt` | `T3` / §7 TS-S4 | DBA | DEFAULT present ⇒ 0019 DDL likely **not** applied (classification input only) | cannot be classified → remains unexplained → STOP §4.2/§4.5 | — | PENDING |
| C2 | `0020`: `users.must_change_password`, `password_changed_at`, `last_login_at` — types/defaults/nullability — `EVD-E3-2-<ts>-01.txt` | `T4` / §7 TS-S4 | DBA | Contract: `boolean NOT NULL DEFAULT false`, `timestamptz NULL`, `timestamptz NULL` | see §2.D — a deployed build reading a missing column is an incident STOP §4.4 | — | PENDING |
| C3 | `0021`: 3 control-plane tables + 6 declared indexes + FK actions (`organization_id`/`employee_id` RESTRICT, `*_user_id` SET NULL) — `EVD-E3-3-<ts>-01.txt` | `T5` | DBA | All 3 tables and all 6 indexes enumerated; FK actions compared with the declared contract | missing/extra object not classifiable → STOP §4.2 | — | PENDING |
| C4 | `0022`: 11 PROTECTED tables — `employee_id` nullability, FK `confdeltype`, `<table>_retained_identity_check` — `EVD-E3-4-<ts>-01.txt` | `T6` / §7 TS-S6 | DBA | All 11 rows present; `confdeltype` must be `'n'` (SET NULL); CHECK present on each | any `confdeltype = 'c'` (CASCADE) or any missing retained-identity CHECK → STOP §4.6 | — | PENDING |
| C5 | Snapshot-column inventory on PROTECTED tables (`employee_number_snapshot`, `employee_name_snapshot`, `birth_date_snapshot`) — `EVD-E3-4-SNAP-<ts>-01.txt` | `T7` | DBA | Compared with the §1.3 contract (pre-state: payslips number+birth; payroll_items number+name) | `employee_number_snapshot IS NULL` on a detached row → anonymous-retention STOP (audit §4) | — | PENDING |
| C6 | Full employee-FK scan on PROTECTED tables (unexpected CASCADE detection) — `EVD-E3-4-FK-<ts>-01.txt` | `T9` / §7 TS-S7 | DBA | Every FK definition attached; no `ON DELETE CASCADE` anywhere in the set | any `c` → STOP §4.6 | — | PENDING |
| C7 | Full application table inventory (classification input) — `EVD-E3-5-<ts>-01.csv` | `T8` / §7 TS-S8 | DBA (capture) + Application Lead (classify) | Every object classified `expected-approved` / `production-only` / `repository-only` / `unexplained` | **any `unexplained` object → STOP §4.2** | — | PENDING |
| C8 | Live-but-unledgered object list (the `0015`/`0016` pattern) — `EVD-E3-6-<ts>-01.txt` | cross-check B1 vs C7 | Application Lead + DBA | Recorded as an **observation** with ticket reference; ledger is never edited to "fix" it | any attempt to edit the journal/ledger → STOP §4.7 | — | PENDING |
| C9 | Pre-apply BEFORE contract capture (protected FKs RESTRICT + NOT NULL, zero retained-identity CHECKs, snapshot inventory, deletable FKs RESTRICT) — `EVD-E3-4-PRE-<ts>-01.txt` | runbook §5.5 (queries 1–4) / §7 TS-S9 | DBA | 11 protected FKs `r` + `attnotnull = true`; `0` retained-identity CHECK rows; 11 deletable FKs `r`; snapshot inventory attached as the pre-state baseline | mismatch vs the first-application contract → STOP (0022 contract violation, audit §4) — unless this is an explicitly recorded re-apply/recovery run, in which case record observed state and compare to runbook §1.3 | — | PENDING |

### 2.D — Actual status of migration `0020` in staging (urgent)

Feeds `G1` staging, intake §3 `E4.1`–`E4.4`, handoff §2 (URGENT).

| ID (artefak) | Required artifact (filename) | Sumber | Penanggung jawab | Metode verifikasi | Stop condition | Redaksi | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Column confirmation for staging (same raw capture as C2, registered separately for the intake row) — `EVD-E4-1-<ts>-01.txt` | `T4` / §7 TS-S4 | DBA | Result is one of: columns exist with declared types/defaults, or columns absent | columns absent → see D3 for the incident test | — | PENDING |
| D2 | Deployed staging build ID / release record — `EVD-E4-2-<ts>-01.md` | release/CI record; `E4.2` | Application Lead | Build ID pinned to a commit SHA; record attached; build identified unambiguously for staging | **build cannot be identified → STOP §4.4 (incident, not routine)** | R5 | PENDING |
| D3 | Does the deployed staging build read `users.must_change_password`? — `EVD-E4-3-<ts>-01.md` | `E4.3`; repository read paths (`lib/auth/auth.ts` `requireUser`, employee-import path) + the pinned build from D2 | Application Lead | Read path confirmed against the **pinned** build, not against an arbitrary working tree | columns absent **while** such a build is deployed → **active incident → STOP §4.4** | — | PENDING |
| D4 | Read-only value distribution of `must_change_password` (counts by value only) — `EVD-E4-4-<ts>-01.txt` | `E4.4`; §7 TS-S5 | DBA | Aggregate counts only; consistency statement; no row-level values | any raw value, user identity, or PII in the artifact → evidence-hygiene STOP §4.11 | P1 | PENDING |
| D5 | `G1` staging disposition record: `routine` / `not-yet-deployed` / `incident` — `EVD-G1-DISP-<ts>-01.md` | intake §5 `G1` (staging row) | DBA + Application Lead (joint) | Disposition is exactly one of the three; decided by both roles; UTC timestamp + evidence refs D1–D4 recorded | `incident`, or an undecided/ambiguous disposition → STOP §4.4; gate stays `BLOCKED` until recorded | — | PENDING |

### 2.E — Lineage evidence and `max(created_at)` analysis for staging

Feeds `G3`, `G2`, `A7`, intake §3 `E6.1`, lineage plan §3/§7/§10.

| ID (artefak) | Required artifact (filename) | Sumber | Penanggung jawab | Metode verifikasi | Stop condition | Redaksi | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | Staging live `max(created_at)` + candidate safe repair `when` with the arithmetic shown — `EVD-LIN-1-<ts>-01.md` | B2 + §7 TS-S3 #3; lineage plan §1.5/§10 | DBA + Application Lead | Candidate `when` is **strictly greater** than the live staging max (`max + 1`); epoch-ms unit and UTC rendering both stated; calculation visible in the artifact | staging max unknown, or candidate `when ≤ max` → **STOP (lineage undetermined, audit §4)** | — | PENDING |
| E2 | Append-only + hash-anchor confirmation for staging: `0019`–`0022` hashes match the §0 anchors or have no ledger row — `EVD-LIN-2-<ts>-01.md` | B3 + B4 + §0 anchors | DBA | Per-migration table: ledger row present/absent, hash observed, anchor match yes/no | any observed hash ≠ anchor → STOP §4.3 | — | PENDING |
| E3 | Staging application-status classification of `0019`–`0022` (`applied` / `not applied` / `unexplained`) from **ledger plus catalog** — `EVD-LIN-3-<ts>-01.md` | inputs B1–B5 + C1–C7 | DBA + Application Lead | Each of the 4 rows cites **both** ledger evidence and catalog evidence; zero objects left `unexplained` | any `unexplained`, or any classification made from repository files alone → STOP §4.2/§4.5 | — | PENDING |
| E4 | Snapshot-chain disposition recorded for staging (duplicate `0011` prefix; dangling `0012` `prevId`; broken `0012`–`0014` chain; missing snapshots for idx 15–19) — `EVD-LIN-4-<ts>-01.md` | lineage plan §1.2 (REPOSITORY FACT) + intake §5 `G3` | Application Lead + DBA (accepted) | Disposition written into the approved reconciliation artifact and cited here; explicitly labelled **repository fact**, not live evidence | disposition unrecorded → STOP §4.3 / audit §4 | — | PENDING |
| E5 | DBA-held checksums for `0015`–`0022` (independent of the repository) — `EVD-E6-1-<ts>-01.txt` | `E6.1` | DBA | DBA's own records compared against the §0 anchors; differences reported rather than reconciled silently | any mismatch on `0019`–`0022` → STOP §4.3 | — | PENDING |
| E6 | Lineage assessment acceptance for **staging** (the `A7` record) — `EVD-A7-ACCEPT-<ts>-01.md` | lineage plan §3 evidence; `A7`; intake §7.1.2 | DBA + Application Lead | Acceptance cites E1–E5; states explicitly that production's ledger was **not** consulted | acceptance attempted before E1–E5 exist → row stays `PENDING` (no waiver) | — | PENDING |

### 2.F — Backup and restore-test evidence (isolated disposable database)

Feeds `G4`, `A5`, intake §3 `E5.1`–`E5.6`, master runbook §B, runbook §5.3.

| ID (artefak) | Required artifact (filename) | Sumber | Penanggung jawab | Metode verifikasi | Stop condition | Redaksi | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | Most recent verified staging backup: label, UTC capture time, storage location (redacted), retention, manifest + SHA-256 — `EVD-E5-1-<ts>-01.md` | `E5.1`; master §B.2; runbook §5.3 label `<ENVIRONMENT>-db-<YYYYMMDD>T<HHMMSS>Z-pre-0022` | DBA | Label pattern matches; SHA-256 recomputed after transfer and equal to the manifest; ledger identifier at backup time recorded (B1 ref) | manifest or checksum missing/mismatched → STOP §4.9 | R6 | PENDING |
| F2 | Backup verification output (checksum / platform verification log) — `EVD-E5-2-<ts>-01.log` | `E5.2`; master §B.3 | DBA | Platform marks the backup **complete, not queued**; WAL continuity checked where applicable; SHA-256 compared post-transfer | backup not complete or unverifiable → STOP §4.9 | R6 | PENDING |
| F3 | Restore test into an **isolated disposable** database: restore log, target identity, row-count/checksum reconciliation, duration — `EVD-E5-3-<ts>-01.log` | `E5.3`; master §B.4; runbook §5.3 | DBA | Restore exit status 0 with no owner/privilege/extension errors; target identity captured and proven **disposable + isolated** (not live staging, not production); row counts reconciled; disposable DB dropped or left read-only; `pg_isready` + identity query attached | restore error, target not disposable/isolated, count mismatch, or restore over live staging/production → STOP §4.9 | R6 | PENDING |
| F4 | PITR posture: `wal_level`, `archive_mode`, tool, retention, RPO/RTO — or an explicit "staging is restore-only" statement — `EVD-E5-4-<ts>-01.txt` | `T10` + §7 TS-S10 + external backup records | DBA | Values captured read-only; posture stated unambiguously (restore-only is acceptable for staging **if stated explicitly**) | posture absent **and** no restorable backup → STOP §4.9 | R7 | PENDING |
| F5 | Private-file storage backup + restore verification (manifest: relative path, size, SHA-256; counts of referenced/missing/orphan/path-escape files) — `EVD-E5-5-<ts>-01.md` | `E5.5`; master §B.6/§B.7 | DBA | Restored into `<STAGING_PRIVATE_ROOT>` only; staging service account cannot traverse the production root; payslip size + SHA-256 reconciled with `payslip_documents`/`payslip_document_versions`; employee-document external manifest produced; orphans **quarantined, never deleted** | private-file restore unverified → STOP §4.9 / audit §4 | P2 | PENDING |
| F6 | Explicit statement: does a restore-tested backup exist for staging? (yes + F1–F3 refs, or NO) — `EVD-E5-6-<ts>-01.md` | `E5.6` | DBA | Unambiguous yes with references, or explicit NO | **NO → STOP §4.9** (also blocks `A5`/`G4`) | — | PENDING |

### 2.G — Application build compatibility evidence

Feeds `A6`, `A8`, `A14`, intake §3 `E4.2`/`E6.2`, runbook §3/§5.1.

| ID (artefak) | Required artifact (filename) | Sumber | Penanggung jawab | Metode verifikasi | Stop condition | Redaksi | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | Staging deployment record / release manifest / CI build ID pinned to the reviewed commit — `EVD-E6-2-<ts>-01.md` | `E6.2` + `E4.2` | Application Lead | Build ID ↔ commit SHA ↔ artifact checksum table complete for staging | build not pinned → `A8` stays open; build cannot be identified → STOP §4.4 | R5 | PENDING |
| G2 | Fixed deployment order record: **migration first**, then the compatible build; no application deployment before §5.5 and §5.8 checks are recorded — `EVD-ORD-A8-<ts>-01.md` | runbook §3; `A8` | Application Lead | Order written as explicit steps in the change record; backward-compatibility rationale recorded | order not fixed or reversed → `A8` blocked; deployment before migration → STOP (deploy-order breach) | — | PENDING |
| G3 | Control-plane disabled evidence: `DELETION_EXECUTION_ENABLED = false`, `RETENTION_ELIGIBLE_CATEGORIES = []` with config + test output — `EVD-A14-<ts>-01.md` | `A14`; `features/employees/deletion-control-policy.ts` (false / `[]`); `tests/employees/employee-deletion-controls.test.ts` | Application Lead | Both values recorded from the pinned build **and** the test run output attached (repository value alone is not sufficient for the gate) | either flag becomes `true` / non-empty → **control-plane breach STOP** | — | PENDING |
| G4 | Repository-side preflight checksums + commit SHA for `0019`–`0022` and `_journal.json` — `EVD-A6-REPO-<ts>-01.txt` | runbook §5.1/§5.4; `A6` (repository part) | Application Lead (capture) → DBA (in-rehearsal re-verification, runbook §5.4) | Recomputed values equal the §0 anchors (already re-verified read-only 2026-10-16); the **gate** still requires the recorded, in-rehearsal DBA re-verification against `724db82d…65c` | mismatch at any point → STOP §4.3 | — | PENDING |
| G5 | Compatibility statement for the pinned build: which new snapshot columns the build reads/writes, and why the migration must precede it — `EVD-COMPAT-<ts>-01.md` | runbook §3; change review §2.5/§3 | Application Lead | Statement names the pinned build (G1) and the code paths that reference `employeeNameSnapshot`; pre-0022 fail-closed behaviour (`23503`) recorded | statement contradicts G2, or the build cannot be identified → STOP (deploy-order / §4.4) | — | PENDING |
| G6 | Cross-reference of A7 (deployment-controller review) as applied to the application deploy path — `EVD-E6-4-G-<ts>-01.md` | `E6.4`; master §G.2 (same capture as A7, cited here) | DBA | Cites artifact A7 rather than restating it; confirms no deploy job applies schema changes | unreviewed automatic migration path → STOP §4.10 | R1, R5 | PENDING |

### 2.H — Cross-cutting attestations required with this pack

| ID (artefak) | Required artifact (filename) | Sumber | Penanggung jawab | Metode verifikasi | Stop condition | Redaksi | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | Evidence-capture plan + STOP-condition acknowledgement (`A11`) — `EVD-A11-ACK-<ts>-01.md` | runbook §5.10 + §7; intake §5 | DBA + Application Lead | Both roles acknowledge the evidence list (§3) and the STOP list (§4 below) in the change record | acknowledgement absent → `A11` open, rehearsal not authorizable | — | PENDING |
| H2 | Synthetic-data attestation (`A13`): synthetic employees only, no production PII in staging evidence — `EVD-A13-ATTEST-<ts>-01.md` | runbook §0 rule 7 (`§0.7`); `A13` (source corrected 2026-10-16 — see coordination §2.2 / response-templates §1.3 F-04) | operator (attest), DBA + Application Lead (review) | Explicit statement that no production PII entered any staging artifact; any PII found triggers redaction + re-capture | production PII found in staging evidence → evidence-hygiene STOP §4.11 | P1, P2 | PENDING |
| H3 | Change record header (ID, window, rollback owner, incident commander) and rehearsal definitions (`A3`, `A9`, `A10`) — `EVD-CR-A3-<ts>-01.md` | master §A.1; runbook §5.7/§5.8; `A3`/`A9`/`A10` | DBA + Application Lead | Change record opened with all four fields; §5.7 Test A/B/C plan and §5.8 assertions referenced and accepted | change record absent → `A3` open; rehearsal may not start | — | PENDING |

---

## 3. Artifact matrix and status

| Group | Artifact IDs | Count | Status | Gates fed | Blockers closed (§4) |
| --- | --- | ---: | --- | --- | --- |
| A — Environment identity + isolation | A1–A7 | 7 | all `PENDING` | `G5`, `A4`, `A12` | B-01, B-08 |
| B — Migration ledger | B1–B5 | 5 | all `PENDING` | `G2`, `G3` | B-02 |
| C — Catalog 0019–0022 | C1–C9 | 9 | all `PENDING` | `G1`, `G2`, `A6` (input) | B-03 |
| D — Actual `0020` status | D1–D5 | 5 | all `PENDING` | `G1` (staging) | B-04 |
| E — Lineage + `max(created_at)` | E1–E6 | 6 | all `PENDING` | `G3`, `G2`, `A7` | B-05 |
| F — Backup + disposable restore | F1–F6 | 6 | all `PENDING` | `G4`, `A5` | B-06 |
| G — Build compatibility | G1–G6 | 6 | all `PENDING` | `A8`, `A14`, `A6`, `G1`/`G2` | B-07, B-09, B-14 |
| H — Cross-cutting attestations | H1–H3 | 3 | all `PENDING` | `A3`, `A9`, `A10`, `A11`, `A13` | B-10, B-13 |
| **Total** | **A1–H3** | **47** | **47 `PENDING`, 0 `CONFIRMED`, 0 `NOT CONFIRMED`, 0 `UNAVAILABLE`** | `G1-S`–`G5-S`, `A1`–`A14` | all open except `B-12`, closed by a documentation corrective action (runbook claim withdrawn 2026-10-16) |

Gate states at the time of writing (unchanged from the readiness audit §3):
`G1-S` `BLOCKED`, `G2-S` `BLOCKED`, `G3-S` `BLOCKED`, `G4-S` `BLOCKED`,
`G5-S` `BLOCKED`; `A1`–`A14` `PENDING` ☐. **No gate is `PASS`.**

Staging-count sanity check against intake §3: this pack covers all 28 staging
register rows (`E1.1`–`E6.4`) plus the isolation matrix (§5 `G5`) and the Part A
attestations that the register does not itemize (`A11`, `A13`, `A3`).

---

## 4. Active blockers

Status of every row at the time of writing: `B-12` is `CLOSED` (documentation
corrective action, 2026-10-16); every other row is `OPEN`. None of them is a
gate; all gates remain `BLOCKED`.

| ID | Blocker | Source | Closed by | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| B-01 | Staging environment identity and isolation unproven (no environment-identity capture, no isolation-matrix attestation) | audit `G5-S`, `A4` | A1–A5, A7 | DBA + Application Lead | OPEN |
| B-02 | No live staging ledger capture (rows, count, min/max `created_at`, hash mapping, append-only) | audit `G2-S`, `G3-S` | B1–B5 | DBA | OPEN |
| B-03 | No live staging catalog capture for `0019`–`0022`; classification impossible | audit `G1-S`, `G2-S` | C1–C9, E3 | DBA + Application Lead | OPEN |
| B-04 | `0020` staging state unverified; no identified staging build/release ID | audit `G1-S`; handoff §2 | D1–D5, G1 | DBA + Application Lead | OPEN |
| B-05 | Staging live max ledger `created_at` unknown ⇒ safe repair `when` not computable; snapshot-chain disposition unrecorded | audit `G3-S`, `A7` | E1, E4, E6 (with B1/B2) | DBA + Application Lead | OPEN |
| B-06 | No staging backup manifest/checksum, no restore test into an isolated disposable DB, no PITR posture, no private-file restore | audit `G4-S`, `A5` | F1–F6 | DBA | OPEN |
| B-07 | Compatible build not pinned; deploy order (migration first) not fixed | audit `A8` | G1, G2, G5 | Application Lead | OPEN |
| B-08 | Staging guard not attested for the rehearsal shell (`HRIS_ENV`, `STAGING_DATABASE_URL`, no `DATABASE_URL` fallback) | audit `A12` | A6 | operator + DBA | OPEN |
| B-09 | Control plane disabled state not evidenced as recorded config + test output (repo value alone insufficient) | audit `A14` | G3 | Application Lead | OPEN |
| B-10 | Change record absent (ID, window, rollback owner, incident commander); §5.7 rollback plan and §5.8 reporting validation not recorded/accepted | audit `A3`, `A9`, `A10`, `A11` | H1, H3 | DBA + Application Lead | OPEN |
| B-11 | Part A authorizations absent (`A1` DBA, `A2` Application Lead) | audit `A1`, `A2` | none — **last**, only after B-01…B-10 are evidenced | DBA + Application Lead | OPEN |
| B-12 | Runbook §1.4 claim "Migration inspected against the PostgreSQL catalog (read-only) — done (parent task)" has no artifact and no environment label (audit observation O1) | audit §1.1 O1 | replace with a labelled C-group artifact (staging or production, as applicable) **or remove the claim** | Application Lead | CLOSED (claim withdrawn 2026-10-16; no gate advanced — live catalog evidence remains required via `C1`–`C9` for `B-03`/`G1-S`/`G2-S`) |
| B-13 | Synthetic-data / no-production-PII attestation absent | audit `A13` | H2 | operator + DBA | OPEN |
| B-14 | `A6` in-rehearsal DBA checksum re-verification not recorded (repository value matches, gate still open) | audit `A6` | G4 + DBA re-verification at rehearsal time (runbook §5.4) | DBA | OPEN |
| B-15 | Runtime idempotency and rollback remain **UNPROVEN** (static review only) | change review §4/§5; runbook §2 | rehearsal §5.6/§5.7 — **not part of this pack** | DBA | OPEN (out of scope here) |

Production-side blockers (`G1-P`–`G4-P`, `E4.2`–`E4.4` production,
`E5.1`–`E5.6` production, `B1`–`B13`, policy §4) are **not** listed here: they
do not block an isolated staging rehearsal (intake §7.1).

---

## 5. Redaction register (secrets and PII)

Apply before submission. Evidence containing secrets or unnecessary PII is a
STOP (evidence request §4.11) — redact and re-capture, never submit as-is.

| Code | Applies to | Must be redacted | Reviewer |
| --- | --- | --- | --- |
| R1 | A1, A3, A7, G6 | Any connection string, host, IP, port, or account detail beyond host class / cluster role; secrets in job or CI configuration | DBA |
| R2 | A2, A4 | Endpoint appears **only** as host class + cluster role (this includes `inet_server_addr()` / `inet_server_port()` output from `T1`) | DBA |
| R3 | A5 | Password hashes/attributes, credentials, or personal identifiers of role holders; role **names and grants only** | DBA |
| R4 | A6 | The **value** of `STAGING_DATABASE_URL` and any other connection URL; only variable **name**, guard evaluation result, and host class may appear | operator + DBA |
| R5 | A7, D2, G1, G6 | Internal URLs, tokens, API keys, CI secrets in release/deployment records | Application Lead |
| R6 | F1, F2, F3, A4 | Storage locations, bucket/cluster names, and file paths reduced to approved redacted form; dump **contents are never transferred** as evidence — only manifest + SHA-256 + logs | DBA |
| R7 | F4 | `archive_command` and any command line that embeds credentials, hosts, or key paths | DBA |
| P1 | D4, H2 | Aggregate counts only; **no** row-level values, no user/employee identifiers, no raw `must_change_password` values tied to a person | DBA |
| P2 | F5, H2 | File manifests: relative paths, sizes, SHA-256 only. **No** file contents, no decrypted payslips, no employee names or document text; payslip passwords must never be logged | DBA + Application Lead |

Also required: no employee names, numbers, birth dates, or other personal data
in any artifact unless an item explicitly demands them, and then only as counts
(handoff §5.4).

---

## 6. Keeping staging evidence separate from production evidence

1. **Distinct filenames.** Every staging artifact is named
   `EVD-<item>-…` and recorded **only** in the intake **staging** register
   (intake §3). Production artifacts live in intake §2 with their own
   filenames. Never reuse one for the other (intake §0 rule 3).
2. **Distinct capture sessions.** Staging and production are captured
   independently through their own approved read-only channels; a production
   console session is never pointed at staging or vice versa.
3. **Distinct labels.** Every artifact carries its environment, database name,
   collector, and capture UTC; a missing environment label invalidates the
   artifact (audit observation O1 is exactly this defect).
4. **Distinct gates.** `G1`–`G4` are evaluated **per environment**. The staging
   rows feed `G1-S`–`G4-S`; production rows feed `G1-P`–`G4-P` and Part B.
5. **No production prerequisite for staging.** Production deployed-build,
   production backup/PITR/restore, and Part B approvals are **not** requested by
   this pack and must not be presented as staging evidence (intake §7.1.2,
   §7.1.4). Conversely, a staging artifact never satisfies a production row.
6. **Only two cross-environment items are legitimate for staging safety:**
   artifact identity (the `0019`–`0022` checksum anchors, `A6`) and staging
   lineage computed from **staging's** live ledger (`A7`) — intake §7.1.2.
7. **Non-transferable outcomes.** A staging `PASS` (when someday achieved)
   authorizes nothing beyond "0022 rehearsed on staging" (intake §7.1,
   approval-checklist Part A).
8. **Storage.** Staging and production artifacts go to the same
   approved restricted-access evidence location but remain labelled and
   listed separately; neither is committed to Git or pasted into chat
   (handoff §5.3, §8).

---

## 7. Read-only SQL templates for DBA review (NOT executed)

> **These statements have not been run.** They are proposals for the DBA to
> review, adapt to the actual application schema, and run in the approved
> read-only channel. The application team does not run them. Confirm each is
> genuinely read-only before execution. Do **not** extend them with
> `INSERT`/`UPDATE`/`DELETE`/DDL/`VACUUM`/`ANALYZE`, `session_replication_role`,
> or trigger-disabling statements (evidence-intake §0.1; evidence-request §8).
>
> Templates **T1–T10** in `docs/employee-permanent-delete-dba-evidence-request.md`
> §8 remain the base source for the captures. The staging-specific templates
> below are cited directly in the `Sumber` cells they serve and **supersede** the
> base template for that row: `TS-S1` → `A1`, `A2`; `TS-S2` → `A5`; `TS-S3` →
> `B1`, `B2`, `E1`; `TS-S4` → `C1`, `C2`, `D1`; `TS-S5` → `D4`; `TS-S6` → `C4`;
> `TS-S7` → `C6`; `TS-S8` → `C7`; `TS-S9` → `C9`; `TS-S10` → `F4`. The additions
> below are **staging-specific** and new.

**TS-S1 — Staging environment identity, encoding, extensions (extends T1)**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

SHOW server_version;
SHOW TimeZone;

SELECT current_database()            AS database_name,
       current_user                  AS database_user,
       current_setting('server_version') AS server_version,
       current_setting('TimeZone')       AS server_timezone,
       current_setting('server_encoding') AS server_encoding,
       inet_server_addr()            AS server_address,   -- REDACT (R2) before submission
       inet_server_port()            AS server_port;      -- REDACT (R2) before submission

SELECT datname,
       pg_encoding_to_char(encoding) AS encoding,
       datcollate,
       datctype
FROM pg_database
WHERE datname = current_database();

SELECT extname, extversion
FROM pg_extension
ORDER BY extname;
ROLLBACK;
```

**TS-S2 — Staging role inventory and membership (isolation evidence, A5)**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

SELECT rolname, rolsuper, rolcreatedb, rolcanlogin, rolreplication
FROM pg_roles
WHERE rolname NOT LIKE 'pg\_%'
ORDER BY rolname;

SELECT m.rolname AS member_role,
       r.rolname AS granted_role,
       a.admin_option
FROM pg_auth_members a
JOIN pg_roles m ON m.oid = a.member
JOIN pg_roles r ON r.oid = a.roleid
WHERE m.rolname NOT LIKE 'pg\_%'
  AND r.rolname NOT LIKE 'pg\_%'
ORDER BY 1, 2;
ROLLBACK;
```

*Review note:* role **names** and grants only; no credential material exists in
these views, but redact anything environment-identifying beyond host class (R1,
R3). The DBA must state which production roles exist separately — do not run
this against production from this request.

**TS-S3 — Staging ledger rows, summary, and candidate safe `when` (B1, B2, E1)**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

-- 1. Full ledger rows
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY id;

-- 2. Summary
SELECT count(*)        AS ledger_rows,
       min(created_at) AS min_created_at,
       max(created_at) AS max_created_at
FROM drizzle.__drizzle_migrations;

-- 3. Candidate safe repair `when` for staging (must be strictly greater than max)
SELECT max(created_at)  AS staging_max_created_at,
       max(created_at) + 1 AS candidate_safe_when
FROM drizzle.__drizzle_migrations;
ROLLBACK;
```

*Review note:* `created_at` is `bigint` (epoch milliseconds). If the ledger table
is absent, record that as a schema/restore failure and **do not create it**
(master runbook §D.2). `candidate_safe_when` is an input to the lineage decision
(E1), **not** an instruction to write anything.

**TS-S4 — `0019` and `0020` catalog confirmation (C1, C2, D1)**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

-- 0019: DEFAULT present ⇒ DDL likely not applied
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name  = 'face_enrollment_templates'
  AND column_name = 'key_version';

-- 0020: three password-lifecycle columns
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN ('must_change_password', 'password_changed_at', 'last_login_at')
ORDER BY column_name;
ROLLBACK;
```

**TS-S5 — `0020` value distribution, counts only (D4)**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
-- Run ONLY after TS-S4 confirms the column exists; if it errors, the error is
-- evidence for D1/D3 and must be reported, not "fixed".
SELECT must_change_password AS value,
       count(*)             AS row_count
FROM users
GROUP BY 1
ORDER BY 1;
ROLLBACK;
```

*Review note:* counts only (P1). No identifiers, no filters that expose a single
user, no row output.

**TS-S6 — `0022` protected-table contract: nullability, FK action, CHECK (C4)**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

WITH protected(table_name) AS (
  VALUES
    ('attendance_records'), ('attendance_events'), ('leave_balances'),
    ('leave_requests'), ('permission_requests'),
    ('employee_payroll_components'), ('payroll_items'), ('payslips'),
    ('payslip_documents'), ('payslip_document_versions'),
    ('employee_employment_history')
)
SELECT p.table_name,
       col.is_nullable AS employee_id_nullable,
       fk.conname      AS employee_fk,
       fk.confdeltype  AS employee_fk_on_delete,  -- 'n'=SET NULL 'r'=RESTRICT 'c'=CASCADE STOP
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
ROLLBACK;
```

**TS-S7 — Employee-FK CASCADE scan on protected tables (C6)**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

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
ROLLBACK;
```

**TS-S8 — Full application table inventory (C7)**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relkind AS relation_kind,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
ROLLBACK;
```

**TS-S9 — Pre-apply BEFORE contract (C9; runbook §5.5 queries 1–4)**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

-- 1. Protected employee FKs must be RESTRICT ('r') with employee_id NOT NULL pre-0022
SELECT c.conrelid::regclass::text AS table_name,
       c.conname,
       a.attnotnull                AS employee_id_not_null,
       c.confdeltype               AS fk_action
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
-- EXPECTED pre-0022 (first application): 11 rows, not_null = true, fk_action = 'r'.

-- 2. No retained-identity CHECK may exist yet (first application only)
SELECT conrelid::regclass::text AS table_name, conname
FROM pg_constraint
WHERE contype = 'c' AND conname LIKE '%\_retained_identity_check'
ORDER BY 1;
-- EXPECTED pre-0022 (first application): 0 rows.

-- 3. Snapshot column inventory BEFORE
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('employee_number_snapshot', 'employee_name_snapshot', 'birth_date_snapshot')
ORDER BY 1, 2;

-- 4. Deletable employee FKs remain RESTRICT (unchanged by 0022)
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
ROLLBACK;
```

*Review note:* expectations 1–2 apply to a **first** application. On a re-apply
or recovery run, record the observed state and compare it with runbook §1.3
instead (runbook §5.5 first-application contract note).

**TS-S10 — Backup / PITR posture (F4; extends T10)**

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

SELECT current_setting('wal_level', true)       AS wal_level,
       current_setting('archive_mode', true)    AS archive_mode,
       current_setting('archive_command', true) AS archive_command;  -- REDACT (R7)
ROLLBACK;
```

*Review note:* external backup tooling records (tool, retention, RPO/RTO) are
supplied separately as read-only records. Staging may legitimately be
restore-only — state that explicitly in the F4 artifact rather than omitting the
item.

---

## 8. Action order to close the blockers

Read-only collection may run in parallel where steps are independent. **Nothing
below authorizes an apply, a rehearsal, or any database change.**

1. **Open the change record (H3 / `A3`)** — ID, window, rollback owner,
   incident commander — so every artifact has a ticket ID to be labelled with.
   *(Prerequisite for labeling; closes part of B-10.)*
2. **Environment identity + isolation (A1–A7).** DBA captures redacted identity,
   role classes/grants, cluster/file-root/secrets separation, denied production
   routes, controller review; Application Lead/operator attest the guard (A6).
   *(Closes B-01, B-08; unblocks `G5`/`A4`/`A12`.)*
3. **Ledger + catalog capture (B1–B5, C1–C9).** DBA captures the live staging
   ledger and the `0019`–`0022` catalog; Application Lead classifies every
   object; any `unexplained` = STOP. *(Closes B-02, B-03; unblocks `G2`.)*
4. **`0020` disposition (D1–D5) with the pinned build (G1).** DBA + Application
   Lead record `routine` / `not-yet-deployed` / `incident`. *(Closes B-04;
   unblocks `G1`.)*
5. **Lineage assessment (E1–E6)** using staging's actual `max(created_at)`:
   compute the candidate safe `when`, confirm append-only, record the
   snapshot-chain disposition, accept for staging. *(Closes B-05; unblocks
   `G3`/`A7`.)*
6. **Backup + disposable-DB restore rehearsal (F1–F6).** *(Closes B-06;
   unblocks `G4`/`A5`.)*
7. **Build pinning and deploy order (G1, G2, G5) + control-plane evidence (G3)
   + repo preflight (G4).** *(Closes B-07, B-09, B-14; unblocks `A8`/`A14`.)*
8. **Attestations and acknowledgements (H1, H2) and rehearsal definitions
   (H3: `A9`, `A10`, `A11`).** *(Closes B-10, B-13.)*
9. **Resolve observation O1 (B-12):** **done 2026-10-16** — the runbook §1.4
   claim was withdrawn and `B-12` closed as a documentation corrective action.
   A labelled C-group artifact (`C1`–`C9`) is still required for the **live**
   catalog evidence that feeds `B-03`/`G1-S`/`G2-S`; nothing was advanced by the
   withdrawal.
10. **Record the receipts:** enter every artifact into the intake **staging**
    register (§3), resolve `G1-S`–`G5-S` against attached artifacts, then seek
    `A1`/`A2` sign-off (B-11). Only then may the rehearsal (runbook §5) be
    considered — and it authorizes nothing beyond "0022 rehearsed on staging".
11. **Production path stays separate and later** (intake §7.2, Part B
    `B1`–`B13`) — not a staging step, not advanced by this pack.

---

## 9. DBA return format (staging only)

Return one packet per the handoff §8 checklist, restricted to the staging rows,
with `EVD-…` filenames from §2 and the redaction codes from §5 applied:

| Group | Items | Return as | Status |
| --- | --- | --- | --- |
| Environment identity + isolation | A1–A7 | labelled artifacts + attestation | ☐ |
| Migration ledger | B1–B5 | raw rows (csv/txt) + mapping | ☐ |
| Catalog 0019–0022 | C1–C9 | raw query output + classification worksheet | ☐ |
| `0020` status | D1–D5 | raw query output + release record + disposition | ☐ |
| Lineage / `max(created_at)` | E1–E6 | analysis note + acceptance record | ☐ |
| Backup + restore | F1–F6 | manifest, verification log, restore log, posture | ☐ |
| Build compatibility | G1–G6 | release record, order record, config/test evidence | ☐ |
| Attestations | H1–H3 | acknowledgements + change-record header | ☐ |

Each item is returned as `DONE` / `PARTIAL` / `UNAVAILABLE` / `DISCREPANCY`
(handoff §8) and is then recorded in the intake staging register as
`CONFIRMED` / `NOT CONFIRMED` / `UNAVAILABLE` / `PENDING` by the reviewer —
**never** by the collector alone.

---

## 10. Explicit non-actions in producing this pack

- **No database was contacted; no query was executed** — read-only or
  otherwise. §7 contains **proposals for DBA review only**.
- **No migration was run, generated, pushed, applied, or journaled.** No
  `_journal.json`, snapshot, ledger, schema, or environment configuration was
  modified.
- **No seed, deployment, RBAC seeding, or employee record was created, modified,
  or deleted.** The retention executor remains disabled
  (`DELETION_EXECUTION_ENABLED = false`) and `RETENTION_ELIGIBLE_CATEGORIES = []`.
- **No secret, `.env.production`, connection string, or production endpoint was
  read or guessed.**
- **No existing working-tree change was reverted, reset, stashed, or
  overwritten**; all prior work products in this worktree are preserved.
- **No gate was set to `PASS` and no artifact was marked `CONFIRMED`.** Every
  row in §2 is `PENDING`; every gate in §3 remains `BLOCKED`; production rows
  and Part B remain untouched and `PENDING`.
- **Repository checksums were recomputed read-only and match the recorded
  anchors** — this establishes artifact identity only, never any environment's
  applied state.

**Conclusion:** this pack is ready to hand to the DBA as a staging-only,
read-only evidence request: 47 artifacts across 8 groups, each with an ID,
source, owner, verification method, status, stop condition, and redaction flag;
14 active blockers (`B-01`–`B-15` minus the documentation-closed `B-12`) with a
dependency-ordered closing sequence; and an explicit separation from production
evidence. Migration `0022` remains unapplied and unjournaled, and no rehearsal
is started by this document.

---

## 11. Files changed in this task

| File | Change |
| --- | --- |
| `docs/employee-permanent-delete-0022-staging-evidence-request-pack.md` | **created** (this document) |

No other file was created, modified, or deleted. No migration, journal,
snapshot, schema, configuration, test, or application source file was touched.

### 11.1 FASE 1 correction pass (2026-10-16)

Read-only documentation corrections; no database, migration, journal, snapshot,
ledger, schema, configuration, or employee record was touched. No control scope
changed and no gate or authorization state was advanced.

| File | Change |
| --- | --- |
| `docs/employee-permanent-delete-0022-staging-evidence-request-pack.md` | D-01 `30`→`28`; D-02 removed undefined `B-10a` from §3 group A; D-03 `G4` Status → strict `PENDING`; D-04 `C1`/`C2`/`D1` cite `TS-S4` + §7 template map; D-05 §2 pointer to register §3; `A6`/`A7` scope notes (R-1/R-2); `B-12` closure + counts updated. |
| `docs/employee-permanent-delete-0022-staging-evidence-intake-register.md` | D-01…D-05 resolutions + §1.4 corrective-action log; mirrored `TS-S4` citations; `B-12` closed; blocker counts 15→14 updated; `V-14`/`V-15` updated; §11 FASE 2 repository-side findings (R-1…R-6) + halt record. |
| `docs/employee-permanent-delete-0022-staging-runbook.md` | §1.4 unsupported catalog-inspection claim withdrawn (B-12). |
| `docs/employee-permanent-delete-0022-staging-readiness-audit.md` | O1 marked resolved (runbook claim withdrawn; B-12 closed). |

### 11.2 FASE 3 correction pass (2026-10-19, Wave 1 evidence-coordination pass)

Read-only documentation corrections; no database, migration, journal, snapshot,
ledger, schema, configuration, test, or employee record was touched. No control
scope changed and no gate or authorization state was advanced.

| File | Change |
| --- | --- |
| `docs/employee-permanent-delete-0022-staging-evidence-request-pack.md` | `F-05`: §2.G `G6` `Redaksi` cell `R5` → `R1, R5` (aligns with §5 `R1` `A1,A3,A7,G6`). |
| `docs/employee-permanent-delete-0022-staging-evidence-intake-register.md` | `F-05`: §3 `G6` `Redaksi` cell `R5` → `R1, R5` (same row mirror); §1.5 FASE 3 log added. |
| `docs/employee-permanent-delete-0022-staging-evidence-coordination-request.md` | `F-06`: §2.5 DBA-row code list now includes `R4`; header revision note added. |
| `docs/employee-permanent-delete-0022-staging-evidence-response-templates.md` | `F-05`/`F-06` recorded RESOLVED in §1.3; §1.4/§1.5 verdict + checks `C-11`/`C-12`; §9/§10 updated. |

All 47 rows remain `PENDING`; all gates remain `BLOCKED`; Part A remains
`PENDING`; blocker states unchanged. The artifacts carrying ≥1 redaction code
remain **17**.
