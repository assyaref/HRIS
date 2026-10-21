# Employee Deletion Controls — 0021 Lineage Reconciliation Plan & Staging Runbook

Status: **PROPOSED — planning artifact only. Migration `0021` is NOT applied to
any database. The deletion executor remains hard-disabled.**

Companion documents:

- `docs/employee-permanent-delete-policy.md` — the policy, tiers, safeguards and
  the §4 retention sign-off gate (BLOCKING for any destructive enablement).
- `docs/migration-reconciliation-runbook.md` — the master DBA/DevOps
  reconciliation, backup, staging-isolation and approval-gate runbook. Its
  safety rules, isolation matrix (§C), backup checklist (§B) and approval gates
  (§F) all apply to this document and are not repeated in full here.

Classification: **READ-ONLY OPERATIONAL RUNBOOK.** Nothing in this document
authorizes a production change. Every executable example is **STAGING-ONLY** and
guarded by an environment check.

---

## 0. Non-negotiable rules (inherited + specific)

1. Do not apply `0021` — or any migration — to production from this worktree.
2. Do not run `DELETE`, do not enable the executor, and do not populate
   `RETENTION_ELIGIBLE_CATEGORIES`. `DELETION_EXECUTION_ENABLED` stays `false`
   (pinned by `tests/employees/employee-deletion-controls.test.ts`).
3. Do not run `drizzle-kit generate` or `drizzle-kit migrate` (`npm run
   db:generate` / `db:migrate`) from this worktree. The snapshot lineage is
   broken (§1.2) and `generate` would emit a migration containing every schema
   change since snapshot `0014` (announcements, `users.name`, employee master
   data, custom tabs, `0019`, `0020`, `0021`) — not just the intended diff.
4. Do not edit `db/migrations/meta/_journal.json`, rename/renumber migration
   files, or hand-edit the `drizzle.__drizzle_migrations` ledger. Journaling
   `0019`/`0020`/`0021` happens only in the separately approved reconciliation
   change (§2).
5. `0021` follows the existing out-of-band convention: it is applied on staging
   manually by the DBA and journaled later, by the approved reconciliation.
6. Staging must satisfy the isolation matrix in the master runbook §C.1–C.4
   (separate cluster, separate private root, staging-only secrets, no shared
   roles, `HRIS_ENV=staging` guard, production endpoints denied).
7. Use synthetic employees only. No production PII in staging evidence.

---

## 1. Verified audit state (as of 2026-10-12)

### 1.1 Artifacts under review

| Artifact | Path | State |
| --- | --- | --- |
| Policy document | `docs/employee-permanent-delete-policy.md` | Untracked (new), PROPOSED |
| Migration | `db/migrations/0021_employee_deletion_controls.sql` | Untracked (new), **NOT applied**, **NOT journaled** |
| Drizzle schema | `db/schema/employee_deletion_controls.ts` (+ export in `db/schema/index.ts`) | Untracked (new) + 1-line tracked change |
| Pure policy module | `features/employees/deletion-control-policy.ts` | Untracked (new), no DB/framework imports |
| Server actions | `features/employees/deletion-control.actions.ts` | Untracked (new), `"use server"`, **no UI consumer yet** |
| Permission codes | `lib/auth/permissions.ts` | `employees.legal_hold`, `employees.deletion_approve` added to catalog + `SYSTEM_ONLY_PERMISSION_CODES` |
| Audit actions | `lib/auth/audit.ts` | 6 new codes in `EmployeeAuditAction` |
| Tests | `tests/employees/employee-deletion-controls.test.ts` | 44 tests, all passing (13 suites) |

Deliberately unchanged: `features/employees/actions.ts` (live destructive
action), `features/employees/queries.ts`, `delete-employee-dialog.tsx`,
`db/migrations/meta/*`.

### 1.2 Migration lineage — current facts

