# Migration `0021` (Revised) — DBA Review Package

**Document type:** REVIEW REQUEST addressed to the DBA. It is **not** an
approval, a change record, a sign-off, or an instruction to execute anything.
**Status:** **READY FOR DBA REVIEW — BLOCKED** (no DBA decision recorded; see §9).

**Prepared:** 2026-10-21 (UTC)
**Repository:** `/opt/hris`, branch `main` (local only — **not pushed**)
**Package commit:** `6e49e44fa8c8971e79d24793d4cb371fe595f6fe` (`6e49e44`)
**Package HEAD:** `831027b3116ca591b4f07b9e151da712f4343937` (`831027b`, docs only)
**Environment impact so far:** **NONE.** `0021` has never been applied to
production or to a shared staging database. Every run cited below used a
disposable database on the local cluster.

Related: `docs/employee-deletion-0021-staging-runbook.md`,
`docs/employee-permanent-delete-0022-lineage-reconciliation-plan.md`,
`docs/employee-deletion-approval-matrix.md`,
`docs/employee-permanent-delete-dba-evidence-request.md`.

---

## 1. Artifact identity (recompute before reviewing)

| Item | Value |
| --- | --- |
| Path | `db/migrations/0021_employee_deletion_controls.sql` |
| **SHA-256 (review anchor)** | **`585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452`** |
| Short form | `585dd2d7…c452` |
| Size | 7,023 bytes / 141 lines |
| Introduced in | commit `6e49e44` (integration commit on local `main`) |
| Supersedes | SHA-256 `0e234c6ee9d2551686b28e93949f0d1c2573df8240bf0ded7a3eb92b52407764` (112 lines) as carried by release candidate `4d415af` |
| Companion migration | `db/migrations/0022_employee_retention_detach.sql` = `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` (unchanged since review) |
| Journal status | **ABSENT** from `db/migrations/meta/_journal.json` — deliberately out-of-band, per header of the file |
| Ledger status | No `drizzle.__drizzle_migrations` row exists in any environment (to be DBA-confirmed per environment) |

Recompute with:

```sh
sha256sum db/migrations/0021_employee_deletion_controls.sql db/migrations/0022_employee_retention_detach.sql
```

> **Stop condition:** if either value differs from the anchors above, STOP and
> re-review. Do not apply a file whose hash does not match a reviewed artifact.

---

## 2. Scope contract (what the migration claims to do)

Header contract of the file, verified against the applied instance (§4):

- **Additive only**: `CREATE TABLE IF NOT EXISTS` × 3, `CREATE INDEX IF NOT
  EXISTS` × 6, wrapped in `BEGIN … COMMIT`. **No `DROP`, no `ALTER`, no data
  migration, no backfill.**
- Introduces the control plane that gates Super Administrator permanent
  deletion: `employee_legal_holds`, `employee_deletion_requests`,
  `employee_deletion_approvals`.
- An **active** hold and a **pending/approved** request still block any
  employee `DELETE`, enforced **by the database** through two `CHECK`
  constraints (SQLSTATE `23514`), not only by application code.
- **Released** holds and **terminal** requests (`rejected`/`cancelled`/
  `executed`) are *history*: their `employee_id` is `ON DELETE SET NULL` and
  their identity is preserved in `employee_number_snapshot` /
  `employee_name_snapshot`.
- `employee_deletion_approvals.request_id` stays `ON DELETE RESTRICT` —
  approval records are never deleted or detached.
- Operator references (`placed_by_user_id`, `released_by_user_id`,
  `requester_user_id`, `approver_user_id`) are `ON DELETE SET NULL` and cannot
  unblock anything.
- The file states it must **not** be applied as part of a destructive release
  until `docs/employee-permanent-delete-policy.md` §4 is signed off.

---

## 3. SQL diff — previously reviewed revision (`4d415af`) → reviewed revision (`6e49e44`)

`git diff 4d415af..6e49e44 -- db/migrations/0021_employee_deletion_controls.sql`
(43 changed lines: +33 / −10):

