# Migration 0022 — Staging Evidence Acceptance & Intake Register (A1–H3)

**Document type:** EVIDENCE ACCEPTANCE / INTAKE REGISTER — **staging scope only**.
This is **not** an approval, a change record, a verification result, or an
execution instruction. It records what was *requested* in
`docs/employee-permanent-delete-0022-staging-evidence-request-pack.md` (the
"pack") and, as artifacts are returned by the DBA / Application Lead, what was
*actually received*. It authorizes nothing.

**Status:** OPEN — **no artifact received**. All **47** requested artifacts
(`A1`–`H3`) are `PENDING` (not received). **14** of the **15** blockers
(`B-01`–`B-15`) remain `OPEN`; `B-12` is `CLOSED` by a documentation corrective
action (runbook §1.4 claim withdrawn, 2026-10-16). All staging gates
(`G1-S`–`G5-S`) remain `BLOCKED` and all Part A rows (`A1`–`A14`) remain
`PENDING`. No gate is `PASS`; no artifact is `CONFIRMED`.

**Date prepared:** 2026-10-16
**Repository:** `/opt/hris` (git `main`, working tree; no commit made)
**Source of truth for requirements:** the pack (§2 artifacts, §4 blockers,
§5 redaction, §7 SQL templates). This register is a *derived record*, not a
re-definition; on any conflict the pack governs until reconciled.

> **Hard boundary observed in producing this register.** No database was
> contacted and **no query was executed**. No migration, seed, deployment,
> journal, snapshot, ledger, schema, configuration, or employee record was run,
> read, or changed. No secret, `.env.production`, or connection string was read
> or guessed. No artifact was fabricated, no `PENDING` row was advanced, and no
> gate or result was set from repository facts. All prior working-tree changes
> are preserved.

---

## 0. Purpose and scope

The pack turns the readiness audit's live-evidence requirement into a
staging-only, per-artifact request. This register is the **receiving side**: it
(i) verifies the pack's internal consistency, (ii) provides the labelled intake
format into which returned artifacts are entered, (iii) records checksums /
file identities for received files, and (iv) keeps `PENDING`/`BLOCKED` states
intact until a raw, labelled artifact is attached and independently reviewed by
a reviewer other than the collector (pack §1 rule 4; intake §0 rule 5).

**In scope:** staging only; the 47 artifacts `A1`–`H3`; blockers `B-01`–`B-15`;
templates `TS-S1`–`TS-S10`; the redaction codes `R1`–`R7`, `P1`, `P2`.

**Out of scope (unchanged):** production evidence rows, Part B approvals, any
apply/rehearsal, journaling, `generate`/`push`, seed, deployment, or employee
deletion. `B-15` (runtime idempotency/rollback) remains out of scope of the pack
and is not advanced here.

---

## 1. Consistency verification of the pack (read-only, static)

Method: the pack was read in full and parsed mechanically; no database or secret
was touched. Counts and cross-references below were recomputed from the pack
text.

### 1.1 Structural checks

| # | Check | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| V-1 | Artifact rows `A1`–`H3` | 47 | 47 | ✅ MATCH |
| V-2 | Duplicate artifact IDs | none | none | ✅ MATCH |
| V-3 | Group A count | 7 (`A1`–`A7`) | 7 | ✅ MATCH |
| V-4 | Group B count | 5 (`B1`–`B5`) | 5 | ✅ MATCH |
| V-5 | Group C count | 9 (`C1`–`C9`) | 9 | ✅ MATCH |
| V-6 | Group D count | 5 (`D1`–`D5`) | 5 | ✅ MATCH |
| V-7 | Group E count | 6 (`E1`–`E6`) | 6 | ✅ MATCH |
| V-8 | Group F count | 6 (`F1`–`F6`) | 6 | ✅ MATCH |
| V-9 | Group G count | 6 (`G1`–`G6`) | 6 | ✅ MATCH |
| V-10 | Group H count | 3 (`H1`–`H3`) | 3 | ✅ MATCH |
| V-11 | Blocker IDs | 15 (`B-01`–`B-15`) | 15, contiguous, no dupes | ✅ MATCH |
| V-12 | SQL templates | 10 (`TS-S1`–`TS-S10`) | 10 | ✅ MATCH |
| V-13 | Per-row fields present (Required artifact, Sumber, PJ, Metode, Stop, Redaksi, Status) | all non-empty | all non-empty | ✅ MATCH |
| V-14 | Row Status value | `PENDING` | 47×`PENDING` (after the D-03 correction in the pack) | ✅ MATCH |
| V-15 | Blocker "Closed by" references resolve to a defined artifact | all resolve | all resolve (after the D-02 correction: the undefined `B-10a` was removed from pack §3 group A) | ✅ MATCH |

### 1.2 Findings requiring correction in the pack (do not block anything by themselves)

These are **documentation defects in the pack**, recorded here so the record is
accurate. None of them changes whether evidence exists; none advances or blocks
a gate by itself. All five (D-01…D-05) were corrected in the pack on
2026-10-16 (see the `Correction applied` column); the applied corrections kept
the **control scope identical** — no artifact, gate, barrier, or authorization
changed state as a result.

