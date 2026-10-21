# DBA Evidence Intake — Migrations 0019–0022 (Production and Staging)

**Document type:** EVIDENCE INTAKE CHECKLIST. This document **collects and
classifies** the read-only evidence requested in
`docs/employee-permanent-delete-dba-evidence-request.md`. It is **not** an
approval, a change record, or an execution instruction.

**Status:** OPEN — no evidence received. Every cell below starts at `PENDING`.
**No item may be marked `CONFIRMED` unless the raw read-only artifact it cites is
attached and independently reviewed.** An empty field, a verbal assurance, or a
repository-side inference is **not** evidence.

Related:
- `docs/employee-permanent-delete-dba-evidence-request.md` — the request this
  checklist answers (items E1–E6, templates T1–T10, STOP conditions §4).
- `docs/employee-permanent-delete-0022-lineage-reconciliation-plan.md` — §3/§7.
- `docs/migration-reconciliation-runbook.md` — §B (backups), §C (staging
  isolation), §D (schema capture), §E (reconciliation), §F (approval), §G
  (production), §H (STOP).
- `docs/employee-permanent-delete-0022-approval-checklist.md` — Part A (staging)
  and Part B (production) gates.
- `docs/employee-permanent-delete-0022-staging-runbook.md`,
  `docs/employee-permanent-delete-0022-staging-change-review.md`.

---

## 0. Rules for completing this checklist

1. **Read-only only.** Every supporting artifact must originate from a
   `SELECT`/`SHOW`/`current_setting` query (evidence request §8, templates
   T1–T10) or a read-only external record (backup manifest, release record,
   ticket). No `INSERT`/`UPDATE`/`DELETE`/DDL/`VACUUM`/`ANALYZE`, no
   `drizzle-kit migrate`/`generate`/`push`, no ledger journal edits.
2. **No fabrication.** Missing evidence stays `PENDING` or becomes
   `UNAVAILABLE`; it is never guessed, inferred from repository files, or marked
   `CONFIRMED`. "Absent from the repo journal" is **not** proof of "not applied"
   (evidence request §3).
3. **Separate environment artifacts.** Production and staging are captured and
   labelled independently. Never reuse a production artifact as staging
   evidence, or vice versa.
4. **Every artifact is labelled** with: environment, database name, capture
   timestamp (UTC) and server/report timezone, collector, reviewer, and a
   checksum where the artifact is a file.
5. **Result vocabulary:**
   - `CONFIRMED` — raw artifact attached, matches the expected contract.
   - `NOT CONFIRMED` — raw artifact attached, **does not** match the contract.
   - `UNAVAILABLE` — the artifact could not be collected (state why).
   - `PENDING` — not yet collected.
6. **Any `NOT CONFIRMED` or `UNAVAILABLE`** on a required item is a STOP
   (evidence request §4) until the owning decision gate resolves it. Record the
   discrepancy and the follow-up decision; do not silently continue.
7. **Redaction.** No passwords, tokens, keys, connection strings, or
   unnecessary PII in any artifact. Endpoints appear only as host class /
   cluster role.
8. **This checklist does not authorize anything.** It records evidence and gate
   decisions only.

### 0.1 Read-only verification of the source SQL templates (task check)

The source request's templates **T1–T10** (`...dba-evidence-request.md` §8) were
reviewed and contain **only** read-only statements:

| Template | Statement type | Destructive op? |
| --- | --- | --- |
| T1 — Environment identity | `SHOW`; `SELECT current_database()/current_setting()/inet_server_*` | No |
| T2 — Ledger rows | `SELECT … FROM drizzle.__drizzle_migrations` | No |
| T3 — 0019 `key_version` | `SELECT … FROM information_schema.columns` | No |
| T4 — 0020 user columns | `SELECT … FROM information_schema.columns` | No |
| T5 — 0021 tables/indexes | `SELECT … FROM pg_class`/`pg_indexes` | No |
| T6 — 0022 nullability/FK/CHECK | `WITH … VALUES` + `SELECT` + `to_regclass` | No |
| T7 — 0022 snapshot columns | `WITH … VALUES` + `SELECT` | No |
| T8 — Full table inventory | `SELECT … FROM pg_class` | No |
| T9 — Employee FK scan | `SELECT … FROM pg_constraint` | No |
| T10 — Backup/PITR posture | `SELECT current_setting(…)` | No |

