# Employee Permanent-Delete — Release Approval Matrix (A / B / §4)

**Document type:** CONSOLIDATED STATUS MATRIX. It records what has and has not
been approved. It **is not** an approval and cannot be used as one.
**Generated:** 2026-10-21 (UTC) · **Last updated:** 2026-10-21 (UTC) — owner
scope approval recorded (§6a), revised `0022` checksum
`3750812f76be5cef1f3356eaf7872208494a31b26b4a2d5ef7433c1ae69160b5` pending DBA
review · **Repository:** `/opt/hris` (local `main`, work on top of `00e4655`,
not pushed)
**Overall release status:** **RELEASE BLOCKED**

> **No signature in this document is fabricated.** Every approval row below is
> reported exactly as found in the source documents: unchecked boxes remain
> unchecked, blank name/signature/timestamp cells remain blank and are marked
> **BLOCKED**. A row is marked `RECORDED` only where a named owner with the
> required role has actually recorded a decision in this repository.
>
> **No role may sign another role's row.** The requesting owner's approval does
> **not** substitute for any DBA, Legal/Compliance, DPO, HR/Payroll, Security or
> Application Lead signature. The owner's 2026-10-21 scope approval
> (`docs/employee-deletion-owner-scope-approval-20261021.md`) is recorded at
> **owner level only** in §6a and changes nothing in §1–§5.

**Sources (read-only, 2026-10-21):**

| Source | Path |
| --- | --- |
| Approval checklist (Part A / Part B / stop conditions) | `docs/employee-permanent-delete-0022-approval-checklist.md` |
| Policy §4 retention sign-off | `docs/employee-permanent-delete-policy.md` §4.1 |
| Staging evidence intake register (47 artifacts, gates) | `docs/employee-permanent-delete-0022-staging-evidence-intake-register.md` |
| Staging readiness audit | `docs/employee-permanent-delete-0022-staging-readiness-audit.md` |
| Evidence coordination request (blockers) | `docs/employee-permanent-delete-0022-staging-evidence-coordination-request.md` |
| 0021 staging runbook §5.1 prerequisites | `docs/employee-deletion-0021-staging-runbook.md` |
| DBA handoff / evidence request | `docs/employee-permanent-delete-dba-handoff.md`, `…-dba-evidence-request.md` |
| Production release report | `docs/SUPERADMIN-FORCE-DELETE-PRODUCTION-REPORT.md` |

---

## 0. Totals

| Gate set | Rows | Recorded / PASS | State |
| --- | ---: | ---: | --- |
| Staging Part A prerequisites (`A1`–`A14`) | 14 | 0 | **BLOCKED** |
| Production Part B requirements (`B1`–`B13`) | 13 | 0 | **BLOCKED** |
| Policy §4.1 retention sign-off | 6 | 0 | **BLOCKED** |
| Staging evidence gates (`G1-S`–`G5-S`) | 5 | 0 `PASS` | **BLOCKED** |
| Production evidence gates (`G1-P`–`G4-P`) | 4 | 0 `PASS` | **BLOCKED** |
| Staging evidence artifacts (`A1`–`H3` register rows) | 47 | 0 received / 0 confirmed | **BLOCKED** |
| Blockers (`B-01`–`B-15`) | 15 | 14 `OPEN`, 1 `CLOSED` | **BLOCKED** |
| DBA signed authorization / attestation | 1 | 0 | **BLOCKED** |
| Rehearsal authorization (staging) | 1 | 0 | **BLOCKED** |
| Production deployment authorization | 1 | 0 | **BLOCKED** |

**Nothing may be applied, journaled, rehearsed on staging, deployed or deleted
in production while any row above is `BLOCKED`.**

---

## 1. Part A — Staging prerequisites (`A1`–`A14`) — **all BLOCKED**

Record approver name, decision, UTC timestamp and evidence link for each row.

