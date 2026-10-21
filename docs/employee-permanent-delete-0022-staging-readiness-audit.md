# Migration 0022 — Final Pre-Rehearsal Staging Readiness Audit

**Document type:** READINESS AUDIT (read-only, pre-rehearsal). This is **not** an
approval, a change record, or an execution instruction. It authorizes nothing.

**Status:** OPEN. No staging gate passes. No live artifact has been received.
Every live-evidence row below is `PENDING` / `BLOCKED`.

**Date of audit:** 2026-10-16
**Repository:** `/opt/hris` (git `main`, working tree; no commit made)
**Scope:** final pre-rehearsal readiness audit for migration `0022`
(`db/migrations/0022_employee_retention_detach.sql`) staging rehearsal, based on
the six documents below plus read-only repository checks.

**Review inputs (the six required documents):**

1. `docs/employee-permanent-delete-dba-evidence-intake.md`
2. `docs/employee-permanent-delete-0022-approval-checklist.md`
3. `docs/employee-permanent-delete-dba-handoff.md`
4. `docs/employee-permanent-delete-0022-staging-runbook.md`
5. `docs/employee-permanent-delete-0022-staging-change-review.md`
6. `docs/employee-permanent-delete-0022-lineage-reconciliation-plan.md`

**Supporting documents (cited, not re-audited here):**
`docs/employee-permanent-delete-dba-evidence-request.md`,
`docs/employee-permanent-delete-0022-detach-design.md`,
`docs/employee-permanent-delete-policy.md`,
`docs/employee-deletion-0021-staging-runbook.md`,
`docs/migration-reconciliation-runbook.md`.

> **Hard boundary.** This audit did **not** connect to any database, did not read
> any secret or connection string, did not run any migration/seed/deployment, and
> did not touch migration journal, snapshots, schema files, ledger rows, or
> employee data. No runtime idempotency or rollback is claimed proven.

---

## 0. Method and limits

- **Document consistency:** the six documents were read in full and cross-checked
  against each other for references, terminology, anchors, status vocabulary, and
  the staging-vs-production separation.
- **Checksums:** recomputed read-only with `sha256sum` against the anchors recorded
  in the documents. Migration files were **not** modified.
- **Repository lineage facts:** verified read-only (journal entry count/tags,
  snapshot file set, `0022` transaction shape, control-plane flags).
- **No live evidence:** no database query was executed. No read-only artifact from
  any environment is attached. Therefore no gate may be marked `PASS` (per
  evidence-intake §0 rule 2 and handoff §6).
- **Result vocabulary:** `CONFIRMED` / `NOT CONFIRMED` / `UNAVAILABLE` / `PENDING`
  (evidence-intake §0 rule 5). Gate states: `PASS` / `BLOCKED`.

---

## 1. Document consistency findings

| # | Check | Result | Note |
| --- | --- | --- | --- |
| 1 | Six documents exist and cross-reference each other consistently | `CONFIRMED` | References resolve to existing files. |
| 2 | Staging and production approval paths kept separate (Part A vs Part B; §7.1 vs §7.2) | `CONFIRMED` | A staging pass authorizes nothing for production in all six. |
| 3 | Status vocabulary consistent (`PENDING`/`BLOCKED`; no gate `PASS`) | `CONFIRMED` | All gates start `BLOCKED`; all live rows `PENDING`. |
| 4 | `0022` SHA-256 anchor consistent across documents | `CONFIRMED` | `724db82d…65c` used identically in all four documents that cite it. |
| 5 | `0019`–`0022` full checksums match between handoff §1.1 and lineage plan §1.4 | `CONFIRMED` | Byte-for-byte identical. |
| 6 | Lineage facts (`_journal.json` = 20 entries, last `0018`; snapshots stop at `0014`; `0015`/`0016` skip rule) consistent | `CONFIRMED` | Re-verified read-only (§2). |
| 7 | Runtime idempotency / rollback consistently stated `UNPROVEN` | `CONFIRMED` | Change review §4/§5, runbook §2/§2.1. |
| 8 | Control-plane disabled state consistent (`DELETION_EXECUTION_ENABLED=false`, `RETENTION_ELIGIBLE_CATEGORIES=[]`) | `CONFIRMED` | A14; re-verified read-only (§2). |
| 9 | Retention sign-off staging exception recorded consistently | `CONFIRMED` | Approval checklist Part A note; runbook §4.1; intake §7.1.5. |

