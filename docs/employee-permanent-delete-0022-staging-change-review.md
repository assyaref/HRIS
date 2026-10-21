# Migration 0022 — Staging Change Review Record (STATIC REVIEW)

**Record type:** STATIC SOURCE-AND-SCHEMA REVIEW — **not** runtime certification.

> This document records a **static** review only. It is **not** a runtime
> certification, not a staging result, and not an authorization to apply
> anything. Migration `0022` **must not be applied to any database yet** —
> staging included. Runtime idempotency and runtime rollback behaviour remain
> **UNPROVEN** until the approved staging rehearsal
> (`docs/employee-permanent-delete-0022-staging-runbook.md` §5) records them.

- **Status:** review record complete; **apply blocked**.
- **Date of review:** 2026-10-15
- **Repository:** `/opt/hris` (git `main`, working tree; no commit made by this review)
- **Companion documents:**
  - `docs/employee-permanent-delete-0022-detach-design.md`
  - `docs/employee-permanent-delete-0022-staging-runbook.md`
  - `docs/employee-permanent-delete-0022-lineage-reconciliation-plan.md`
  - `docs/employee-permanent-delete-0022-approval-checklist.md`

---

## 1. Reviewed artifact

| Item | Value |
| --- | --- |
| Migration path | `db/migrations/0022_employee_retention_detach.sql` |
| Line count | 570 |
| SHA-256 | `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` |
| Journal status | **Deliberately unjournaled** — absent from `db/migrations/meta/_journal.json` |
| Apply status | **NOT applied** to any database (staging or production) |
| Transaction shape | Exactly one `BEGIN;` … `COMMIT;` (all-or-nothing) |

The checksum and line count above were re-verified in this worktree at review
time and match the baseline under review.

---

## 2. Reviewed source and application scope

### 2.1 Migration (reviewed artifact)

`db/migrations/0022_employee_retention_detach.sql` (the only artifact whose
SHA-256 is the review anchor).

### 2.2 Schema companion changes (working tree)

- `db/schema/attendance.ts`
- `db/schema/employee_details.ts`
- `db/schema/index.ts`
- `db/schema/leave.ts`
- `db/schema/payroll.ts`
- `db/schema/permission_requests.ts`

### 2.3 Application companion changes (working tree)

- `features/employees/queries.ts`, `features/employees/actions.ts`,
  `features/employees/permanent-delete-policy.ts`,
  `features/employees/delete-employee-dialog.tsx`
- `features/attendance/queries.ts`
- `features/leave/actions.ts`, `features/leave/queries.ts`
- `features/permission/actions.ts`, `features/permission/queries.ts`
- `features/payroll/actions.ts`, `features/payroll/payslip-document.actions.ts`,
  `features/payroll/payslip-document.guard.ts`, `features/payroll/queries.ts`
- `app/api/payroll/payslips/[payslipId]/pdf/route.ts`
- `lib/auth/audit.ts`, `lib/auth/permissions.ts`

### 2.4 Tests (working tree)

- `tests/employees/employee-retention-detach.test.ts`
- `tests/employees/employee-permanent-delete.test.ts`
- `tests/employees/employee-deletion-controls.test.ts`

### 2.5 Scope of the migration (verified in §1.3 of the staging runbook)

- 11 PROTECTED (retention-bound) tables gain nullable `employee_id`, a
  `ON DELETE SET NULL` employee FK (constraint name preserved), and a
  `<table>_retained_identity_check` CHECK.
- `employee_number_snapshot` + `employee_name_snapshot` added on 10 PROTECTED
  tables; `payroll_items` adds none (creation-time snapshots already exist).
- `payslips` adds only `employee_name_snapshot`; the existing number/birth
  snapshots (0013/0014) are never redefined.
- 11 DELETABLE (person-owned) tables are **untouched** — they keep
  `RESTRICT` + `NOT NULL`.
- Additive only: no `DELETE`/`TRUNCATE`/`DROP COLUMN`; no `CASCADE`; no
  `session_replication_role`; no trigger disabling.

---

## 3. Test and static-analysis results (re-verified this review)

| Check | Command | Result |
| --- | --- | --- |
| Retention-detach suite | `node --test tests/employees/employee-retention-detach.test.ts` | **45 pass / 0 fail** (8 suites) |
| Deletion-controls suite | `node --test tests/employees/employee-deletion-controls.test.ts` | **44 pass / 0 fail** (13 suites) |
| Permanent-delete suite | `node --test tests/employees/employee-permanent-delete.test.ts` | **168 pass / 0 fail** (28 suites) |
| Full suite | `npm test` (baseline) | **1,933 pass / 0 fail** |
| TypeScript | `npx tsc --noEmit` | clean (exit 0) |
| Lint | `npm run lint` | 0 errors, 15 warnings (all pre-existing) |

The 15 lint warnings are pre-existing patterns (unused `_prevState`/`_formData`
in `useActionState` signatures, and `window.location` navigation suggestions);
none are introduced by, or attributable to, migration `0022`.

**Limits of this evidence:** the tests above statically parse and assert on the
migration SQL and application modules. They do **not** execute `0022` against
PostgreSQL. Passing tests are **not** runtime proof.

---

## 4. Static idempotency assessment

Every statement class in `0022` is guarded:

