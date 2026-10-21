# Migration 0022 — Consolidated Evidence Intake Checklist

**Document type:** OPERATIONAL INTAKE CHECKLIST (consolidation layer) — **staging
scope for artifacts `A1`–`H3`; production scope for Part B and policy §4 in
reference only.** This is **not** an approval, a change record, a verification
result, a gate decision, an authorization, or an execution instruction. It
authorizes nothing and confirms nothing. It only consolidates, classifies, and
assigns owners for evidence already defined by the governing documents.

**Status:** OPEN. Evidence received: **0 / 47**. Artifacts `CONFIRMED`: **0**.
Staging gates `G1-S`–`G5-S`: **BLOCKED**. Part A `A1`–`A14`: **PENDING** ☐. Part B
`B1`–`B13`: **PENDING** ☐. Policy §4: all six rows **☐ pending**. Blockers:
**14 OPEN** (`B-01`–`B-11`, `B-13`–`B-15`), `B-12` **CLOSED** (doc-only). Change
record: **absent**. Independent review: **none obtained**.

**Date compiled:** 2026-10-20
**Repository:** `/opt/hris` (git `main` @ `e735f47`; uncommitted 0022 release
candidate present; no commit made)

**Governing documents (govern on conflict, in this order):**

| Source | Role here |
| --- | --- |
| `docs/employee-permanent-delete-0022-staging-evidence-request-pack.md` (pack) | Authoritative artifact rows (`A1`–`H3`, 47); **governs on conflict** |
| `docs/employee-permanent-delete-0022-staging-evidence-intake-register.md` (register) | Per-row receiving fields; Result authority |
| `docs/employee-permanent-delete-0022-staging-evidence-coordination-request.md` (coordination) | Owner slices §2.1; stop conditions §2.6; Part A §4 |
| `docs/employee-permanent-delete-0022-staging-evidence-dispatch-preparation-20261019.md` (dispatch) | M-1…M-5 role roster §2; intake sequence §3; validation V-1…V-10 §5 |
| `docs/employee-permanent-delete-0022-staging-runbook.md` (0022 runbook) | §4.1 approvals; §5.0 env guard; §7 STOP |
| `docs/migration-reconciliation-runbook.md` (master) | §C isolation; §F gates; §G production prereqs; §H STOP |
| `docs/employee-permanent-delete-policy.md` (policy) | §4 retention sign-off (production only) |
| `docs/employee-permanent-delete-0022-approval-checklist.md` | Part A `A1`–`A14`; Part B `B1`–`B13` |

> **Hard boundary observed in compiling this document.** No database was
> contacted and no query was executed. No migration, seed, deployment, journal,
> snapshot, ledger, schema, configuration, or employee record was run, read, or
> changed. No secret, `.env.production`, or connection string was read or
> guessed. No message was sent; no owner was contacted; no recipient identity was
> invented. No `PENDING` row was advanced, no gate set to `PASS`, no approval
> recorded, no evidence fabricated.

---

## 0. Purpose

Provide a single index that (i) lists every required evidence item across the
staging artifact pack (47), Part A (14), Part B (13), policy §4 (6), and the
change record (1); (ii) classifies each by **how it can be produced**
(`AUTO` / `SEMI` / `HUMAN`) and whether this workspace can generate it;
(iii) records the **owner**, the **independent reviewer** requirement, and the
**current status**; and (iv) states plainly what this workspace **cannot** do.

**Classification legend**

| Code | Meaning in this workspace |
| --- | --- |
| `AUTO` | Derivable from the repository / local toolchain with read-only commands, no DBA, no staging DB access. Produces **repository facts**, which confirm **no** artifact and close **no** gate. |
| `SEMI` | Requires staging DB access (or a pinned deployed build) and a named collector; cannot be produced from this workspace. |
| `HUMAN` | Requires a signed decision, attestation, or authorization by a named role; cannot be produced by any automated process. |

**Critical rule (dispatch §6; handoff §6):** repository facts, test output, and
parent-task claims are **never** live proof. `AUTO` items below feed comparison
only; the corresponding artifact remains `PENDING` until the owning collector
captures it in staging and a reviewer ≠ collector records the Result.

---

