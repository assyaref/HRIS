# Super Administrator Permanent Employee Deletion — Policy & Audit

Status: **PROPOSED — control plane implemented, destructive execution DISABLED.
Live path revised (2026-10-13): Super Administrator application-level override
implemented; completion still gated by the database and the §4 sign-off.
Revision 2026-10-21: 0021/0022 control-plane integration designed and rehearsed
on an isolated database; neither migration is applied to production and no
approval has been recorded.**

This document is the Tahap 1–5 deliverable for the Super Administrator Permanent
Employee Deletion policy. The control plane (legal hold, retention tiers,
dual-control approval) is additive and its executor is hard-disabled until the
retention policy in §4 is signed off.

- Feature code: `features/employees/permanent-delete-policy.ts` (existing),
  `features/employees/deletion-control-policy.ts` (new),
  `features/employees/deletion-control.actions.ts` (new)
- Schema: `db/schema/employee_deletion_controls.ts` (new)
- Migration: `db/migrations/0021_employee_deletion_controls.sql` (new, **NOT applied**)
- Audit: `lib/auth/audit.ts`
- RBAC: `lib/auth/permissions.ts` (`SYSTEM_ONLY_PERMISSION_CODES`)
- Lineage reconciliation plan & staging procedure:
  `docs/employee-deletion-0021-staging-runbook.md`

---

## 1. Audit (Tahap 1)

### 1.1 What already exists

| Concern | Location | State |
| --- | --- | --- |
| Permanent delete action | `features/employees/actions.ts` → `permanentlyDeleteEmployeeAction` | Implemented |
| Dependency pre-flight | `features/employees/actions.ts` → `checkEmployeeDeletionDependenciesAction` | Implemented |
| Policy module | `features/employees/permanent-delete-policy.ts` | Implemented |
| Dependency scan / delete plan | `features/employees/queries.ts` (`EMPLOYEE_DELETE_DEPENDENCY_SOURCES`, `EMPLOYEE_DELETABLE_DELETE_PLAN`) | Implemented |
| UI | `features/employees/delete-employee-dialog.tsx` | Implemented |
| FK hardening | `db/migrations/0017_employee_delete_safety_reconciliation.sql` | Applied to production |
| RBAC | `employees.permanent_delete` + system-level `SUPERADMIN` (`canPermanentlyDeleteEmployees`) | Implemented |
| Audit | `employee.permanently_deleted` with `SUCCESS`/`DENIED`/`FAILED` | Implemented |
| Tests | `tests/employees/employee-permanent-delete.test.ts` | Implemented |

### 1.2 Data categories and foreign keys

Baseline FK hardening is migration `0017` (`ON DELETE RESTRICT` for
employee-scoped history; two self-referencing `manager_id` FKs are `SET NULL`;
`face_enrollment_templates` carries a CASCADE to its own enrollment, so the
delete plan deletes the template row explicitly first).

Migration `0022_employee_retention_detach.sql` (unapplied, pre-release; revised
2026-10-21 for the owner-approved payroll-deletion scope) revises the **six
time/employment-history tables** to nullable `employee_id` +
`ON DELETE SET NULL`, with employee-number/name snapshots, so retained history
survives without a live reference. The **five payroll/payslip tables are
DELETED with the employee** (owner-approved scope) and keep
`employee_id NOT NULL` + `ON DELETE RESTRICT` as the deletion backstop.
Migration `0021` gives the control-plane
tables the same treatment for **terminal history only**: released legal holds
and rejected/cancelled/executed requests detach; active holds and
pending/approved requests are still enforced by database CHECK constraints.
`employee_deletion_approvals.request_id` remains `RESTRICT`.

| Category | Tables (source of truth: `queries.ts`) | Classification | Retention |
| --- | --- | --- | --- |
| Attendance | `attendance_records`, `attendance_events` | PROTECTED | time record |
| Leave | `leave_balances`, `leave_requests` | PROTECTED | time record |
| Permission | `permission_requests` | PROTECTED | time record |
| Payroll | `employee_payroll_components`, `payroll_items` | **DELETABLE** (owner-approved scope, 2026-10-21) | deleted with the employee |
| Payslip | `payslips`, `payslip_documents`, `payslip_document_versions` | **DELETABLE** (owner-approved scope, 2026-10-21) | deleted with the employee, children first |
| Employment history | `employee_employment_history` | PROTECTED | legal timeline |
| Documents | `employee_documents` | DELETABLE | person-owned |
| Face ID | `employee_face_enrollments`, `face_enrollment_templates` | DELETABLE | biometric, consent-bound |
| Projects | `employee_project_assignments` | DELETABLE | assignment |
| Other | addresses, insurances, bank accounts, dependents, educations, custom field values, announcement recipients | DELETABLE | person-owned |