| # | Prerequisite | Owner | Evidence required | Approver / signature | UTC | State |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | DBA authorization for the staging rehearsal | DBA | signed change record §A.1 | *(blank)* | *(blank)* | **BLOCKED — not signed** |
| A2 | Application Lead authorization for the compatible build + deploy order | Application Lead | signed change record §A.1 | *(blank)* | *(blank)* | **BLOCKED — not signed** |
| A3 | Change record opened (ID, window, rollback owner, incident commander) | DBA + Application Lead | change record | *(blank)* | *(blank)* | **BLOCKED — no change record** |
| A4 | Staging isolation verified (separate cluster/roles/secrets/storage; no production route) | DBA + Application Lead | §5.2 / master §C isolation matrix | *(blank)* | *(blank)* | **BLOCKED — isolation unproven (`B-01`)** |
| A5 | Pre-apply backup captured **and** restore-rehearsed into a disposable DB | DBA | §5.3 dump label + SHA-256 + restore output | *(blank)* | *(blank)* | **BLOCKED — staging backup not evidenced (`B-06`)** |
| A6 | Reviewed artifact checksum re-verified against `3750812f…0b5` (revised `0022`, payroll-deletion scope) and `0021` = `585dd2d7…c452` | DBA | §5.4 output | *(blank)* | *(blank)* | **BLOCKED — in-rehearsal DBA re-verification not recorded (`B-14`); revised `0022` not yet DBA-reviewed** |
| A7 | Migration lineage assessment accepted (0019–0022 status known; plan recorded) | DBA + Application Lead | lineage reconciliation plan §3 evidence | *(blank)* | *(blank)* | **BLOCKED — `B-02`/`B-03`/`B-05` open** |
| A8 | Compatible application build identified, pinned, deployment order fixed (migration first) | Application Lead | §3 order + build ID | *(blank)* | *(blank)* | **BLOCKED — build not pinned (`B-07`)** |
| A9 | Transaction rollback rehearsal defined (disposable clone; §5.7 Test A/B/C) | DBA | §5.7 plan | *(blank)* | *(blank)* | **BLOCKED — `B-10` open** |
| A10 | Historical-reporting validation defined (§5.8 assertions; payslip password resolves) | Application Lead + HR/Payroll | §5.8 plan | *(blank)* | *(blank)* | **BLOCKED — `B-10` open** |
| A11 | Evidence capture plan and stop conditions acknowledged | DBA + Application Lead | §5.10 evidence pack; §7 stop conditions | *(blank)* | *(blank)* | **BLOCKED — `B-10` open** |
| A12 | Staging guard in use for every modifying command (`HRIS_ENV=staging`, explicit `STAGING_DATABASE_URL`, no `DATABASE_URL` fallback) | operator | §5.0 guard | *(blank)* | *(blank)* | **BLOCKED — guard not attested (`B-08`)** |
| A13 | Synthetic employees only; no production PII in staging evidence | operator | runbook §0 rule 7 | *(blank)* | *(blank)* | **BLOCKED — attestation absent (`B-13`)** |
| A14 | Control plane confirmed disabled (`DELETION_EXECUTION_ENABLED=false`, `RETENTION_ELIGIBLE_CATEGORIES=[]`) | Application Lead | config + test output | *(blank)* | *(blank)* | **BLOCKED — recorded config evidence absent (`B-09`)** |

**Part A result: 0 / 14 recorded → staging rehearsal is NOT authorized.**
(`A1`/`A2` are additionally required to be signed **last**, only after
`B-01`…`B-10` are evidenced.)

**Staging exception (must be recorded in the change record when opened):**
policy §4 retention sign-off is **not** required for the *staging* rehearsal of
`0022` (non-destructive to retained data; enables no tier-2 capability). The
exception does **not** carry over to production and is currently unrecorded.

---

## 2. Part B — Production requirements (`B1`–`B13`) — **all BLOCKED**

Every row is required. No production apply, no journaling and no executor
enablement may proceed on a subset.