```diff
@@ header — safety banner @@
---   This migration adds RESTRICT foreign keys that BLOCK employee deletion.
+--   This migration adds control-plane constraints that BLOCK employee deletion
+--   while a hold is active or a request is pending/approved.
@@ header — safety banner @@
---   - Every employee/request reference is ON DELETE RESTRICT, consistent with
---     migration 0017, so a legal hold physically blocks ANY employee DELETE.
+--   - An ACTIVE legal hold and a PENDING/APPROVED deletion request still block
+--     ANY employee DELETE. They do so through a NOT NULL-style CHECK after the
+--     employee reference is cleared (SET NULL), so the block is enforced by the
+--     database, not only by application code:
+--       * employee_legal_holds_active_requires_employee
+--       * employee_deletion_requests_active_requires_employee
+--   - RELEASED holds and TERMINAL requests (rejected/cancelled/executed) are
+--     control-plane HISTORY. Their employee reference is ON DELETE SET NULL so
+--     they no longer block a later, legitimate deletion; the identity snapshot
+--     columns preserve who the record was about.
@@ employee_legal_holds @@
-  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
+  -- Nullable ONLY for released holds whose employee row has been deleted.
+  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
+  -- Immutable identity captured when the hold is placed, so released hold
+  -- history remains attributable after the employee row is gone.
+  employee_number_snapshot text NOT NULL,
+  employee_name_snapshot text NOT NULL,
@@ employee_legal_holds (tail) @@
   active boolean NOT NULL DEFAULT true,
   created_at timestamptz NOT NULL DEFAULT now(),
-  updated_at timestamptz NOT NULL DEFAULT now()
+  updated_at timestamptz NOT NULL DEFAULT now(),
+  -- An ACTIVE hold can never lose its employee reference. Deleting the
+  -- employee fires SET NULL, this CHECK rejects it and the whole transaction
+  -- rolls back: the database still enforces "an active hold blocks deletion".
+  CONSTRAINT employee_legal_holds_active_requires_employee
+    CHECK (NOT active OR employee_id IS NOT NULL)
 );
@@ employee_deletion_requests @@
-  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
+  -- Nullable ONLY for terminal requests whose employee row has been deleted.
+  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
@@ employee_deletion_requests (tail) @@
   decision_reason text,
   created_at timestamptz NOT NULL DEFAULT now(),
-  updated_at timestamptz NOT NULL DEFAULT now()
+  updated_at timestamptz NOT NULL DEFAULT now(),
+  -- Pending/approved requests are live control-plane state and must keep the
+  -- employee reference (they block deletion). Rejected/cancelled/executed
+  -- requests are terminal history and may be detached when the employee row is
+  -- later deleted. Unknown statuses fail closed (they require the reference).
+  CONSTRAINT employee_deletion_requests_active_requires_employee
+    CHECK (
+      employee_id IS NOT NULL
+      OR status IN ('rejected', 'cancelled', 'executed')
+    )
 );
```

### 3.1 Interpretation of the change (why the checksum moved)

| Aspect | Previous (`0e234c6e…7764`) | Revised (`585dd2d7…c452`) | Effect |
| --- | --- | --- | --- |
| `employee_legal_holds.employee_id` | `NOT NULL`, `RESTRICT` | nullable, `SET NULL` | A released hold no longer prevents a later legitimate delete |
| `employee_deletion_requests.employee_id` | `NOT NULL`, `RESTRICT` | nullable, `SET NULL` | A terminal request no longer prevents a later legitimate delete |
| Hold identity after detach | none (row could not exist without employee) | `employee_number_snapshot NOT NULL`, `employee_name_snapshot NOT NULL` | History stays attributable; never anonymous |
| Active-hold block | FK `RESTRICT` only | FK `SET NULL` **+** `CHECK (NOT active OR employee_id IS NOT NULL)` | Block preserved, now as `23514` instead of `23503` |
| Pending/approved-request block | FK `RESTRICT` only | FK `SET NULL` **+** `CHECK (employee_id IS NOT NULL OR status IN ('rejected','cancelled','executed'))` | Unknown/future statuses **fail closed** (reference required) |
| Approval records | `request_id RESTRICT` | unchanged | Approvals remain undeletable |

**Nothing else changed.** Column list, indexes, PKs, `organization_id`
`RESTRICT`, user-reference `SET NULL`, and the transaction wrapper are
byte-identical in intent.

### 3.2 Behavioural consequences the DBA must accept before applying

1. The blocking signal for an active hold / pending request changes from
   SQLSTATE **`23503`** (foreign key) to **`23514`** (check constraint). Any
   client, runbook, monitoring rule or query that keys on `23503` for this
   condition must be updated. The application already maps `23514` by
   constraint name (`features/employees/actions.ts:135` `DB_CHECK_VIOLATION`,
   `:1386` `LEGAL_HOLD`, `:1396` `ACTIVE_DELETION_REQUEST`).