| # | Location | Finding | Impact | Recommended correction | Correction applied (2026-10-16) |
| --- | --- | --- | --- | --- | --- |
| D-01 | Pack §3, closing note (line ~240) | States the pack covers "all **30** staging register rows (`E1.1`–`E6.4`)". The intake staging register (intake §3) contains **28** rows: `E1.1`–`E1.3`, `E2.1`–`E2.5`, `E3.1`–`E3.6`, `E4.1`–`E4.4`, `E5.1`–`E5.6`, `E6.1`–`E6.4` = 28. | Cosmetic/arithmetic only. All 28 rows **are** covered by the 47 artifacts; no row is left uncovered. | Change "30" to "28". | **RESOLVED** — pack §3 now reads "all 28 staging register rows". |
| D-02 | Pack §3, group-A matrix row | "Blockers closed" for group A cites **`B-10a`**, which is not a defined blocker ID (the defined set is `B-01`–`B-15`; `B-10` is closed by `H1`, `H3`). | Ambiguous reference. | Replace `B-10a` with the intended defined ID, or define the sub-reference explicitly. | **RESOLVED** — now `B-01, B-08` (pack §4 defines `B-01` closed by `A1`–`A5, A7` and `B-08` by `A6`); the undefined `B-10a` was removed. |
| D-03 | Pack §2.G, row `G4`, Status cell | Status is `PENDING (repo value matches; not yet recorded in a change record)` rather than the strict vocabulary `PENDING` (intake §0 rule 5). | Vocabulary-only; value is still not confirmed. | Keep `PENDING` in Status; move the parenthetical to Discrepancy/Follow-up. | **RESOLVED** — `G4` Status is now strict `PENDING`; the "repo value matches / gate still requires in-rehearsal re-verification" content remains in the `Metode verifikasi` cell. |
| D-04 | Pack §7 vs §2 artifact rows | Template `TS-S4` is **defined** and referenced only in the `TS-S5` review note; it is cited in **no** artifact row's `Sumber` column. `C1`/`C2`/`D1` cite the base templates `T3`/`T4` instead. | No artifact is unreachable (base `T3`/`T4` also cover those captures). | Cite `TS-S4` for `C1`/`C2`/`D1` (staging-specific form) or note that it supersedes `T3`/`T4` for staging. | **RESOLVED** — `C1`/`C2`/`D1` `Sumber` now cite `T3`/`T4` **/ §7 TS-S4**; pack §7 header note adds the full staging-template↔row map and states the staging template supersedes the base template for that row. |
| D-05 | Pack §2 artifact tables (all groups) | The tables carry `Sumber`, `PJ`, `Metode`, `Stop`, `Redaksi` but **no per-row `Environment` or `Captured (UTC)` column**; environment is declared pack-wide ("staging scope only", §1 rule 2) and capture time is encoded in the filename pattern `EVD-…-<ts>-…`. | Verifiability requirement (task item 2) is only met indirectly by the pack. | This register supplies the missing `Env` and `Captured (UTC)` columns per row (§3). | **CLOSED by this register** — register §3 carries `Env` and `Captured (UTC)` per row; pack §2 now carries an explicit pointer to register §3 and states that a non-`staging` `Env` or an empty `Captured (UTC)` is rejected at intake. |

### 1.3 Association coverage (task item 2)

Every artifact row can be associated with all required attributes, as follows:

| Required association | Where it is established | Coverage |
| --- | --- | --- |
| Environment = staging | Pack title/§0/§1 rule 2 (pack-wide) **+** `Env` column in this register §3 | all 47 |
| Source (query/template/record) | Pack `Sumber` column; templates `T1`–`T10` + `TS-S1`–`TS-S10` | all 47 |
| Capture time (UTC) | Pack §1 rule 5 filename `<ts>`; `Captured (UTC)` column in this register §3 | all 47 |
| Owner / penanggung jawab | Pack `Penanggung jawab` column; `Collector`/`Reviewer` columns in this register §3 | all 47 |
| Verification method | Pack `Metode verifikasi` column; `Stop condition` column | all 47 |
| Redaction / PII handling | Pack `Redaksi` column (§5 codes `R1`–`R7`, `P1`, `P2`) | all 47 |

**Verdict:** the pack is **internally consistent for its artifact set (47),
blocker set (15), and template set (10)**. The four documentation defects
(D-01…D-04) were corrected in the pack on 2026-10-16 and the one structural gap
(D-05) is closed by this register. None of the corrections changed the control
scope, and **no artifact may be treated as received because of this
verification.**

### 1.4 FASE 1 corrective-action log (2026-10-16)

Read-only documentation corrections only; no database, migration, journal,
snapshot, ledger, schema, config, or employee record was touched. No gate or
authorization state was advanced.

| # | Corrective action | Files | Effect on control scope |
| --- | --- | --- | --- |
| C-1 | Applied D-01…D-04 corrections and the D-05 pointer in the pack. | `employee-permanent-delete-0022-staging-evidence-request-pack.md` | None — counts, artifacts, gates, blockers unchanged except `B-12` below. |
| C-2 | Withdrew the unsupported runbook §1.4 catalog-inspection claim; reclassified it as not-evidence. | `employee-permanent-delete-0022-staging-runbook.md` | None for gates: the live catalog capture was and remains required via `C1`–`C9` (`B-03`/`G1-S`/`G2-S`). Closes documentation blocker `B-12` only. |
| C-3 | Recorded the O1 resolution against the readiness audit observation. | `employee-permanent-delete-0022-staging-readiness-audit.md` | None — audit is point-in-time; the observation is now marked resolved. |
| C-4 | Recorded D-01…D-05 resolutions, B-12 closure, and updated blocker counts in this register. | `employee-permanent-delete-0022-staging-evidence-intake-register.md` | None — all 47 rows remain `PENDING`; all gates remain `BLOCKED`; Part A remains `PENDING`. |
| C-5 | Corrected the `H2`/`A13` source citation from the mis-attributed "intake §0 rule 7" to the authoritative `runbook §0 rule 7` (`§0.7`); recorded as `F-04` in the response templates. | `employee-permanent-delete-0022-staging-evidence-request-pack.md`; `…-staging-evidence-intake-register.md`; `…-staging-evidence-coordination-request.md`; `…-staging-readiness-audit.md`; `…-approval-checklist.md` | None — source citation only; the `H2`/`A13` requirement text, all 47 row statuses (`PENDING`), all gates (`BLOCKED`), and Part A/B states are unchanged. The redaction rule (`employee-permanent-delete-dba-evidence-intake.md` §0 rule 7) remains cited separately via the `H2` codes `P1`/`P2`. |

### 1.5 FASE 3 corrective-action note (2026-10-19, Wave 1 evidence-coordination pass)

Read-only documentation corrections only; no database, migration, journal,
snapshot, ledger, schema, config, test, or employee record was touched. No gate
or authorization state was advanced.

| # | Corrective action | Files | Effect on control scope |
| --- | --- | --- | --- |
| C-6 | Applied `F-05` (register §3 `G6` `Redaksi` cell `R5` → `R1, R5`, matching pack §5 / register §5 / coordination §2.4 / response-templates W-8) and `F-06` (coordination §2.5 DBA-row code list now includes `R4`); findings logged in response-templates §1.3, cross-checks `C-11`/`C-12` in §1.5. | `…-staging-evidence-intake-register.md` (§3 `G6`); `…-staging-evidence-request-pack.md` (§2.G `G6`); `…-staging-evidence-coordination-request.md` (§2.5 + header note); `…-staging-evidence-response-templates.md` (§1.3/§1.4/§1.5/§9/§10) | None — redaction-cell/code-list alignment only. The set of artifacts carrying ≥1 redaction code stays **17**; all 47 rows remain `PENDING`; all gates remain `BLOCKED`; Part A remains `PENDING`; no blocker changed state (`B-12` stays `CLOSED`). |

---

## 2. Intake register — field legend