| # | Approval | Owner | Evidence required | Approver / signature | UTC | State |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Migration SQL review + staging rehearsal evidence accepted | DBA | rehearsal evidence pack §5.10 | *(blank)* | *(blank)* | **BLOCKED — no DBA review; revised `0021` package pending (`585dd2d7…c452`)** |
| B2 | Retention/detach design acceptable for every protected category in-jurisdiction | Legal / Compliance | design §7 sign-off | *(blank)* | *(blank)* | **BLOCKED — no Legal signature** |
| B3 | Personal-data handling of retained identity snapshots accepted | DPO | DPO decision record | *(blank)* | *(blank)* | **BLOCKED — no DPO decision record** |
| B4 | Retention schedule per category + permissible deletion window | HR / Payroll (+ Legal) | policy §4.1 rows | *(blank)* | *(blank)* | **BLOCKED — §4.1 rows pending** |
| B5 | Compatible application build + ordered rollout accepted | Application Lead | build ID + order | *(blank)* | *(blank)* | **BLOCKED — not pinned (`B-07`)** |
| B6 | Migration-lineage reconciliation executed; `0019`–`0022` journaled through the approved channel | DBA (reconciliation owner) | R2/R4/R5 records | *(blank)* | *(blank)* | **BLOCKED — production ledger still 18 rows, `0019`/`0021`/`0022` unapplied** |
| B7 | Data Owner / DPO final authorization to enable tier 2 / apply the destructive-release migration set | Data Owner / DPO | policy §4.1 final row | *(blank)* | *(blank)* | **BLOCKED — §4.1 final row pending** |
| B8 | Backup/PITR vs deletion expectations accepted | DBA | policy §4.1 backup row | *(blank)* | *(blank)* | **BLOCKED — §4.1 backup row pending** |
| B9 | Security controls accepted (dual control, self-approval prevention, audit integrity, tenant isolation) | Security | master §F security gate | *(blank)* | *(blank)* | **BLOCKED — no Security signature** |
| B10 | Production write-freeze / payroll cutoff / window / rollback owner / RPO-RTO approved | DBA + Application Lead + Payroll/HR | master §G.1 | *(blank)* | *(blank)* | **BLOCKED — no window defined** |
| B11 | Deployment-controller verification complete (no unreviewed automatic migration) | DBA | master §G.2 | *(blank)* | *(blank)* | **BLOCKED — deploy workflow still auto-deploys any `main` push with no approval environment** |
| B12 | Monitoring, audit logging, alerting, incident contacts active | Application Lead + DBA | master §G.1 | *(blank)* | *(blank)* | **BLOCKED — not evidenced** |
| B13 | Post-deployment read-only verification plan approved | DBA + Application Lead | master §G.3 | *(blank)* | *(blank)* | **BLOCKED — plan not approved** |

**Part B result: 0 / 13 recorded → production application is NOT authorized.**

> Note: `B12` in **this** table is a production approval row. The *blocker*
> named `B-12` in the evidence register is a different identifier and is the
> only `CLOSED` blocker (documentation correction, 2026-10-16).

---

## 3. Policy §4 — Retention sign-off (BLOCKING) — **all BLOCKED**

Source: `docs/employee-permanent-delete-policy.md` §4.1. Required **before**
tier 2 is enabled or migration `0021` is applied as part of a destructive
release.

| Area | Owner | Decision required | Recorded approval |
| --- | --- | --- | --- |
| Retention schedule per category | HR / Payroll | Legal minimum retention per category and permissible deletion window | **BLOCKED — ☐ pending** |
| Retention-eligible categories | HR / Payroll + Legal | Which protected categories may be deleted with approval, and after what period | **BLOCKED — ☐ pending** |
| Legal hold procedure | Legal / Compliance | Who may place/release a hold; escalation and evidence | **BLOCKED — ☐ pending** |
| Backup/PITR implications | DBA | Backup retention vs. deletion expectations; restore behaviour | **BLOCKED — ☐ pending** |
| Security controls | Security | Dual-control enforcement, self-approval prevention, audit integrity | **BLOCKED — ☐ pending** |
| Final authorisation | Data Owner / DPO | Approval to enable tier 2 and apply `0021` | **BLOCKED — ☐ pending** |

**§4 result: 0 / 6 recorded.** Consequences while this holds:
`RETENTION_ELIGIBLE_CATEGORIES` stays `[]`, `DELETION_EXECUTION_ENABLED` stays
`false`, every protected category resolves to tier 3 (absolute refusal), and
**the multi-role sign-off for the retention/deletion policy remains absent**.
The project owner has separately approved the payroll-deletion *scope* at
owner level
(`docs/employee-deletion-owner-scope-approval-20261021.md`): payroll history
is implemented as a deletable category and verified in isolated databases
(`docs/employee-deletion-payroll-scope-decision-record.md`). That owner
approval **does not** satisfy, waive or replace any §4.1 row above, and no
production apply/deploy/delete is authorized while this section is 0/6.