2. `employee_legal_holds.employee_id` and
   `employee_deletion_requests.employee_id` become **nullable columns**. Any
   consumer assuming `NOT NULL` must be re-checked (application query
   `getEmployeeDeletionControlState`, `features/employees/queries.ts:1047`).
3. A row inserted with `active = false` and `employee_id = NULL` is accepted by
   the hold CHECK (it is history). The unique partial index
   `employee_legal_holds_active_hold_unique (organization_id, employee_id)
   WHERE active` does not cover such rows — by design (released history is
   unlimited), but it means "one active hold per employee" is only enforced for
   rows that still carry `employee_id`.
4. Deleting an employee with an active hold (or pending/approved request)
   **fails and rolls back the whole transaction**, leaving no partial write.

---

## 4. Object inventory of the applied migration (from a disposable database)

Captured from `hris_control_fk_20261021T035639Z` after `0021` (then `0022`)
was applied (see §7).

**Tables (3):** `employee_legal_holds`, `employee_deletion_requests`,
`employee_deletion_approvals`.

**Foreign keys declared by `0021` (10):**

| Constraint | Column | References | On delete |
| --- | --- | --- | --- |
| `employee_legal_holds_organization_id_fkey` | `organization_id` | `organizations` | `RESTRICT` |
| `employee_legal_holds_employee_id_fkey` | `employee_id` | `employees` | **`SET NULL`** |
| `employee_legal_holds_placed_by_user_id_fkey` | `placed_by_user_id` | `users` | `SET NULL` |
| `employee_legal_holds_released_by_user_id_fkey` | `released_by_user_id` | `users` | `SET NULL` |
| `employee_deletion_requests_organization_id_fkey` | `organization_id` | `organizations` | `RESTRICT` |
| `employee_deletion_requests_employee_id_fkey` | `employee_id` | `employees` | **`SET NULL`** |
| `employee_deletion_requests_requester_user_id_fkey` | `requester_user_id` | `users` | `SET NULL` |
| `employee_deletion_approvals_organization_id_fkey` | `organization_id` | `organizations` | `RESTRICT` |
| `employee_deletion_approvals_request_id_fkey` | `request_id` | `employee_deletion_requests` | **`RESTRICT`** |
| `employee_deletion_approvals_approver_user_id_fkey` | `approver_user_id` | `users` | `SET NULL` |

**Indexes:** 3 PKs + 6 declared non-PK indexes —
`employee_legal_holds_employee_idx`, `employee_legal_holds_active_hold_unique`
(partial, `WHERE active`), `employee_deletion_requests_org_employee_idx`,
`employee_deletion_requests_status_idx`,
`employee_deletion_approvals_request_approver_unique`,
`employee_deletion_approvals_request_idx`.

**CHECK constraints (2):**

```sql
employee_legal_holds_active_requires_employee
  :: CHECK (((NOT active) OR (employee_id IS NOT NULL)))
employee_deletion_requests_active_requires_employee
  :: CHECK (((employee_id IS NOT NULL)
             OR (status = ANY (ARRAY['rejected','cancelled','executed']))))
```

**Nullable columns introduced by the revision:**
`employee_legal_holds.employee_id`,
`employee_deletion_requests.employee_id`.
**NOT NULL identity columns introduced by the revision:**
`employee_legal_holds.employee_number_snapshot`,
`employee_legal_holds.employee_name_snapshot`.
(`employee_deletion_requests.employee_number` / `employee_name` were already
`NOT NULL` in the previous revision.)

---

## 5. FK / control-plane impact

### 5.1 Employee FK population (disposable database, before → after `0021` + `0022`)

| Metric | Baseline (restore of `staging-db-20261021T005459Z-pre-0022.dump`) | After `0021` + `0022` |
| --- | ---: | ---: |
| FKs referencing `employees` | **24** | **26** |
| — `ON DELETE CASCADE` | 0 | **0** |
| — `ON DELETE SET NULL` (`n`) | 2 | **15** |
| — `ON DELETE RESTRICT` (`r`) | 22 | **11** |
| Retained-identity CHECKs (`%_retained_identity_check`) | 0 | **11** |
| Live-control CHECKs (this package) | — | **2** |
| Anonymous retained rows (`employee_id IS NULL` with no identity snapshot) | — | **0** |