| Item | State |
| --- | --- |
| `_journal.json` entries | 20 (idx 0–19); last = `0018_employee_custom_tabs` |
| Snapshot files | Stop at `0014_snapshot.json` (idx 0–14). **No snapshots for idx 15–19** (`0011_nasty_khan`, `0015`, `0016`, `0017`, `0018`) |
| Snapshot chain defects | `0011_snapshot.json` `prevId` = id of `0014_snapshot.json` (mis-attributed); `0012_snapshot.json` `prevId` (`4221b242…`) missing from the set; `0013`/`0014` depend on the broken `0012` predecessor |
| Unjournaled SQL files | `0019_face_template_key_version.sql` (idempotent `DROP DEFAULT`), `0020_user_password_lifecycle.sql` (idempotent `ADD COLUMN IF NOT EXISTS` ×3), `0021_employee_deletion_controls.sql` (idempotent `CREATE TABLE/INDEX IF NOT EXISTS`) |
| Production ledger | 18 rows, all hash-verified to SQL files (Release A DBA package); `0018` applied; max `created_at` = `1790661254287` |
| Production 0019/0020 | `0019` **NOT APPLIED** (Phase-11 observation 2026-10-01). `0020` application **UNVERIFIED** — committed 2026-10-10 (7488053), no DBA application evidence exists; app code in that commit already selects `users.must_change_password` |
| `drizzle-kit migrate` | Mechanically possible (journal vs ledger), currently a no-op; **`generate` is broken** (missing snapshot for the last journal entry) |

Consequences:

- The migrator applies journal entries whose `when` > ledger
  `max(created_at)`; the `0011_nasty_khan`/`0015`/`0016` entries (all
  `when=1790152070913` ≤ max) are permanently skipped — their DDL is live in
  production without ledger rows. This is accepted historical state (Release A
  DBA sign-off D-decisions) and must not be "fixed" by rewriting the ledger.
- Any future `generate`/`push` from this worktree is unsafe (rule 3).

### 1.3 Consistency findings — migration 0021 vs Drizzle schema

Column-by-column comparison of `0021_employee_deletion_controls.sql` against
`db/schema/employee_deletion_controls.ts`:

| Check | Result |
| --- | --- |
| Tables | 3/3 match: `employee_legal_holds` (16 cols), `employee_deletion_requests` (16 cols), `employee_deletion_approvals` (8 cols) |
| Column names/types/nullability/defaults | Match (incl. `gen_random_uuid()` PKs via `uuidId()`, `timestamptz` `now()` defaults via `createdAt()/updatedAt()`, `status DEFAULT 'pending'`, `required_approvals DEFAULT 1`, `active DEFAULT true`) |
| Employee/request FKs | All `ON DELETE RESTRICT` in both — a legal hold or pending request physically blocks ANY employee `DELETE`, including the live action |
| Operator FKs (`placed_by`, `released_by`, `requester`, `approver`) | `ON DELETE SET NULL` in both, identity snapshotted as text |
| Partial unique index | `employee_legal_holds_active_hold_unique (organization_id, employee_id) WHERE active` in both |
| Other indexes | `employee_legal_holds_employee_idx`, `employee_deletion_requests_org_employee_idx`, `employee_deletion_requests_status_idx`, `employee_deletion_approvals_request_approver_unique`, `employee_deletion_approvals_request_idx` — all present in both |
| Additive/idempotent | `BEGIN`/`COMMIT`, `IF NOT EXISTS` throughout; zero `DROP`/`ALTER` of existing objects (pinned by test) |
| Journal | `0021` absent from `_journal.json` (pinned by test) |

Minor observations (not blockers):

- `employee_deletion_approvals_request_approver_unique(request_id,
  approver_user_id)` allows repeated NULL-approver rows under PostgreSQL
  NULL-distinct semantics; the action always writes a non-null
  `approverUserId`, so this is theoretical (schema comment acknowledges it).
- On the decision path, refusal audits always use the action code
  `employee.deletion.rejected` (metadata `operation=EMPLOYEE_DELETION_DECISION`
  carries the true reason), and a DB-level duplicate-approver violation is
  audited as `DUPLICATE_APPROVER`. Audit metadata, not the action code, is the
  machine-readable truth here — acceptable, documented for reviewers.
- `updated_at` has no DB trigger; it is maintained by Drizzle's `$onUpdate`
  (consistent with the rest of the codebase).

### 1.4 Verification already performed (this worktree, no database touched)

- `npx tsc --noEmit` — clean.
- `npm test` — 1876 tests pass, including the 44 new deletion-control tests
  (verified: `node --test tests/employees/employee-deletion-controls.test.ts`
  → 44/44).
- `npm run lint` — 0 errors; 15 warnings, all pre-existing patterns (the two
  new `_prevState`/`_formData` warnings on the disabled executor mirror the
  established `useActionState` signature convention used by e.g.
  `features/work-locations/actions.ts`).
- `npm run build` — success.
- `git diff --check` — clean.

**NOT performed (do not claim otherwise):** application of `0021` to any
database; runtime invocation of the control actions against a live schema; any
UI testing. The tables do not exist in any environment, so until staging apply
happens, the control actions fail closed at the DB and return `FAILED` — this is
by design.

