# 0022 — Retention-compatible employee deletion (detach + identity snapshots)

Status: **IMPLEMENTED (code + migration authored, migration NOT applied).**
DBA/Legal/DPO review of the migration remains a **blocking prerequisite** for
applying `0022` to any database, including the staging rehearsal. The SQL has
been **statically reviewed only**; no staging rehearsal and no runtime
execution has occurred. See §6, §6.2 and §7.

This document records the complete dependency audit, the selected database
strategy, its trade-offs, and the migration/rollback plan required by
`docs/employee-permanent-delete-policy.md` §7.5 option 2 ("an approved database
change to detach or anonymize the retained records … reviewed by DBA/Legal/DPO").

Related documents:

- `docs/employee-permanent-delete-policy.md` — the policy, tiers and §4 sign-off table.
- `docs/employee-deletion-0021-staging-runbook.md` — lineage reconciliation plan.
- `db/migrations/0022_employee_retention_detach.sql` — the migration itself.

---

## 1. Root cause

A Super Administrator's permanent deletion cannot complete while any protected
historical record exists because migration `0017` reconciled every
employee-scoped foreign key to `ON DELETE RESTRICT` **and** every protected
table's `employee_id` column is `NOT NULL`. That is a correct and deliberate
safety property — it made blanket destructive deletion impossible — but it also
made *retention-compatible* deletion impossible: there is no way to remove the
person's primary record while keeping the legally retained history, because the
history is welded to the person row by a mandatory reference.

The 2026-10-13 revision (policy §7) removed the **application-level** blocker
for the Super Administrator, but the database still refuses the `DELETE`
(`23503`), rolls the transaction back and the server reports the
retained-completion error. Completing the deletion requires a schema change.
This is that change.

## 2. Complete dependency inventory (verified against the live PostgreSQL catalog)

Source of truth: `pg_constraint` / `information_schema` on the running
PostgreSQL 16 instance, cross-checked with the Drizzle schema and migration
history `0000…0021`.

### 2.1 Employee-scoped foreign keys — PROTECTED (retention-bound) tables

All are `ON DELETE RESTRICT` with `employee_id NOT NULL` today:

| Table | FK constraint | Notes |
| --- | --- | --- |
| `attendance_records` | `attendance_records_employee_id_employees_id_fk` | unique `(employee_id, attendance_date)` |
| `attendance_events` | `attendance_events_employee_id_employees_id_fk` | append-only; child `attendance_id` SET NULL to records |
| `leave_balances` | `leave_balances_employee_id_employees_id_fk` | unique `(employee_id, leave_type_id, year)` |
| `leave_requests` | `leave_requests_employee_id_employees_id_fk` | `reviewed_by → users` SET NULL |
| `permission_requests` | `permission_requests_employee_id_employees_id_fk` | `reviewed_by → users` SET NULL |
| `employee_payroll_components` | `employee_payroll_components_employee_id_employees_id_fk` | partial unique `(org, employee_id, component_id) WHERE active` |
| `payroll_items` | `payroll_items_employee_id_employees_id_fk` | **has** `employee_number_snapshot` + `employee_name_snapshot` (NOT NULL, creation-time) |
| `payslips` | `payslips_employee_id_employees_id_fk` | **has** `employee_number_snapshot`, `birth_date_snapshot` (PDF password contract) |
| `payslip_documents` | `payslip_documents_employee_id_employees_id_fk` | also `payslip_id → payslips` RESTRICT |
| `payslip_document_versions` | `payslip_document_versions_employee_id_employees_id_fk` | append-only version chain |
| `employee_employment_history` | `employee_employment_history_employee_id_employees_id_fk` | also `manager_id → employees` SET NULL |

### 2.2 Employee-scoped foreign keys — DELETABLE (person-owned) tables

Also `ON DELETE RESTRICT` + `employee_id NOT NULL` (after `0017`), but they are
**removed explicitly by the delete plan** inside the deletion transaction, so
they never block it:

`employee_documents`, `employee_face_enrollments`, `face_enrollment_templates`
(child first — its own enrollment FK is CASCADE but the plan never relies on
it), `employee_project_assignments`, `employee_addresses`,
`employee_insurances`, `employee_bank_accounts`, `employee_dependents`,
`employee_educations`, `employee_custom_field_values`,
`announcement_recipients`.

### 2.3 Self/other references

| Reference | Action | Effect on deletion |
| --- | --- | --- |
| `employees.manager_id → employees(id)` | SET NULL | direct reports survive, manager cleared |
| `employee_employment_history.manager_id → employees(id)` | SET NULL | historical rows lose the manager pointer |
| `employees.user_id → users(id)` | SET NULL (link lives on the employee row) | the login account survives, unlinked |
| `employees.work_location_id → work_locations` | SET NULL | n/a (removed with the row) |
| `audit_logs.entity_id` | **no FK at all** (plain uuid) | the audit trail survives by design |
| `audit_logs.actor_user_id → users(id)` | SET NULL | n/a |
| `leave_request_events`, `permission_request_events`, `payroll_item_components`, `attendance_photos` | reference protected parents only (CASCADE/SET NULL) | inherit retention; never reference `employees` |

### 2.4 Not yet in the database (pending, out of scope here)

- Migration `0021` control-plane tables (`employee_legal_holds`,
  `employee_deletion_requests`, `employee_deletion_approvals`) are **not
  applied** and their employee FKs are deliberately `RESTRICT` so an active
  legal hold will physically block any deletion once applied. `0022` must not
  weaken that; it does not touch them.
- Triggers: none exist on any employee-scoped table.
- Snapshot columns that exist today: `payroll_items.employee_number_snapshot`,
  `payroll_items.employee_name_snapshot`, `payslips.employee_number_snapshot`,
  `payslips.birth_date_snapshot`, `payroll_item_components.*_snapshot`.

### 2.5 Historical reporting dependencies (queries that join protected tables to `employees`)

`INNER JOIN employees` today — a detached row would silently disappear from
history unless the query layer changes with the schema:

- Attendance: `listOrganizationAttendance`, `getAttendanceDetail`
  (`features/attendance/queries.ts`), the recap Excel export (consumes those rows).
- Leave: `listOrganizationLeaveRequests`, `getLeaveRequestDetail`
  (`features/leave/queries.ts`), `loadLeaveRequestForAction`
  (`features/leave/actions.ts`).
- Permission: `listOrganizationPermissionRequests`,
  `getPermissionRequestDetail` (`features/permission/queries.ts`),
  the review action (`features/permission/actions.ts`).
- Payroll: `listRecentPayslips` (`features/payroll/queries.ts`).
- `payroll_items` / payslip-per-run / per-period listings are already
  snapshot-based (no `employees` join) — designed for historical stability.
- Self-service queries (`listMy*`, `findOpenAttendance`, …) pin the session's
  employee and keep their `INNER JOIN`: a deleted employee has no session
  employee row, so there is nothing to serve.

## 3. Options considered

| # | Strategy | Verdict |
| --- | --- | --- |
| A | Keep `RESTRICT`; delete retained records too under the override | **Rejected** — violates the retention mandate; §4 sign-off absent; deletes the employer's legal time/financial record. |
| B | Blanket `ON DELETE CASCADE` | **Rejected** — explicitly forbidden by the task and by policy; destroys history; unbounded blast radius. |
| C | Disable/drop the FKs (session_replication_role or constraint drop) | **Rejected** — explicitly forbidden; leaves the schema lying about integrity. |
| D | Anonymize retained rows at deletion time (scrub amounts/names into hashes) | **Rejected as the primary mechanism** — payroll/payslip/attendance figures must stay reportable and payroll math must remain verifiable; anonymization destroys the time/financial record's meaning. Retained as a *future* option for specific categories if Legal mandates erasure rather than retention. |
| E | **Nullable `employee_id` + `ON DELETE SET NULL` + immutable identity snapshots + integrity CHECK** | **SELECTED** — the exact design the policy §7.5 names and the task requests. Detailed below. |
| F | Tombstone/`deleted_at` soft delete of the employee row | **Rejected** — the requirement is *permanent* deletion of the primary record; a soft-deleted row remains personal data subject to the very erasure the Super Administrator is executing, and every employee-scoped query would need tombstone awareness. |

## 4. Selected strategy (E) — precise definition

For each of the eleven PROTECTED tables in §2.1:

1. **Add identity snapshot columns** `employee_number_snapshot text` and
   `employee_name_snapshot text` (nullable), except:
   - `payroll_items` — already carries both (NOT NULL, creation-time);
   - `payslips` — already carries `employee_number_snapshot`; only
     `employee_name_snapshot` is added.
   The snapshots are **immutable once written**: nothing in the application
   updates them after creation/deletion-time capture, and the deletion flow
   only fills NULLs (`COALESCE`), never overwrites — so the payslip PDF
   password contract (`employee_number_snapshot` + `DDMMYYYY(birth date)`)
   can never change retroactively.
2. **Backfill** every existing row's snapshots from its employee record inside
   the migration (best available identity; the payroll/payslip snapshots that
   already exist are preserved by the `WHERE … IS NULL` guard).
3. **Make `employee_id` nullable** and switch the FK from
   `ON DELETE RESTRICT` to **`ON DELETE SET NULL`**. This is neither a
   disabled constraint nor a CASCADE: the child row is always preserved and the
   reference is atomically cleared by PostgreSQL in the same statement that
   deletes the employee row.
4. **Add an integrity CHECK**
   `(employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL)`
   (`<table>_employee_identity_check`). A retained row may never be fully
   anonymous by accident: either it still references a live employee, or it
   carries its historical identity. This also makes the design self-defending:
   if the app is deployed *before* the migration and someone deletes an
   employee, post-migration rows would violate the CHECK and the DELETE fails
   closed (rollback) rather than silently detaching a row without identity.
5. **DELETABLE tables keep `RESTRICT` + `NOT NULL` untouched.** The explicit
   delete plan still removes them row by row, and the database still backstops
   a racing insert with `23503` → rollback.

### 4.1 Deletion flow (inside the single existing transaction)

1. `SELECT … FOR UPDATE` the employee row (unchanged).
2. Re-validate confirmation/acknowledgement/authorization/scope (unchanged).
3. Count + classify dependents (`listEmployeeDeletionDependencies`) and decide
   (`evaluatePermanentEmployeeDeletion`, Super Administrator override) —
   unchanged.
4. **NEW** `snapshotEmployeeRetainedRecords(tx, …)`: one org+employee-scoped
   `UPDATE` per protected table setting
   `employee_number_snapshot = COALESCE(employee_number_snapshot, $number)`,
   `employee_name_snapshot = COALESCE(employee_name_snapshot, $name)`.
   The plan is derived from the same `EMPLOYEE_DELETE_DEPENDENCY_SOURCES`
   table list that drives counting and deletion, so the three can never drift;
   a module-load assertion keeps every protected table in the snapshot plan and
   every deletable table out of it.
5. Delete the DELETABLE records (existing explicit plan, unchanged).
6. `DELETE employees …` — the protected FKs now atomically SET NULL the
   retained references in the same statement. No partial state is possible:
   any failure at any step rolls back snapshots, deletable-record removals and
   the employee row together.

The result: the employee's primary record is permanently gone; Attendance,
Leave, Permission, Payroll, Payslip and Employment history remain — org-scoped,
with their historical identity frozen on the row — and payroll math is
untouched because it was already snapshot-based.

### 4.2 Historical reporting contract

Every management/report query over protected tables switches from
`INNER JOIN employees` to `LEFT JOIN employees` and resolves display identity
with `COALESCE(live employee fields, snapshot columns)`; free-text search also
matches the snapshots. `employeeId` in returned rows becomes `string | null`
(NULL ⇒ detached history; UIs render plain text instead of a profile link).
Self-service queries keep `INNER JOIN` (a deleted employee cannot reach them).
Review actions (leave/permission) load the request via `LEFT JOIN` so retained
requests stay visible; the balance mutation for a detached request finds no
balance row and is refused safely without special-casing.

### 4.3 What this deliberately does NOT change

- The control plane (§2/§3 of the policy), `RETENTION_ELIGIBLE_CATEGORIES`
  and `DELETION_EXECUTION_ENABLED = false` are untouched.
- Authorization (SUPERADMIN + system-only `employees.permanent_delete`,
  server-verified), organization-scope resolution, typed confirmation and the
  acknowledgement are untouched.
- The retained-completion error path stays in the action as the
  **compatibility fallback**: if the app runs against a database where `0022`
  is not applied, the `RESTRICT` FKs still refuse the DELETE (`23503`), the
  transaction rolls back and the operator gets the retained-completion
  message. The feature completes only when BOTH the migration and the app are
  deployed — there is no ordering hazard, it fails closed in between.

## 5. Trade-offs

| Trade-off | Assessment |
| --- | --- |
| `employee_id` becomes nullable on protected tables — an app bug could theoretically insert a live record with NULL `employee_id` | Mitigated by the `<table>_employee_identity_check` CHECK (a detached row must carry identity) and by the fact that every write path supplies the id. Acceptable. |
| FK switches RESTRICT → SET NULL weaken the *blanket* "employee row cannot be deleted while history exists" invariant | Intended: that invariant is replaced by the *retention-compatible* invariant "history is never deleted and always keeps its identity". The 0017 hardening keeps its full strength for every other write path (no app code deletes employees outside this action, and tenant roles cannot reach it). |
| Snapshot identity is captured at deletion time for legacy rows (not creation time) | For rows that existed before 0022 the migration backfills the best available identity (current employee number/name). Payroll/payslip creation-time snapshots are preserved. Documented residual inaccuracy, one-time. |
| Detached rows no longer match name/number search on `employees` columns | Search clauses extended to the snapshot columns. |
| `employee_id`-unique indexes no longer constrain detached rows (e.g. one attendance row per employee/day) | Harmless: detached rows are immutable history; no new rows can be created for a deleted employee (the FK requires a live parent). |
| Payroll-config rows (`employee_payroll_components`) survive detached and `active` | Inert by construction: every payroll calculation drives from `employees`, so a detached row can never enter a run. No mutation of retained rows during deletion (only the identity snapshot fill). |
| Reports must use `LEFT JOIN` + COALESCE | Explicit, reviewable query change; the alternative (dropping detached rows from history) violates the reporting requirement. |

## 6. Migration `0022_employee_retention_detach.sql`

- **Additive-first and transactional**: runs inside `BEGIN … COMMIT`; every
  `ALTER`/`UPDATE` is idempotent (`IF EXISTS`/`IF NOT EXISTS`/`IS NULL` guards),
  and the closing verification checks invariants that hold **before and after**
  the first permanent deletion. A re-run after a partial failure — or at any
  later point in the lifecycle — is safe. See §6.2 for the lifecycle and the
  evidence standard; **runtime idempotency is UNPROVEN** until the staging
  rehearsal records it (`employee-permanent-delete-0022-staging-runbook.md`
  §2/§5.6).
- **No data is deleted and no row's meaning changes**: snapshots are filled,
  nullability widened, FK actions changed, checks added. Existing production
  data is preserved bit-for-bit apart from the added snapshot values.
- **NOT journaled**, following the established out-of-band pattern for
  `0019`/`0020`/`0021` (documented lineage breakage; see the staging runbook).
  Journaling happens in the approved lineage-reconciliation change.
- **Not applied automatically, and not applied at all** by this work: the
  migration has only been **statically reviewed** (`node --test`, `tsc`, lint,
  and read-only catalog inspection). No rehearsal database was created or used
  to execute `0022`; the prior "rehearsing it twice" wording was unsupported and
  has been corrected. Actual execution evidence is pending the approved staging
  rehearsal.

### 6.1 Rollback / recovery

Before the first production application, take the approved backup. Rollback
options in increasing severity:

1. **Revert the schema** (if the feature must be withdrawn after application):

   ```sql
   BEGIN;
   -- per protected table: restore NOT NULL, re-tighten the FK, drop the check
   ALTER TABLE attendance_records ALTER COLUMN employee_id SET NOT NULL; -- etc.
   -- (fails with 23503-not-checkable if any detached row exists: those rows
   --  must first be reviewed by HR/Legal — they are retained history)
   COMMIT;
   ```

    The snapshot columns can stay (they are harmless, additive and preserve the
    audit value already captured).
2. **Forward recovery — re-run `0022`** (preferred for a failed/partial apply):
   the migration is one transaction, so a failure leaves no partial state; the
   same reviewed artifact can be re-applied at any lifecycle point, including
   after detachments exist (§6.2). This is the documented recovery procedure.
3. **Point-in-time recovery** to before the migration window (DBA procedure,
   existing backup/PITR runbook) — this also restores any deletions performed
   since; coordinate with HR because deletion of the employee row is itself an
   audited, intended data change.
4. **A committed deletion is not reversible by schema means** — the employee
   row is gone by design. The audit row (`employee.permanently_deleted`, with
   the removed/retained summaries) and the retained history are the recovery
   narrative; re-creating the employee is a new record, not a restore.

### 6.2 Migration lifecycle and re-run contract

`0022` is designed and verified (statically) to be **repeatable across the whole
lifecycle**. The distinction the previous revision got wrong:

| Lifecycle point | Re-run of `0022` |
| --- | --- |
| Before any permanent deletion (fresh pre-0022 schema) | Safe: idempotent schema change; verification passes with zero detached rows. |
| After `0022` applied, before any permanent deletion | Safe: no-ops; verification passes. |
| After retained records were detached by a permanent deletion | **Safe**: detached rows (`employee_id IS NULL`, populated `employee_number_snapshot`) satisfy the retained-identity CHECK and the backfill `UPDATE` skips them (`WHERE t.employee_id = e.id`); the verification no longer asserts that zero rows are detached. |
| Recovery from a partially applied migration | Safe: the migration is a single `BEGIN … COMMIT`, so PostgreSQL provides all-or-nothing — a failure leaves **no** partial state to clean up; re-run the same reviewed artifact. |

The reason a re-run is safe after deletion is that the migration never asserts
"nobody has been detached". Its verified invariants are lifecycle-independent:

- **Backfill completeness** — a row still bound to a live employee carries its
  number snapshot (`employee_id IS NOT NULL AND employee_number_snapshot IS NULL`
  must be zero).
- **Snapshot integrity** — a detached/retained row is never anonymous
  (`employee_id IS NULL AND employee_number_snapshot IS NULL` must be zero),
  also enforced by every `<table>_retained_identity_check`.
- **Schema invariants** (`pg_catalog`, no data dependence) — `employee_id` is
  nullable; the employee FK is `ON DELETE SET NULL` (confdeltype `'n'`, never
  `'c'`); the retained-identity CHECK exists.

The earlier revision's `count(*) WHERE employee_id IS NULL = 0` assertion was
only true *before* the first deletion, so it made the migration falsely
one-time. It has been replaced by the checks above; the integrity guarantees
were **not** weakened — the retained-identity CHECK and the fail-closed `SET
NULL` behaviour are unchanged.

## 7. Approvals required before production application (BLOCKING)

| Area | Owner | Decision required |
| --- | --- | --- |
| Retention detach design (this document) | DBA + Legal/Compliance + DPO | Confirm nullable-reference + snapshot retention is acceptable for every protected category in their jurisdiction |
| Migration `0022` review | DBA | Review the SQL, rehearse on the staging restore, schedule the window |
| Backup/PITR vs deletion expectations | DBA | Confirms §6.1 is acceptable |
| Lineage reconciliation | DBA | Journal `0019`–`0022` in the approved reconciliation change |
| §4 retention schedule | HR/Payroll + Legal | Still pending (unchanged by this design; nothing is deleted, so tier 2 remains disabled and irrelevant here) |

Until these are recorded, `0022` must not be applied to any database — staging
included — and the live path keeps failing closed with the retained-completion
message wherever the migration has not been applied.