| Column | Meaning |
| --- | --- |
| **ID** | Pack artifact ID (`A1`–`H3`). |
| **Env** | `staging` (restated per row). A non-staging artifact for a staging row is a STOP. |
| **Required artifact (filename)** | What the DBA/Application Lead must return; `EVD-<item>-<ts>-…` per pack §1 rule 5. |
| **Sumber** | Template/record the artifact derives from (pack `Sumber`). |
| **Captured (UTC)** | ISO-8601 capture timestamp on the returned artifact (from its label/filename). |
| **Collector** | Named operator who produced the raw artifact. |
| **Reviewer** | Named reviewer (≠ collector) who checked it against the contract. |
| **Checksum (SHA-256)** | SHA-256 of the received file; `n/a` for direct console text with no file. |
| **Redaksi** | Redaction codes (`R1`–`R7`, `P1`, `P2`) that apply before submission (pack §5). |
| **Metode verifikasi** | How the reviewer checks the artifact against the contract (pack `Metode verifikasi`). |
| **Result** | `PENDING` / `CONFIRMED` / `NOT CONFIRMED` / `UNAVAILABLE` (intake §0 rule 5). |
| **Discrepancy** | Any mismatch vs the contract, or `—`. |
| **Follow-up** | Owning blocker / STOP escalation / owner. |

An empty `Collector`, `Reviewer`, or `Captured (UTC)` is **not** evidence — an
artifact is not `CONFIRMED` until those cells and the raw file reference are
filled and independently reviewed.

---

## 3. Staging evidence intake register (A1–H3)

Environment: **staging**. Status of **every** row at intake preparation:
`PENDING` — not received.