## 1. Staging artifact pack — 47 items (`A1`–`H3`)

Owner abbreviations: **DBA**, **APP** (Application Lead), **OPS** (rehearsal
operator). Joint items are owned by both; the reviewer must differ from the
collector.

### A. Identity / isolation (7)

| ID | Evidence | Class | Owner | Reviewer | Gate | Blocker | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | Staging DB identity (name, version, TZ, encoding, extensions) | SEMI | DBA | APP | G5-S | B-01 | PENDING |
| A2 | Redacted endpoint + role class | SEMI | DBA | APP | G5-S | B-01 | PENDING |
| A3 | Staging row of environment inventory (E1.3) | SEMI | DBA | APP | G5-S | B-01 | PENDING |
| A4 | Isolation-matrix attestation (7 controls) | HUMAN (joint) | DBA+APP | OPS | G5-S | B-01,B-08 | PENDING |
| A5 | Role & grant export for staging | SEMI | DBA | APP | G5-S | B-01 | PENDING |
| A6 | Staging shell guard attestation | HUMAN | OPS | DBA+APP | — | B-08 | PENDING |
| A7 | Deployment-controller review (no auto-migrate) | SEMI | DBA | APP | G5-S | B-01,B-10 | PENDING |

### B. Ledger (5)

| ID | Evidence | Class | Owner | Reviewer | Gate | Blocker | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | Ledger rows id/hash/created_at | SEMI | DBA | APP | G2-S,G3-S | B-02 | PENDING |
| B2 | Ledger summary count/min/max | SEMI | DBA | APP | G2-S,G3-S | B-02 | PENDING |
| B3 | Hash→file mapping + unmapped list | SEMI (joint) | DBA+APP | OPS | G2-S,G3-S | B-02 | PENDING |
| B4 | Ledger rows for 0019–0022 (if any) | SEMI | DBA | APP | G2-S | B-02 | PENDING |
| B5 | Append-only observation + method | SEMI | DBA | APP | G2-S | B-02 | PENDING |

### C. Catalog / schema (9)

| ID | Evidence | Class | Owner | Reviewer | Gate | Blocker | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | 0019 key_version column contract | SEMI | DBA | APP | G2-S | B-03 | PENDING |
| C2 | 0020 users columns contract | SEMI | DBA | APP | G2-S | B-03 | PENDING |
| C3 | 0021 control tables/indexes/FK | SEMI | DBA | APP | G2-S | B-03 | PENDING |
| C4 | 0022 11 PROTECTED tables contract | SEMI | DBA | APP | G2-S | B-03 | PENDING |
| C5 | Snapshot column inventory on PROTECTED | SEMI | DBA | APP | G2-S | B-03 | PENDING |
| C6 | Full employee FK scan (CASCADE detect) | SEMI | DBA | APP | G2-S | B-03 | PENDING |
| C7 | Full app-table inventory + classification | SEMI (joint) | DBA+APP | OPS | G1-S,G2-S | B-03 | PENDING |
| C8 | Live-objects-without-ledger list | SEMI (joint) | DBA+APP | OPS | G2-S | B-03 | PENDING |
| C9 | Pre-apply BEFORE contract capture | SEMI | DBA | APP | G2-S | B-03 | PENDING |

### D. 0020 / build (5)

| ID | Evidence | Class | Owner | Reviewer | Gate | Blocker | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | 0020 column confirmation capture | SEMI | DBA | APP | G1-S | B-04 | PENDING |
| D2 | Deployed staging build ID / release record | SEMI | APP | DBA | G1-S | B-04 | PENDING |
| D3 | Does pinned build read must_change_password? | SEMI | APP | DBA | G1-S | B-04 | PENDING |
| D4 | must_change_password distribution (count only) | SEMI | DBA | APP | G1-S | B-04 | PENDING |
| D5 | G1 staging disposition (routine/deploy/incident) | HUMAN (joint) | DBA+APP | OPS | G1-S | B-04 | PENDING |

### E. Lineage / reconciliation (6)