The database — not a Super Administrator — is the final authority. On the
current production schema a remaining `RESTRICT` row makes the `DELETE` fail
and the transaction roll back. After `0022`, retained rows detach with
snapshots instead; their rows are never deleted. An active legal hold or a
pending/approved deletion request still blocks the `DELETE` through 0021's
CHECK constraints.

### 1.3 Gaps found during the audit

1. **Legal-hold model (resolved in unapplied 0021).** Baseline had no
   legal-hold record. Migration/code now model an active hold and block the
   live delete path; released holds detach as history. The migration is
   **not applied** and the executor remains disabled. `docs/face-verification.md`
   still says retention is "TO BE DEFINED BY COMPANY POLICY".
2. **No retention-tier with special approval.** Today a protected record is an
   absolute block and a deletable record is removed with no second signature.
   There is no "retention-eligible but requires approval" middle tier.
3. **No operator-supplied reason on the destructive path.** `reason` in the
   audit metadata is a machine code (e.g. `PERMISSION_DENIED`), not the
   operator's justification.
4. **No dual control.** A single Super Administrator can permanently delete.
   Self-approval is not a concept because there is no approval step.
5. **Tests** do not cover legal hold, dual control, self-approval or reason.

### 1.4 Deletion dependencies / referential integrity notes

- `audit_logs.entity_id` has no FK: the permanent-delete trail survives the
  employee row (by design).
- `employees.user_id` is `SET NULL`: the login account is not a dependency.
- Direct reports survive with a nulled `manager_id` (self `SET NULL`), and are
  deliberately excluded from the "will be deleted" count.
- Private document files live outside the transaction and are removed **after**
  commit; the filesystem is not atomic with the DB.

---

## 2. Access policy (Tahap 2)

Access is granted **only** to the system-level Super Administrator, evaluated
server-side from the database-backed RBAC of the session. Role and
`organizationId` are **never** read from the browser. A Super Administrator may
act on the employee's **owning** organization (read from the row), not the
session organization; an inconsistent/forged organization context is refused.

The new control plane classifies every deletion attempt into exactly one tier:

| Tier | Condition | Approval | Execution |
| --- | --- | --- | --- |
| **1 — direct** | No protected historical records, no legal hold | Single Super Administrator | Existing `permanentlyDeleteEmployeeAction` (unchanged) |
| **2 — special approval** | Only protected categories that Legal/HR have marked **retention-eligible** | Dual control: two *distinct* Super Administrators, requester cannot approve their own request | **DISABLED** — executor refuses until sign-off |
| **3 — retained** | Active legal hold, **or** any non-retention-eligible protected record | None possible | Absolute refusal |

`RETENTION_ELIGIBLE_CATEGORIES` is **empty** by default. Until §4 is signed off,
every protected category resolves to tier 3 and no deletion of historical
records can be requested or performed. This is deliberate and tested.

### 2.1 Approval matrix

| Action | Who | Notes |
| --- | --- | --- |
| Place legal hold | Super Admin | Requires reason |
| Release legal hold | Super Admin | Requires reason; never automatic |
| Request deletion | Super Admin | Requires reason + typed Employee Number match |
| Approve/reject request | Super Admin (not the requester) | Dual control for tier 2 |
| Execute deletion | — | **Disabled** pending retention sign-off |

---

## 3. Safeguards (Tahap 3)

Implemented in `deletion-control.actions.ts` (all server-side, all additive):

- **Identity & scope**: employee id/owning organization loaded from the
  database; `resolveEmployeePermanentDeleteScope` reused unchanged.
- **Mandatory reason**: `isValidDeletionReason` (non-empty, ≥ 10 characters,
  ≤ 2000) for holds, requests and decisions.
- **Employee Number confirmation**: typed value compared against the stored
  number for deletion requests (same helper as the live action).
- **Dual control**: `evaluateDeletionApproval` requires two *distinct* approvers
  for tier 2.
- **No self-approval**: an approval whose `approverUserId` equals the requester
  is rejected (`SELF_APPROVAL_FORBIDDEN`).