| ID | Env | Required artifact (filename) | Sumber | Captured (UTC) | Collector | Reviewer | Checksum (SHA-256) | Redaksi | Metode verifikasi | Result | Discrepancy | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | staging | DB name, full server version, timezone, encoding, extensions — `EVD-E1-1-<ts>-01.txt` | §7 TS-S1 (extends `T1`) | | | | | R1 | Label complete; statement set confirmed read-only by DBA; values reported verbatim; environment field says `staging` | `PENDING` (not received) | — | B-01, B-08 |
| A2 | staging | Redacted endpoint identity + role class (staging/DR/preview/CI) — `EVD-E1-2-<ts>-01.txt` | `T1` + §7 TS-S1, redacted to host class / cluster role | | | | | R2 | Endpoint appears **only** as host class + role class; must differ from the production class; no raw address, hostname, or URL | `PENDING` (not received) | — | B-01, B-08 |
| A3 | staging | Staging row of the full environment inventory (incl. DR/preview/CI) — `EVD-E1-3-<ts>-01.txt` | intake §4 worksheet, staging row | | | | | R1 | Every discovered environment named with role class; staging row completed and ledger/catalog capture checkbox decided | `PENDING` (not received) | — | B-01, B-08 |
| A4 | staging | Isolation-matrix attestation, all 7 controls (separate cluster/DB, separate file root, unique staging secrets, dedicated roles with no production membership, denied production routes, integrations disabled or test sinks, `HRIS_ENV=staging` guard) — `EVD-ISO-C1-<ts>-01.md` | master runbook §C.1; intake §5 `G5` table | | | | | R2, R6 | Each control row has an `Attested?` mark **and** a cited evidence ref (A1/A2/A5/A7 or platform config); no blank cell | `PENDING` (not received) | — | B-01, B-08 |
| A5 | staging | Staging role and grant export (dedicated owner/migration/app-rw/readonly/backup roles) — `EVD-ROLE-C3-<ts>-01.csv` | master runbook §C.3; §7 TS-S2 | | | | | R3 | No staging role is a member of a production role; the read-only role cannot write; grants attached | `PENDING` (not received) | — | B-01, B-08 |
| A6 | staging | Staging guard attestation for the rehearsal shell (`HRIS_ENV=staging`, explicit `STAGING_DATABASE_URL`, **no `DATABASE_URL` fallback**) — `EVD-GUARD-A12-<ts>-01.md` | runbook §5.0; `A12` | | | | | R4 | Guard snippet present and evaluated in the session that will be used; variable **values** redacted; fallback absence stated explicitly | `PENDING` (not received) | — | B-01, B-08 |
| A7 | staging | Deployment-controller review: no controller, systemd unit, timer, CI setting, or external job can invoke `db:migrate` / schema change outside an approved change record — `EVD-E6-4-<ts>-01.md` | `E6.4`; master runbook §G.2 | | | | | R1, R5 | Configuration review attached (job list + schedule + trigger source), conclusion stated | `PENDING` (not received) | — | B-01, B-08 |
| B1 | staging | Full ledger rows `id, hash, created_at` ordered by id — `EVD-E2-1-<ts>-01.csv` | `T2` #1 / §7 TS-S3 #1 | | | | | — | Raw rows attached; row count equals the count reported in B2; ledger table existence confirmed (absence recorded as restore/schema failure — **never** created) | `PENDING` (not received) | — | B-02 |
| B2 | staging | Ledger summary: row count, `min(created_at)`, `max(created_at)` — `EVD-E2-2-<ts>-01.txt` | `T2` #2 / §7 TS-S3 #2 | | | | | — | `min ≤ max`; count equals B1 row count; value reported in epoch ms and its UTC rendering | `PENDING` (not received) | — | B-02 |
| B3 | staging | Hash → reviewed-file mapping + unmapped-hash flags — `EVD-E2-3-<ts>-01.csv` | `E2.3`; anchors in §0 above; DBA's own records | | | | | — | Each ledger `hash` compared with `sha256(raw .sql)` of the reviewed files; unmapped list produced even if empty | `PENDING` (not received) | — | B-02 |
| B4 | staging | Ledger rows (if any) that map to `0019`–`0022`: `id`, `created_at` — `EVD-E2-4-<ts>-01.txt` | `E2.4` | | | | | — | Absence reported as "no ledger row", **not** as "not applied"; presence reported with `id` + `created_at` | `PENDING` (not received) | — | B-02 |
| B5 | staging | Append-only observation + method (no row updated or deleted) — `EVD-E2-5-<ts>-01.md` | `E2.5` | | | | | — | Statement of the method used (single snapshot, audit trail, or tooling review) and its limits; ledger write path reviewed | `PENDING` (not received) | — | B-02 |
| C1 | staging | `0019`: `face_enrollment_templates.key_version` — `column_default`, `is_nullable`, `data_type` — `EVD-E3-1-<ts>-01.txt` | `T3` / §7 TS-S4 | | | | | — | DEFAULT present ⇒ 0019 DDL likely **not** applied (classification input only) | `PENDING` (not received) | — | B-03 |
| C2 | staging | `0020`: `users.must_change_password`, `password_changed_at`, `last_login_at` — types/defaults/nullability — `EVD-E3-2-<ts>-01.txt` | `T4` / §7 TS-S4 | | | | | — | Contract: `boolean NOT NULL DEFAULT false`, `timestamptz NULL`, `timestamptz NULL` | `PENDING` (not received) | — | B-03 |
| C3 | staging | `0021`: 3 control-plane tables + 6 declared indexes + FK actions (`organization_id`/`employee_id` RESTRICT, `*_user_id` SET NULL) — `EVD-E3-3-<ts>-01.txt` | `T5` | | | | | — | All 3 tables and all 6 indexes enumerated; FK actions compared with the declared contract | `PENDING` (not received) | — | B-03 |
| C4 | staging | `0022`: 11 PROTECTED tables — `employee_id` nullability, FK `confdeltype`, `<table>_retained_identity_check` — `EVD-E3-4-<ts>-01.txt` | `T6` / §7 TS-S6 | | | | | — | All 11 rows present; `confdeltype` must be `'n'` (SET NULL); CHECK present on each | `PENDING` (not received) | — | B-03 |
| C5 | staging | Snapshot-column inventory on PROTECTED tables (`employee_number_snapshot`, `employee_name_snapshot`, `birth_date_snapshot`) — `EVD-E3-4-SNAP-<ts>-01.txt` | `T7` | | | | | — | Compared with the §1.3 contract (pre-state: payslips number+birth; payroll_items number+name) | `PENDING` (not received) | — | B-03 |
| C6 | staging | Full employee-FK scan on PROTECTED tables (unexpected CASCADE detection) — `EVD-E3-4-FK-<ts>-01.txt` | `T9` / §7 TS-S7 | | | | | — | Every FK definition attached; no `ON DELETE CASCADE` anywhere in the set | `PENDING` (not received) | — | B-03 |
| C7 | staging | Full application table inventory (classification input) — `EVD-E3-5-<ts>-01.csv` | `T8` / §7 TS-S8 | | | | | — | Every object classified `expected-approved` / `production-only` / `repository-only` / `unexplained` | `PENDING` (not received) | — | B-03 |
| C8 | staging | Live-but-unledgered object list (the `0015`/`0016` pattern) — `EVD-E3-6-<ts>-01.txt` | cross-check B1 vs C7 | | | | | — | Recorded as an **observation** with ticket reference; ledger is never edited to "fix" it | `PENDING` (not received) | — | B-03 |
| C9 | staging | Pre-apply BEFORE contract capture (protected FKs RESTRICT + NOT NULL, zero retained-identity CHECKs, snapshot inventory, deletable FKs RESTRICT) — `EVD-E3-4-PRE-<ts>-01.txt` | runbook §5.5 (queries 1–4) / §7 TS-S9 | | | | | — | 11 protected FKs `r` + `attnotnull = true`; `0` retained-identity CHECK rows; 11 deletable FKs `r`; snapshot inventory attached as the pre-state baseline | `PENDING` (not received) | — | B-03 |
| D1 | staging | Column confirmation for staging (same raw capture as C2, registered separately for the intake row) — `EVD-E4-1-<ts>-01.txt` | `T4` / §7 TS-S4 | | | | | — | Result is one of: columns exist with declared types/defaults, or columns absent | `PENDING` (not received) | — | B-04 |
| D2 | staging | Deployed staging build ID / release record — `EVD-E4-2-<ts>-01.md` | release/CI record; `E4.2` | | | | | R5 | Build ID pinned to a commit SHA; record attached; build identified unambiguously for staging | `PENDING` (not received) | — | B-04 |
| D3 | staging | Does the deployed staging build read `users.must_change_password`? — `EVD-E4-3-<ts>-01.md` | `E4.3`; repository read paths (`lib/auth/auth.ts` `requireUser`, employee-import path) + the pinned build from D2 | | | | | — | Read path confirmed against the **pinned** build, not against an arbitrary working tree | `PENDING` (not received) | — | B-04 |
| D4 | staging | Read-only value distribution of `must_change_password` (counts by value only) — `EVD-E4-4-<ts>-01.txt` | `E4.4`; §7 TS-S5 | | | | | P1 | Aggregate counts only; consistency statement; no row-level values | `PENDING` (not received) | — | B-04 |
| D5 | staging | `G1` staging disposition record: `routine` / `not-yet-deployed` / `incident` — `EVD-G1-DISP-<ts>-01.md` | intake §5 `G1` (staging row) | | | | | — | Disposition is exactly one of the three; decided by both roles; UTC timestamp + evidence refs D1–D4 recorded | `PENDING` (not received) | — | B-04 |
| E1 | staging | Staging live `max(created_at)` + candidate safe repair `when` with the arithmetic shown — `EVD-LIN-1-<ts>-01.md` | B2 + §7 TS-S3 #3; lineage plan §1.5/§10 | | | | | — | Candidate `when` is **strictly greater** than the live staging max (`max + 1`); epoch-ms unit and UTC rendering both stated; calculation visible in the artifact | `PENDING` (not received) | — | B-05 |
| E2 | staging | Append-only + hash-anchor confirmation for staging: `0019`–`0022` hashes match the §0 anchors or have no ledger row — `EVD-LIN-2-<ts>-01.md` | B3 + B4 + §0 anchors | | | | | — | Per-migration table: ledger row present/absent, hash observed, anchor match yes/no | `PENDING` (not received) | — | B-05 |
| E3 | staging | Staging application-status classification of `0019`–`0022` (`applied` / `not applied` / `unexplained`) from **ledger plus catalog** — `EVD-LIN-3-<ts>-01.md` | inputs B1–B5 + C1–C7 | | | | | — | Each of the 4 rows cites **both** ledger evidence and catalog evidence; zero objects left `unexplained` | `PENDING` (not received) | — | B-05 |
| E4 | staging | Snapshot-chain disposition recorded for staging (duplicate `0011` prefix; dangling `0012` `prevId`; broken `0012`–`0014` chain; missing snapshots for idx 15–19) — `EVD-LIN-4-<ts>-01.md` | lineage plan §1.2 (REPOSITORY FACT) + intake §5 `G3` | | | | | — | Disposition written into the approved reconciliation artifact and cited here; explicitly labelled **repository fact**, not live evidence | `PENDING` (not received) | — | B-05 |
| E5 | staging | DBA-held checksums for `0015`–`0022` (independent of the repository) — `EVD-E6-1-<ts>-01.txt` | `E6.1` | | | | | — | DBA's own records compared against the §0 anchors; differences reported rather than reconciled silently | `PENDING` (not received) | — | B-05 |
| E6 | staging | Lineage assessment acceptance for **staging** (the `A7` record) — `EVD-A7-ACCEPT-<ts>-01.md` | lineage plan §3 evidence; `A7`; intake §7.1.2 | | | | | — | Acceptance cites E1–E5; states explicitly that production's ledger was **not** consulted | `PENDING` (not received) | — | B-05 |
| F1 | staging | Most recent verified staging backup: label, UTC capture time, storage location (redacted), retention, manifest + SHA-256 — `EVD-E5-1-<ts>-01.md` | `E5.1`; master §B.2; runbook §5.3 label `<ENVIRONMENT>-db-<YYYYMMDD>T<HHMMSS>Z-pre-0022` | | | | | R6 | Label pattern matches; SHA-256 recomputed after transfer and equal to the manifest; ledger identifier at backup time recorded (B1 ref) | `PENDING` (not received) | — | B-06 |
| F2 | staging | Backup verification output (checksum / platform verification log) — `EVD-E5-2-<ts>-01.log` | `E5.2`; master §B.3 | | | | | R6 | Platform marks the backup **complete, not queued**; WAL continuity checked where applicable; SHA-256 compared post-transfer | `PENDING` (not received) | — | B-06 |
| F3 | staging | Restore test into an **isolated disposable** database: restore log, target identity, row-count/checksum reconciliation, duration — `EVD-E5-3-<ts>-01.log` | `E5.3`; master §B.4; runbook §5.3 | | | | | R6 | Restore exit status 0 with no owner/privilege/extension errors; target identity captured and proven **disposable + isolated** (not live staging, not production); row counts reconciled; disposable DB dropped or left read-only; `pg_isready` + identity query attached | `PENDING` (not received) | — | B-06 |
| F4 | staging | PITR posture: `wal_level`, `archive_mode`, tool, retention, RPO/RTO — or an explicit "staging is restore-only" statement — `EVD-E5-4-<ts>-01.txt` | `T10` + §7 TS-S10 + external backup records | | | | | R7 | Values captured read-only; posture stated unambiguously (restore-only is acceptable for staging **if stated explicitly**) | `PENDING` (not received) | — | B-06 |
| F5 | staging | Private-file storage backup + restore verification (manifest: relative path, size, SHA-256; counts of referenced/missing/orphan/path-escape files) — `EVD-E5-5-<ts>-01.md` | `E5.5`; master §B.6/§B.7 | | | | | P2 | Restored into `<STAGING_PRIVATE_ROOT>` only; staging service account cannot traverse the production root; payslip size + SHA-256 reconciled with `payslip_documents`/`payslip_document_versions`; employee-document external manifest produced; orphans **quarantined, never deleted** | `PENDING` (not received) | — | B-06 |
| F6 | staging | Explicit statement: does a restore-tested backup exist for staging? (yes + F1–F3 refs, or NO) — `EVD-E5-6-<ts>-01.md` | `E5.6` | | | | | — | Unambiguous yes with references, or explicit NO | `PENDING` (not received) | — | B-06 |
| G1 | staging | Staging deployment record / release manifest / CI build ID pinned to the reviewed commit — `EVD-E6-2-<ts>-01.md` | `E6.2` + `E4.2` | | | | | R5 | Build ID ↔ commit SHA ↔ artifact checksum table complete for staging | `PENDING` (not received) | — | B-07, B-09, B-14 |
| G2 | staging | Fixed deployment order record: **migration first**, then the compatible build; no application deployment before §5.5 and §5.8 checks are recorded — `EVD-ORD-A8-<ts>-01.md` | runbook §3; `A8` | | | | | — | Order written as explicit steps in the change record; backward-compatibility rationale recorded | `PENDING` (not received) | — | B-07, B-09, B-14 |
| G3 | staging | Control-plane disabled evidence: `DELETION_EXECUTION_ENABLED = false`, `RETENTION_ELIGIBLE_CATEGORIES = []` with config + test output — `EVD-A14-<ts>-01.md` | `A14`; `features/employees/deletion-control-policy.ts` (false / `[]`); `tests/employees/employee-deletion-controls.test.ts` | | | | | — | Both values recorded from the pinned build **and** the test run output attached (repository value alone is not sufficient for the gate) | `PENDING` (not received) | — | B-07, B-09, B-14 |
| G4 | staging | Repository-side preflight checksums + commit SHA for `0019`–`0022` and `_journal.json` — `EVD-A6-REPO-<ts>-01.txt` | runbook §5.1/§5.4; `A6` (repository part) | | | | | — | Recomputed values equal the §0 anchors (already re-verified read-only 2026-10-16); the **gate** still requires the recorded, in-rehearsal DBA re-verification against `724db82d…65c` | `PENDING` (not received) | — | B-07, B-09, B-14 |
| G5 | staging | Compatibility statement for the pinned build: which new snapshot columns the build reads/writes, and why the migration must precede it — `EVD-COMPAT-<ts>-01.md` | runbook §3; change review §2.5/§3 | | | | | — | Statement names the pinned build (G1) and the code paths that reference `employeeNameSnapshot`; pre-0022 fail-closed behaviour (`23503`) recorded | `PENDING` (not received) | — | B-07, B-09, B-14 |
| G6 | staging | Cross-reference of A7 (deployment-controller review) as applied to the application deploy path — `EVD-E6-4-G-<ts>-01.md` | `E6.4`; master §G.2 (same capture as A7, cited here) | | | | | R1, R5 | Cites artifact A7 rather than restating it; confirms no deploy job applies schema changes | `PENDING` (not received) | — | B-07, B-09, B-14 |
| H1 | staging | Evidence-capture plan + STOP-condition acknowledgement (`A11`) — `EVD-A11-ACK-<ts>-01.md` | runbook §5.10 + §7; intake §5 | | | | | — | Both roles acknowledge the evidence list (§3) and the STOP list (§4 below) in the change record | `PENDING` (not received) | — | B-10, B-13 |
| H2 | staging | Synthetic-data attestation (`A13`): synthetic employees only, no production PII in staging evidence — `EVD-A13-ATTEST-<ts>-01.md` | runbook §0 rule 7 (`§0.7`); `A13` (source corrected 2026-10-16 — see coordination §2.2 / response-templates §1.3 F-04) | | | | | P1, P2 | Explicit statement that no production PII entered any staging artifact; any PII found triggers redaction + re-capture | `PENDING` (not received) | — | B-10, B-13 |
| H3 | staging | Change record header (ID, window, rollback owner, incident commander) and rehearsal definitions (`A3`, `A9`, `A10`) — `EVD-CR-A3-<ts>-01.md` | master §A.1; runbook §5.7/§5.8; `A3`/`A9`/`A10` | | | | | — | Change record opened with all four fields; §5.7 Test A/B/C plan and §5.8 assertions referenced and accepted | `PENDING` (not received) | — | B-10, B-13 |

