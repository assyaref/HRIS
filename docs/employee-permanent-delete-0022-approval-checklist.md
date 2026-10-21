# Migration 0022 — Approval Checklist (Staging and Production)

**Status:** template, unexecuted. No checkbox here is satisfied by this review.
This checklist gates the approved staging rehearsal and, separately, production.
It does not authorize execution.

Related: `docs/employee-permanent-delete-0022-staging-change-review.md`,
`docs/employee-permanent-delete-0022-staging-runbook.md` §4/§5/§7,
`docs/migration-reconciliation-runbook.md` §F/§G/§H,
`docs/employee-permanent-delete-policy.md` §4.

---

## Part A — Staging prerequisites (BLOCKING before §5 runs)

Record approver name, decision, UTC timestamp, and evidence link for each row.
No single role may waive another role's gate.

| # | Prerequisite | Owner | Evidence | State |
| --- | --- | --- | --- | --- |
| A1 | DBA authorization for the staging rehearsal | DBA | signed change record §A.1 | ☐ |
| A2 | Application Lead authorization for the compatible build + deploy order | Application Lead | signed change record §A.1 | ☐ |
| A3 | Change record opened (ID, window, rollback owner, incident commander) | DBA + Application Lead | change record | ☐ |
| A4 | Staging isolation verified (separate cluster/roles/secrets/storage; no production route) | DBA + Application Lead | §5.2 / master §C isolation matrix | ☐ |
| A5 | Pre-apply backup captured **and** restore-rehearsed into a disposable DB | DBA | §5.3 dump label + SHA-256 + restore output | ☐ |
| A6 | Reviewed artifact checksum re-verified against `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` | DBA | §5.4 output | ☐ |
| A7 | Migration lineage assessment accepted (0019–0022 status known; plan recorded) | DBA + Application Lead | lineage reconciliation plan §3 evidence | ☐ |
| A8 | Compatible application build identified, pinned, and deployment order fixed (migration first) | Application Lead | §3 order + build ID | ☐ |
| A9 | Transaction rollback rehearsal defined (disposable clone; §5.7 Test A/B/C) | DBA | §5.7 plan | ☐ |
| A10 | Historical-reporting validation defined (§5.8 assertions; payslip password resolves from snapshots) | Application Lead + HR/Payroll | §5.8 plan | ☐ |
| A11 | Evidence capture plan and stop conditions acknowledged | DBA + Application Lead | §5.10 evidence pack; §7 stop conditions | ☐ |
| A12 | Staging guard in use for every modifying command (`HRIS_ENV=staging`, explicit `STAGING_DATABASE_URL`, no `DATABASE_URL` fallback) | operator | §5.0 guard | ☐ |
| A13 | Synthetic employees only; no production PII in staging evidence | operator | runbook §0 rule 7 (`§0.7`) | ☐ |
| A14 | Control plane confirmed disabled (`DELETION_EXECUTION_ENABLED=false`, `RETENTION_ELIGIBLE_CATEGORIES=[]`) | Application Lead | config + tests | ☐ |

**Staging exception to record:** the policy §4 retention sign-off is **not**
required for the staging rehearsal of `0022` (it is non-destructive to retained
data and enables no tier-2 capability). Record this exception explicitly in the
change record. It does **not** carry over to production.

**Staging gate outcome:** when A1–A14 are recorded, staging may run §5. A
staging pass authorizes nothing beyond "0022 rehearsed on staging".

---

## Part B — Production requirements (BLOCKING, separate)

Every row is required; no production apply, no journaling, and no executor
enablement may proceed on a subset. Follow master runbook §F gates.

| # | Approval | Owner | Evidence | State |
| --- | --- | --- | --- | --- |
| B1 | Migration SQL review + staging rehearsal evidence (§5) accepted | DBA | rehearsal evidence pack §5.10 | ☐ |
| B2 | Retention/detach design acceptable for every protected category in-jurisdiction | Legal / Compliance | design §7 sign-off | ☐ |
| B3 | Personal-data handling of retained identity snapshots accepted | DPO | DPO decision record | ☐ |
| B4 | Retention schedule per category + permissible deletion window | HR / Payroll (+ Legal) | policy §4.1 rows | ☐ |
| B5 | Compatible application build + ordered rollout accepted | Application Lead | build ID + order | ☐ |
| B6 | Migration-lineage reconciliation decision executed; `0019`–`0022` journaled through the approved channel | DBA (reconciliation owner) | R2/R4/R5 records | ☐ |
| B7 | Data Owner / DPO final authorization to enable tier 2 / apply the destructive-release migration set | Data Owner / DPO | policy §4.1 final row | ☐ |
| B8 | Backup/PITR vs deletion expectations accepted | DBA | policy §4.1 backup row | ☐ |
| B9 | Security controls accepted (dual control, self-approval prevention, audit integrity, tenant isolation) | Security | master §F security gate | ☐ |
| B10 | Production write-freeze / payroll cutoff / window / rollback owner / RPO-RTO approved | DBA + Application Lead + Payroll/HR | master §G.1 | ☐ |
| B11 | Deployment-controller verification complete (no unreviewed automatic migration) | DBA | master §G.2 | ☐ |
| B12 | Monitoring, audit logging, alerting, incident contacts active | Application Lead + DBA | master §G.1 | ☐ |
| B13 | Post-deployment read-only verification plan approved | DBA + Application Lead | master §G.3 | ☐ |

**Production-vs-staging distinction:** staging rehearses the migration on an
isolated clone and proves runtime idempotency/rollback/reporting. Production
additionally requires the legal, privacy, retention, and lineage-processing
approvals above (B2–B9), which staging deliberately does not require.

---

## Part C — Stop conditions (any one halts the workstream)

Escalate to the DBA + Application Lead. STOP means do not deploy, do not retry a
migration, do not edit the journal, and preserve evidence.

- Staging cannot be proven isolated (shared endpoint, credential, role, storage,
  or reachable production route).
- Any preflight/migration checksum differs from the reviewed artifact
  (`724db82d…65c`).
- The §5.5 AFTER catalog differs from the §1.3 contract — especially any
  `confdeltype = 'c'` (CASCADE) or a missing retained-identity CHECK.
- Any detached row has `employee_number_snapshot IS NULL` (anonymous retention).
- The §5.6 pre-deletion idempotency re-run, **or** the §5.8 step 4
  post-deletion re-run, errors.
- The §5.7 rollback fingerprint changes (transaction guarantee broken).
- A retained record disappears from a management listing, or a payslip PDF
  password cannot be resolved from snapshots.
- Any attempt to run `generate`/`push`, edit the journal, or edit ledger rows.
- `DELETION_EXECUTION_ENABLED` becomes `true`, or
  `RETENTION_ELIGIBLE_CATEGORIES` becomes non-empty.
- `0019`/`0020` production state is `unexplained` after evidence capture.
- A base requirement fails: target commit unproven, no verified backup, backup
  not restore-tested, production object unexplained, or a required §F gate
  missing/expired/unauthorized (master runbook §H).

---

## Part D — Required approvals summary

- **Staging:** DBA + Application Lead (A1, A2), plus the staging prerequisites
  A3–A14.
- **Production:** DBA, Legal/Compliance, DPO, HR/Payroll, Application Lead, and
  the migration-lineage reconciliation owner (B1–B13).

**No execution is authorized by this checklist.** Migration `0022` remains
unapplied and unjournaled; no database, journal, seed, deployment, or employee
deletion action has occurred.