- **Audit**: `employee.legal_hold.placed`, `employee.legal_hold.released`,
  `employee.deletion.requested`, `employee.deletion.approved`,
  `employee.deletion.rejected`, `employee.deletion.execution_blocked` — actor
  identity, organization, reason, decision, timestamp and result.
- **Transactional** writes. The hold release runs in one transaction with
  `SELECT … FOR UPDATE`; the deletion request and the dual-control decision
  each run in exactly one transaction, so a failed statement rolls the whole
  operation back. `employee_deletion_approvals.request_id` stays `RESTRICT`:
  approvals are never deleted or detached.
- **Single active hold**: the partial unique index
  `employee_legal_holds_active_hold_unique (organization_id, employee_id)
  WHERE active` makes a concurrent second placement fail with `23505`, which
  the action reports as `HOLD_EXISTS` and audits as `DENIED`. The database,
  not application code, is the authority.
- **Audit parity with the live action**: every control attempt appends one
  audit row — `SUCCESS`, `DENIED` (with a machine-readable reason:
  `PERMISSION_DENIED`, `REASON_REQUIRED`, `NOT_FOUND`, `HOLD_EXISTS`,
  `CONFIRMATION_MISMATCH`, `LEGAL_HOLD`, `RETENTION_BOUND`,
  `SELF_APPROVAL_FORBIDDEN`, `DUPLICATE_APPROVER`, `NOT_PENDING`,
  `NOT_APPROVED`, `EXECUTION_DISABLED`) or `FAILED` (`UNEXPECTED_ERROR`).
  The actor identity is resolved BEFORE the allow/deny decision, so even a
  non-Super-Admin attempt is auditable.
- **No legal-hold bypass**: `employee_legal_holds_active_requires_employee`
  rejects an `employee_id = NULL` row while `active`, and
  `employee_deletion_requests_active_requires_employee` rejects a detached row
  while status is pending/approved. Both constraints fire on the employee
  `DELETE` (23514) and roll back the live path. They are mapped to
  `LEGAL_HOLD` / `ACTIVE_DELETION_REQUEST` as a race backstop; the live action
  also pre-checks inside the locked deletion transaction.
- **Server-side refusal**: every new action returns `FORBIDDEN` for a
  non-Super-Admin, no matter what a crafted request submits.
- **Executor disabled**: `executeApprovedEmployeeDeletionAction` verifies the
  request is approved, then returns `EXECUTION_DISABLED` and performs **no**
  delete. It contains **zero** `DELETE` statements (asserted by test).

---

## 4. Retention policy sign-off (BLOCKING prerequisite)

The following must be completed and recorded **before** tier 2 is enabled or
migration `0021` is applied as part of a destructive release. Tiers and values
are proposals only — the organisation owns the decision.

### 4.1 Sign-off table

| Area | Owner | Decision required | Recorded approval |
| --- | --- | --- | --- |
| Retention schedule per category | HR / Payroll | Legal minimum retention per category and permissible deletion window | ☐ pending |
| Retention-eligible categories | HR / Payroll + Legal | Which protected categories may be deleted with approval, and after what period | ☐ pending |
| Legal hold procedure | Legal / Compliance | Who may place/release a hold; escalation and evidence | ☐ pending |
| Backup/PITR implications | DBA | Backup retention vs. deletion expectations; restore behaviour | ☐ pending |
| Security controls | Security | Dual-control enforcement, self-approval prevention, audit integrity | ☐ pending |
| Final authorisation | Data Owner / DPO | Approval to enable tier 2 and apply `0021` | ☐ pending |

### 4.2 Proposed baseline retention (needs approval — not enforced in code)

- Attendance / leave / permission: employer time record (proposed ≥ 5 years).
- Payroll / payslip: financial record (proposed ≥ 10 years, jurisdiction).
  **Owner decision 2026-10-21:** the project owner approved including payroll
  history in the permanent-deletion scope
  (`docs/employee-deletion-owner-scope-approval-20261021.md`), which overrides
  this proposal **at the owner level only**; the Legal/DPO/HR-Payroll §4.1
  confirmation of that override remains **pending** and production remains
  untouched.
- Employment history: legal employment timeline (proposed ≥ statute of
  limitations + contract period).
- Legal hold: indefinite until formally released by Legal.

`RETENTION_ELIGIBLE_CATEGORIES` stays empty until the rows above are approved
and a dated config change is reviewed.

---

## 5. Testing (Tahap 4)

`tests/employees/employee-deletion-controls.test.ts` covers:

- Super Administrator vs. non-Super-Admin authorization (server-side only; a
  refused attempt is still audited with the real actor identity).
- Cross-organization scope (owning org from DB, forged context refused, tenant
  roles can never reach the control plane).
- Legal hold → absolute refusal (tier 3).
- Protected history → retained; deletable-only → tier 1.
- Retention-eligible category → tier 2 (using an injected test schedule).
- Incomplete approval → pending; dual distinct approvers → approved.
- Self-approval rejection; duplicate approver rejection; explicit reject.
- Mandatory reason validation.
- Transactional integrity: request/decision/release each run in exactly one
  transaction; release locks the row (`FOR UPDATE`); the executor performs no
  business write.
- Single active hold (partial unique index + `HOLD_EXISTS` fail-closed).
- Audit vocabulary: SUCCESS / DENIED / FAILED with machine-readable reasons.
- Executor disabled: source contains no `DELETE` and returns `EXECUTION_DISABLED`.
- FK integrity: migration `0021` uses `ON DELETE SET NULL` for released holds
  and terminal requests, keeps approvals `RESTRICT`, and is not journaled.
  `scripts/verify-employee-deletion-control-fks.sql` proves all four live
  control scenarios against a disposable database.
- URL/API manipulation: no role/organization read from form data.

Fixtures are synthetic; no production employee data is used.

---

## 6. Proposed changes, risks, migration & deployment (Tahap 5)

### 6.1 Files added

- `docs/employee-permanent-delete-policy.md` (this file)
- `db/schema/employee_deletion_controls.ts`
- `db/migrations/0021_employee_deletion_controls.sql` (not journaled, not applied)
- `features/employees/deletion-control-policy.ts`
- `features/employees/deletion-control.actions.ts`
- `tests/employees/employee-deletion-controls.test.ts`

### 6.2 Files changed

- `db/schema/index.ts` — export the new schema module.
- `lib/auth/permissions.ts` — add `employees.legal_hold`,
  `employees.deletion_approve`; mark them system-only.
- `lib/auth/audit.ts` — add the new audit action codes.
- `docs/employees.md` — pointer to this policy.

### 6.3 Files deliberately NOT changed (at proposal time; see §7 for the 2026-10-13 revision)

- `features/employees/queries.ts` — the existing scan/delete plan is untouched.
- `db/migrations/meta/*` — not updated; the lineage is already broken (see
  below) and must be repaired by a separate, approved reconciliation.
- `features/employees/actions.ts` and
  `features/employees/delete-employee-dialog.tsx` were untouched by the
  original proposal; the 2026-10-13 revision (§7) later changed both to
  implement the Super Administrator application-level override. The control
  plane and its executor remain untouched and disabled.

### 6.4 Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Migration lineage is already inconsistent (files `0019`/`0020` exist but are unjournaled; snapshots stop at `0014`) | High | `0021` is hand-written and **not journaled**, matching the existing out-of-band pattern. Apply only via an approved DBA change after lineage reconciliation. Do not run `drizzle-kit generate`/`migrate` from this worktree. |
| Revised 0021 CHECKs/FKs add live control to the delete path once applied | Medium | Active holds and pending/approved requests block by CHECK (23514) and are mapped to state codes; released/terminal rows detach. Rehearsed on an isolated database. DBA must re-review the new checksum before application. |
| Tier 2 could be enabled prematurely | High | `RETENTION_ELIGIBLE_CATEGORIES` empty; executor asserts a disabled constant; test pins it. |
| Filesystem (documents) deletion is outside the transaction | Low | Pre-existing design; unchanged. |
| Re-running RBAC seed needed for new permission codes | Low | Seed is idempotent; required after deploy. |

### 6.5 Migration requirement

`db/migrations/0021_employee_deletion_controls.sql` creates three additive
tables (`employee_legal_holds`, `employee_deletion_requests`,
`employee_deletion_approvals`). Employee references on holds/requests are
nullable `ON DELETE SET NULL` so terminal history detaches; active rows are
protected by CHECK constraints. `employee_deletion_approvals.request_id`
remains `RESTRICT`. The migration is **not applied**, **not journaled**, and
contains no `DROP`/`ALTER` of existing objects. Apply only after §4 sign-off,
on staging first, with a verified backup. Revised checksum:
`585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452`.

### 6.6 Deployment steps (after sign-off)

1. Record the §4 sign-off.
2. Reconcile the Drizzle lineage (separate approved change) and journal `0021`.
3. Apply `0021` on staging; run the manual retention/dual-control checklist.
   (Detailed preflight/backup/validation/rollback procedure:
   `docs/employee-deletion-0021-staging-runbook.md` §3.)