### 1.1 Observations requiring follow-up (do not affect any gate by themselves)

| # | Observation | Assessment | Required action |
| --- | --- | --- | --- |
| O1 | Staging runbook §1.4 states `Migration inspected against the PostgreSQL catalog (read-only) \| done (parent task)` with no attached raw artifact and no environment label. | A parent-task assertion is **not** evidence (evidence-intake §0 rule 2; handoff §6). The environment is ambiguous. | Replace with a labelled, attached `EVD-staging-…` / `EVD-production-…` artifact, or remove the claim. **Resolved 2026-10-16:** the claim was withdrawn in runbook §1.4 and blocker `B-12` closed as a documentation corrective action; the live catalog evidence is still required via pack `C1`–`C9` for `B-03`/`G1-S`/`G2-S`. No gate was advanced. |
| O2 | Staging runbook §1.2 and change review §7.1 carry forward "recorded leads" (e.g. production `0019` NOT APPLIED 2026-10-01; `0020` UNVERIFIED since 2026-10-10). | Correctly labelled as leads, not proof. | Reclassify only from live ledger + catalog (G2). |
| O3 | Change review §3 test counts (45/44/168, full 1,933) vs runbook §1.4 (257 = 45/44/168; 1,933). | Consistent. | None. |

---

## 2. Read-only checksum and repository-lineage verification

### 2.1 Migration SHA-256 (recomputed read-only; NOT modified)

| Migration | File | Recomputed SHA-256 | Documented anchor | Match |
| --- | --- | --- | --- | --- |
| 0019 | `db/migrations/0019_face_template_key_version.sql` | `21752cce27b490807854a5c27387d8525738d1a9fe718b9dada1e89b63042d27` | `21752cce…2d27` | ✅ MATCH |
| 0020 | `db/migrations/0020_user_password_lifecycle.sql` | `baf1887559aa0d8cb7905a17d5a71c8a8b506431624d9445747ca88d0f3a4eaa` | `baf18875…4eaa` | ✅ MATCH |
| 0021 | `db/migrations/0021_employee_deletion_controls.sql` | `0e234c6ee9d2551686b28e93949f0d1c2573df8240bf0ded7a3eb92b52407764` | `0e234c6e…7764` | ✅ MATCH |
| 0022 | `db/migrations/0022_employee_retention_detach.sql` | `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` | `724db82d…65c` | ✅ MATCH |

Line counts recomputed: `0019`=61, `0020`=52, `0021`=112, `0022`=570 — all match
the lineage plan §1.4. `0022` contains exactly one `BEGIN;` (line 65) and one
`COMMIT;` (line 570).

### 2.2 Repository lineage facts (re-verified read-only)

| Fact | Claimed | Verified | Result |
| --- | --- | --- | --- |
| `_journal.json` entries | 20 (idx 0–19); last `0018_employee_custom_tabs` | 20; last idx 19 `0018_employee_custom_tabs` | ✅ |
| `0019`–`0022` in journal | absent | absent | ✅ |
| Snapshot files | stop at `0014` | `0000`–`0014` present; no `0015`+ | ✅ |
| `DELETION_EXECUTION_ENABLED` | `false` | `false` (`deletion-control-policy.ts:100`) | ✅ |
| `RETENTION_ELIGIBLE_CATEGORIES` | `[]` | `[]` (`deletion-control-policy.ts:79-80`) | ✅ |

**Conclusion of §2:** the reviewed artifact identity is intact and the
repository-side lineage facts used by the documents are accurate. This does
**not** establish any environment's applied state — only the live ledger plus
live catalog can (handoff §6; evidence-intake §0.1).

---

## 3. Staging readiness gate matrix