Baseline detail (24): 22 `RESTRICT` on the 11 deletable + 11 protected tables,
plus 2 `SET NULL` (`employees.manager_id` self-reference and one
`employee_employment_history → employees` FK).

After (26): the 11 protected history tables move to `SET NULL`, the 11
deletable tables stay `RESTRICT`, and `0021` adds 2 control-plane `SET NULL`
references. The approval FK stays `RESTRICT`. **No `CASCADE` exists anywhere
in the employee FK set.**

### 5.2 Control-plane semantics after this migration

| Situation | Enforced by | Result of an employee `DELETE` |
| --- | --- | --- |
| Active legal hold | CHECK `employee_legal_holds_active_requires_employee` (`23514`) | **Refused**, transaction rolled back |
| Pending or approved deletion request | CHECK `employee_deletion_requests_active_requires_employee` (`23514`) | **Refused**, transaction rolled back |
| Released hold / rejected/cancelled/executed request | FK `SET NULL` + `NOT NULL` snapshots | Row **detached**, identity retained, delete proceeds |
| Approval rows | FK `request_id RESTRICT` (`23503`) | Delete of an approval-bearing request **refused** |
| Concurrent second active hold | partial unique index (`23505`) | Second placement refused (`HOLD_EXISTS`) |
| Unknown/future request status with `employee_id NULL` | CHECK fails closed | **Refused** |

### 5.3 Application integration shipped with the same commit (`6e49e44`)

- `features/employees/queries.ts:1047` — `getEmployeeDeletionControlState`.
- `features/employees/actions.ts:1255` — pre-check called **inside** the
  deletion transaction after the employee row is locked; refuses with
  `LEGAL_HOLD` / `ACTIVE_DELETION_REQUEST`.
- `features/employees/actions.ts:135` — `23514` mapped by constraint name as
  the race backstop (`:1386`, `:1396`).
- Preflight report and delete dialog expose `legalHoldActive` and
  `blockingDeletionRequestCount` and gate submission
  (`features/employees/queries.ts`, `delete-employee-dialog.tsx`).
- Legal-hold inserts write employee-number/name snapshots
  (`deletion-control.actions.ts`).
- Control actions accept `employeeId: string | null` for detached history.

### 5.4 Impact on production today

**Zero.** Production does not have `employee_legal_holds`,
`employee_deletion_requests`, `employee_deletion_approvals` (read-only
re-check 2026-10-21: objects absent; ledger 18 rows,
`max(created_at) = 1790661254287`). The revised `0021` therefore changes
nothing until a DBA applies it.

---

## 6. Rollback limitations (read before signing)

`0021` ships **no down-migration**. There is no `*.down.sql` and Drizzle's
journal-driven migrator does not execute rollbacks (`node_modules/drizzle-orm`
`migrate` is apply-only — see lineage plan §1.5). Consequences:

1. **Rollback = manual `DROP` of three tables.** That is destructive to
   *control-plane data*: every legal hold, deletion request and approval row is
   lost. Approval rows are governance evidence (dual control); dropping them
   destroys the audit of who requested/approved what. **Take a verified backup
   before any apply, and treat `DROP` as data loss, not as a clean undo.**
2. **Not reversible once rows exist.** `0021` itself migrates no data, so the
   *schema* is mechanically droppable — but any rows written after apply cannot
   be restored except from a backup taken before the write.
3. **Rollback does not restore the previous guarantee automatically.** Dropping
   the tables removes both CHECK constraints and the partial unique index, so
   the database-level "active hold blocks deletion" and "one active hold per
   employee" guarantees disappear until the tables are recreated.
4. **NULLability cannot be undone without data repair.** Re-imposing
   `NOT NULL` on `employee_legal_holds.employee_id` /
   `employee_deletion_requests.employee_id` would fail while any detached
   history row (with `employee_id IS NULL`) exists. A rollback that wants the
   old shape must first delete or repair those rows — an irreversible action.
5. **Chain coupling with `0022`.** `0022` alters 11 pre-existing tables
   (nullable `employee_id`, snapshot backfill, retained-identity CHECKs).
   Rolling back `0021` alone while `0022` stays applied leaves an inconsistent
   control plane (history detachable but no control tables). Rolling back
   `0022` requires re-imposing `NOT NULL` on 11 tables and discarding snapshot
   columns — permanent loss of payslip/password/identity snapshots.
