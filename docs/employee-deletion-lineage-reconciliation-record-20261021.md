# Employee Deletion — Lineage Reconciliation Record (2026-10-21)

**Document type:** RECONCILIATION RECORD / EVIDENCE. It does **not** edit the
journal, snapshots, migration ledger or any database, and it does **not**
authorize a reconciliation execution.
**Status:** **REPOSITORY + ISOLATED-DATABASE RECONCILIATION COMPLETE;
ENVIRONMENT LIVE RECONCILIATION STILL BLOCKED** (production/staging evidence
owned by the DBA).
**Prepared:** 2026-10-21 (UTC) · **Repo:** `/opt/hris`, local `main`, work on
top of `00e4655` (not pushed). **Updated 2026-10-21 (UTC):** the payroll tables
moved from *retained/detach* to **deleted** under the owner-approved scope
(`docs/employee-deletion-owner-scope-approval-20261021.md`); migration `0022`
was rewritten (checksum `3750812f…0b5`) and re-verified on a fresh disposable
database (§3.1/§3.2 updated below; the pre-update retention-era tables remain
in §9 History).

This record completes the reconciliation **that can be completed without a DBA
change record**: every employee-related dependency is enumerated and classified,
the migration lineage is re-verified against the files and against an applied
disposable database, and the approved payroll deletion scope is stated
explicitly. It does **not** substitute for the DBA's live ledger/catalog
evidence, and it does not claim that production or staging are reconciled.

Related: `docs/employee-permanent-delete-0022-lineage-reconciliation-plan.md`
(the plan this record executes the repository half of),
`docs/employee-permanent-delete-0022-detach-design.md`,
`docs/employee-deletion-0021-dba-review-package.md`,
`docs/employee-permanent-delete-dba-evidence-request.md`.

---

## 1. Reconciliation outcome (summary)

| Area | Reconciled here? | Result | Remaining owner |
| --- | --- | --- | --- |
| Migration files `0019`–`0022` checksums | **YES** (recomputed read-only) | match the reviewed anchors | — |
| Journal / snapshot state | **YES** (repository facts re-read) | unchanged; deliberate out-of-band | DBA for journaling decision |
| Employee FK dependency map (direct) | **YES** (24 → 26 enumerated) | complete | DBA to confirm live catalog |
| Employee FK dependency map (indirect) | **YES** (second-level map) | complete | DBA to confirm live catalog |
| Control-plane dependency map | **YES** | complete | DBA |
| Isolated apply / idempotency / invariants | **YES** (disposable DB) | PASS | DBA must reproduce in the approved environment |
| Production catalog state of `0019`/`0020`/`0021`/`0022` | **OBSERVED READ-ONLY** | see §5 | **DBA** to attest |
| Staging catalog/ledger state | **NO** | unavailable to the operator | **DBA** |
| Approved payroll deletion scope | **YES** | **Owner-approved (2026-10-21) — payroll DELETED with the employee; third-party (DPO/Legal/HR-Payroll) sign-off still pending** | **DPO / Legal / HR-Payroll** (owner approval recorded at owner level only) |
| Ledger repair (`when` values, journal entries) | **NO** | must not be attempted speculatively | **DBA** (R2/R4/R5) |

**The reconciliation is not "complete" in the sense of being applied.** It is
complete as an analysis and evidence package; the executable half remains
DBA-owned and blocked.

---

## 2. Migration lineage — re-verified 2026-10-21

### 2.1 Checksums (read-only, `sha256sum`)

| Migration | File | SHA-256 | Lines | Status |
| --- | --- | --- | ---: | --- |
| 0019 | `0019_face_template_key_version.sql` | `21752cce27b490807854a5c27387d8525738d1a9fe718b9dada1e89b63042d27` | 61 | unchanged |
| 0020 | `0020_user_password_lifecycle.sql` | `baf1887559aa0d8cb7905a17d5a71c8a8b506431624d9445747ca88d0f3a4eaa` | 52 | unchanged |
| 0021 | `0021_employee_deletion_controls.sql` | `585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452` | 141 | **revised** (supersedes `0e234c6e…7764`) |
| 0022 | `0022_employee_retention_detach.sql` | `3750812f76be5cef1f3356eaf7872208494a31b26b4a2d5ef7433c1ae69160b5` | 421 | **revised 2026-10-21** (supersedes `724db82d…65c`; owner-approved payroll-deletion scope — see `docs/employee-deletion-payroll-scope-decision-record.md`) |

