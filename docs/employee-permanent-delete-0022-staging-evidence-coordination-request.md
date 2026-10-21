# Migration 0022 — Formal Staging Evidence Request & Coordination Package (A1–H3)

**Document type:** FORMAL EVIDENCE REQUEST (coordination dispatch) — **staging
scope only**. It is **not** an approval, a change record, a verification result,
or an execution instruction. It authorizes nothing and must not be read as one.

**Status:** OPEN — dispatchable, **no evidence received**. All **47** artifacts
(`A1`–`H3`) are `PENDING`, all staging gates (`G1-S`–`G5-S`) are `BLOCKED`, all
Part A rows (`A1`–`A14`) are `PENDING` ☐. **No artifact is `CONFIRMED`; no gate
is `PASS`.**

**Date prepared:** 2026-10-16
**Repository:** `/opt/hris` (git `main`, working tree; no commit made)

**Revision 2026-10-16 (navigational corrections, no state change).** Findings
`F-01`–`F-03` recorded in
`docs/employee-permanent-delete-0022-staging-evidence-response-templates.md` §1.3
are applied here: §2.2 intake references now name
`docs/employee-permanent-delete-dba-evidence-intake.md` explicitly; §2.5 lists
`A7` in the DBA reviewer row (it carries `R1`, and also `R5`); §2.6 annotates
`D1` as an **indirect** `§4.4` trigger (via `D3`/`D5`). Finding `F-04` (added
2026-10-16, FASE 1) corrects the `H2` source in §2.2 and qualifies the `A13`
evidence cell in §4: the synthetic-data rule is `runbook §0 rule 7` (`§0.7`),
not "intake §0 rule 7". No artifact count, owner slice, status, blocker, gate,
or Part A state is changed by these corrections.

**Revision 2026-10-19 (redaction-coverage corrections, no state change).**
Findings `F-05`/`F-06` recorded in
`docs/employee-permanent-delete-0022-staging-evidence-response-templates.md` §1.3
are applied: §2.5 DBA reviewer row parenthetical now includes `R4` (the code
under which `A6` sits in that row), and the `G6` redaction cells in the pack §2.G
row and the staging intake register §3 row now read `R1, R5`, matching the
authoritative redaction register (pack §5, register §5, §2.4 above). No artifact
count, owner slice, status, blocker, gate, or Part A state is changed.

**Addressees:** **DBA** (primary collector) and **Application Lead** (primary
collector/classifier); **rehearsal operator** for the two operator-owned
attestations (`A6`, `H2`).

**Built from (unchanged, this package only references them):**

| Source document | Role in this package |
| --- | --- |
| `docs/employee-permanent-delete-0022-staging-evidence-request-pack.md` (the pack) | Authoritative artifact rows: ID, source, owner, verification method, stop condition, redaction |
| `docs/employee-permanent-delete-0022-staging-evidence-intake-register.md` (intake) | Receiving side: per-row `Env`/`Captured (UTC)`/`Collector`/`Reviewer`/`Checksum`/`Result`, receipt and approval worksheets |
| `docs/employee-permanent-delete-0022-staging-readiness-audit.md` (audit) | Gate matrix, stop conditions, dependency order |
| `docs/employee-permanent-delete-dba-handoff.md` (handoff) | Labeling, storage, redaction, approval path §7, DBA return checklist §8 |
| `docs/employee-permanent-delete-0022-approval-checklist.md` (checklist) | Part A `A1`–`A14`, Part B `B1`–`B13`, Part C stop conditions |

> **Hard boundary observed in producing this package.** No database was
> contacted and **no query was executed**. No migration, seed, deployment,
> journal, snapshot, ledger, schema, configuration, or employee record was run,
> read, or changed. No secret, `.env.production`, or connection string was read
> or guessed. No existing document was modified, no `PENDING` row was advanced,
> no gate was set to `PASS`, and **no rehearsal was started or authorized**.
> Control plane unchanged: `DELETION_EXECUTION_ENABLED = false`,
> `RETENTION_ELIGIBLE_CATEGORIES = []`.