| ID | Evidence | Class | Owner | Reviewer | Gate | Blocker | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | max(created_at) + safe repair `when` candidate | SEMI (joint) | DBA+APP | OPS | G2-S,G3-S | B-05 | PENDING |
| E2 | Append-only + hash-anchor 0019–0022 | SEMI | DBA | APP | G2-S | B-05 | PENDING |
| E3 | App status classification 0019–0022 | SEMI (joint) | DBA+APP | OPS | G2-S | B-05 | PENDING |
| E4 | Snapshot-chain disposition for staging | HUMAN (joint) | DBA+APP | OPS | G2-S | B-05 | PENDING |
| E5 | DBA checksums 0015–0022 (independent) | SEMI | DBA | APP | G2-S | B-05 | PENDING |
| E6 | Lineage acceptance for staging | HUMAN (joint) | DBA+APP | OPS | G2-S | B-05 | PENDING |

### F. Backup / restore (6)

| ID | Evidence | Class | Owner | Reviewer | Gate | Blocker | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | Last verified staging backup (label/manifest/SHA-256) | SEMI | DBA | APP | G4-S | B-06 | PENDING |
| F2 | Backup verification output | SEMI | DBA | APP | G4-S | B-06 | PENDING |
| F3 | Restore test to disposable isolated DB | SEMI | DBA | APP | G4-S | B-06 | PENDING |
| F4 | PITR posture OR explicit restore-only | SEMI | DBA | APP | G4-S | B-06 | PENDING |
| F5 | Private-file backup + restore reconciliation | SEMI | DBA | APP | G4-S | B-06 | PENDING |
| F6 | Explicit restore-tested statement (yes+ref / NO) | SEMI | DBA | APP | G4-S | B-06 | PENDING |

### G. Build / deployment (6)

| ID | Evidence | Class | Owner | Reviewer | Gate | Blocker | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | Pinned build record ↔ commit ↔ checksum | SEMI | APP | DBA | G1-S | B-07,B-09,B-14 | PENDING |
| G2 | Migration-first deploy-order record | HUMAN | APP | DBA | — | B-07 | PENDING |
| G3 | Control-plane disabled proof from pinned build | SEMI | APP | DBA | — | B-09 | PENDING |
| G4 | Repo checksum preflight for 0019–0022 + journal | AUTO *(repo fact; corridor only)* | APP | DBA | — | B-14 | PENDING |
| G5 | Pinned-build compatibility statement | HUMAN | APP | DBA | — | B-07 | PENDING |
| G6 | Cross-reference of A7 (quote, not rewrite) | SEMI | DBA | APP | G5-S | B-01 | PENDING |

### H. Attestations / change record (3)

| ID | Evidence | Class | Owner | Reviewer | Gate | Blocker | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | Capture plan + STOP-condition acknowledgement (A11) | HUMAN (joint) | DBA+APP | OPS | — | B-10 | PENDING |
| H2 | Synthetic-data / no-production-PII attestation (A13) | HUMAN | OPS | DBA+APP | — | B-13 | PENDING |
| H3 | Change record header + rehearsal definition (A3/A9/A10) | HUMAN (joint) | DBA+APP | OPS | — | B-10 | PENDING |

**Pack totals:** 47 items — `AUTO` 1 (`G4`); `SEMI` 34; `HUMAN` 12. Zero
received; zero `CONFIRMED`.

---

## 2. Part A — staging readiness (`A1`–`A14`)

Source: `docs/employee-permanent-delete-0022-approval-checklist.md`. Part A rows
are **accountable status flags**, distinct from the artifact IDs above despite
the shared `A` letter.