---

## 2. Migration lineage reconciliation plan (separate approved change)

Prerequisite for journaling `0021`. Owned by DBA + Application lead, executed
from an immutable artifact — never from a dirty worktree. Follows the master
runbook §E (inventory, dependency review, candidate chain, clean-database
reconstruction, invariant verification, disposition).

### R0 — Freeze and change control

- Open a change record (unique ID, risk rating, window, rollback owner, incident
  commander) per master runbook §A.1. Freeze unrelated migration/schema/seed
  changes.
- Build the reconciliation artifact from the exact commit under review, with
  SHA-256 recorded for every SQL file, `_journal.json`, and snapshot.

### R1 — Evidence capture (read-only)

- Capture the production ledger (`select id, hash, created_at from
  drizzle.__drizzle_migrations order by id`) and the full production schema
  packet (master runbook §D.1) through the approved DBA channel.
- **Verify the actual production state of `0019` and `0020` objects**: does
  `face_enrollment_templates.key_version` still have a default? Do
  `users.must_change_password`, `password_changed_at`, `last_login_at` exist?
  Classify each as `expected-approved`, `production-only`, `repository-only`, or
  `unexplained`. An `unexplained` result is a STOP (master runbook §H).
  - Urgency note: commit 7488053 (2026-10-10) ships app code that reads
    `users.must_change_password`. If that build reaches production before the
    `0020` columns exist, login/session paths will fail at runtime. The DBA must
    confirm which of (a) app deployed + columns applied out-of-band, (b) app
    deployed + columns missing (incident), or (c) app not yet deployed, is true —
    before any reconciliation ordering is decided.

### R2 — Choose the repair strategy (decision, recorded in the change record)

- **Option A (recommended): authoritative-baseline reconstruction.** From the
  verified production schema capture, produce a new coherent journal + snapshot
  set in a fresh, separately reviewed artifact (e.g. a single squashed baseline
  migration generated against the current `db/schema`, snapshotted, and marked
  as pre-applied in production), then append `0019`/`0020`/`0021` (or their
  post-squash equivalents) as fully journaled, fully snapshotted entries with
  fresh `when` timestamps. The ledger stays append-only; `generate` works again.
- **Option B: append-only journal repair.** Keep the historical chain as-is;
  append journal entries for `0019`/`0020`/`0021` with fresh `when` timestamps
  so `drizzle-kit migrate` applies them (all three SQL files are idempotent, so
  an earlier out-of-band application is a no-op on re-run and still records
  ledger rows). Snapshots are NOT repaired, so `generate` stays broken and the
  team must keep treating generated diffs as untrustworthy.
  Trade-off: less work now, but it perpetuates the defect that caused this
  incident and leaves `generate`/`push` as standing hazards.
- Either way: never rewrite, renumber, or backfill ledger rows; never assign a
  `when` ≤ ledger max for a migration whose DDL is not yet live (that is how
  `0015`/`0016` became ledger-less), and never journal a migration whose DDL is
  live with a fresh `when` unless the SQL is verified idempotent.

### R3 — Rehearse (staging only)

- Restore the production backup into isolated staging (master runbook §B.4) and
  rebuild a clean staging database from the candidate chain (§E.4).
- Apply the candidate chain on the clean database; stop on first error.
- Run the zero-difference schema comparison (§D.4) between: production capture,
  clean reconstruction, and the Drizzle schema at the reviewed commit
  (including the three `0021` tables once journaled).
- Run the data-invariant checks (§E.5/E.6) plus the deletion-control additions:
  every FK delete rule on `employee_legal_holds`,
  `employee_deletion_requests`, `employee_deletion_approvals` is
  RESTRICT/SET NULL exactly as declared; the partial unique index predicate is
  `WHERE active`; no unexpected object exists.

### R4 — Approve and execute (production, separate window)

- All four gates (DBA, Application, Payroll/HR, Security) sign per master
  runbook §F.
- DBA applies the journaled entries in the approved production window; verify
  ledger row count, hashes, and a read-only schema/ledger check post-deploy
  (§G.3). Never by editing the ledger.

### R5 — Journal `0021`

- Once §R3/R4 are complete AND the policy §4 sign-off is recorded, `0021` is
  journaled through the same repaired channel and follows the same
  staging-first path (§3 of this document). `0021` may be applied to **staging**
  earlier (out-of-band, §3.3) because it is additive and idempotent, but it must
  not reach production before both the lineage decision and the §4 sign-off.