Both `0021` and `0022` are revised artifacts: `0021` for the control-plane
detachment (`docs/employee-deletion-0021-dba-review-package.md` §3) and `0022`
for the payroll-deletion scope. **The lineage plan must be read with the
revised hashes; the previously reviewed `0e234c6e…7764` (`0021`) and
`724db82d…65c` (`0022`, never applied anywhere persistent) are obsolete.**

### 2.2 Journal / snapshot state (repository facts, unchanged)

- `meta/_journal.json`: 20 entries, `idx 0–19`, last = `0018_employee_custom_tabs`
  (`when = 1790661254287`).
- `0019`–`0022` are **absent** from the journal (deliberate; headers state so).
- Snapshots stop at `0014`; chain defects remain: duplicate `0011` prefix,
  `0012.prevId` dangling, `0011` mis-attributed to `0014`, no snapshots for
  `idx 15–19`.
- Drizzle `migrate` is journal-driven and **skips entries whose `when` ≤ live
  ledger max**; `generate`/`push` is broken and must not be run.
- Consequence: a safe journal entry for `0019`–`0022` needs a `when` strictly
  greater than the live ledger max. That value is environment-specific and is
  **not computable without DBA evidence** (`B-05`).

### 2.3 Repository-side classification of `0019`–`0022`

| Migration | Journal | Snapshot | Repo-side conclusion |
| --- | --- | --- | --- |
| 0019 | absent | none | out-of-band; `DROP DEFAULT` marker is catalog-detectable |
| 0020 | absent | none | out-of-band; three `ADD COLUMN IF NOT EXISTS` are catalog-detectable |
| 0021 | absent | none | out-of-band; three control tables are catalog-detectable |
| 0022 | absent | none | out-of-band; nullability + 11 snapshots/CHECKs are catalog-detectable |

**A missing journal entry does not prove non-application** (the `0015`/`0016`
precedent). Each row is confirmed or refuted only by live ledger + catalog.

---

## 3. Employee-related dependencies — complete map

### 3.1 Direct dependencies: every FK whose parent is `employees`

Baseline (restore of `staging-db-20261021T005459Z-pre-0022.dump`, and identical
counts observed read-only on production): **24 FKs = 22 `RESTRICT` + 2
`SET NULL` + 0 `CASCADE`.**

After `0021` + **revised** `0022` (disposable DB
`hris_control_fk_20261021T060118Z`, fresh run 2026-10-21):
**26 FKs = 10 `SET NULL` + 16 `RESTRICT` + 0 `CASCADE`.**
(The retention-era counts — 15 `SET NULL` + 11 `RESTRICT` from
`hris_control_fk_20261021T035639Z` — are superseded.)

| # | Table | FK to `employees` | Baseline rule | Reconciled rule | Disposition |
| ---: | --- | --- | --- | --- | --- |
| 1 | `attendance_records` | ✓ | `RESTRICT` | `SET NULL` | retained / detach |
| 2 | `attendance_events` | ✓ | `RESTRICT` | `SET NULL` | retained / detach |
| 3 | `leave_balances` | ✓ | `RESTRICT` | `SET NULL` | retained / detach |
| 4 | `leave_requests` | ✓ | `RESTRICT` | `SET NULL` | retained / detach |
| 5 | `permission_requests` | ✓ | `RESTRICT` | `SET NULL` | retained / detach |
| 6 | `employee_payroll_components` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** (owner-approved payroll scope; explicit plan, backstop) |
| 7 | `payroll_items` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** (owner-approved payroll scope; explicit plan, backstop) |
| 8 | `payslips` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** (owner-approved payroll scope; explicit plan, backstop) |
| 9 | `payslip_documents` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** (owner-approved payroll scope; explicit plan, backstop) |
| 10 | `payslip_document_versions` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** (owner-approved payroll scope; explicit plan, backstop) |
| 11 | `employee_employment_history` | ✓ (×2) | 1 `RESTRICT` + 1 `SET NULL` | 2 `SET NULL` | retained / detach |
| 12 | `employees.manager_id` (self) | ✓ | `SET NULL` | `SET NULL` | retained; manager link cleared |
| 13 | `employee_documents` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** |
| 14 | `employee_face_enrollments` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** (templates first) |
| 15 | `face_enrollment_templates` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** (child first) |
| 16 | `employee_project_assignments` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** |
| 17 | `employee_addresses` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** |
| 18 | `employee_insurances` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** |
| 19 | `employee_bank_accounts` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** |
| 20 | `employee_dependents` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** |
| 21 | `employee_educations` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** |
| 22 | `employee_custom_field_values` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** |
| 23 | `announcement_recipients` | ✓ | `RESTRICT` | `RESTRICT` | **deleted** |
| 24 | `employee_legal_holds` | ✓ | *(table absent)* | `SET NULL` | control plane: active blocks, released detaches |
| 25 | `employee_deletion_requests` | ✓ | *(table absent)* | `SET NULL` | control plane: pending/approved blocks, terminal detaches |
| 26 | `employee_deletion_approvals.request_id` | *(parent = requests)* | *(table absent)* | `RESTRICT` | control plane: never deleted/detached |