The templates contain no `INSERT`/`UPDATE`/`DELETE`/DDL/`VACUUM`/`ANALYZE`,
no `session_replication_role`, and no trigger-disabling statement. The
review is a **static read of the document**; no database was contacted. The
reviewer must still confirm that any DBA-adapted SQL actually executed is
read-only before attaching it.

---

## 1. Field legend (applies to every item table)

| Column | Meaning |
| --- | --- |
| **ID** | Evidence request item (E1.1–E6.4). |
| **Required artifact** | What must be attached (query output / external record). |
| **Evidence ref** | Filename or ticket/attachment reference. |
| **Env** | `production` or `staging` (restated per row for auditability). |
| **Captured (UTC)** | ISO-8601 capture timestamp. |
| **TZ** | Server/report timezone the artifact is expressed in. |
| **Collector** | Named operator who produced the raw artifact. |
| **Reviewer** | Named reviewer who checked it against the contract. |
| **Checksum** | SHA-256 of the file artifact (`n/a` for direct console text). |
| **Result** | `PENDING` / `CONFIRMED` / `NOT CONFIRMED` / `UNAVAILABLE`. |
| **Discrepancy** | Any mismatch vs. the expected contract, or `none`. |
| **Follow-up** | Decision / STOP escalation / owner, or `none`. |

Use one row per item. For multi-object items (E3.3, E3.4) attach the per-object
breakdown as the artifact and summarize the result in the row.

---

## 2. Production evidence register

Environment: **production**. Artifact anchor for 0019–0022 SHA-256:
`21752cce…2d27`, `baf18875…4eaa`, `0e234c6e…7764`, `724db82d…65c`.

| ID | Required artifact | Evidence ref | Env | Captured (UTC) | TZ | Collector | Reviewer | Checksum | Result | Discrepancy | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1.1 | DB name, full server version, timezone, encoding, extensions (T1) | | production | | | | | | PENDING | | |
| E1.2 | Redacted endpoint identity + role class (prod/staging/DR/CI) (T1) | | production | | | | | | PENDING | | |
| E1.3 | Full environment inventory incl. DR/preview/CI (see §4) | | production | | | | | | PENDING | | |
| E2.1 | Full ledger rows `id, hash, created_at` (T2) | | production | | | | | | PENDING | | |
| E2.2 | Ledger count + `min/max(created_at)` (T2) | | production | | | | | | PENDING | | |
| E2.3 | Hash→reviewed-file mapping + unmapped-hash flags | | production | | | | | | PENDING | | |
| E2.4 | Ledger rows (if any) mapping to 0019–0022 (id, created_at) | | production | | | | | | PENDING | | |
| E2.5 | Ledger append-only confirmation (no update/delete) | | production | | | | | | PENDING | | |
| E3.1 | 0019: `face_enrollment_templates.key_version` default/null/type (T3) | | production | | | | | | PENDING | | |
| E3.2 | 0020: `users.must_change_password/password_changed_at/last_login_at` (T4) | | production | | | | | | PENDING | | |
| E3.3 | 0021: 3 tables + 6 indexes + FK actions (T5) | | production | | | | | | PENDING | | |
| E3.4 | 0022: 11 PROTECTED tables — nullability, FK action, CHECK, snapshots (T6/T7/T9) | | production | | | | | | PENDING | | |
| E3.5 | Full application table inventory for classification (T8) | | production | | | | | | PENDING | | |
| E3.6 | Live-but-unledgered object list (0015/0016 pattern) | | production | | | | | | PENDING | | |
| E4.1 | 0020 column confirmation (same as E3.2) | | production | | | | | | PENDING | | |
| E4.2 | Deployed build ID / release record | | production | | | | | | PENDING | | |
| E4.3 | Does deployed build read `must_change_password`? incident flag | | production | | | | | | PENDING | | |
| E4.4 | `must_change_password` value distribution (read-only counts) | | production | | | | | | PENDING | | |
| E5.1 | Most recent verified backup: label, time, location, retention, manifest | | production | | | | | | PENDING | | |
| E5.2 | Backup verification output (checksum/verification log) | | production | | | | | | PENDING | | |
| E5.3 | Restore test into isolated disposable DB: log, target, reconciliation | | production | | | | | | PENDING | | |
| E5.4 | PITR posture: `wal_level`, `archive_mode`, tool, retention, RPO/RTO (T10) | | production | | | | | | PENDING | | |
| E5.5 | Private-file storage backup + restore verification | | production | | | | | | PENDING | | |
| E5.6 | Explicit statement: restore-tested backup exists? | | production | | | | | | PENDING | | |
| E6.1 | DBA-held checksums for 0015–0022 | | production | | | | | | PENDING | | |
| E6.2 | Deployment records / release manifests / CI build IDs | | production | | | | | | PENDING | | |
| E6.3 | Change/ticket IDs for out-of-band/ledger-less DDL | | production | | | | | | PENDING | | |
| E6.4 | Deployment-controller review (any unreviewed `db:migrate`?) | | production | | | | | | PENDING | | |