4. Run `npm run db:seed:rbac` to register the new permission codes.
5. Review and merge the executor-enable patch (a distinct PR) with Legal/HR.
6. Apply to production during the approved window; verify audit rows.

---

## 7. Revision 2026-10-13 — Super Administrator override of the protected-record blocker (live path)

### 7.1 What changed

The Super Administrator's **application-level eligibility decision**
(`evaluatePermanentEmployeeDeletion`, via the new `superAdminOverride` input) no
longer fails when protected historical records are detected. The flag is set
ONLY by `permanentlyDeleteEmployeeAction` from its server-side RBAC gate
(`canPermanentlyDeleteEmployees`: the system-level SUPERADMIN role AND the
system-only `employees.permanent_delete` code) — never from the browser.
Without the flag the protected-record refusal is unchanged (fail closed).

The dialog no longer disables the button nor shows
"Delete blocked by protected records": the confirm button reads
"Permanently Delete Employee" and stays enabled once the Employee Number
confirmation, the irreversibility acknowledgement and an ARRIVED pre-flight
report are present. The dialog summarizes the records that will be deleted and
those that will be retained.

### 7.2 What did NOT change

- **Authorization**: permanent deletion remains SUPERADMIN-only, verified
  server-side on every request; every other role receives `FORBIDDEN` (403)
  and is audited.
- **Organization scope**: the owning organization is still read from the
  database; a forged/inconsistent organization context is still refused.
- **Confirmation layers**: the typed Employee Number and the explicit
  irreversibility acknowledgement remain mandatory and server-side.
- **Transaction**: one transaction; any failure rolls everything back.
- **Protected records are never deleted, cascaded or detached** by this flow.
- **The control plane (§2/§3) and its executor remain unchanged and
  DISABLED.**

### 7.3 Why the attempt still cannot complete on the current production schema

Production still has migration `0017` FK hardening with `NOT NULL` employee
references on the retained tables. Removing the application-level blocker does
not remove the database restriction: while a retained record references the
employee, PostgreSQL raises `23503` on the `DELETE` of the employee row, the
whole transaction rolls back (deletable-record removals included), and the
server returns the retained-completion error:

> Permanent deletion cannot be completed because protected historical records must be retained.
> … Retained records: … Nothing was deleted. …

The attempt is audited as `DENIED` with reason `PROTECTED_RECORDS_RETAINED`
and the per-category `retainedRecords` summary. The database — not a role and
not this policy — keeps the final word on referential integrity.

### 7.3.1 After migration `0022` (designed, rehearsed, NOT applied)

`0022_employee_retention_detach.sql` (revised 2026-10-21) changes the **six
retained** tables to nullable `employee_id` + `ON DELETE SET NULL` with
employee-number/name snapshots; the delete plan therefore **detaches** those
rows. The **five payroll/payslip tables are NOT detached**: they keep
`employee_id NOT NULL` + `ON DELETE RESTRICT` and the delete plan removes them
explicitly, children first (payslip versions → documents → payslips, then
payroll items — cascading `payroll_item_components` — then component
assignments), before the employee row. Payroll *history deletion* is
**owner-approved** (2026-10-21,
`docs/employee-deletion-owner-scope-approval-20261021.md`), implemented and
rehearsed in isolation; the multi-role §4 Legal/DPO/HR sign-off remains
pending and production is untouched.
`employee_deletion_approvals.request_id` remains `RESTRICT`.

### 7.4 Per-table disposition under the revised policy