> Row 11 has two FKs to `employees`; row 26 is included because it is part of
> the same control-plane dependency closure. That is why the table count (25
> distinct tables) differs from the FK count (26).

### 3.2 Indirect dependencies (children of retained/deleted/control tables)

Verified on the disposable database:

| Child → parent | Delete rule | Reconciliation note |
| --- | --- | --- |
| `attendance_photos` → `attendance_records` | `CASCADE` | parent is **retained**, so the cascade never fires during employee deletion |
| `leave_request_events` → `leave_requests` | `CASCADE` | parent retained — no cascade on employee deletion |
| `permission_request_events` → `permission_requests` | `CASCADE` | parent retained — no cascade |
| `payroll_item_components` → `payroll_items` | `CASCADE` | parent is **deleted** with the employee — the pre-existing cascade removes exactly the employee's own item-component rows; other employees' rows untouched (proven in the 2026-10-21 payroll-scope rehearsal) |
| `payslips` → `payroll_items` | `RESTRICT` | both **deleted**; the plan removes payslips (children first) strictly before payroll items |
| `payslip_documents` → `payslips` | `RESTRICT` | both **deleted** (versions → documents → payslips order) |
| `payslip_document_versions` → `payslips` / `payslip_documents` | `RESTRICT` | all **deleted** (versions first) |
| `face_enrollment_templates` → `employee_face_enrollments` | `CASCADE` | **both are deleted**; the plan deletes templates **before** enrollments, so the explicit delete order — not the cascade — is authoritative |
| `employee_deletion_approvals` → `employee_deletion_requests` | `RESTRICT` | approval rows pin their request; both handled by the control plane |

No other table has an `employee_id` column that is not an FK to `employees`
(verified: query returned zero rows). There is therefore **no un-mapped
employee reference**.

### 3.3 Control-plane closure

`employee_legal_holds` and `employee_deletion_requests` each have
`organization_id → organizations RESTRICT`, operator FKs to `users`
(`SET NULL`), and identity snapshots (`NOT NULL` for holds;
`employee_number`/`employee_name` were already `NOT NULL` for requests).
`employee_deletion_approvals` has `request_id RESTRICT`, `organization_id
RESTRICT`, `approver_user_id SET NULL`. Full inventory:
`docs/employee-deletion-0021-dba-review-package.md` §4.

---

## 4. Payroll deletion scope — **owner-approved and implemented (2026-10-21)**

The release request asks for **permanent deletion of payroll history**. The
project owner explicitly approved that scope on 2026-10-21 (UTC)
(`docs/employee-deletion-owner-scope-approval-20261021.md` — **owner approval
only**; it does not replace Legal/DPO/HR-Payroll sign-off, which remains
pending). The reconciled state is now:

| Question | Recorded answer | Source |
| --- | --- | --- |
| Is there an approved scope to delete payroll rows? | **YES — at owner level** (2026-10-21); Legal/DPO/HR-Payroll sign-off still pending | owner scope approval record; matrix §6a/§3 |
| Which payroll rows are deleted? | The employee's `employee_payroll_components`, `payroll_items` (+ cascaded `payroll_item_components`), `payslips`, `payslip_documents`, `payslip_document_versions` | `features/employees/queries.ts` delete plan; revised `0022` |
| What happens to payroll/payslip rows on a permanent delete? | **DELETED explicitly, children first**; `employee_id` stays NOT NULL + `ON DELETE RESTRICT` as the backstop; `payslips.employee_number_snapshot`/`birth_date_snapshot` (PDF password contract, 0013/0014) unchanged | `0022_employee_retention_detach.sql` (revised, `3750812f…0b5`) |
| What is retained? | `payroll_periods`, `payroll_runs`, `payroll_components`, `payroll_events` (organization-level; no employee reference) and every OTHER employee's rows | delete plan + rehearsal |
| Is tier-2 / retention-eligible deletion enabled? | **NO** — `RETENTION_ELIGIBLE_CATEGORIES = []`, `DELETION_EXECUTION_ENABLED = false` (unchanged) | `features/employees/deletion-control-policy.ts` |
| Does the owner approval constitute the multi-role policy decision? | **NO** — it resolves the data-owner scope only; §4.1 sign-off rows remain pending | approval matrix §3 |

**Reconciled payroll scope (implemented and proven):**