---

## 3. Staging evidence register

Environment: **staging**. Captured independently; no production artifact may be
substituted.

| ID | Required artifact | Evidence ref | Env | Captured (UTC) | TZ | Collector | Reviewer | Checksum | Result | Discrepancy | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1.1 | DB name, full server version, timezone, encoding, extensions (T1) | | staging | | | | | | PENDING | | |
| E1.2 | Redacted endpoint identity + role class (T1) | | staging | | | | | | PENDING | | |
| E1.3 | Full environment inventory incl. DR/preview/CI (see §4) | | staging | | | | | | PENDING | | |
| E2.1 | Full ledger rows `id, hash, created_at` (T2) | | staging | | | | | | PENDING | | |
| E2.2 | Ledger count + `min/max(created_at)` (T2) | | staging | | | | | | PENDING | | |
| E2.3 | Hash→reviewed-file mapping + unmapped-hash flags | | staging | | | | | | PENDING | | |
| E2.4 | Ledger rows (if any) mapping to 0019–0022 (id, created_at) | | staging | | | | | | PENDING | | |
| E2.5 | Ledger append-only confirmation (no update/delete) | | staging | | | | | | PENDING | | |
| E3.1 | 0019: `face_enrollment_templates.key_version` default/null/type (T3) | | staging | | | | | | PENDING | | |
| E3.2 | 0020: `users.must_change_password/password_changed_at/last_login_at` (T4) | | staging | | | | | | PENDING | | |
| E3.3 | 0021: 3 tables + 6 indexes + FK actions (T5) | | staging | | | | | | PENDING | | |
| E3.4 | 0022: 11 PROTECTED tables — nullability, FK action, CHECK, snapshots (T6/T7/T9) | | staging | | | | | | PENDING | | |
| E3.5 | Full application table inventory for classification (T8) | | staging | | | | | | PENDING | | |
| E3.6 | Live-but-unledgered object list (0015/0016 pattern) | | staging | | | | | | PENDING | | |
| E4.1 | 0020 column confirmation (same as E3.2) | | staging | | | | | | PENDING | | |
| E4.2 | Deployed build ID / release record | | staging | | | | | | PENDING | | |
| E4.3 | Does deployed build read `must_change_password`? incident flag | | staging | | | | | | PENDING | | |
| E4.4 | `must_change_password` value distribution (read-only counts) | | staging | | | | | | PENDING | | |
| E5.1 | Most recent verified backup: label, time, location, retention, manifest | | staging | | | | | | PENDING | | |
| E5.2 | Backup verification output (checksum/verification log) | | staging | | | | | | PENDING | | |
| E5.3 | Restore test into isolated disposable DB: log, target, reconciliation | | staging | | | | | | PENDING | | |
| E5.4 | PITR posture (staging may be restore-only; state explicitly) (T10) | | staging | | | | | | PENDING | | |
| E5.5 | Private-file storage backup + restore verification | | staging | | | | | | PENDING | | |
| E5.6 | Explicit statement: restore-tested backup exists? | | staging | | | | | | PENDING | | |
| E6.1 | DBA-held checksums for 0015–0022 | | staging | | | | | | PENDING | | |
| E6.2 | Deployment records / release manifests / CI build IDs | | staging | | | | | | PENDING | | |
| E6.3 | Change/ticket IDs for out-of-band/ledger-less DDL | | staging | | | | | | PENDING | | |
| E6.4 | Deployment-controller review (any unreviewed `db:migrate`?) | | staging | | | | | | PENDING | | |