**Legend — Classification:**
- **[S]** staging-specific prerequisite (belongs to the isolated rehearsal).
- **[X]** cross-environment prerequisite that genuinely reaches across environments
  because it is required to establish staging safety (artifact identity and
  staging lineage only, per evidence-intake §7.1.2).
- **[P]** production-specific approval/evidence that **must not** block an isolated
  staging rehearsal (evidence-intake §7.1; approval-checklist Part B).

`Status` values are the **actual** state at audit time. None is `PASS`.

### 3.1 Core evidence gates (staging register)

| Gate | Prerequisite | Required artifact | Owner | Class | Status | Reason BLOCKED |
| --- | --- | --- | --- | --- | --- | --- |
| G1-S | 0020 staging security/operational disposition (`routine` or `not-yet-deployed`) | E3.2, E4.1, E4.2, E4.3, E4.4, E6.2 (staging) | DBA + App Lead | [S] | `BLOCKED` / `PENDING` | No staging catalog capture of the three `users` columns and no identified staging build/release ID; `0020` state unverified. |
| G2-S | 0019–0022 applied/not-applied classified for **staging**; zero `unexplained` objects | E2.1–E2.5, E3.1–E3.6, E6.1 (staging) | DBA + App Lead | [S] | `BLOCKED` / `PENDING` | No live staging ledger rows and no live staging catalog; classification cannot be made from repository files. |
| G3-S | Staging ledger/snapshot reconciliation accepted: staging max ledger `created_at` known; safe repair `when` computable; ledger append-only; 0019–0022 hashes match; 0011/0012–0014 disposition recorded | E2.1, E2.3, E2.5, E6.1, E6.3 (staging) + lineage plan §1 | DBA + App Lead | [S] (with [X] lineage) | `BLOCKED` / `PENDING` | Staging's live max ledger `created_at` not captured, so a safe repair `when` cannot be computed; snapshot-chain disposition unrecorded in an approved artifact. |
| G4-S | Staging backup verified **and** restore-tested into an isolated disposable DB; PITR posture; private-file restore | E5.1–E5.6 (staging) | DBA | [S] | `BLOCKED` / `PENDING` | No staging backup manifest/checksum, no restore-test log, no PITR posture, no private-file restore verification. |
| G5-S | Staging isolation (separate cluster/DB, file root, secrets, roles, denied prod routes, disabled integrations, `HRIS_ENV=staging` guard) | E1.1–E1.3, E6.4 + master runbook §C.1 isolation matrix | DBA + App Lead | [S] | `BLOCKED` / `PENDING` | No environment-identity capture, no isolation-matrix attestation, no controller/automation review for staging. |

### 3.2 Part A prerequisites (approval-checklist A1–A14)