---

## 3. Staging deployment procedure for `0021`

Scope: apply `0021` on the isolated staging database, validate, seed RBAC, run
non-destructive smoke tests, and prove rollback/forward recovery. This is a
control-plane rehearsal only — the executor stays disabled.

### 3.0 Preconditions

- [ ] Change record open; named DBA + Application operators; staging only.
- [ ] Policy §4 sign-off: **not required for a staging-only additive apply**
  (no destructive capability is enabled), but the §4 record MUST exist before
  any tier-2/executor-enable work that builds on this rehearsal. Record the
  staging-only exception in the change record.
- [ ] Staging isolation verified per master runbook §C.1–C.4 (HRIS_ENV guard,
  no production credentials/routes/roles, synthetic data).
- [ ] Staging database is a verified restore of a production backup, or a clean
  reconstruction, with the restore report attached.
- [ ] App build from the exact reviewed commit builds and its repo-side checks
  (§1.4) are green and attached as evidence.

### 3.1 Preflight (repository side, no database)

- [ ] Record commit SHA and `sha256sum` of
  `db/migrations/0021_employee_deletion_controls.sql`,
  `db/schema/employee_deletion_controls.ts`,
  `features/employees/deletion-control-policy.ts`,
  `features/employees/deletion-control.actions.ts`,
  `lib/auth/permissions.ts`, `lib/auth/audit.ts`.
- [ ] Confirm `_journal.json` is byte-identical to the reviewed version
  (checksum) — no `0019`/`0020`/`0021` entries.
- [ ] Confirm `DELETION_EXECUTION_ENABLED = false` and
  `RETENTION_ELIGIBLE_CATEGORIES = []` in the build (pinned by the 44-test
  suite; re-run it as part of evidence).
- [ ] Confirm the 44-test suite and the full `npm test`, `npx tsc --noEmit`,
  `npm run lint`, `npm run build` outputs are attached (already green at the
  reviewed commit — see §1.4).

### 3.2 Backup (staging)

- [ ] Take a pre-apply logical dump of the staging database, labeled
  `<ENVIRONMENT>-db-<YYYYMMDD>T<HHMMSS>Z-pre-0021`, with SHA-256 recorded.

**STAGING-ONLY — pre-apply backup**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
pg_dump --format=custom --file "staging-db-$(date -u +%Y%m%dT%H%M%SZ)-pre-0021.dump" "$STAGING_DATABASE_URL"
sha256sum staging-db-*-pre-0021.dump
```

- [ ] Verify the dump is restorable into a disposable database before
  proceeding (restore rehearsal evidence).

### 3.3 Apply

**STAGING-ONLY — apply 0021 (single transaction, stop on first error)**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  --file db/migrations/0021_employee_deletion_controls.sql
```

- [ ] Record start/end UTC, psql exit code, and full output.
- [ ] Re-run the same command once to prove idempotency (expected: zero
  errors; `IF NOT EXISTS` skips). Record the output as evidence.
- [ ] Do not use `db:migrate`/`db:generate` for this step (rule 3).

### 3.4 Schema validation (read-only)

**STAGING-ONLY — validate the created objects**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
-- 1. Exactly the three new tables exist, with the expected column counts.
SELECT table_name, count(*) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('employee_legal_holds', 'employee_deletion_requests', 'employee_deletion_approvals')
GROUP BY table_name ORDER BY table_name;
-- Expected: employee_deletion_approvals=8, employee_deletion_requests=16, employee_legal_holds=16.
-- 2. Every FK delete rule matches the schema contract.
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid::regclass::text IN ('employee_legal_holds', 'employee_deletion_requests', 'employee_deletion_approvals')
ORDER BY 1, 2;
-- Expected: 10 FKs; employee/request/org refs ON DELETE RESTRICT; user refs ON DELETE SET NULL.
-- 3. The partial unique index exists with the WHERE active predicate.
SELECT indexdef FROM pg_indexes
WHERE indexname = 'employee_legal_holds_active_hold_unique';
-- Expected: CREATE UNIQUE INDEX ... ON employee_legal_holds (organization_id, employee_id) WHERE active
-- 4. All expected indexes present (6 total).
SELECT indexname FROM pg_indexes
WHERE tablename IN ('employee_legal_holds', 'employee_deletion_requests', 'employee_deletion_approvals')
ORDER BY 1;
ROLLBACK;
SQL
```

- [ ] Compare the captured output against the §1.3 contract table. Any
  mismatch is a STOP; do not "fix" the schema ad hoc.
- [ ] Capture the full staging catalog packet (master runbook §D.2) and attach.

### 3.5 RBAC seed (staging)

**STAGING-ONLY — register the new permission codes**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
DATABASE_URL="$STAGING_DATABASE_URL" npm run db:seed:rbac
```