---

## 4. Cross-environment inventory (E1.3)

Complete **once**, covering every environment discovered — not just production
and staging. Any environment not listed here, or any listed environment with no
ledger/catalog capture, is a STOP (evidence request §4.1/§4.8).

| Environment | Role (prod/staging/DR/preview/CI/other) | DB name | Cluster/role class (redacted) | Ledger captured? | Catalog captured? | Evidence ref | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| production | | | | ☐ | ☐ | | PENDING |
| staging | | | | ☐ | ☐ | | PENDING |
| | | | | ☐ | ☐ | | PENDING |
| | | | | ☐ | ☐ | | PENDING |

Object classification vocabulary (per environment, per object):
`expected-approved` / `production-only` / `repository-only` / `unexplained`.
**`unexplained` = STOP.** The classification worksheet is the E3.5 artifact.

---

## 5. Decision gates

Each gate lists the evidence that must be `CONFIRMED` before the gate can pass,
the pass criteria, the STOP trigger, and the decision authority. **All gates
start `BLOCKED`.** A gate cannot be marked `PASS` from repository facts alone.

**Environment scope.** G1–G4 are evaluated **per environment**: the production
row(s) and the staging row(s) are independent dispositions, and a gate is `PASS`
for an environment only when **that environment's** row(s) pass against attached
artifacts. G5 is the staging-isolation gate and is evaluated for the staging
rehearsal. A production row does **not** gate the staging rehearsal, and a
staging row does **not** gate production: staging authorization depends only on
the staging evidence register and the staging-specific gates (§7.1), while
production authorization depends on the production evidence register and Part B
(§7.2).

### G1 — Migration 0020 security / operational status

- **Inputs:** E3.2, E4.1, E4.2, E4.3, E4.4, E6.2 (production and staging).
- **Pass criteria (one disposition, recorded per environment):**
  - **Routine:** the three columns exist with the declared types/defaults, the
    deployed build reading `must_change_password` is identified, and the read
    path is consistent; or
  - **Not-yet-deployed:** columns absent **and** no build reading the column is
    deployed.
- **STOP / incident trigger:** a build that reads `must_change_password` is
  deployed while the columns are absent, or the deployed build cannot be
  identified (evidence request §4.4; 0021 runbook R1 urgency note).
- **Decision:** DBA + Application Lead. State `routine` or `incident`.

| Env | Column result | Deployed build ID | Reads column? | Disposition | Decided by | UTC | State |
| --- | --- | --- | --- | --- | --- | --- | --- |
| production | PENDING | | | | | | BLOCKED |
| staging | PENDING | | | | | | BLOCKED |