| # | Prerequisite | Required artifact | Owner | Class | Status | Reason BLOCKED |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | DBA authorization for the staging rehearsal | signed change record §A.1 | DBA | [S] | `PENDING` ☐ | No signed authorization recorded. |
| A2 | Application Lead authorization for compatible build + deploy order | signed change record §A.1 | App Lead | [S] | `PENDING` ☐ | No signed authorization recorded. |
| A3 | Change record opened (ID, window, rollback owner, incident commander) | change record | DBA + App Lead | [S] | `PENDING` ☐ | No change record (ID/window/rollback owner/incident commander). |
| A4 | Staging isolation verified | §5.2 / master §C isolation matrix | DBA + App Lead | [S] | `PENDING` ☐ | Same as G5-S; no isolation evidence. |
| A5 | Pre-apply backup captured **and** restore-rehearsed into a disposable DB | §5.3 dump label + SHA-256 + restore output | DBA | [S] | `PENDING` ☐ | No backup or restore rehearsal artifact. |
| A6 | Reviewed artifact checksum re-verified against `724db82d…65c` | §5.4 output | DBA | **[X]** | `PENDING` ☐ | Repository checksum **matches** (`724db82d…65c`, §2.1), but the in-rehearsal DBA re-verification (§5.4) is not recorded. |
| A7 | Migration lineage assessment accepted (0019–0022 status known; plan recorded) | lineage reconciliation plan §3 evidence | DBA + App Lead | **[X]** | `PENDING` ☐ | Requires staging's **actual** ledger max `created_at`; the lineage plan is `PROPOSED` and its environment rows are unverified leads. |
| A8 | Compatible build identified, pinned, deploy order fixed (migration first) | §3 order + build ID | App Lead | [S] | `PENDING` ☐ | No compatible build ID pinned, no deploy order recorded. |
| A9 | Transaction rollback rehearsal defined (disposable clone; §5.7 Test A/B/C) | §5.7 plan | DBA | [S] | `PENDING` ☐ | Plan text exists but is not recorded/accepted in a change record; not rehearsed. |
| A10 | Historical-reporting validation defined (§5.8) | §5.8 plan | App Lead + HR/Payroll | [S] | `PENDING` ☐ | Plan text exists but not recorded/accepted; not run. |
| A11 | Evidence capture plan and stop conditions acknowledged | §5.10 evidence pack; §7 stop conditions | DBA + App Lead | [S] | `PENDING` ☐ | No acknowledgement recorded. |
| A12 | Staging guard in use (`HRIS_ENV=staging`, explicit `STAGING_DATABASE_URL`, **no `DATABASE_URL` fallback**) | §5.0 guard | operator | [S] | `PENDING` ☐ | Guard defined in runbook but not attested as configured for the rehearsal shell. |
| A13 | Synthetic employees only; no production PII in staging evidence | runbook §0 rule 7 (`§0.7`) | operator | [S] | `PENDING` ☐ | No attestation recorded. |
| A14 | Control plane confirmed disabled (`DELETION_EXECUTION_ENABLED=false`, `RETENTION_ELIGIBLE_CATEGORIES=[]`) | config + tests | App Lead | [S] | `PENDING` ☐ | Repository confirms both flags now (`false`/`[]`, §2.2), but the gate requires recorded config + test evidence. |

### 3.3 Minimum prerequisites required for the staging rehearsal (task §5 coverage)

| Coverage item (task §5) | Where satisfied | Status |
| --- | --- | --- |
| Bukti identitas **dan** isolasi environment staging | E1.1–E1.3, G5-S, A4, runbook §5.2 | `PENDING` |
| Tidak ada fallback ke `DATABASE_URL` / akses production | A12, runbook §5.0 guard, G5-S | `PENDING` |
| Status migration ledger + katalog schema staging dibuktikan DBA | E2.x, E3.x, G1-S, G2-S | `PENDING` |
| Penilaian lineage staging memakai ledger aktual | G3-S, A7, lineage plan §3 | `PENDING` |
| Checksum migration yang telah ditinjau | A6, runbook §5.4 (repo match verified §2.1) | repo ✅ / gate `PENDING` |
| Backup staging + restore test ke DB disposable terisolasi | A5, runbook §5.3, G4-S | `PENDING` |
| Build aplikasi yang kompatibel | A8, runbook §3 | `PENDING` |
| Change record, jadwal, pemilik rollback | A3 | `PENDING` |
| Persetujuan DBA + Application Lead untuk Part A1–A14 | A1, A2 (+ A3–A14) | `PENDING` |

### 3.4 Production-only gates — explicitly **not** staging blockers

Per evidence-intake §7.1 (and §7.2), the following do **not** gate an isolated
staging rehearsal. They remain `PENDING` for production and are listed here only
to keep the separation explicit.

| Production item | Owner | Status | Staging-blocking? |
| --- | --- | --- | --- |
| G1-P / G2-P / G3-P / G4-P (production rows) | DBA + App Lead | `BLOCKED` / `PENDING` | No |
| E4.2–E4.4 (production deployed build / incident flag / value distribution) | DBA | `PENDING` | No |
| E5.1–E5.6 (production backup/PITR/restore) | DBA | `PENDING` | No |
| B1–B13 (production approvals incl. Legal/DPO/HR-Payroll/Security/Data Owner) | multiple | `PENDING` ☐ | No |
| Policy §4 retention sign-off | Data Owner / DPO | `PENDING` | No (staging exception recorded) |

---

## 4. Stop conditions that must halt the workstream