| Category | Tables | Disposition |
| --- | --- | --- |
| Documents | `employee_documents` | **Deleted** with the employee (existing plan) |
| Face ID | `face_enrollment_templates`, `employee_face_enrollments` | **Deleted** (child first) |
| Projects | `employee_project_assignments` | **Deleted** |
| Other related records | `employee_addresses`, `employee_insurances`, `employee_bank_accounts`, `employee_dependents`, `employee_educations`, `employee_custom_field_values`, `announcement_recipients` | **Deleted** |
| Attendance | `attendance_records`, `attendance_events` | **Retained**: row preserved, `employee_id` detached, identity snapshotted |
| Leave | `leave_balances`, `leave_requests` | **Retained**: detach + snapshot |
| Permission | `permission_requests` | **Retained**: detach + snapshot |
| Payroll | `employee_payroll_components`, `payroll_items` (+ cascaded `payroll_item_components`) | **Deleted** with the employee (owner-approved scope, 2026-10-21) |
| Payslip | `payslip_document_versions`, `payslip_documents`, `payslips` | **Deleted** with the employee, children first; org-level period/run/component retained |
| Employment history | `employee_employment_history` | **Retained**: detach + snapshot |
| Direct reports | `employees.manager_id` self-FK | **Retained**; manager link cleared (`SET NULL`) |
| Linked login account | `employees.user_id → users` | **Retained** (link removed with the row) |
| Audit trail | `audit_logs` | **Retained** (no FK; survives the employee) |
| Legal holds / requests | `employee_legal_holds`, `employee_deletion_requests` | **Active/pending/approved block**; released/terminal history **detached** with snapshots |
| Approvals | `employee_deletion_approvals` | **Retained** (`RESTRICT`); never deleted or detached |

### 7.5 Remaining prerequisites (blocking, deliberately not implemented here)

Completing a permanent deletion while protected records exist requires ONE of:

1. **Retention-policy approval (§4 sign-off)** that marks the affected
   categories retention-eligible, plus the dual-control approval flow, plus a
   reviewed executor-enable change that actually deletes the retained records.
   The §4 sign-off table is still pending; `RETENTION_ELIGIBLE_CATEGORIES`
   stays empty and `DELETION_EXECUTION_ENABLED` stays `false`.
2. **An approved database change** to detach the retained records. `0022` now
   implements the nullable-`employee_id` + identity-snapshot design and `0021`
   integrates the live control plane. Both are **unapplied, unjournaled and
   unapproved**; the DBA must re-review the revised 0021 checksum and the
   migration lineage must not be modified speculatively (see
   `docs/employee-deletion-0021-staging-runbook.md`).

Until one of these is satisfied, the Super Administrator override lets the
attempt proceed to the database, which refuses it safely: nothing is deleted,
everything is audited. Deactivate/archive remains the correct non-destructive
alternative.

### 7.6 Revision 2026-10-19 — mandatory operator-supplied reason on the live path

The audit gap from §1.3 item 3 is closed for the live destructive path: the
dialog now requires a deletion **reason** (10–2000 characters, validated by the
shared `isValidDeletionReason` used by the control plane), the server action
re-validates it on every request and refuses a missing or too-short reason with
`REASON_REQUIRED` before the transaction starts (audited `DENIED`, nothing
written), and the validated reason is recorded on every subsequent
`employee.permanently_deleted` audit row (metadata `deletionReason`) together
with the actor identity. Authorization, organization scope, the confirmation
layers, the transaction and the fail-closed database behavior of §7.2–§7.3 are
unchanged; the control plane (§2/§3) remains disabled
(`DELETION_EXECUTION_ENABLED = false`, `RETENTION_ELIGIBLE_CATEGORIES = []`).

### 7.7 Revision 2026-10-21 — control-plane integration and payroll retention reconciliation

- 0021 was rewritten before first application to make released holds and
  terminal requests detachable (`ON DELETE SET NULL`) while active control stays
  mandatory via CHECK constraints. This changes the migration checksum:
  `585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452`.
- The live action now pre-checks control state after locking the employee row
  and inside the deletion transaction, refuses with `LEGAL_HOLD` /
  `ACTIVE_DELETION_REQUEST`, and maps constraint `23514` violations by name as
  the race backstop. The preflight report and dialog expose the same state.
- **2026-10-21 (later session):** the project owner approved including payroll
  history in the deletion scope
  (`docs/employee-deletion-owner-scope-approval-20261021.md` — owner approval
  only). `0022` was rewritten accordingly (checksum `3750812f…0b5`): the six
  time/employment-history tables stay retained via detach + snapshots, while
  the five payroll/payslip tables keep `NOT NULL` + `RESTRICT` and are deleted
  explicitly, children first. The isolated rehearsal proves A's full payroll
  chain deleted, B/C intact, org-level payroll records intact, and full
  rollback of C's payroll chain on injected failure
  (`docs/employee-deletion-payroll-scope-decision-record.md` §7).
- A disposable-database regression script
  (`scripts/verify-employee-deletion-control-fks.sql`) covers active-hold block,
  pending/approved-request block, and released/terminal detach with snapshots.
- This revision is implementation evidence only. It does **not** constitute
  DBA, Legal, DPO, HR or Data Owner approval; all §4 entries remain pending and
  production has not applied 0021/0022.