6. **Journal/ledger hygiene.** Because `0021` is deliberately unjournaled, an
   apply must **not** be recorded by hand-editing `drizzle.__drizzle_migrations`
   or `meta/_journal.json`. A rollback must not remove or invent ledger rows
   either; the ledger entry (if any) is created only by the approved lineage
   reconciliation (see `docs/employee-permanent-delete-0022-lineage-reconciliation-plan.md`).
7. **Apply is idempotent, rollback is not.** Re-running `0021` is a no-op
   (`IF NOT EXISTS`, verified exit 0). The inverse is not automatic.
8. **Ordering.** Applying `0021` before `0022` is safe (independent objects);
   applying `0022` without `0021` is also safe. Rollback of the *pair* must be
   planned as one change, with a restore point.

---

## 7. Isolated regression evidence (disposable databases only)

### 7.1 Fresh run — 2026-10-21T03:56:39Z (this package)

Database `hris_control_fk_20261021T035639Z`, restored from
`/tmp/opencode/rehearsal-20261021/staging-db-20261021T005459Z-pre-0022.dump`
(staging dump, **not production**). Evidence directory:
`/tmp/opencode/migreg-20261021-20261021T035639Z/` (operator workspace, not
committed).

| Step | Artifact | Result |
| --- | --- | --- |
| Create + restore | `00-create.log`, `01-restore.log` | exit 0 |
| Checksums re-verified | `03-checksums.txt` | `585dd2d7…c452` / `724db82d…65c` |
| Pre-apply employee FK inventory | `04-pre-fk-to-employees.txt` | 24 rows |
| Apply `0021` | `05-apply-0021.log` | **exit 0** |
| Apply `0022` | `06-apply-0022.log` | **exit 0** |
| Re-apply `0021` (idempotency) | `07-rerun-0021.log` | **exit 0** (all `already exists, skipping`) |
| Re-apply `0022` (idempotency) | `08-rerun-0022.log` | **exit 0** |
| Catalog invariants | `09-invariants.out` | `RETAINED_IDENTITY_CHECKS=11`, `LIVE_CONTROL_CHECKS=2`, `CONTROL_TABLES=3`, `ANONYMOUS_RETAINED_ROWS=0`, 0 employee `CASCADE` |
| Post-apply FK inventory | `10-post-fk-to-employees.txt` | 26 rows (15 `n` / 11 `r` / 0 `c`) |
| Control-plane regression | `11-control-fk-regression.out` | **`CONTROL_FK_REGRESSION_PASS`** |

SHA-256 of the evidence files (from `99-evidence-sha256.txt`):

| File | SHA-256 |
| --- | --- |
| `03-checksums.txt` | `8929013814259a6b036016812fcd95f1b55e4c72c7c948ad345abe04e1328b49` |
| `04-pre-fk-to-employees.txt` | `5ee1ce8488283066be09ad09728cf3d9933846ca1186329076f620f95dd571af` |
| `05-apply-0021.log` | `5945e055551e374d656db0d199b0de70c23bdb48db82714ddb9f65a0b452fbaa` |
| `06-apply-0022.log` | `abc1868cd8b4470cb167c31f1288c642394e9dda5a7b5cf631c6d2cd4b2b5d52` |
| `07-rerun-0021.log` | `0d7f966dc1fc974dc23d72633a078a085ad3930059b3a5790dc5748e58987cc0` |
| `08-rerun-0022.log` | `10888de1f66925dfd08ff410d45d8934e02b4ed586673b34b02c8606898c1676` |
| `09-invariants.out` | `2cfc4adbfcc0d8a15a69476f6d51ec50c723b3e7c61b33fe3fa1ebae6cc4fce1` |
| `10-post-fk-to-employees.txt` | `a1022523ceca9ec1e41578d20800b9297038a1fbbc680841f85968376075acfc` |
| `11-control-fk-regression.out` | `96976f07a8b1f856caba8466df90bac0787b62de67bf1b3c08d09d785da7e1a5` |

### 7.2 What `scripts/verify-employee-deletion-control-fks.sql` proves

Guard: refuses to run unless `current_database()` matches
`^hris_(control_fk|force_delete_rehearsal)_[0-9TZ]+$` (never production).