Any one of the following stops the workstream (escalate to DBA + App Lead;
preserve evidence). Sourced from approval-checklist Part C, runbook §7,
evidence-request §4, handoff §7.2, evidence-intake §5.

- **Checksum mismatch:** any preflight/migration checksum differs from the
  reviewed artifact `724db82d…65c` (or any 0019–0022 anchor).
- **Environment ambiguity / isolation failure:** staging shares a cluster, role,
  secret, storage root, or reachable production route; environment identity cannot
  be established; `HRIS_ENV`/`STAGING_DATABASE_URL` guard ambiguous.
- **Backup/restore unproven:** no verified, restore-tested backup into an isolated
  disposable DB; backup checksum/manifest missing or mismatched; private-file
  restore unverified.
- **Lineage undetermined:** no live max ledger `created_at`, a safe repair `when`
  cannot be made strictly greater, an unmapped ledger hash, a ledger row
  updated/deleted, or an unrecorded snapshot-chain disposition.
- **Incomplete evidence:** required evidence missing/incomplete/unverified; any
  `NOT CONFIRMED` or `UNAVAILABLE` on a required item.
- **Unexplained object:** any catalog object not classifiable
  `expected-approved`/`production-only`/`repository-only`.
- **`0020` uncertain:** columns absent while a build reading
  `must_change_password` is deployed, or the deployed build cannot be identified.
- **`0022` contract violation:** any `confdeltype='c'` (CASCADE) or missing
  `<table>_retained_identity_check`; any detached row with
  `employee_number_snapshot IS NULL`.
- **Idempotency/rollback failure:** pre-deletion or post-deletion re-run errors;
  rollback fingerprint changes.
- **Control-plane breach:** `DELETION_EXECUTION_ENABLED` becomes `true` or
  `RETENTION_ELIGIBLE_CATEGORIES` becomes non-empty; any `generate`/`push`,
  journal/ledger edit, RBAC seed, deployment, or employee deletion.
- **Evidence hygiene:** evidence contains secrets, connection strings, or
  unnecessary PII.

---

## 5. Next actions in dependency order

Read-only evidence collection may run in parallel where independent. Nothing
below authorizes an apply.

1. **Staging environment identity + isolation (A4, G5-S, E1.1–E1.3, E6.4).** DBA
   captures redacted DB identity, role classes, cluster/file-root/secrets
   separation, denied production routes, and controller/automation review;
   attaches labelled artifacts. *(Unblocks A4/G5-S; prerequisite for safe
   rehearsal.)*
2. **Staging ledger + catalog capture (E2.x, E3.1–E3.6, E6.1, G1-S, G2-S).** DBA
   captures live `drizzle.__drizzle_migrations` rows/count/max and the 0019–0022
   catalog; classifies every object; `unexplained` = STOP.
3. **Staging lineage assessment using the actual ledger (A7, G3-S).** DBA + App
   Lead compute the safe repair `when` strictly greater than staging's live max
   `created_at`, confirm append-only, and record the snapshot-chain disposition.
4. **Reviewed-artifact checksum re-verification (A6, §5.4).** DBA re-verifies
   `0022` = `724db82d…65c` at rehearsal time. *(Repository value already matches,
   §2.1.)*
5. **Staging backup + disposable-DB restore rehearsal (A5, §5.3, G4-S).** DBA
   captures pre-apply dump label + SHA-256, restores into an isolated disposable
   DB, records row-count/checksum reconciliation, PITR posture, and private-file
   restore verification.
6. **Compatible build pinned + deploy order fixed (A8, §3).** Application Lead
   records the build ID and migration-first order.
7. **Guard + control-plane evidence (A12, A14).** Operator/App Lead record
   `HRIS_ENV=staging`, explicit `STAGING_DATABASE_URL`, no `DATABASE_URL` fallback,
   and disabled control plane (`false`/`[]`) with test evidence.
8. **Change record + rehearsal definitions (A3, A9, A10, A11).** DBA + App Lead
   open the change record (ID, window, rollback owner, incident commander) and
   record the §5.7 rollback rehearsal plan, §5.8 reporting validation, and
   evidence/STOP acknowledgement.