---

## 4. Evidence gates

### 4.1 Staging gates — **all BLOCKED**

| Gate | Scope | Intake status | Blocking dependency |
| --- | --- | --- | --- |
| `G1-S` | `0020` staging security/operational disposition | **BLOCKED / PENDING** | `B-04`, `B-09`, `B-14` |
| `G2-S` | `0019`–`0022` staging application status, zero `unexplained` | **BLOCKED / PENDING** | `B-03`, `B-05` |
| `G3-S` | staging ledger/snapshot reconciliation | **BLOCKED / PENDING** | `B-02`, `B-05` |
| `G4-S` | staging backup + disposable-DB restore | **BLOCKED / PENDING** | `B-06`, `B-14` |
| `G5-S` | staging isolation | **BLOCKED / PENDING** | `B-01`, `B-08` |

### 4.2 Production gates — **all BLOCKED**

| Gate | Scope | Intake status |
| --- | --- | --- |
| `G1-P` | production `0020` disposition | **BLOCKED / PENDING** |
| `G2-P` | production `0019`–`0022` application status | **BLOCKED / PENDING** |
| `G3-P` | production ledger/snapshot reconciliation | **BLOCKED / PENDING** |
| `G4-P` | production backup + restore verification | **BLOCKED / PENDING** |

### 4.3 Evidence artifacts — **0 / 47 received**

Register rows `A1`–`H3` in
`docs/employee-permanent-delete-0022-staging-evidence-intake-register.md`:
**47 requested · 0 received · 0 `CONFIRMED` · 0 `NOT CONFIRMED` ·
0 `UNAVAILABLE` · 47 `PENDING`.**
Received-artifact log: empty. Formal approval record (§8.2): all boxes `☐`.

---

## 5. Blockers (`B-01`–`B-15`)

| ID | Summary | Owner | State |
| --- | --- | --- | --- |
| B-01 | Staging environment identity and isolation unproven | DBA + Application Lead | **OPEN** |
| B-02 | No live staging ledger capture | DBA | **OPEN** |
| B-03 | No live staging catalog capture for `0019`–`0022` | DBA + Application Lead | **OPEN** |
| B-04 | `0020` staging state unverified; no identified staging build | DBA + Application Lead | **OPEN** |
| B-05 | Staging live max ledger `created_at` unknown ⇒ safe repair `when` not computable | DBA + Application Lead | **OPEN** |
| B-06 | No staging backup manifest/checksum, no restore test, no PITR posture | DBA | **OPEN** |
| B-07 | Compatible build not pinned; deploy order not fixed | Application Lead | **OPEN** |
| B-08 | Staging guard not attested for the rehearsal shell | operator + DBA | **OPEN** |
| B-09 | Control-plane disabled state not evidenced as recorded config + test output | Application Lead | **OPEN** |
| B-10 | Change record absent; §5.7/§5.8 plans not recorded/accepted | DBA + Application Lead | **OPEN** |
| B-11 | Part A authorizations absent (`A1`, `A2`) | DBA + Application Lead | **OPEN** |
| B-12 | Runbook §1.4 catalog-claim had no artifact (claim withdrawn) | Application Lead | **CLOSED** (documentation correction, 2026-10-16; no gate advanced) |
| B-13 | Synthetic-data / no-production-PII attestation absent | operator + DBA | **OPEN** |
| B-14 | `A6` in-rehearsal DBA checksum re-verification not recorded | DBA | **OPEN** |
| B-15 | Runtime idempotency and rollback **UNPROVEN** | DBA | **OPEN** — partial isolated evidence exists (`/tmp/opencode/migreg-20261021-*`, rehearsal evidence 2026-10-21) but **no approved rehearsal has run**, so the blocker stays open |

**14 OPEN / 1 CLOSED.**

---

## 6. Additional authorization rows