### G2 — Migration 0019–0022 application status

- **Inputs:** E2.1–E2.5, E3.1–E3.6, E6.1 (production and staging).
- **Pass criteria:** every one of 0019/0020/0021/0022 is classified
  **applied / not applied** per environment from live ledger **plus** live
  catalog; every ledger hash maps to a reviewed SQL file; every catalog object
  is classified `expected-approved`/`production-only`/`repository-only`;
  **zero `unexplained` objects**.
- **STOP trigger:** any unexplained object; any unmapped ledger hash; any
  mismatch between catalog and an expected 0019–0022 contract (evidence request
  §4.2/§4.3/§4.5/§4.6).
- **Decision:** DBA + Application Lead.

| Migration | Production status (applied / not applied / unexplained) | Staging status | Evidence ref | State |
| --- | --- | --- | --- | --- |
| 0019 `face_template_key_version` | PENDING | PENDING | | BLOCKED |
| 0020 `user_password_lifecycle` | PENDING | PENDING | | BLOCKED |
| 0021 `employee_deletion_controls` | PENDING | PENDING | | BLOCKED |
| 0022 `employee_retention_detach` | PENDING | PENDING | | BLOCKED |

### G3 — Ledger and snapshot reconciliation

- **Inputs:** E2.1, E2.3, E2.5, E6.1, E6.3; repository lineage facts
  (journal/snapshot defects) from
  `docs/employee-permanent-delete-0022-lineage-reconciliation-plan.md` §1.
- **Pass criteria:** the live max ledger `created_at` is known per environment; a
  safe repair `when` (> max `created_at`) can be computed; the ledger is
  append-only; each 0019–0022 SHA-256 matches the §1 anchors; the duplicate
  `0011` prefix and the broken `0012`–`0014` snapshot chain have a recorded
  disposition in the approved reconciliation artifact.
- **STOP trigger:** a mismatched checksum for 0019–0022; a ledger row updated or
  deleted; a repair `when` cannot be made strictly greater than the live max; the
  snapshot-chain disposition is unrecorded (evidence request §4.3/§4.7; master
  runbook §H).
- **Decision:** DBA (reconciliation owner) + Application Lead. **No snapshot or
  journal file is edited by this checklist.**

| Check | Production | Staging | Evidence ref | State |
| --- | --- | --- | --- | --- |
| Live max ledger `created_at` known | PENDING | PENDING | | BLOCKED |
| Ledger append-only | PENDING | PENDING | | BLOCKED |
| 0019–0022 SHA-256 match anchors | PENDING | PENDING | | BLOCKED |
| Repair `when` computable | PENDING | PENDING | | BLOCKED |
| Snapshot-chain defect disposition recorded | PENDING | PENDING | | BLOCKED |

### G4 — Backup and restore readiness

- **Inputs:** E5.1–E5.6 (production and staging).
- **Pass criteria:** a **verified, restore-tested** backup exists for the
  environment; the restore test ran into an isolated disposable database with
  row-count/checksum reconciliation; PITR posture and private-file storage
  restore are recorded; pre-apply backup is restorable.
- **STOP trigger:** no restore-tested backup for the environment; backup
  checksum/manifest missing or mismatched; private-file restore unverified
  (evidence request §4.9; master runbook §B/§H).
- **Decision:** DBA.

| Check | Production | Staging | Evidence ref | State |
| --- | --- | --- | --- | --- |
| Verified backup exists | PENDING | PENDING | | BLOCKED |
| Restore test into disposable DB passed | PENDING | PENDING | | BLOCKED |
| PITR posture recorded | PENDING | PENDING | | BLOCKED |
| Private-file storage restore verified | PENDING | PENDING | | BLOCKED |

### G5 — Staging isolation