- **Catalog:** `SET NULL` for released/terminal history, `RESTRICT` for
  approvals, exactly 2 live-control CHECKs.
- **Scenario 1:** released hold + terminal request detach with identity
  snapshots.
- **Scenario 2:** active hold blocks the employee `DELETE`; after release the
  same delete is allowed.
- **Scenario 3:** pending request blocks; a rejected request detaches.
- **Scenario 4:** approved request blocks.
- Result row: `CONTROL_FK_REGRESSION_PASS`.

### 7.3 Prior isolated evidence (carried forward)

| Run | Database | Result | Evidence SHA-256 |
| --- | --- | --- | --- |
| Control-FK apply/rerun (09:41–09:48 UTC) | `hris_control_fk_20261021T024129Z` | all exit 0 | `control-fk-apply-0021.log` `5945e055…`, `control-fk-apply-0022.log` `abc1868c…`, `control-fk-rerun-0021.log` `0d7f966d…`, `control-fk-rerun-0022.log` `10888de1…`, `control-fk-regression.out` `e84e0255…` |
| Destructive rehearsal (09:43 UTC) | `hris_force_delete_rehearsal_20261021T024301Z` | `HARNESS_RESULT=PASS` (316 ms) | `rehearsal-current-v2.out` `4be8a3aa…` |
| Payroll-scope rehearsal (10:00 UTC) | `hris_force_delete_rehearsal_20261021T040023Z` | `HARNESS_RESULT=PASS` (377 ms); `payroll rows deleted = 0` | `05-harness.out` `e7cc226e…`, `07-payroll-rows-deleted.txt` `cf4cb738…` |

Combined index of the 2026-10-21 evidence set:
`/tmp/opencode/evidence-combined-20261021.sha256`
(SHA-256 of the index: `a0660b249aeaae9429c50ef6931ae17aea548b1d55d7898ae88f274c3199f6ab`).

---

## 8. Questions the DBA must answer for this revision

1. Do you accept the semantics change from FK `RESTRICT` (`23503`) to
   `CHECK` (`23514`) for the active-hold / pending-request block (§3.2.1)?
2. Do you accept nullable `employee_id` on the two control tables as the price
   of retaining released/terminal history (§3.2.2)?
3. Do you accept that approvals stay `RESTRICT` and are lost if the three
   tables are dropped on rollback (§6.1)?
4. Do you accept the fail-closed behaviour for unknown request statuses
   (§3.2.4)?
5. Do you confirm the checksum `585dd2d7…c452` against your own records, and
   record the `A6`/`B-14` re-verification?
6. What is the production and staging ledger + catalog state for `0019`–`0022`
   (`docs/employee-permanent-delete-dba-evidence-request.md` items 1–6)?
7. Which restore point (backup label + SHA-256) will be taken before any apply?

---

## 9. DBA decision record — **NOT SIGNED (BLOCKED)**

No signature, timestamp, change-record ID or attestation exists for this
revision. Rows are intentionally left blank; **they must not be filled in by
anyone other than the named owner.**

| # | Decision | Owner | Name / signature | UTC | Evidence ref |
| --- | --- | --- | --- | --- | --- |
| 1 | Checksum `585dd2d7…c452` re-verified against independent records (`A6`, `B-14`) | DBA | *(blank — **BLOCKED**)* | *(blank)* | |
| 2 | SQL review of the revised `0021` accepted (`B1`) | DBA | *(blank — **BLOCKED**)* | *(blank)* | |
| 3 | §3.2 behavioural consequences accepted (notably `23514` mapping) | DBA + Security | *(blank — **BLOCKED**)* | *(blank)* | |
| 4 | §6 rollback limitations accepted; restore point defined | DBA | *(blank — **BLOCKED**)* | *(blank)* | |
| 5 | §5.1 FK invariant set accepted (0 `CASCADE`, 15 `SET NULL`, 11 `RESTRICT`) | DBA | *(blank — **BLOCKED**)* | *(blank)* | |
| 6 | Authorization to apply on staging under the approved change record (`A1`) | DBA | *(blank — **BLOCKED**)* | *(blank)* | |
| 7 | Authorization to apply on production (`B1`) | DBA | *(blank — **BLOCKED**)* | *(blank)* | |

**Status of this package: READY FOR DBA REVIEW — BLOCKED pending rows 1–7 and
the Part A / Part B approvals tracked in
`docs/employee-deletion-approval-matrix.md`.**