| Payroll object | Table(s) | On employee delete | Rows deleted (rehearsal, 3 synthetic employees) |
| --- | --- | --- | ---: |
| Employee payroll components | `employee_payroll_components` | **deleted** (explicit) | 1 |
| Payroll items | `payroll_items` | **deleted** (explicit; creation-time snapshots on the row are irrelevant once deleted) | 1 |
| Payslips | `payslips` | **deleted** (explicit) | 1 |
| Payslip documents | `payslip_documents` | **deleted** (explicit) | 1 |
| Payslip document versions | `payslip_document_versions` | **deleted** (explicit) | 1 |
| Payroll item components | `payroll_item_components` | **deleted via the pre-existing item CASCADE** (employee's own rows only) | 1 |
| Payroll periods / runs / components | `payroll_periods` / `payroll_runs` / `payroll_components` | **retained** (organization-level) | 0 |

Fresh evidence (2026-10-21T06:15:29Z, disposable DB
`hris_force_delete_rehearsal_20261021T061529Z`, `HARNESS_RESULT=PASS`):

```
payslip_document_versions:  pre=3 post=2 deleted=1 (detached=0)
payslip_documents:          pre=3 post=2 deleted=1 (detached=0)
payslips:                   pre=3 post=2 deleted=1 (detached=0)
payroll_items:              pre=3 post=2 deleted=1 (detached=0)
payroll_item_components:    pre=3 post=2 deleted=1 (via item CASCADE)
employee_payroll_components: pre=3 post=2 deleted=1 (detached=0)
retained (detached + snapshotted): attendance x2, leave x2, permission,
  employment history — exactly 1 row of A's each, identity snapshots set
control employees B/C: every row intact; org-level period/run/component intact
rollback (employee C): the entire payroll chain restored
```

(`04-harness.out` SHA-256 `4600920619687103d4648d45011718c17dd02e0e395033ea00a08c980ae8f510`,
`05-post-payroll-scope.txt` `eb9691d33fb72ec2667cefd137d317a48711be400acff655ec9c6edefcc0c1f3`;
full detail in `docs/employee-deletion-payroll-scope-decision-record.md` §7.)

**Conclusion:** "permanently delete payroll history" **is** part of the
implemented, owner-approved deletion scope, proven at the database level.
Production application remains blocked on the third-party approvals and
gates in `docs/employee-deletion-approval-matrix.md`.

### 4.1 History — the state before the owner approval (superseded)

Before the owner scope approval (2026-10-21 morning), the reconciled answer was
"**NONE approved — payroll is retained**", with `payroll rows deleted = 0`
proven on `hris_force_delete_rehearsal_20261021T040023Z` (evidence
`07-payroll-rows-deleted.txt`, SHA-256 `cf4cb738…`). That state was correct at
the time and is preserved here for audit; its disposable databases were
dropped. The revision history of
`docs/employee-deletion-payroll-scope-decision-record.md` records the same
transition.
---

## 5. Environment classification (read-only observations, 2026-10-21)

These are **operator read-only observations on the local cluster**, not a DBA
attestation. They are recorded so the DBA can confirm or refute them.

| Object / marker | Production `hris` | Expected if applied |
| --- | --- | --- |
| `drizzle.__drizzle_migrations` rows | **18** (`max(created_at) = 1790661254287`) | — |
| `face_enrollment_templates.key_version` DEFAULT | **`'v1'::text` present** | 0019 applied ⇒ default absent ⇒ **0019 NOT applied** |
| `users.password_changed_at` | **present** | 0020 applied (marker consistent) |
| `employee_legal_holds` / `_deletion_requests` / `_deletion_approvals` | **absent (0)** | 0021 ⇒ **NOT applied** |
| `attendance_records.employee_number_snapshot` | **absent** | 0022 ⇒ **NOT applied** |
| FKs referencing `employees` | **24** (2 `n`, 22 `r`, 0 `c`) | post-chain 26 |
| `hris.service` | `active (running)` | — |
| Deployed build ID | `kR0L8QnWCFjO3oU4Qb4w3` | unchanged |

Staging ledger/catalog: **not captured** (no authorized staging access in this
session) → `B-02`, `B-03`, `B-05` remain **OPEN**.

### 5.1 Isolated confirmation of the full chain

**Revised pair, fresh run 2026-10-21T06:01:18Z** — disposable DB
`hris_control_fk_20261021T060118Z` (restored from the staging dump, **not
production**):

- `0021` apply → exit 0; revised `0022` apply → exit 0.
- Re-apply `0021` and `0022` → both exit 0 (idempotent).
- FKs referencing `employees`: 24 → **26**.
- 0 `CASCADE`; **10 `SET NULL`** (6 retained + 2 manager + 2 control-plane);
  **16 `RESTRICT`** (11 deletable + 5 payroll); **6 retained-identity CHECKs**;
  2 live-control CHECKs; 3 control tables; **0 anonymous retained rows**;
  payroll `employee_id` NOT NULL on 5/5 tables; retention-only payroll
  snapshot columns remaining: 0.
- `scripts/verify-employee-deletion-control-fks.sql` →
  **`CONTROL_FK_REGRESSION_PASS`**.

Evidence: `/tmp/opencode/migreg-payroll-scope-20261021T060118Z/`
(`06-invariants.out`, `07-control-fk-regression.out`).

**Superseded run (retention-era `0022`), kept for history:**
`hris_control_fk_20261021T035639Z` — 15 `SET NULL`, 11 `RESTRICT`, 11
retained-identity CHECKs; evidence
`/tmp/opencode/migreg-20261021-20261021T035639Z/`
(index SHA-256 `a0660b249aeaae9429c50ef6931ae17aea548b1d55d7898ae88f274c3199f6ab`).

---

## 6. What remains before lineage is fully reconciled

| # | Remaining action | Owner | Blocker |
| --- | --- | --- | --- |
| 1 | Capture staging + production ledger rows (`id, hash, created_at`) and catalog markers (`B1`–`B5`, `C1`–`C9`, `D1`–`D5`) | DBA | `B-02`, `B-03`, `B-05` |
| 2 | Confirm/refute the §5 production observations against the live catalog with an evidence artifact | DBA | `B-14` |
| 3 | Decide the repair strategy `R2` (safe `when` = live max + 1, journal order, snapshot disposition) | DBA + App Lead | `B-05`, `B-10` |
| 4 | Rehearse the reconciliation on the approved staging clone (`R3`) | DBA | `A1`–`A14` |
| 5 | Execute `R4` and journal `0021`/`0022` through the approved channel (`R5`) | DBA | `B-06`, `B-11` |
| 6 | Record the payroll retention decision (§4) — **or** approve a separate payroll-deletion design | DPO / Legal / HR-Payroll / Data Owner | §4 sign-off |

**Never:** hand-edit `drizzle.__drizzle_migrations`, edit `meta/_journal.json`
speculatively, run `drizzle-kit generate`/`push`, or delete/invent ledger rows.

---

## 7. Explicit non-actions

- No journal, snapshot or ledger file was modified.
- No migration was applied to production or to a shared staging database.
- No production/staging employee, payroll or control-plane row was created,
  changed or deleted.
- No reconciliation execution, journaling, push or deployment occurred.
- No approval or signature was created, inferred or fabricated.