9. **Part A sign-off (A1, A2).** Only when actions 1–8 are evidenced may DBA and
   Application Lead authorize the staging rehearsal (`§5`). A staging pass
   authorizes **nothing** beyond "0022 rehearsed on staging".
10. **Production path (separate, later).** Production authorization requires the
    production evidence register plus Part B1–B13; it is not a staging step.

---

## 6. Staging readiness summary

- **Readiness state:** **NOT READY.** All staging gates (`G1-S`–`G5-S`) and all
  Part A rows (`A1`–`A14`) are `PENDING`/`BLOCKED`.
- **What is established (repository-side only):** reviewed `0019`–`0022` artifact
  identity intact (all four SHA-256 match their anchors, §2.1); lineage repository
  facts accurate (§2.2); control-plane flags disabled; static review and tests
  recorded. None of this is a live/staging gate.
- **What is missing:** every live staging artifact — environment identity and
  isolation (G5-S/A4), ledger and catalog (G1-S/G2-S), lineage from the actual
  staging ledger (G3-S/A7), backup + disposable-DB restore (G4-S/A5), compatible
  build (A8), change record (A3), guard/config attestation (A12/A14), and the DBA
  + Application Lead Part A authorizations (A1/A2).
- **Classification separation preserved:** staging-specific prerequisites [S],
  cross-environment prerequisites required for staging safety [X] (artifact
  identity A6 and staging lineage A7 only), and production-only gates [P]
  (G1-P–G4-P, E4.2–E4.4, E5.1–E5.6, B1–B13, policy §4) which must not block the
  isolated staging rehearsal.
- **Production gate preserved separately:** approval-checklist Part B (B1–B13)
  remains entirely `PENDING`; a staging `PASS` (when achieved) will authorize only
  the rehearsal, not production.

---

## 7. Explicit non-actions in producing this audit

- **No database was contacted; no query was executed.**
- **No migration was run, generated, pushed, or applied** to any database.
- **No migration, journal, snapshot, ledger, schema, or environment configuration
  was modified.** `db/migrations/0019`–`0022` were read only; their SHA-256 were
  recomputed and match the recorded anchors.
- **No seed, deployment, RBAC seeding, or employee record was created, modified,
  or deleted.** The retention executor remains disabled
  (`DELETION_EXECUTION_ENABLED = false`) and `RETENTION_ELIGIBLE_CATEGORIES = []`.
- **No `.env.production`, secret, or connection string was read or guessed.**
- **No existing working-tree change was reverted, reset, stashed, or overwritten.**
- **No result was fabricated:** every live-evidence item is `PENDING` and every
  gate is `BLOCKED`; no `PASS` was assigned from repository facts.

**Conclusion:** migration `0022` is not ready for the staging rehearsal. The
artifact under test is intact and the six documents are internally consistent, but
no live staging evidence exists yet. The rehearsal may be authorized only after
§5 actions 1–8 are evidenced and Part A (A1–A14) is recorded. Production remains
gated separately by Part B (B1–B13) and is not advanced by this audit.

---

## 8. Revalidation addendum (2026-10-20, read-only; no gate advanced)

**Trigger:** the operator asserted that all required approvals for the `0022`
release had been granted and requested continuation of the release. Per the
release procedure, the assertion was verified against actual records; an
operator confirmation is authorization to *verify and proceed where evidence
exists*, never a substitute for recorded evidence.

**Method:** read-only inspection of the repository, the deployment mechanism
(`/usr/local/sbin/hris-deploy`, read as root), the production service, and the
production database (SELECT-only: `current_database()`, ledger count/max
`created_at`, catalog column/constraint presence). No migration was run; no
journal/ledger/schema/config change was made; no seed, deployment, RBAC change,
or employee deletion was performed; control plane unchanged
(`DELETION_EXECUTION_ENABLED = false`, `RETENTION_ELIGIBLE_CATEGORIES = []`).

### 8.1 Verified state (2026-10-20 ~01:05 UTC)