- [ ] Verify `permissions` now contains `employees.legal_hold` and
  `employees.deletion_approve`; verify the SUPERADMIN role (SYSTEM org) holds
  both grants; verify no organization-level role received them
  (`SYSTEM_ONLY_PERMISSION_CODES` are never granted to tenant roles by the
  seed).
- [ ] Re-run the seed once and confirm row counts are unchanged (idempotent).

### 3.6 Smoke tests (non-destructive, synthetic employees only)

No UI exists yet, so the smoke set is deliberately split: what can be proven at
the database level now, and what must wait for the UI (§4).

- [ ] Build and start the app from the reviewed commit against the staging DB;
  confirm health check and synthetic SuperAdmin login.
- [ ] **DB-level hold enforcement (the critical proof):** with a synthetic
  employee, insert one active `employee_legal_holds` row, then attempt the
  employee `DELETE` (as the live action would, inside a transaction) and verify
  it fails with the RESTRICT FK violation and rolls back; remove the hold
  row and verify the same transaction now proceeds only as far as the other
  RESTRICT dependencies allow. Evidence: exact SQL + errors captured.
- [ ] **Single-active-hold invariant:** attempt a second active hold insert;
  verify `23505` from the partial unique index.
- [ ] **Existing path regression:** run the live permanent-delete dependency
  scan against a synthetic employee with protected records and confirm it
  still classifies PROTECTED/DELETABLE exactly as before (no behavior change
  from `0021`).
- [ ] **Executor disabled (static, already pinned by tests):** the executor
  performs no write; re-affirm the 44-test suite result in the evidence pack.
- [ ] Record that action-level flows (place/release/request/decide/execute
  refusal) are **not yet exercised end-to-end** — deferred to the UI phase
  (§4). Do not claim them as tested.

### 3.7 Rollback / forward recovery (staging)

**Backward (staging-only):**

```sh
[ "${HRIS_ENV:?must be set to staging}" = "staging" ] || exit 1
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DROP TABLE IF EXISTS employee_deletion_approvals;
DROP TABLE IF EXISTS employee_deletion_requests;
DROP TABLE IF EXISTS employee_legal_holds;
COMMIT;
SQL
```

- [ ] Order is child-first; indexes drop with their tables; nothing else
  references these tables, so no `CASCADE` is used.
- [ ] This drops hold/request **history** — acceptable only in staging. A
  production rollback of `0021` is a separate Legal-involved decision (a hold
  history is itself evidence).
- [ ] Rehearse the restore path once from the §3.2 dump into a disposable
  database and record duration + checksum verification.

**Forward:** re-run §3.3 (idempotent). A partially applied `0021` (e.g. lost
connection mid-transaction) is impossible if `ON_ERROR_STOP` + the file's
`BEGIN/COMMIT` are honored; if a partial state is ever observed anyway, STOP —
preserve evidence, do not hand-repair (master runbook §H).

### 3.8 Evidence & sign-off (staging gate only)

- [ ] Attach: preflight checksums, backup + restore rehearsal, apply output
  (both runs), schema-validation output, seed verification, smoke evidence,
  rollback rehearsal.
- [ ] DBA + Application sign the STAGING readiness record. This authorizes
  nothing beyond "0021 rehearsed on staging". Production authorization requires
  the §2 lineage decision, the policy §4 sign-off table, and all four master
  runbook §F gates.

---

## 4. UI work still needed (not started)

Verified: nothing imports `deletion-control.actions.ts` — the control plane has
**no UI today**. Required before the control plane is operable (all gated by
`SUPERADMIN` + the system-only codes; server never trusts client role/org):

1. **Legal-hold panel** (employee detail, SuperAdmin only): place hold with
   reason (≥10 chars) + optional authority/reference; release active hold with
   reason; show hold history; render `HOLD_EXISTS`, `FORBIDDEN`, `FAILED`
   states; the release action is never automatic.
2. **Hold indicator** in `delete-employee-dialog.tsx` and the employee page:
   an active hold must visibly block tier-1 permanent deletion and explain why
   (the live action will fail on the RESTRICT FK; the UI should pre-empt with
   the policy message).