**Register totals:** 47 rows requested · 0 received · 0 `CONFIRMED` ·
0 `NOT CONFIRMED` · 0 `UNAVAILABLE` · 47 `PENDING`.

---

## 4. Received-artifact log (checksum / file identity)

One row **per returned file**. Fill only when the artifact is physically
received through the approved restricted-access channel (never via Git, chat, or
a broadly shared folder — pack §1 rule 6). No file has been received.

| Evidence ref (filename) | Artifact ID | Env | Received (UTC) | Channel | File type / size | SHA-256 | Redaction verified (§5) | Reviewer ≠ collector | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _(none received)_ | | | | | | | | | |

Rules for this log:
1. Recompute SHA-256 on receipt and record it; compare against the DBA-reported
   checksum. A mismatch is a STOP (pack §1 rule 9) — do not reconcile silently.
2. Filenames must match the pack pattern; a mislabelled or environment-ambiguous
   artifact is rejected (audit observation O1 is exactly this defect).
3. The collector may not also be the reviewer (pack §9: result recorded by the
   reviewer, **never** by the collector alone).
4. PII/secret-bearing artifacts are handled per §5 below before entry.

---

## 5. Secret / PII handling (secure channel and reduction)

Per pack §1 rule 7 and §5, evidence containing secrets, connection strings, or
unnecessary PII is a STOP if submitted as-is: **redact and re-capture**. The
following artifacts carry a redaction code and **must** be sent through the
approved secure evidence channel, not attached to this register or any ticket.