---

## 0. Purpose and scope

The pack defines *what* is requested and the intake register defines *how* it is
received. This package is the **dispatch layer**: one formal request that (i)
addresses both owners in a single packet, (ii) groups the same 47 artifacts by
**owner, source, artifact format, redaction, reviewer, and stop condition** so
each party can act on its own slice without re-reading the pack, (iii) fixes the
rules by which status is recorded without any `PENDING` becoming `CONFIRMED`
before verification, (iv) carries the Part A `A1`–`A14` review checklist and the
approval record to be signed, and (v) keeps production Part B `B1`–`B13`
explicitly outside this request.

**In scope:** staging evidence collection only; artifacts `A1`–`H3` (47);
blockers `B-01`–`B-15`; Part A `A1`–`A14` (recorded later, listed here as the
review checklist); redaction codes `R1`–`R7`, `P1`, `P2`; templates
`TS-S1`–`TS-S10` and base `T1`–`T10`.

**Out of scope (unchanged by this package):** every production evidence row,
gates `G1-P`–`G4-P`, Part B `B1`–`B13`, policy §4 retention sign-off, any
apply/rehearsal, any `generate`/`push`, journal or ledger edit, seed, deployment,
or employee deletion.

---

## 1. Parties that must act

| Party | Must do | Artifacts | Blocking effect |
| --- | --- | --- | --- |
| **DBA** | Open/own the change record jointly; capture every read-only staging artifact below in the approved channel; apply redaction before submission; complete the handoff §8 return checklist (per group, `DONE`/`PARTIAL`/`UNAVAILABLE`/`DISCREPANCY`); re-verify `0022 = 724db82d…65c` at rehearsal time (`A6`/`B-14`) | sole: 27 (`A1`,`A2`,`A3`,`A5`,`A7`,`B1`,`B2`,`B4`,`B5`,`C1`–`C6`,`C9`,`D1`,`D4`,`E2`,`E5`,`F1`–`F6`,`G6`); joint: 11 | Closes `B-02`, `B-06`; co-closes `B-01`,`B-03`,`B-04`,`B-05`,`B-10`,`B-13` |
| **Application Lead** | Classify every catalog object (`C7`, `C8`); pin the staging build and fix migration-first order; supply release/deploy records and compatibility statement; record control-plane config + test evidence; jointly decide the `G1` disposition; own `A2` authorization | sole: 7 (`D2`,`D3`,`G1`,`G2`,`G3`,`G4`,`G5`); joint: 11 | Closes `B-07`, `B-09`; co-closes the rest |
| **Rehearsal operator** | Attest the rehearsal-shell guard (`A6`) and synthetic-data / no-production-PII status (`H2`) | `A6`, `H2` | Closes `B-08`, `B-13` (with reviewers) |
| **Reviewer (≠ collector)** | Independently check each returned artifact against the pack `Metode verifikasi`, verify redaction code applied, record the `Result` in intake §3 | all 47 | No result is valid without a named reviewer |
| **DBA + Application Lead (joint sign-off)** | Record Part A `A1`/`A2` **last**, only after `B-01`…`B-10` are evidenced | `A1`, `A2` | Closes `B-11`; gates the rehearsal consideration |

**Not addressed by this package (production only, later):** Legal/Compliance,
DPO, HR/Payroll, Security, Data Owner/DPO — they own Part B `B2`–`B4`, `B7`,
`B9`, `B10` (§5 below). Nothing is requested from them now.

---

## 2. Grouped request register (47 artifacts)

Grouping views of the **same** rows. The pack §2 row (ID → artifact, source,
owner, verification method, stop condition, redaction) governs on any conflict;
this section adds no new requirement and creates no state change. Every status
below is `PENDING`.

### 2.1 Grouped by owner (pemilik / penanggung jawab)