| Authorization | Owner | State | Evidence |
| --- | --- | --- | --- |
| DBA signed authorization / attestation for `0019`–`0022` | DBA | **BLOCKED — none present** | `docs/employee-permanent-delete-dba-handoff.md` §7.1 (unsigned) |
| Staging rehearsal authorization (`§5` execution) | DBA + Application Lead | **BLOCKED — Part A 0/14** | approval checklist Part A |
| Revised `0021` SQL review acceptance | DBA + Security | **BLOCKED — package ready, unsigned** | `docs/employee-deletion-0021-dba-review-package.md` §9 |
| Revised `0022` SQL review acceptance (payroll-deletion scope, checksum `3750812f…0b5`) | DBA + Security | **BLOCKED — not yet reviewed** | `docs/employee-deletion-payroll-scope-decision-record.md` §5; DBA re-review required before any application |
| Lineage reconciliation decision (R2) + execution (R4/R5) | DBA | **BLOCKED — decision not recorded** | `docs/employee-permanent-delete-0022-lineage-reconciliation-plan.md` |
| Drizzle journal/snapshot repair authorization | DBA | **BLOCKED — never granted** | explicit non-action in plan §11 |
| Production write-freeze / window approval | DBA + App Lead + Payroll/HR | **BLOCKED** | master §G.1 |
| Push of the release candidate to `origin/main` | Application Lead | **BLOCKED — not pushed** | `origin/main` = `e735f47` |
| Production deployment | Deployment owner | **BLOCKED — deploy not started** | production report §6.3 |
| Owner-level approval (release request) | Requesting owner | **RECORDED** — release request / production report §1.1 | **Insufficient**: does not satisfy, waive or replace any row in §1–§5 or §6 |

### 6a. Owner scope approvals (OWNER LEVEL ONLY — recorded 2026-10-21)

| Owner-approved item | Level | Record | What it does NOT do |
| --- | --- | --- | --- |
| Proceeding with the Superadmin Force Delete release (implementation + verification) | Owner | `docs/employee-deletion-owner-scope-approval-20261021.md` §1 | Not a staging/production authorization |
| Permanent employee deletion scope (employee row + deletable related records; time/employment history retained via detach) | Owner | same §1 item 2 | Not a Legal/DPO/HR retention sign-off (§4 stays 0/6) |
| **Payroll history included in the deletion scope** (payroll components, payroll items + cascaded item components, payslips, payslip documents/versions deleted with the employee) | Owner | same §1 item 3; implemented scope in `docs/employee-deletion-payroll-scope-decision-record.md` §3 | Not a DBA review of revised `0022`; not a production authorization; does not close any Part A/Part B/§4 row |

---

## 7. What unblocks the release (dependency order)

1. **DBA** returns read-only evidence for `0019`–`0022` in *both* environments
   (`docs/employee-permanent-delete-dba-evidence-request.md`) → closes
   `B-01`–`B-06`.
2. **DBA + Security** sign the revised `0021` review package
   (`docs/employee-deletion-0021-dba-review-package.md` §9) **and review the
   revised `0022`** (payroll-deletion scope, checksum `3750812f…0b5`;
   `docs/employee-deletion-payroll-scope-decision-record.md` §5) → unblocks
   `A6`/`B1`.
3. **Application Lead** pins the build and fixes migration-first order →
   `B-07`.
4. **Operator + DBA** record staging guard + synthetic-data attestations →
   `B-08`, `B-13`.
5. **DBA + Application Lead** open the change record, record rollback /
   reporting plans and the evidence+STOP acknowledgement → `B-10`.
6. Evidence register `0/47 → 47/47` reviewed → gates `G1-S`–`G5-S` can move to
   `PASS`; **only then** `A1`/`A2` may be signed (`B-11`).
7. **Authorized staging rehearsal** runs per
   `docs/employee-deletion-staging-rehearsal-checklist-20261021.md` → `B-15`
   closes and produces the `B1` evidence.
8. **Legal, DPO, HR/Payroll, Security, Data Owner** record §4 and `B2`–`B4`,
   `B7`–`B9` decisions.
9. **DBA** executes the approved lineage reconciliation (R2 → R4 → R5) → `B6`.
10. **DBA + Application Lead + Payroll/HR** approve the window → `B10`–`B13`.
11. Only after 1–10: migration-first production apply, then deploy, then
    read-only verification.

**Until every row in §1–§4 is `RECORDED`/`PASS`, the final status stays
RELEASE BLOCKED.**