- **Inputs:** E1.1–E1.3, E6.4, plus the master runbook §C.1 isolation matrix
  (separate cluster/DB, separate file root, unique env vars/secrets, dedicated
  roles with no production membership, denied production network routes,
  disabled external integrations).
- **Pass criteria:** every isolation-matrix control is attested with evidence;
  no staging role can authenticate to production; no production secret or route
  is present in staging; the `HRIS_ENV=staging` guard is in force.
- **STOP trigger:** staging shares a cluster, role, secret, storage root, or
  production network route with production (evidence request §4.8; master
  runbook §C/§H).
- **Decision:** DBA + Application Lead.

| Isolation control | Attested? | Evidence ref | Discrepancy | State |
| --- | --- | --- | --- | --- |
| Separate cluster / database | ☐ | | | BLOCKED |
| Separate file storage root | ☐ | | | BLOCKED |
| Unique staging env vars / secrets (no `.env.production`) | ☐ | | | BLOCKED |
| Dedicated roles; no production membership | ☐ | | | BLOCKED |
| Production endpoints/routes denied | ☐ | | | BLOCKED |
| External integrations disabled/test sinks | ☐ | | | BLOCKED |
| `HRIS_ENV=staging` guard active | ☐ | | | BLOCKED |

---

## 6. Outstanding evidence index

All items are outstanding until the registers in §2–§4 cite attached artifacts.

| Evidence request item | Production | Staging |
| --- | --- | --- |
| E1 Environment identity | PENDING | PENDING |
| E2 Ledger rows + counts + mapping | PENDING | PENDING |
| E3 0019 catalog | PENDING | PENDING |
| E3 0020 catalog | PENDING | PENDING |
| E3 0021 catalog | PENDING | PENDING |
| E3 0022 catalog | PENDING | PENDING |
| E3.5 Full table inventory | PENDING | PENDING |
| E4 0020 behavior + deployed build | PENDING | PENDING |
| E5 Backup/PITR/restore test | PENDING | PENDING |
| E6 Checksums / deployments / tickets | PENDING | PENDING |
| E1.3 Other environments | PENDING | — |

---

## 7. Authorization conditions (staging and production, kept separate)

A staging authorization and a production authorization are **separate and
non-transferable**. Staging is authorized only under §7.1; production is
authorized only under §7.2. Satisfying §7.1 does not satisfy §7.2, and a staging
pass authorizes nothing beyond "rehearsed on staging".

### 7.1 Conditions before the DBA and Application Lead may authorize staging

Staging is authorized **only** when every condition below is met and recorded in
the change record, each citing attached raw artifacts. None may be waived by a
single role.

1. **Applicable staging gates `PASS`** on the **staging** evidence register
   (§3/§4), each citing attached raw artifacts:
   - **G1** staging — 0020 staging status is `routine` (or `not-yet-deployed`);
   - **G2** staging — `0019`–`0022` staging application status classified, zero
     `unexplained` objects;
   - **G3** staging — staging ledger lineage/snapshot reconciliation accepted;
   - **G4** staging — staging backup captured and restore-rehearsed into a
     disposable DB;
   - **G5** — staging isolation attested.
   The **production** rows of G1–G4 are **not** conditions for the staging
   rehearsal and must not block an isolated staging rehearsal.
2. **Cross-environment prerequisites preserved for staging safety.** These are
   the only items that legitimately reach across environments, and each is
   genuinely required to establish staging safety:
   - **Artifact identity (environment-independent).** The reviewed `0019`–`0022`
     SQL is checksum-pinned to the §1 anchors and the `0022` artifact under test
     equals `724db82d…65c` (A6). Rationale: the rehearsal must apply the exact
     reviewed artifact; artifact identity cannot be established from the staging
     catalog alone.
   - **Staging lineage (staging-specific).** The lineage/snapshot-chain defect
     disposition (repository fact) required to compute a safe repair `when` is
     accepted for **staging** using staging's live max ledger `created_at`
     (A7); production's ledger is not consulted.
   No **production** evidence row — G1–G4 production, the production deployed
   build/incident checks (E4.2–E4.4), or the production backup/PITR/restore rows
   (E5.1–E5.6) — is a prerequisite for the staging rehearsal.