| Code | Applies to | Must be redacted | Reviewer |
| --- | --- | --- | --- |
| `R1` | `A1`, `A3`, `A7`, `G6` | Connection strings, host/IP/port/account detail beyond host class/cluster role; secrets in job/CI config | DBA |
| `R2` | `A2`, `A4` | Endpoint only as host class + cluster role (incl. `inet_server_addr()`/`inet_server_port()` from `T1`) | DBA |
| `R3` | `A5` | Password hashes/attributes, credentials, personal identifiers of role holders; role **names and grants only** | DBA |
| `R4` | `A6` | Value of `STAGING_DATABASE_URL` and any connection URL; only variable name, guard-result, host class | operator + DBA |
| `R5` | `A7`, `D2`, `G1`, `G6` | Internal URLs, tokens, API keys, CI secrets in release/deployment records | Application Lead |
| `R6` | `F1`, `F2`, `F3`, `A4` | Storage locations/bucket/cluster names/file paths reduced to approved redacted form; dump **contents never transferred** — manifest + SHA-256 + logs only | DBA |
| `R7` | `F4` | `archive_command` and any command line embedding credentials/hosts/key paths | DBA |
| `P1` | `D4`, `H2` | Aggregate counts only; **no** row-level values, no user/employee identifiers, no per-person `must_change_password` values | DBA |
| `P2` | `F5`, `H2` | File manifests: relative paths, sizes, SHA-256 only; **no** contents, no decrypted payslips, no employee names/document text; payslip passwords never logged | DBA + Application Lead |

Additional handling rules:
1. **Secure channel:** raw `R*`/`P*` artifacts go only to the approved
   restricted-access evidence location and are transferred over the approved
   secure channel (pack §1 rule 6, §6.8). They are never committed to Git or
   pasted into chat.
2. **Redaction before receipt:** the *submitting* role applies the code and
   records it; the *reviewer* confirms the code was applied. A redaction failure
   is an evidence-hygiene STOP (pack §4.11).
3. **No secrets in this register:** this register records only artifact IDs,
   filenames, checksums, and non-sensitive labels. It must never contain a
   secret, connection string, or raw PII.
4. **Minimum PII:** no employee names, numbers, birth dates, or other personal
   data in any artifact unless the item explicitly demands them and then only as
   counts.

---

## 6. Blocker status (B-01–B-15)

Fourteen of the fifteen blockers remain `OPEN`; `B-12` is `CLOSED` by the
documentation corrective action (runbook §1.4 claim withdrawn, 2026-10-16). No
`OPEN` blocker may close without the raw artifacts named in the pack; closing
requires the cited artifacts to be `CONFIRMED` on the staging register.

| ID | Blocker (from pack §4) | Source | Closed by | Owner | Intake status |
| --- | --- | --- | --- | --- | --- |
| B-01 | Staging environment identity and isolation unproven (no environment-identity capture, no isolation-matrix attestation) | audit `G5-S`, `A4` | A1–A5, A7 | DBA + Application Lead | `OPEN` (unchanged) |
| B-02 | No live staging ledger capture (rows, count, min/max `created_at`, hash mapping, append-only) | audit `G2-S`, `G3-S` | B1–B5 | DBA | `OPEN` (unchanged) |
| B-03 | No live staging catalog capture for `0019`–`0022`; classification impossible | audit `G1-S`, `G2-S` | C1–C9, E3 | DBA + Application Lead | `OPEN` (unchanged) |
| B-04 | `0020` staging state unverified; no identified staging build/release ID | audit `G1-S`; handoff §2 | D1–D5, G1 | DBA + Application Lead | `OPEN` (unchanged) |
| B-05 | Staging live max ledger `created_at` unknown ⇒ safe repair `when` not computable; snapshot-chain disposition unrecorded | audit `G3-S`, `A7` | E1, E4, E6 (with B1/B2) | DBA + Application Lead | `OPEN` (unchanged) |
| B-06 | No staging backup manifest/checksum, no restore test into an isolated disposable DB, no PITR posture, no private-file restore | audit `G4-S`, `A5` | F1–F6 | DBA | `OPEN` (unchanged) |
| B-07 | Compatible build not pinned; deploy order (migration first) not fixed | audit `A8` | G1, G2, G5 | Application Lead | `OPEN` (unchanged) |
| B-08 | Staging guard not attested for the rehearsal shell (`HRIS_ENV`, `STAGING_DATABASE_URL`, no `DATABASE_URL` fallback) | audit `A12` | A6 | operator + DBA | `OPEN` (unchanged) |
| B-09 | Control plane disabled state not evidenced as recorded config + test output (repo value alone insufficient) | audit `A14` | G3 | Application Lead | `OPEN` (unchanged) |
| B-10 | Change record absent (ID, window, rollback owner, incident commander); §5.7 rollback plan and §5.8 reporting validation not recorded/accepted | audit `A3`, `A9`, `A10`, `A11` | H1, H3 | DBA + Application Lead | `OPEN` (unchanged) |
| B-11 | Part A authorizations absent (`A1` DBA, `A2` Application Lead) | audit `A1`, `A2` | none — **last**, only after B-01…B-10 are evidenced | DBA + Application Lead | `OPEN` (unchanged) |
| B-12 | Runbook §1.4 claim "Migration inspected against the PostgreSQL catalog (read-only) — done (parent task)" has no artifact and no environment label (audit observation O1) | audit §1.1 O1 | replace with a labelled C-group artifact (staging or production, as applicable) **or remove the claim** | Application Lead | `CLOSED` (documentation corrective action, 2026-10-16: claim withdrawn; no gate advanced — live catalog evidence remains required via `C1`–`C9` for `B-03`/`G1-S`/`G2-S`) |
| B-13 | Synthetic-data / no-production-PII attestation absent | audit `A13` | H2 | operator + DBA | `OPEN` (unchanged) |
| B-14 | `A6` in-rehearsal DBA checksum re-verification not recorded (repository value matches, gate still open) | audit `A6` | G4 + DBA re-verification at rehearsal time (runbook §5.4) | DBA | `OPEN` (unchanged) |
| B-15 | Runtime idempotency and rollback remain **UNPROVEN** (static review only) | change review §4/§5; runbook §2 | rehearsal §5.6/§5.7 — **not part of this pack** | DBA | `OPEN` (unchanged) |