| Item | Verified fact |
| --- | --- |
| Branch / HEAD | `main` @ `e735f47`, up to date with `origin/main`; matches the previously reported production commit |
| Working tree | Dirty: 23 modified + 25 untracked files — the `0022` release candidate (migrations `0021`/`0022`, detach feature, docs, tests) — **uncommitted**, not pushed |
| Production service | `hris.service` active since 2026-10-19 14:16:39 WIB; HTTP 200 on `/login` |
| Deployed artifact | Build ID `J5cpppAYMdIb8Q5QViGP9`, commit `e735f47d23e83da97cd1f97faead34221eaa18b5` (deploy log `20261019-141513`, `HEALTH_CHECK=PASS`) |
| Production DB identity | Database `hris` at `127.0.0.1:5432` (from `.env.production` `DATABASE_URL`; credential redacted). Distinguished from legacy rehearsal/reconciliation DBs on the same cluster (`hris_rehearse_*`, `hris_emd_reconciliation_staging*`, `hris_security_rotation_staging`, etc.). No evidence-registered current staging database exists |
| Production ledger (read-only) | `drizzle.__drizzle_migrations`: 18 rows, max `created_at` = `1790661254287` (2026-09-29T05:54:14Z) — consistent with the recorded lead that production's ledger stops at the 0018 era |
| Production catalog (read-only) | `0019` applied out-of-band (`face_enrollment_templates.key_version` present); `0020` applied out-of-band (`users.must_change_password` present); `0021` **not** applied (no `employee_deletion_requests`/`employee_deletion_approvals`/`employee_retention_overrides` tables); `0022` **not** applied (zero `<table>_retained_identity_check` constraints). `payslips.employee_number_snapshot`/`birth_date_snapshot` and `payroll_items.employee_number_snapshot`/`employee_name_snapshot` are pre-existing (0013/0014 and creation-time snapshots per the `0022` header) — not evidence of `0022` |
| Migration journal (repo) | 20 entries, last `0018_employee_custom_tabs`; `0019`–`0022` deliberately not journaled (out-of-band pattern) |
| `0022` checksum | Recomputed `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` — matches the reviewed anchor |
| Candidate build | Production build of the candidate tree succeeded 2026-10-19 (session record: `tsc` clean, lint 0 errors, employee tests 783 pass / 0 fail, full suite pass); runtime idempotency/rollback remain UNPROVEN (`B-15`) |
| Deploy mechanism | `hris-deploy` requires a target **commit reachable from `origin/main`**; the uncommitted `0022` candidate cannot be deployed as-is, and no release commit exists to review |

### 8.2 Approval verification result

**Operator assertion: NOT SUPPORTED by any recorded evidence.** Verified
2026-10-20: approval checklist Part A (`A1`–`A14`) all ☐; Part B (`B1`–`B13`)
all ☐; policy §4 retention sign-off ☐ pending; change record (`H3`/`A3`)
absent (no ID, window, rollback owner, incident commander anywhere in the
repository); no `EVD-*` artifact exists anywhere on this host; evidence
register: 0/47 received, 0 `CONFIRMED`; independent review: none recorded;
staging rehearsal: never executed (`B-15` OPEN).

### 8.3 Gate impact (unchanged — nothing advanced)

`G1-S`–`G5-S` remain `BLOCKED`; Part A remains `PENDING`; blockers
`B-01`–`B-11`, `B-13`–`B-15` remain `OPEN`. **The staging rehearsal remains
unauthorized; the production release is stopped at the production gate.** The
production-side read-only observations in §8.1 are operator-captured facts
that inform the DBA evidence request; they are **not** gate evidence and close
nothing (the live captures remain the DBA's to return as `B1`–`B5`,
`C1`–`C9`, `E2.x` production rows through the official channel).

**Release status: `BLOCKED`.** Required to proceed, in order: dispatch
M-1…M-5 (dispatch preparation §4) and return the 47 artifacts; reviewer ≠
collector records results; Part A `A1`–`A14` recorded; staging rehearsal
executed per runbook §5 (closing `B-15`); Part B `B1`–`B13` + policy §4
recorded; release candidate committed and the exact release commit reviewed;
change window and operator recorded — then the production sequence may begin.