| ID | Item | Class | Owner | Reviewer | Status |
| --- | --- | --- | --- | --- | --- |
| A1 | DBA lead approval (staging) | HUMAN | DBA lead | — | PENDING ☐ |
| A2 | Application lead approval (staging) | HUMAN | App lead | — | PENDING ☐ |
| A3 | Change record opened | HUMAN | joint | OPS | PENDING ☐ |
| A4 | Isolation matrix signed | HUMAN | DBA+APP | OPS | PENDING ☐ |
| A5 | Verified backup exists | SEMI→HUMAN | DBA | APP | PENDING ☐ |
| A6 | In-rehearsal checksum re-verification | SEMI | DBA | APP | PENDING ☐ |
| A7 | Deploy-controller no-auto-migrate review | SEMI | DBA | APP | PENDING ☐ |
| A8 | Migration-first order recorded | HUMAN | App lead | DBA | PENDING ☐ |
| A9 | Rehearsal Test A/B/C defined (§5.7) | HUMAN | joint | OPS | PENDING ☐ |
| A10 | Rehearsal assertions defined (§5.8) | HUMAN | joint | OPS | PENDING ☐ |
| A11 | Capture plan + STOP acknowledgement | HUMAN | joint | OPS | PENDING ☐ |
| A12 | Staging guard in place for rehearsal shell | HUMAN | OPS | DBA+APP | PENDING ☐ |
| A13 | Synthetic-data / no-PII attestation | HUMAN | OPS | DBA+APP | PENDING ☐ |
| A14 | Control plane disabled | SEMI | App lead | DBA | PENDING ☐ |

**Part A: 0 / 14.** `A1` and `A2` are signed **last**, after `B-01`…`B-10` are
evidenced (`B-11`). Their absence is the hard gate on staging rehearsal
(`0022 runbook §4.1`).

---

## 3. Part B — production readiness (`B1`–`B13`)

Production scope; **out of scope for staging rehearsal** and unchanged. Listed
for completeness so the release gate is not confused with the staging gate.

| ID | Item | Class | Owner | Reviewer | Status |
| --- | --- | --- | --- | --- | --- |
| B1 | Production backup + checksums + restore test | SEMI | DBA | Security | PENDING ☐ |
| B2 | Production schema capture | SEMI | DBA | App lead | PENDING ☐ |
| B3 | Production ledger review | SEMI | DBA | App lead | PENDING ☐ |
| B4 | Lineage repair approved by all four gates | HUMAN | all four | — | PENDING ☐ |
| B5 | Clean staging reconstruction from approved chain | SEMI | DBA | App lead | PENDING ☐ |
| B6 | Prod↔staging schema comparison zero unexplained | SEMI | DBA | App lead | PENDING ☐ |
| B7 | Payroll/payslip/employee invariants pass | SEMI | Payroll/HR | DBA | PENDING ☐ |
| B8 | Private-file restore test passes | SEMI | DBA | Security | PENDING ☐ |
| B9 | Write-freeze / cutoff / window / comms approved | HUMAN | Payroll/HR | — | PENDING ☐ |
| B10 | Rollback/recovery decision documented | HUMAN | DBA+App | — | PENDING ☐ |
| B11 | Health check incl. read-only DB/ledger check | SEMI | DBA | App lead | PENDING ☐ |
| B12 | Monitoring/audit/alerting/incident contacts active | HUMAN | Security | — | PENDING ☐ |
| B13 | No automation applies an unreviewed migration | HUMAN | DBA | Security | PENDING ☐ |

**Part B: 0 / 13.**

---

## 4. Policy §4 — retention sign-off (production, BLOCKING)

Source: `docs/employee-permanent-delete-policy.md` §4.1. Required **before** tier
2 is enabled or `0021` is applied **in a destructive production release**.
**Expressly NOT required for the 0022 staging rehearsal** (0022 runbook staging
exception; master §C.1) — but that exception must be recorded in the change
record (H3) and never extended to production.

| Area | Class | Owner | Status |
| --- | --- | --- | --- |
| Retention schedule per category | HUMAN | HR / Payroll | ☐ pending |
| Retention-eligible categories | HUMAN | HR / Payroll + Legal | ☐ pending |
| Legal hold procedure | HUMAN | Legal / Compliance | ☐ pending |
| Backup/PITR implications | HUMAN | DBA | ☐ pending |
| Security controls | HUMAN | Security | ☐ pending |
| Final authorisation (tier 2 + `0021`) | HUMAN | Data Owner / DPO | ☐ pending |

`RETENTION_ELIGIBLE_CATEGORIES` stays `[]` until these rows are approved and a
dated config change is reviewed.

---

## 5. Change record (single blocking item)

| Item | Class | Owner | Reviewer | Status |
| --- | --- | --- | --- | --- |
| Change record: ID, window, rollback owner, incident commander (+ rehearsal def A3/A9/A10) | HUMAN | joint (DBA+APP) | OPS | **ABSENT** |