`B-11` (Part A authorizations `A1`/`A2`) closes **last**, only after `B-01`…`B-10`
are evidenced. `B-15` (runtime idempotency/rollback) is out of scope of the pack
and remains `OPEN`; it is closed only by rehearsal §5.6/§5.7, which is **not**
authorized here.

---

## 7. Gate and Part A status (unchanged)

| Gate | Scope | Intake status |
| --- | --- | --- |
| `G1-S` | `0020` staging security/operational disposition | `BLOCKED` / `PENDING` |
| `G2-S` | `0019`–`0022` staging application status, zero `unexplained` | `BLOCKED` / `PENDING` |
| `G3-S` | staging ledger/snapshot reconciliation | `BLOCKED` / `PENDING` |
| `G4-S` | staging backup + disposable-DB restore | `BLOCKED` / `PENDING` |
| `G5-S` | staging isolation | `BLOCKED` / `PENDING` |

Part A (`A1`–`A14`): all `PENDING`. **No gate is `PASS`.** Production gates
`G1-P`–`G4-P` and Part B remain separate and unchanged; they do not gate an
isolated staging rehearsal and are not advanced here.

---

## 8. Receipt and decision worksheet

### 8.1 Per-artifact receipt line (one per returned item)

| Field | Value |
| --- | --- |
| Artifact ID | |
| Evidence ref (filename) | |
| Env / DB name | |
| Captured (UTC) / TZ | |
| Collector | |
| Reviewer (≠ collector) | |
| SHA-256 / file identity | |
| Redaction code applied | |
| Contract checked against | |
| Result (`CONFIRMED`/`NOT CONFIRMED`/`UNAVAILABLE`/`PENDING`) | |
| Discrepancy / STOP ref | |
| Follow-up / owner | |

### 8.2 Formal approval record (gates the rehearsal)

A staging rehearsal may be considered **only** after every staging gate
`G1-S`–`G5-S` is `PASS` against attached artifacts **and** the following formal
approvals are recorded in the change record. No rehearsal is run by this
register.

| Approval | Role | Ref | UTC | Recorded? |
| --- | --- | --- | --- | --- |
| DBA authorization (`A1`) | DBA | | | ☐ |
| Application Lead authorization (`A2`) | Application Lead | | | ☐ |
| Change record ID / window / rollback owner / incident commander (`A3`/`H3`) | DBA + Application Lead | | | ☐ |
| Evidence + STOP acknowledgement (`A11`/`H1`) | DBA + Application Lead | | | ☐ |

**Rule:** a staging `PASS`, when someday achieved, authorizes only "0022
rehearsed on staging"; it authorizes **nothing** for production (pack §6.7,
intake §7.1).

---

## 9. Disposition report (this intake)

As of 2026-10-16, with no artifacts returned:

| Category | Count | Items |
| --- | ---: | --- |
| **Valid (received & `CONFIRMED`)** | 0 | — |
| **Rejected (`NOT CONFIRMED` / redaction fail / mislabelled)** | 0 | — |
| **Unavailable (`UNAVAILABLE`)** | 0 | — |
| **Not received (`PENDING`)** | 47 | `A1`–`A7`, `B1`–`B5`, `C1`–`C9`, `D1`–`D5`, `E1`–`E6`, `F1`–`F6`, `G1`–`G6`, `H1`–`H3` |
| **Blockers remaining `OPEN`** | 14 | `B-01`–`B-11`, `B-13`–`B-15` (`B-12` `CLOSED` by documentation corrective action) |

There are **no valid artifacts and no rejected artifacts** because none has been
received. The database state of staging is **not** reported and **not** inferable
from this register or from the repository (pack §0 rule; intake §0 rule 2).

---

## 10. Explicit non-actions in producing this register

- **No database was contacted; no query was executed** — read-only or otherwise.
  The `TS-S1`–`TS-S10` templates remain proposals for DBA review only.
- **No migration was run, generated, pushed, applied, or journaled.** No
  `_journal.json`, snapshot, ledger, schema, or environment configuration was
  modified.
- **No seed, deployment, RBAC seeding, or employee record was created, modified,
  or deleted.** `DELETION_EXECUTION_ENABLED` remains `false`;
  `RETENTION_ELIGIBLE_CATEGORIES` remains `[]`.
- **No secret, `.env.production`, connection string, or production endpoint was
  read or guessed.**
- **No existing working-tree change was reverted, reset, stashed, or
  overwritten**; all prior work products are preserved.
- **No result was fabricated.** Every artifact is `PENDING` (not received);
  every blocker is `OPEN` except `B-12` (closed by a documentation corrective
  action that withdrew an unsupported claim); every gate is `BLOCKED`; no `PASS`
  was assigned from repository facts.
- **No rehearsal was started or authorized.**

---

## 11. FASE 2 repository-side findings (read-only, 2026-10-16)

Method: read-only inspection of the repository (`/opt/hris`, git `main`, working
tree). No database was contacted, no query executed, no secret / `.env.production`
/ connection string read or printed. These are **repository facts and code/test
results**, not live staging evidence; they close no gate by themselves.