| Statement class | Guard | Static re-run expectation |
| --- | --- | --- |
| `ALTER TABLE … ADD COLUMN IF NOT EXISTS` | `IF NOT EXISTS` | no-op if the column exists |
| Backfill `UPDATE … SET col = COALESCE(col, e.col) WHERE (col IS NULL OR …)` | NULL-fill only | filled rows no longer match; never overwrites a snapshot |
| `ALTER COLUMN employee_id DROP NOT NULL` | PostgreSQL no-op when already nullable | safe |
| FK swap `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT` | drop-then-add | drop is a no-op; FK re-created identical (`ON DELETE SET NULL`) |
| `<table>_retained_identity_check` | `DO` block guarded by `pg_constraint` existence | no-op if present |
| Closing verification `DO` block | checks lifecycle-independent invariants | passes before and after a permanent deletion |

The closing verification checks invariants that hold **before and after** the
first permanent deletion:

1. backfill completeness — a live reference has its number snapshot;
2. non-anonymous retention — `employee_id IS NULL AND employee_number_snapshot IS NULL` is zero;
3. `employee_id` is nullable;
4. the employee FK is `ON DELETE SET NULL` (`confdeltype = 'n'`, never `'c'`);
5. the retained-identity CHECK exists.

**Assessment:** the SQL is statically idempotent and designed to be repeatable
at every lifecycle point. **Runtime idempotency is UNPROVEN.**

---

## 5. Static rollback assessment

Per `docs/employee-permanent-delete-0022-detach-design.md` §6.1 and the staging
runbook §5.9, in increasing severity:

1. **Forward recovery — re-run `0022`** (preferred): the migration is one
   transaction, so a failed/partial apply leaves no partial state; the same
   reviewed artifact is re-applied.
2. **Revert the schema** (withdrawal only): restore `NOT NULL`, re-tighten the FK
   to `RESTRICT`, drop the CHECK. This **fails (`23503`)** if any row is already
   detached; such rows are retained history requiring HR/Legal review. Snapshot
   columns may remain (additive, harmless).
3. **Point-in-time recovery** to before the window (DBA/PITR) — also restores any
   deletions performed since; coordinate with HR.
4. **A committed deletion is not reversible by schema means** — the employee row
   is gone by design; the audit row and retained history are the recovery
   narrative.

**Assessment:** the rollback path is statically sound for a single-transaction
apply. **Runtime rollback has NOT been rehearsed** (the §5.7 disposable-clone
tests are pending). This remains UNPROVEN until staging evidence exists.

---

## 6. What this review does NOT establish

- No `0022` execution against any PostgreSQL instance.
- No staging rehearsal, no disposable-clone transaction/rollback test, no
  historical-reporting run, no application deployment.
- No verification of runtime idempotency.
- No verification of runtime rollback.
- No migration journaling, no lineage change, no RBAC seeding.
- No employee record deleted or altered.

---

## 7. Current blockers and required approvals

### 7.1 Blockers (all open)

1. **Staging sign-off not recorded** — DBA + Application Lead authorization for
   the §5 staging rehearsal is absent (approval checklist Part A).
2. **Runtime evidence absent** — idempotency (§5.6/§5.7), rollback (§5.7),
   historical reporting (§5.8) unproven.
3. **Lineage unresolved** — `0019`–`0022` unjournaled; snapshots stop at `0014`;
   `0019`/`0020` production state partly unverified (see the lineage plan).
4. **Production retention/policy sign-offs absent** — policy §4.1 rows pending;
   DPO/Legal/HR-Payroll approvals not recorded.
5. **Compatible application build not approved/deployed** — deploy order
   (migration first, then build) not yet executed.
6. **`0019`/`0020` production status unverified** — `0020` unverified since
   commit 2026-10-10; `0019` observed NOT APPLIED (2026-10-01).

### 7.2 Staging approvals required before any apply

- DBA approval of the reviewed SQL + rehearsal plan.
- Application Lead approval of the compatible build and deploy order.
- Staging isolation verified (separate cluster/roles/secrets; `HRIS_ENV=staging`).
- Pre-apply backup captured and restore-rehearsed.
- Reviewed artifact checksum re-verified.

### 7.3 Production approvals required (separate, blocking)

- Migration SQL review + rehearsal evidence accepted — DBA.
- Retention/detach acceptable per category in-jurisdiction — Legal/Compliance.
- Personal-data handling of retained snapshots accepted — DPO.
- Retention schedule + deletion window — HR/Payroll (+ Legal).
- Compatible build + ordered rollout accepted — Application Lead.
- Lineage reconciliation executed; `0019`–`0022` journaled — DBA (reconciliation owner).

No production apply, no journaling, and no executor enablement may proceed on a
subset of these.

---

## 8. Disposition

**Migration `0022` must not be applied to any database yet — staging included.**
This record is a static review and a prerequisite only; it authorizes no
execution. The next permitted step is the recorded staging rehearsal under the
approval checklist, on an isolated staging database with a verified backup,
using the exact checksum above. Do not run `drizzle-kit generate`/`migrate`,
edit the journal, edit ledger rows, seed RBAC, enable the retention executor, or
delete employee records.

**No database, migration, journal, seed, deployment, or employee-deletion
action was performed in producing this record.**