3. **Approval-checklist Part A (A1–A14)** recorded: DBA authorization (A1),
   Application Lead authorization (A2), change record (A3), verified staging
   isolation (A4), pre-apply backup **restore-rehearsed into a disposable DB**
   (A5), reviewed-artifact checksum re-verified against `724db82d…65c` (A6),
   lineage assessment accepted using this evidence intake (A7), pinned
   compatible build with migration-first order (A8), rollback rehearsal defined
   (A9), historical-reporting validation defined (A10), evidence/stop
   conditions acknowledged (A11), staging guard in use (`HRIS_ENV=staging`,
   explicit `STAGING_DATABASE_URL`, no `DATABASE_URL` fallback) (A12), synthetic
   data only (A13), control plane disabled (`DELETION_EXECUTION_ENABLED=false`,
   `RETENTION_ELIGIBLE_CATEGORIES=[]`) (A14).
4. **Only staging-applicable STOP conditions** in evidence request §4, master
   runbook §H, 0021 runbook §5.3, or approval-checklist Part C are closed. A
   **production-only** STOP or base requirement (for example, a production object
   left `unexplained`, or a missing production `§F` gate) is deferred to §7.2 and
   does not block the staging rehearsal.
5. **Recorded staging exception:** the policy §4 retention sign-off is not
   required for the `0022` staging rehearsal; it **does not** carry to
   production.
6. **Read-only discipline maintained:** no migration, journal edit, ledger edit,
   snapshot edit, RBAC seed, deployment, or employee deletion has been performed
   during evidence intake.

### 7.2 Conditions before production may be authorized (separate and explicit)

A staging pass under §7.1 authorizes **nothing** for production. Production is
gated separately and additionally:

1. **Applicable production gates `PASS`** on the **production** evidence
   register (§2/§4), each citing attached raw artifacts: **G1** production
   (0020 disposition), **G2** production (`0019`–`0022` application status, zero
   `unexplained`), **G3** production (production ledger/snapshot reconciliation
   and a computable safe repair `when`), **G4** production (production backup
   captured and restore-tested). G5 (isolation) is a staging-environment control;
   production isolation is covered by the master-runbook §C/§G controls.
2. **Approval-checklist Part B (B1–B13)** recorded, including **DBA,
   Legal/Compliance, DPO, HR/Payroll, Application Lead, and the
   migration-lineage reconciliation owner** approvals, and the migration-lineage
   reconciliation executed with `0019`–`0022` journaled through the approved
   channel.
3. **No STOP condition** in evidence request §4, master runbook §H, or
   approval-checklist Part C is open on production.

No production apply, journaling, or executor enablement may proceed on a subset
of §7.2, and this checklist adds no production approval of its own.

---

## 8. Explicit non-actions in producing this checklist

- No database was contacted; no query was executed.
- No migration, journal, snapshot, ledger, schema, or environment configuration
  was modified.
- No migration, RBAC seed, deployment, or employee deletion was run.
- No evidence was invented; every item above is `PENDING` until a raw read-only
  artifact is attached and reviewed.

**Conclusion:** this intake checklist mirrors the DBA evidence request item for
item, in separate production and staging registers, and defines the decision
gates for 0020 status, 0019–0022 application status, ledger/snapshot
reconciliation, backup/restore readiness, and staging isolation. Nothing is
verified. Staging may not be authorized until §7.1 is satisfied with attached
evidence; production may not be authorized until §7.2 (including Part B,
B1–B13) is satisfied. A staging authorization does not authorize production, and
the only cross-environment items that gate the staging rehearsal are the pinned
artifact identity and staging-specific lineage facts named in §7.1.2.