3. **Deletion-request flow**: request form with mandatory reason + typed
   employee-number confirmation; show the resolved tier preview
   (direct/special_approval/retained with the per-category breakdown) from the
   same pure policy module; render refusal codes (`LEGAL_HOLD`,
   `RETENTION_BOUND`, `CONFIRMATION_MISMATCH`).
4. **Approvals surface**: queue of pending requests (SuperAdmin, never the
   requester); request detail with approvals received/required, approve/reject
   with comment; client-side self-approval guard as UX only (server remains the
   authority); render `NOT_PENDING`, `SELF_APPROVAL_FORBIDDEN`, `DUPLICATE_APPROVER`.
5. **Executor status surface**: approved requests must show "execution
   disabled pending retention sign-off" (`EXECUTION_DISABLED` message), never an
   execute button that pretends to work.
6. **Audit history view**: employee-scoped and request-scoped audit trails for
   the six new action codes, including DENIED/FAILED attempts (actor, reason,
   timestamp). Needed for the §4 legal-hold procedure evidence and any future
   incident review.
7. **Operational notes for the UI phase**: ship UI only to environments where
   `0021` is applied (before that, actions return `FAILED`); keep role/tenant
   resolution server-side; masked PII conventions per `features/employees/masking.ts`.

Sequencing: none of this blocks the staging rehearsal (§3), and none of it may
enable execution. UI rollout follows the same staging-first rule.

---

## 5. Prerequisites, risks, and STOP conditions

### 5.1 Blocking prerequisites (before production `0021`)

| # | Prerequisite | Owner | State |
| --- | --- | --- | --- |
| 1 | §4 retention sign-off table (all six rows) recorded and dated | HR/Payroll, Legal, DBA, Security, DPO | **Pending** |
| 2 | `0019`/`0020` production application status verified and classified (R1) | DBA | **Open** — 0019 known NOT APPLIED (2026-10-01); 0020 unverified since commit 2026-10-10 |
| 3 | Lineage reconciliation decision (R2) executed from an immutable artifact | DBA + App | **Not started** |
| 4 | Staging rehearsal of `0021` (§3) complete with evidence | DBA + App | **Not started** (this document is the procedure) |
| 5 | RBAC seed re-run in each target environment after deploy | App/DevOps | Planned (§3.5 proves it on staging) |
| 6 | UI for the control plane (optional for apply, required for operation) | App | Not started (§4) |

### 5.2 Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Broken lineage (missing idx 15–19 snapshots, broken `0011`/`0012` chain, unjournaled `0019`/`0020`) invites a bad `generate`/`push` | High | Rule 3 forbids generate/migrate from worktrees; R2 repair is mandatory; CI guard recommended |
| App code (7488053) reads `users.must_change_password` while `0020` may not be applied | High | R1 verification is urgent; deployment controller does NOT run migrations, so the columns do not appear automatically |
| New RESTRICT FKs block the live permanent-delete path once applied | Medium | Intended (a hold must block ANY delete). Live action fails safe (rollback); UI pre-empts (§4.2) |
| Tier 2 enabled prematurely | High | `RETENTION_ELIGIBLE_CATEGORIES = []`, executor `false`, both test-pinned; enabling requires a distinct reviewed PR + §4 record |
| Operator/user `SET NULL` could orphan control records' actor identity | Low | Email snapshots stored alongside; audit trail independent |
| Backup/PITR re-instates "permanently deleted" data | Medium | Explicit §4 DBA sign-off row; deletion expectations must be documented against backup retention before enabling execution |
| Documents filesystem deletion outside the DB transaction (pre-existing) | Low | Unchanged by this work; documented in policy §1.4 |

### 5.3 STOP conditions for this workstream

Any one of these halts staging/production work (escalate to the change owners):

- Staging cannot be proven isolated (endpoint, credential, role, or storage
  shared with production).
- Any preflight checksum differs from the reviewed artifact.
- The §3.4 validation output differs from the §1.3 contract in any way.
- `0019`/`0020` production state is `unexplained` after R1.
- Any attempt (tool, script, or person) to run `generate`/`push`, edit the
  journal, or edit ledger rows during this workstream.
- A partial `0021` apply or an unexpected second active-hold insert succeeding.

**Final statement:** migration `0021` remains unapplied and unjournaled; the
executor remains disabled; `RETENTION_ELIGIBLE_CATEGORIES` remains empty. This
document adds planning and procedure only — no database, migration, or
deployment action has been performed.