| # | Finding | Where verified | Effect on staging gates |
| --- | --- | --- | --- |
| R-1 | The application has **no `STAGING_DATABASE_URL` concept**. `db/index.ts` resolves the single secret `databaseUrl` via `lib/config/credentials.ts` (systemd credential `database_url` preferred, then env `DATABASE_URL`) and `lib/config/env.ts`. The runbook §5.0 `STAGING_DATABASE_URL` guard is a **shell/psql convention for the rehearsal operator**, not an app-enforced guard. | `db/index.ts:37`, `lib/config/credentials.ts:62-78`, `lib/config/env.ts:25-53` | Isolation of the migration path rests on the guarded shell (`A6`/`A12`) plus cluster/DB/role/secret separation (`A2`/`A4`/`A5`); isolation of the *application* rests on the deployed credential/`DATABASE_URL` pointing only at staging. None is attested → `A6`/`G5-S` stay `PENDING`. No code fallback from staging to production exists; the risk is provisioning, to be evidenced. |
| R-2 | **No automatic migration path in the repository.** The only `db:migrate` entry point is the `package.json` script; there is no systemd unit/timer or CI step that runs a migration. `.github/workflows/deploy.yml` delegates to the external `/usr/local/sbin/hris-deploy` (root-owned, mode 750, not readable by this account and outside the repo), so it could not be reviewed here. | `package.json:27`, `.github/workflows/deploy.yml:46` | `E6.4`/`A7` deployment-controller review remains required from the DBA/Application Lead; `A7` stays `PENDING`. |
| R-3 | Control plane confirmed disabled in source: `DELETION_EXECUTION_ENABLED = false`, `RETENTION_ELIGIBLE_CATEGORIES = []`. | `features/employees/deletion-control-policy.ts:79,100` | `A14` still requires recorded config + test output from the pinned build (`B-09` open); source value alone is not the gate. |
| R-4 | Repository lineage facts re-confirmed: `_journal.json` = 20 entries (last `0018_employee_custom_tabs`); snapshots present `0000`–`0014` (15 files). | `db/migrations/meta/_journal.json`, `db/migrations/meta/*_snapshot.json` | Repository fact only; live staging ledger/catalog (`B1`–`B5`, `C1`–`C9`) still required. |
| R-5 | Build-compatibility surface exists: client/server code and Drizzle schema reference the new snapshot columns (`employeeNameSnapshot`, `employee_number_snapshot`, …). | `features/**`, `app/**`, `db/schema/**`, `tests/employees/employee-retention-detach.test.ts` | A named compatibility statement (`G5`) from the Application Lead is still required; build pinning (`G1`) open. |
| R-6 | Static verification re-run 2026-10-16 with real results: `npx tsc --noEmit` **clean**; `npm run lint` **0 errors / 15 warnings** (pre-existing); targeted employee tests **257 pass / 0 fail**; full `npm test` **1,933 pass / 0 fail**. | this worktree | Code/test facts only. Runtime idempotency/rollback (`B-15`) remains **UNPROVEN**; no runtime claim is made. |

**Halt record (FASE 2).** Progress toward the rehearsal is **halted**: no live
staging artifact (`A1`–`H3`) has been received, so `G1-S`–`G5-S` remain
`BLOCKED`, all 47 intake rows remain `PENDING`, and `A1`–`A14` remain `PENDING`.
No rehearsal, apply, backup, restore test, journaling, or employee deletion was
performed or authorized.

**Action request (owners, until halted).** The concrete request and return
format are pack §8 (dependency-ordered action order) and pack §9 (return
format); the DBA/Application Lead return checklist is handoff §8. First actions:
open the change record (`H3`/`A3`); capture environment identity/isolation
(`A1`–`A7`, incl. the `A6` guard attestation for R-1); capture the ledger and
`0019`–`0022` catalog (`B1`–`B5`, `C1`–`C9`); pin the staging build (`G1`) and
record the deploy order (`G2`).

## 12. Conclusion

**Conclusion:** the pack is internally consistent for its 47 artifacts, 15
blockers, and 10 templates; the documentation findings D-01…D-04 were corrected
in the pack and the structural gap D-05 is closed by this register, with no
change to control scope. Six read-only repository-side findings (R-1…R-6) were
recorded in §11; they close no gate. **No staging evidence has been received**,
so all 47 intake rows stay `PENDING`, 14 blockers stay `OPEN` (`B-12` closed by
the documentation corrective action), and all staging gates stay `BLOCKED`. The
rehearsal remains unauthorized pending verified staging evidence and recorded
DBA + Application Lead approval (`§8.2`).

---

## 13. Revalidation note (2026-10-20, read-only; no row advanced)

**Trigger:** the operator asserted that all required approvals for the `0022`
release had been granted. Verified against actual records per the release
procedure (operator confirmation authorizes verification only; it is not
evidence).

**Verification result (2026-10-20 ~01:05 UTC):**

- **Artifacts received: 0.** No `EVD-*` file exists anywhere on this host
  (full-filesystem search). All 47 rows (`A1`–`H3`) remain `PENDING`; the
  §4 received-artifact log remains empty; totals in §9 are unchanged.
- **Approvals recorded: none.** Approval checklist Part A `A1`–`A14` and
  Part B `B1`–`B13` all ☐; policy §4 sign-off ☐ pending; no change record
  (no ticket/change ID exists to cite on any artifact).
- **Independent review: none recorded**; no collector/reviewer identities
  exist for any row.
- **Blockers: 14 `OPEN`** (`B-01`–`B-11`, `B-13`–`B-15`); `B-12` stays
  `CLOSED` (documentation corrective action). `B-15` (runtime
  idempotency/rollback) remains unproven — **no rehearsal has been executed**.
- **Operator-side read-only observations (NOT gate evidence):** production
  DB confirmed as `hris` @ `127.0.0.1:5432` (credential redacted), ledger 18
  rows / max `created_at` 2026-09-29T05:54:14Z, `0019`+`0020` columns present
  out-of-band, `0021` tables and `0022` retained-identity CHECKs absent;
  `0022` checksum re-verified = `724db82d…65c`; deployed build
  `J5cpppAYMdIb8Q5QViGP9` @ `e735f47` healthy. These facts inform the DBA /
  Application Lead captures; the live evidence rows remain theirs to return
  through the official restricted-access channel with a named reviewer.

**Disposition: the operator's approval assertion is recorded as `NOT
CONFIRMED` against the register** (no artifact, no approval record, no change
record). Nothing in this register changed state: 0 received / 0 `CONFIRMED` /
47 `PENDING`; gates `G1-S`–`G5-S` `BLOCKED`; Part A `PENDING`; production
gates and Part B unchanged and separate. The evidence request (pack §2/§8,
dispatch preparation §4 messages M-1…M-5) remains outstanding; the release is
stopped at the production gate pending the artifacts and recorded approvals
named above.