`H3` is best opened **first** so every artifact can carry a ticket ID (dispatch
§3 Wave 4 note). Without it, `A3` stays open and rehearsal cannot begin.

---

## 6. What this workspace can and cannot do

**Can (read-only, `AUTO` only):**

- Compute the repository checksum preflight for `0019`–`0022` and `_journal.json`
  (artifact `G4` corridor) — already recorded in dispatch §6 `L-1`…`L-5`; the
  values match the pack §0 anchors. This is a **repository fact**, not staging
  evidence; the gate still requires the DBA in-rehearsal re-verification (`B-14`).
- Read source values for the control plane (`DELETION_EXECUTION_ENABLED = false`,
  `RETENTION_ELIGIBLE_CATEGORIES = []`) — again a repository fact; the `G3`/`A14`
  gate requires config + test output from the **pinned deployed build**.

**Cannot (no authorized capability in this workspace):**

- Produce any `SEMI` artifact — no staging DB access, no connection string, and
  the application team must not run DBA templates (pack §1 rule 3).
- Produce any `HUMAN` artifact — no approval authority, no attestation authority.
- Sign `A1`/`A2`, open the change record, or obtain the independent review.
- Send M-1…M-5: **no official outbound connector exists here** (dispatch §1);
  dispatch requires an authorized person using the organization's channel.
- Run the staging rehearsal: `0022 runbook §0.9` forbids it without recorded
  DBA + Application Lead authorization (`§4.1`), and `§5.0` requires an explicit
  `STAGING_DATABASE_URL` with `HRIS_ENV=staging` — neither of which this
  workspace may supply.

---

## 7. Isolation caveat (honest status — do not self-mark PASS)

Master §C.1 accepts a separate **cluster or database** with separate owner and no
production network route. This host has historically carried same-instance
staging databases (`hris_rehearse_*`, `hris_emd_reconciliation_staging*`,
`hris_security_rotation_staging`, etc.). Whether a fresh isolated target can be
proven isolated (separate endpoint/credential/role/storage, production route
unreachable) is **unproven**. If it cannot be proven, master §H / 0022 runbook §7
STOP applies: *staging cannot be proven isolated*. This is recorded here as
**UNPROVEN**, not PASS.

---

## 8. Consolidated state (2026-10-20)

| Category | Count | Items |
| --- | ---: | --- |
| Artifacts received | 0 | — |
| Artifacts `CONFIRMED` | 0 | — |
| Artifacts `PENDING` | 47 | `A1`–`H3` |
| Part A `A1`–`A14` | 14 PENDING | — |
| Part B `B1`–`B13` | 13 PENDING | out of staging scope |
| Policy §4 | 6 PENDING | production-only |
| Change record | ABSENT | `H3` |
| Staging gates | 5 BLOCKED | `G1-S`–`G5-S` |
| Blockers `OPEN` | 14 | `B-01`–`B-11`, `B-13`–`B-15` |
| Blockers `CLOSED` | 1 | `B-12` (doc-only) |
| Independent review | NONE | — |

**Staging readiness: NOT READY. Production readiness: NOT READY.**

---

## 9. Explicit non-actions in compiling this document

- No message sent; no owner contacted; no identity fabricated.
- No database contacted; no query executed.
- No migration run/generated/pushed/applied/journaled; no journal, snapshot,
  ledger, schema, or configuration modified.
- No seed, deployment, RBAC seed, backup, restore, rehearsal, or employee
  deletion performed or authorized.
- No secret, `.env.production`, connection string, or production endpoint read
  or guessed.
- No `PENDING` row advanced; no gate set to `PASS`; no approval recorded; no
  evidence fabricated.
- No existing document modified; this document is new and additive.

**Conclusion:** this index consolidates the 47 staging artifacts, 14 Part A rows,
13 Part B rows, 6 policy §4 rows, and the single change record; classifies each
as `AUTO`/`SEMI`/`HUMAN`; assigns owners and independent reviewers; and records
that **none** may be produced or confirmed from this workspace. Staging and
production both remain **NOT READY**; all artifacts remain `PENDING`; no gate is
`PASS`.