| Owner slice | Count | Artifact IDs |
| --- | ---: | --- |
| **DBA (sole)** | 27 | `A1`, `A2`, `A3`, `A5`, `A7`, `B1`, `B2`, `B4`, `B5`, `C1`, `C2`, `C3`, `C4`, `C5`, `C6`, `C9`, `D1`, `D4`, `E2`, `E5`, `F1`, `F2`, `F3`, `F4`, `F5`, `F6`, `G6` |
| **Application Lead (sole)** | 7 | `D2`, `D3`, `G1`, `G2`, `G3`, `G4`, `G5` |
| **DBA + Application Lead (joint)** | 11 | `A4`, `B3`, `C7`, `C8`, `D5`, `E1`, `E3`, `E4`, `E6`, `H1`, `H3` |
| **Operator (captured/attested), reviewed by DBA + Application Lead** | 2 | `A6`, `H2` |
| **Total** | **47** | `A1`–`H3` |

### 2.2 Grouped by source (sumber)

| Source | Artifacts |
| --- | --- |
| `§7 TS-S1` (extends `T1`) — staging environment identity | `A1`, `A2` |
| `§7 TS-S2` (roles/grants) + master §C.3 | `A5` |
| `§7 TS-S3` (ledger rows / summary / safe `when`) | `B1` (#1), `B2` (#2), `E1` (#3) |
| `§7 TS-S4` (0019/0020 catalog; supersedes `T3`/`T4` for staging) | `C1`, `C2`, `D1` |
| `§7 TS-S5` (counts only) | `D4` |
| `§7 TS-S6` (`T6` form — 0022 protected contract) | `C4` |
| `§7 TS-S7` (`T9` form — employee-FK CASCADE scan) | `C6` |
| `§7 TS-S8` (`T8` form — full table inventory) | `C7` |
| `§7 TS-S9` (runbook §5.5 queries 1–4, pre-apply BEFORE) | `C9` |
| `§7 TS-S10` (extends `T10` — PITR posture) | `F4` |
| Base templates `T2`/`T5`/`T7` + pack `E2.x` cross-checks | `B3`, `B4`, `B5`, `C3`, `C5`, `C8` |
| Environment inventory worksheet (`docs/employee-permanent-delete-dba-evidence-intake.md` §4), staging row | `A3` |
| Master runbook §C.1 isolation matrix + `docs/employee-permanent-delete-dba-evidence-intake.md` §5 `G5` table | `A4` |
| Master runbook §G.2 controller review | `A7`, `G6` |
| Runbook §5.0 guard / §5.1–§5.4 preflight / §3 order / §5.10 + §7 | `A6`, `G2`, `G4`, `H1` |
| Release / CI / deployment records | `D2`, `G1` |
| Repository read paths + pinned build (`E4.3`) | `D3` |
| `docs/employee-permanent-delete-dba-evidence-intake.md` §5 `G1` staging row (disposition) | `D5` |
| Lineage plan §1.5/§3/§10 + anchors (`E6.1`) | `E1`, `E2`, `E4`, `E5`, `E6` |
| Master runbook §B + runbook §5.3 (backup/restore/private files) | `F1`, `F2`, `F3`, `F5`, `F6` |
| `A14` control plane (config + test output) / change review §2.5–§3 | `G3`, `G5` |
| Master §A.1 change record + runbook §5.7/§5.8 | `H3` |
| Runbook §0 rule 7 (`§0.7`) — synthetic data / PII | `H2` |

### 2.3 Grouped by artifact format (format artefak)

| Format | Count | Artifacts |
| --- | ---: | --- |
| `.txt` (raw query output / identity / posture) | 18 | `A1`, `A2`, `A3`, `B2`, `B4`, `C1`, `C2`, `C3`, `C4`, `C5`, `C6`, `C8`, `C9`, `D1`, `D4`, `E5`, `F4`, `G4` |
| `.csv` (row/tabular exports) | 4 | `A5`, `B1`, `B3`, `C7` |
| `.log` (verification / restore logs) | 2 | `F2`, `F3` |
| `.md` (records, attestations, dispositions, analyses) | 23 | `A4`, `A6`, `A7`, `B5`, `D2`, `D3`, `D5`, `E1`, `E2`, `E3`, `E4`, `E6`, `F1`, `F5`, `F6`, `G1`, `G2`, `G3`, `G5`, `G6`, `H1`, `H2`, `H3` |
| **Total** | **47** | |

Filename pattern (pack §1 rule 5, staging register only):
`EVD-<item>-<YYYYMMDDTHHMMSSZ>-<seq>.<ext>`, `<item>` = pack ID with dots
replaced by dashes, e.g. `EVD-E3-4-20261016T090000Z-01.txt`.

### 2.4 Grouped by redaction (redaksi) — pack §5

| Code | Artifacts | Must be redacted | Reviewer |
| --- | --- | --- | --- |
| `R1` | `A1`, `A3`, `A7`, `G6` | Connection string, host/IP/port/account detail beyond host class / cluster role; secrets in job or CI configuration | DBA |
| `R2` | `A2`, `A4` | Endpoint only as host class + cluster role (incl. `inet_server_addr()` / `inet_server_port()`) | DBA |
| `R3` | `A5` | Password hashes/attributes, credentials, role-holder identifiers; role **names and grants only** | DBA |
| `R4` | `A6` | Value of `STAGING_DATABASE_URL` and any connection URL; only variable **name**, guard result, host class | operator + DBA |
| `R5` | `A7`, `D2`, `G1`, `G6` | Internal URLs, tokens, API keys, CI secrets in release/deployment records | Application Lead |
| `R6` | `F1`, `F2`, `F3`, `A4` | Storage/bucket/cluster names and paths reduced to approved form; **dump contents never transferred** — manifest + SHA-256 + logs only | DBA |
| `R7` | `F4` | `archive_command` and any command line embedding credentials/hosts/key paths | DBA |
| `P1` | `D4`, `H2` | Aggregate counts only; no row-level values, no user/employee identifiers | DBA |
| `P2` | `F5`, `H2` | File manifests: relative path, size, SHA-256 only; no contents, no decrypted payslips, payslip passwords never logged | DBA + Application Lead |
| **none (—)** | **30** | All remaining artifacts still obey the general rule: no secrets, no unnecessary PII (handoff §5.4) | reviewer ≠ collector |

Artifacts carrying at least one code: **17** (`A1`–`A7`, `D2`, `D4`,
`F1`–`F5`, `G1`, `G6`, `H2`). Evidence containing secrets, connection strings,
or unnecessary PII is itself a **STOP** (evidence-request §4.11): redact and
re-capture, never submit as-is.

### 2.5 Grouped by reviewer

| Reviewer | Artifacts |
| --- | --- |
| **DBA** (as redaction/contract reviewer) | `A1`, `A2`, `A3`, `A4`, `A5`, `A6`, `A7`, `D4`, `F1`, `F2`, `F3`, `F4`, `G6` (code-driven rows `R1`/`R2`/`R3`/`R4`/`R6`/`R7`/`P1`) |
| **Application Lead** (code `R5`) | `A7`, `D2`, `G1`, `G6` |
| **DBA + Application Lead** (code `P2`) | `F5`, `H2` |
| **All 47** | Every row additionally requires a named **reviewer ≠ collector** (pack §1 rule 4, §9; intake §0 rule 5): DBA-collected rows are reviewed by the Application Lead (or a second named DBA), Application Lead–collected rows by the DBA, joint rows by a named individual who did not produce the file. **The collector never records the result alone.** |

### 2.6 Grouped by stop condition

Codes point to evidence-request §4, checklist Part C, or audit §4; the **pack §2
row text governs** for that artifact. Any one STOP halts the workstream:
do not deploy, do not retry a migration, do not edit journal/ledger, preserve
evidence, escalate to DBA + Application Lead.

| STOP code | Trigger | Artifacts that can raise it |
| --- | --- | --- |
| §4.1 | Required evidence missing/incomplete/unverified; identity cannot be established | `A1`, `A3`, `B2`, `H1`, `H3` (and any row returned `UNAVAILABLE`/`NOT CONFIRMED`) |
| §4.2 | Any catalog object not classifiable → `unexplained` | `C1`, `C3`, `C7`, `E3` |
| §4.3 | Ledger hash unmapped, checksum mismatch vs anchors, malformed rows, recorded edit | `B1`, `B3`, `B4`, `E2`, `E4`, `E5`, `G4` |
| §4.4 | `0020` uncertain (columns absent while a reading build is deployed; build unidentifiable) | `C2`, `D2`, `D3`, `D5`, `G1`, `G5`; `D1` indirect (`§4.4` via `D3`/`D5`) |
| §4.5 | `0019`/`0020` remain `unexplained` after capture | `C1`, `E3` |
| §4.6 | `confdeltype = 'c'` (CASCADE) or missing `<table>_retained_identity_check` | `C4`, `C6`, `C9` |
| §4.7 | Ledger not append-only / evidence of update or delete / journal edit attempted | `B5`, `C8` |
| §4.8 | Staging isolation unproven (shared cluster/role/secret/storage root/production route; raw connection string submitted) | `A1`, `A2`, `A3`, `A4`, `A5`, `A6` |
| §4.9 | No restore-tested backup, or manifest/checksum mismatch, or restore target not disposable | `F1`, `F2`, `F3`, `F4`, `F5`, `F6` |
| §4.10 | Any controller/external job could apply schema changes outside an approved change record | `A7`, `G6` |
| §4.11 | Evidence contains secrets, connection strings, or unnecessary PII | `A2`, `D4`, `H2` (+ every artifact) |
| Checklist Part C / audit §4 (beyond §4.x) | Detached row with `employee_number_snapshot IS NULL` (anonymous retention); deploy-order breach; control-plane breach | `C5`, `C9`, `G2`, `G3` |
| No row-level STOP text (gate stays open instead) | Acknowledgement/change record absent → prerequisite remains `PENDING` | `H1`, `H3` |

---

## 3. How status is recorded (no `PENDING` → `CONFIRMED` before verification)

1. **Default state.** Every artifact starts and stays `PENDING` until a raw,
   labelled artifact is received (intake §0 rule 5). This package changes no
   state: all 47 rows remain `PENDING` on dispatch.
2. **Return path.** DBA/Application Lead complete the handoff §8 return
   checklist per group (`DONE`/`PARTIAL`/`UNAVAILABLE`/`DISCREPANCY`) and place
   raw files only in the **approved restricted-access evidence location** —
   never in Git, never in chat (pack §1 rule 6; handoff §5.3).
3. **Receipt entry.** On physical receipt the reviewer fills intake §4
   (filename, artifact ID, env, received UTC, channel, type/size, SHA-256,
   redaction verified, reviewer ≠ collector) and intake §8.1 per-artifact
   receipt line.
4. **Verification before result.** The reviewer checks the artifact against the
   pack `Metode verifikasi`, the label (environment = `staging`, capture UTC
   present, collector, reviewer, ticket ID), the redaction code, and the
   recomputed checksum. Only then may `Result` be set to `CONFIRMED`,
   `NOT CONFIRMED`, or `UNAVAILABLE` (intake §3).
5. **Prohibited transitions.** `PENDING` → `CONFIRMED` without an attached raw
   labelled artifact; a result recorded by the collector alone; a result derived
   from repository facts, test output, or a parent-task claim (handoff §6,
   readiness-audit O1); an environment label other than `staging`; a backfilled
   or approximate capture timestamp.
6. **Negative results.** Any `NOT CONFIRMED` or `UNAVAILABLE` on a required item
   is a **STOP** until the owning gate resolves it (intake §0 rule 6) — recorded
   as discrepancy + follow-up, never silently continued.
7. **Checksum mismatch** on transfer is a STOP (pack §1 rule 9): report, do not
   reconcile silently.
8. **Gate resolution.** Only after artifacts are `CONFIRMED` may the DBA +
   Application Lead resolve `G1-S`–`G5-S` against the attached artifacts
   (intake §7). This package performs none of that; every gate stays `BLOCKED`.

---

## 4. Part A review checklist (`A1`–`A14`) and approvals to be recorded

Record **approver name, decision, UTC timestamp, and evidence link** for each
row in the change record. No single role may waive another role's gate. All
states below are the current state: `PENDING` ☐.

| # | Prerequisite to review | Owner | Required evidence (artifact / record) | Feeding artifacts | State |
| --- | --- | --- | --- | --- | --- |
| A1 | DBA authorization for the staging rehearsal | DBA | signed change record §A.1 | `H3` (record) | ☐ `PENDING` |
| A2 | Application Lead authorization for compatible build + deploy order | Application Lead | signed change record §A.1 | `G1`, `G2`, `G5` | ☐ `PENDING` |
| A3 | Change record opened (ID, window, rollback owner, incident commander) | DBA + Application Lead | change record | `H3` | ☐ `PENDING` |
| A4 | Staging isolation verified (separate cluster/roles/secrets/storage; no production route) | DBA + Application Lead | §5.2 / master §C isolation matrix | `A1`–`A5`, `A7` | ☐ `PENDING` |
| A5 | Pre-apply backup captured **and** restore-rehearsed into a disposable DB | DBA | §5.3 dump label + SHA-256 + restore output | `F1`–`F6` | ☐ `PENDING` |
| A6 | Reviewed artifact checksum re-verified against `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` | DBA | §5.4 output | `G4` + in-rehearsal re-verification (`B-14`) | ☐ `PENDING` |
| A7 | Migration lineage assessment accepted (0019–0022 status known; plan recorded) | DBA + Application Lead | lineage plan §3 evidence | `E1`–`E6` | ☐ `PENDING` |
| A8 | Compatible build identified, pinned, deployment order fixed (migration first) | Application Lead | §3 order + build ID | `G1`, `G2`, `G5` | ☐ `PENDING` |
| A9 | Transaction rollback rehearsal defined (disposable clone; §5.7 Test A/B/C) | DBA | §5.7 plan | `H3` | ☐ `PENDING` |
| A10 | Historical-reporting validation defined (§5.8; payslip password resolves from snapshots) | Application Lead + HR/Payroll | §5.8 plan | `H3` | ☐ `PENDING` |
| A11 | Evidence capture plan and stop conditions acknowledged | DBA + Application Lead | §5.10 evidence pack; §7 stop conditions | `H1` | ☐ `PENDING` |
| A12 | Staging guard in use for every modifying command (`HRIS_ENV=staging`, explicit `STAGING_DATABASE_URL`, no `DATABASE_URL` fallback) | operator | §5.0 guard | `A6` | ☐ `PENDING` |
| A13 | Synthetic employees only; no production PII in staging evidence | operator | runbook §0 rule 7 (`§0.7`) | `H2` | ☐ `PENDING` |
| A14 | Control plane confirmed disabled (`DELETION_EXECUTION_ENABLED=false`, `RETENTION_ELIGIBLE_CATEGORIES=[]`) | Application Lead | config + tests | `G3` | ☐ `PENDING` |

**Recorded staging exception (to be written into the change record):** policy §4
retention sign-off is **not** required for the staging rehearsal of `0022`; it
does **not** carry over to production.

### 4.1 Approval record to be signed (gates any rehearsal consideration)

| Approval | Role | Ref | Decision | UTC | Evidence link | Recorded? |
| --- | --- | --- | --- | --- | --- | --- |
| DBA authorization (`A1`) | DBA | change record §A.1 | | | | ☐ |
| Application Lead authorization (`A2`) | Application Lead | change record §A.1 | | | | ☐ |
| Change record header: ID / window / rollback owner / incident commander (`A3`, `H3`) | DBA + Application Lead | change record | | | | ☐ |
| Evidence + STOP acknowledgement (`A11`, `H1`) | DBA + Application Lead | change record | | | | ☐ |
| Lineage assessment acceptance, staging (`A7`) | DBA + Application Lead | `EVD-A7-ACCEPT-…` | | | | ☐ |
| Guard attestation (`A12`, `A6`) | operator → reviewed by DBA + Application Lead | `EVD-GUARD-A12-…` | | | | ☐ |
| Synthetic-data / no-PII attestation (`A13`, `H2`) | operator → reviewed by DBA + Application Lead | `EVD-A13-ATTEST-…` | | | | ☐ |
| Control plane disabled evidence (`A14`, `G3`) | Application Lead | `EVD-A14-…` | | | | ☐ |

**Ordering rule:** `A1`/`A2` are signed **last** (blocker `B-11`), only after
`B-01`…`B-10` are evidenced. Signing order and every checkbox above are
unsatisfied by this package.

---

## 5. Production path (Part B `B1`–`B13`) — kept separate, untouched

**No production evidence, approval, or action is requested by this package.**
Part B rows remain `PENDING` ☐, are not advanced by any staging artifact, and do
not block an isolated staging rehearsal. Conversely, a future staging `PASS`
authorizes nothing for production.

| # | Approval (production only) | Owner | State |
| --- | --- | --- | --- |
| B1 | Migration SQL review + staging rehearsal evidence (§5) accepted | DBA | ☐ `PENDING` |
| B2 | Retention/detach design acceptable for every protected category in-jurisdiction | Legal / Compliance | ☐ `PENDING` |
| B3 | Personal-data handling of retained identity snapshots accepted | DPO | ☐ `PENDING` |
| B4 | Retention schedule per category + permissible deletion window | HR / Payroll (+ Legal) | ☐ `PENDING` |
| B5 | Compatible application build + ordered rollout accepted | Application Lead | ☐ `PENDING` |
| B6 | Migration-lineage reconciliation executed; `0019`–`0022` journaled through the approved channel | DBA (reconciliation owner) | ☐ `PENDING` |
| B7 | Data Owner / DPO final authorization to enable tier 2 / apply the destructive-release migration set | Data Owner / DPO | ☐ `PENDING` |
| B8 | Backup/PITR vs deletion expectations accepted | DBA | ☐ `PENDING` |
| B9 | Security controls accepted (dual control, self-approval prevention, audit integrity, tenant isolation) | Security | ☐ `PENDING` |
| B10 | Production write-freeze / payroll cutoff / window / rollback owner / RPO-RTO approved | DBA + Application Lead + Payroll/HR | ☐ `PENDING` |
| B11 | Deployment-controller verification complete | DBA | ☐ `PENDING` |
| B12 | Monitoring, audit logging, alerting, incident contacts active | Application Lead + DBA | ☐ `PENDING` |
| B13 | Post-deployment read-only verification plan approved | DBA + Application Lead | ☐ `PENDING` |

Also unchanged: production gates `G1-P`–`G4-P`, production rows
`E4.2`–`E4.4` / `E5.1`–`E5.6`, and policy §4 retention sign-off — all `PENDING`
and not staging blockers (readiness audit §3.4; intake §7.1).

---

## 6. Evidence not yet received (as of 2026-10-16)

| Group | Requested | Received | `CONFIRMED` | Status |
| --- | ---: | ---: | ---: | --- |
| A — Environment identity + isolation | 7 | 0 | 0 | all `PENDING` |
| B — Migration ledger | 5 | 0 | 0 | all `PENDING` |
| C — Catalog 0019–0022 | 9 | 0 | 0 | all `PENDING` |
| D — Actual `0020` status | 5 | 0 | 0 | all `PENDING` |
| E — Lineage + `max(created_at)` | 6 | 0 | 0 | all `PENDING` |
| F — Backup + disposable restore | 6 | 0 | 0 | all `PENDING` |
| G — Build compatibility | 6 | 0 | 0 | all `PENDING` |
| H — Cross-cutting attestations | 3 | 0 | 0 | all `PENDING` |
| **Total** | **47** | **0** | **0** | **47 `PENDING`** |

**Blockers:** 14 of 15 `OPEN` — `B-01`…`B-11`, `B-13`, `B-14`, `B-15`
(`B-12` `CLOSED` by a documentation corrective action, 2026-10-16; no gate was
advanced). `B-15` (runtime idempotency/rollback) is closed only by rehearsal
§5.6/§5.7, which is out of scope here.

**Gates:** `G1-S`, `G2-S`, `G3-S`, `G4-S`, `G5-S` — all `BLOCKED`.
**Part A:** `A1`–`A14` — all `PENDING` ☐.

**Most urgent open items:** `D1`–`D5` + `G1` (staging status of `0020`, handoff
§2 URGENT) and `A1`–`A5` + `A7` (environment identity/isolation).

---

## 7. Conditions required before the next stage

The **next stage** is consideration of the staging rehearsal (runbook §5). All
conditions below must be satisfied first; none is satisfied now.

1. All **47** artifacts received through the approved restricted-access channel,
   labelled (env = `staging`, DB name, capture UTC + timezone, collector,
   reviewer, ticket ID), checksummed, redaction-verified.
2. Intake §3 rows filled and `Result` recorded by a **reviewer ≠ collector**;
   zero `NOT CONFIRMED` / `UNAVAILABLE` on required rows; intake §4 received-log
   complete with matching SHA-256.
3. Blockers `B-01`…`B-11`, `B-13`, `B-14` closed by their cited artifacts
   (`B-15` only by a later, separately authorized rehearsal).
4. Gates `G1-S`–`G5-S` resolved **against attached artifacts** by DBA +
   Application Lead (no repository-side inference, handoff §6).
5. Part A `A1`–`A14` recorded with approver, decision, UTC, evidence link in
   the change record — `A1`/`A2` signed last (`B-11`).
6. Zero open STOP conditions (evidence-request §4.1–§4.11, checklist Part C,
   audit §4); control plane still `false` / `[]`.
7. Only then may the rehearsal be **considered** — and a staging pass would
   authorize nothing beyond "0022 rehearsed on staging". **Production** stays
   gated separately by Part B `B1`–`B13`.

---

## 8. Explicit non-actions in producing this package

- No database was contacted; no query was executed. `TS-S1`–`TS-S10` remain
  proposals for DBA review only.
- No migration was run, generated, pushed, applied, or journaled; no
  `_journal.json`, snapshot, ledger, schema, or configuration was modified.
- No seed, deployment, RBAC seeding, or employee record was created, modified,
  or deleted. `DELETION_EXECUTION_ENABLED` remains `false` and
  `RETENTION_ELIGIBLE_CATEGORIES` remains `[]`.
- No secret, `.env.production`, connection string, or production endpoint was
  read or guessed.
- No existing document or working-tree change was modified, reverted, or
  overwritten **when this package was produced**; it was a **new, additive**
  coordination document. In the follow-up task (2026-10-16) this same document
  received the header revision note and the navigational corrections to §2.2,
  §2.5, and §2.6 (findings `F-01`–`F-03`); no application, migration, schema,
  configuration, test, or other document was touched by those corrections.
- No `PENDING` row was advanced, no gate was set to `PASS`, no approval was
  recorded, and **no rehearsal was started or authorized**.
- No staging or production readiness is claimed: staging is **NOT READY** and
  production is **NOT READY** (readiness audit §6).

**Conclusion:** one formal request package now exists for the DBA and the
Application Lead covering all 47 staging artifacts `A1`–`H3`, grouped by owner,
source, format, redaction, reviewer, and stop condition, with the Part A `A1`–`A14`
review checklist and approval record to be signed, Part B `B1`–`B13` held
separate, and an explicit state-recording protocol that keeps every row
`PENDING` until independently verified. Migration `0022` remains unapplied and
unjournaled.
