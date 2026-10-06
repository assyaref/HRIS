# Employee Management — Phase 5

This document records the first real HRIS business module: organization-scoped
employee management. It is a companion to `docs/architecture.md`, `docs/auth.md`
and `docs/rbac.md`.

## 1. Architecture overview

Employee management reuses the existing authentication + RBAC infrastructure.
Authorization is server-only; every query/action is scoped to the authenticated
user's organization.

| Concern | Location |
| --- | --- |
| Status constants (`active`/`inactive`) | `features/employees/constants.ts` |
| Zod validation | `features/employees/schemas.ts` |
| Org-scoped data access | `features/employees/queries.ts` |
| Server actions (create/update) | `features/employees/actions.ts` |
| Create dialog | `features/employees/employee-create-dialog.tsx` |
| Detail editor | `features/employees/employee-editor.tsx` |
| List table / filters / status badge | `features/employees/employee-table.tsx` · `employee-filters.tsx` · `employee-status-badge.tsx` |
| Routes | `app/(dashboard)/employees` · `app/(dashboard)/employees/[employeeId]` |
| Audit events | `lib/auth/audit.ts` (`employee.*`) |

## 2. Routes

- `/employees` — org-scoped directory (search, status filter, pagination).
- `/employees/[employeeId]` — employee profile + edit (when permitted).

Both are inside the authenticated `(dashboard)` group and additionally enforce
`employees.view` server-side. An employee id that does not resolve in the
caller's organization renders `forbidden()` so cross-org existence is not
leaked.

## 3. Permissions & roles

Existing catalog permissions are reused (`lib/auth/permissions.ts`):
`employees.view`, `employees.create`, `employees.update`, `employees.delete`.
One permission was added for the irreversible operation:
`employees.permanent_delete`. **Re-run `npm run db:seed:rbac`** so the catalog row
exists; no migration is required for it.

| Role | Employees capability |
| --- | --- |
| SUPERADMIN | all (bypass), **including permanent delete** |
| ADMIN | view/create/update + deactivate (`employees.delete`) |
| HR | view/create/update |
| MANAGEMENT / FINANCE / SUPERVISOR | view |
| EMPLOYEE | none via `employees.*` (self-service profile arrives with its own module) |

The seed matrix in `scripts/seed-rbac.mts` was updated so HR no longer receives
`employees.delete`. **Re-run `npm run db:seed:rbac`** against an existing
database to apply the new matrix.

`employees.permanent_delete` is system-only: it is listed in
`SYSTEM_ONLY_PERMISSION_CODES`, granted to `SUPERADMIN` through `ALL_PERMISSIONS`,
and refused for every organization-level role by the seed guard, the role editor,
and `updateRoleAction`.

## 4. Organization isolation

- The organization is always `currentUser.organizationId` (from the session).
  The browser never supplies an `organization_id`.
- List: `WHERE employees.organization_id = currentUser.organizationId`.
- Detail/update: `WHERE employee.id = ? AND employee.organization_id = currentUser.organizationId`.
- Unknown or cross-org employee ids → `forbidden()` (no existence leak).
- User-account linking only lists/accepts users belonging to the same
  organization and not already linked to another employee.

## 5. Schema decisions (no migration)

The Phase 2 `employees` table is sufficient for the Phase 5 scope and was **not
modified** — no migration was generated.

Supported fields: employee number, names, email, phone, employment status
(`active | inactive` — the existing schema contract), hire date, user linkage,
timestamps.

Intentionally deferred (documented, not created speculatively): position/job
title, department, manager, employment type, timezone, photo, project
assignment (`employee → project` requires a junction-table schema decision in a
later phase). No salary/bank/national-id/biometric/attendance fields exist.

## 6. Validation

Zod schemas mirror the existing style (`features/auth/login-schema.ts`).
Empty optional strings are normalized before parsing; the server actions
re-validate every submission.

- `employeeNumber` — required, ≤ 32 chars, `[A-Za-z0-9._/-]`.
- `firstName` / `lastName` — required, ≤ 100 chars.
- `email` — optional, validated format, ≤ 254 chars.
- `phone` — optional, ≤ 30 chars (no over-validation).
- `hireDate` — optional `YYYY-MM-DD`.
- `userId` — optional user-account link (must exist in the same organization
  and be unlinked from another employee).
- `employmentStatus` — `active | inactive` (update only).
- List query params validated via `employeeListSearchSchema`.

## 7. Mutation flow

**Create** (`createEmployeeAction`):
authenticate → `employees.create` → resolve org from session → zod validate →
validate user link → insert (status `active`) → audit → redirect to profile.
Duplicate employee numbers are rejected with a friendly message (pre-check +
PostgreSQL `23505` handling).

**Update** (`updateEmployeeAction`):
authenticate → `employees.update` → org-scoped load (else `forbidden`) → zod
validate → if the status is changing to `inactive`, additionally require
`employees.delete` → validate user link → update only allowed fields
(`organization_id` is preserved) → audit → revalidate list + profile.

**Deactivate** (`deleteEmployeeAction`):
Removing someone from the active roster is a status change to `inactive`, which
is the `employees.delete` capability. The active roster is not modified, so
attendance, payroll, leave, audit, master-data, document, custom-value, and
employment history remain intact.

**Permanent delete** (`permanentlyDeleteEmployeeAction`):
A separate, irreversible capability — **not** a second step of deactivation. It
is available for active *and* inactive employees, from both the roster and the
profile page, to Super Administrators only.

Authorization requires **two independent conditions** (`canPermanentlyDeleteEmployees`):
the `employees.permanent_delete` code **and** the system-level `SUPERADMIN` role.
The second condition is the structural guarantee: an organization-level role can
create custom roles and grant them permissions, so capability alone could not be
treated as sufficient. Mirroring `organizations.*`, the code is declared in
`SYSTEM_ONLY_PERMISSION_CODES` (`lib/auth/permissions.ts`), the RBAC seed refuses
to write it into any organization role, the role editor does not offer it for a
tenant role, and `updateRoleAction` rejects a forged grant. Hiding the button is
only a convenience — the action re-checks both conditions.

Flow: authenticate → authorize → resolve org from session → org-scoped load (else
`not found`) → compare the typed employee number with the stored `employee_number`
→ require the server-side acknowledgement → in **one transaction**: lock the row,
re-check the confirmation, scan and classify employee-scoped dependencies, delete
the deletable related records, then `DELETE` the employee row scoped to
`(id, organization_id)` → audit → remove private document storage → revalidate
roster + profile. Direct reports are retained; only their `manager_id` is nulled.

The scan lives in `listEmployeeDeletionDependencies` (`queries.ts`) and is always
filtered by both `employee_id` and `organization_id`; it never uses a
user-supplied `organizationId`. Categories are **classified, not treated
uniformly** (`permanent-delete-policy.ts`):

| Disposition | Categories | Effect |
| --- | --- | --- |
| `protected` | Attendance, Leave, Permission, Payroll, Payslip, Employment history | Retention-bound. A non-zero count **blocks** the deletion with `409`; the rows are never removed, not even by a Super Administrator. |
| `deletable` | Documents, Face ID, Projects, Other related records | Removed explicitly, one statement per table, inside the same transaction. |

An unclassified label fails closed as `protected`, so a newly added category can
never become implicitly deletable by omission. The explicit plan in
`EMPLOYEE_DELETABLE_DELETE_PLAN` is asserted against the policy at module load, so
the two cannot drift apart.

A linked login account is **not** a dependency: `employees.user_id` points at
`users`, so the account survives. Only the self-linked case is refused
(`SELF_LINKED`).

The `DELETE` is a backstop, not the guard: all employee foreign keys are
`RESTRICT` or `SET NULL` (never `CASCADE`), so a dependent record that appears
between the scan and the statement makes PostgreSQL raise `23503`, the
transaction rolls back, and the dependency summary is re-read and reported as
`409`. Nothing is committed unless the whole operation succeeds. The two
self-referencing `SET NULL` foreign keys are the exception that proves the rule:
deleting an employee re-points their direct reports rather than blocking.

Note that `db/schema/*.ts` still declares `onDelete: "cascade"` on some
employee-scoped tables. That is pre-existing drift: the live database was
reconciled by `db/migrations/0017_employee_delete_safety_reconciliation.sql`, and
this feature neither relies on nor reintroduces the declarative value. The
migration is the authoritative production contract.

## 8. Audit events

Written through `lib/auth/audit.ts` (append-only, best-effort after commit):

- `employee.created`
- `employee.updated` (metadata: employee number + changed field names)
- `employee.status_changed` (metadata: employee number + `from`/`to`)
- `employee.permanently_deleted` for a permanent delete (metadata: `operation:
  "EMPLOYEE_PERMANENT_DELETE"`, employee id + number + name, actor id/email/role,
  organization, `result` of `SUCCESS`/`DENIED`/`FAILED`, a machine-readable
  `reason`, and the `deletedRelatedRecords` summary). The employee number and name
  are audit context, not credentials.
- `employee.deleted` for a deactivation (metadata: `operation: "EMPLOYEE_DELETE"`,
  employee id + number + name, `result`, `reason`).

`audit_logs.entity_id` has no foreign key, so the permanent-delete trail outlives
the employee row it describes.

PII is minimized in audit metadata (field names, never full values); passwords,
session tokens and hashes are never logged. The delete audit is written after
the transaction commits and is best-effort, like every other event here: a lost
audit row is logged, never turned into a reported failure for a deletion that
already succeeded.

## 9. User-account linkage

`employees.user_id → users` is used in Phase 5 as an optional, org-safe link.
HR/Admin can link an employee to an existing user account in the same org or
unlink it. No credentials are created here — account provisioning belongs to a
future user-management phase. A user can be linked to at most one employee per
organization (enforced in the module).

## 10. Known limitations / deferred

- Employee → project assignment is reported under the "Projects" dependency
  category (the schema has no junction table, so the count is always 0).
- Position/department/manager/job title: not present; deferred with the
  module that owns organizational structure.
- Permanent deletion is reserved for the system-level `SUPERADMIN` role and
  requires both `employees.permanent_delete` and that role; no tenant role can
  hold or be granted it.
- Permanent deletion is blocked by any **protected** record: attendance, leave,
  permission requests, payroll, payslips, or employment history. These are
  retention-bound and are never removed, not even by a Super Administrator. Only
  the deletable categories (documents, face ID, project assignments, and other
  master data) are removed, explicitly and inside the same transaction. There is
  no cascade and no forced purge (see §7).
- Direct reports are retained: deleting a manager only nulls their
  `manager_id`. The dialog reports that count separately so it is never presented
  as a deletion.
- Private employee document files under
  `/opt/hris-private/employee-documents/<organizationId>/<employeeId>` are
  removed **after** the transaction commits. The database deletion is atomic;
  the filesystem is not, so a storage failure is logged and never reported as a
  failed deletion (or retried into a second delete).
- The permanent-delete flow is a server action, matching the rest of this module;
  there is no separate REST endpoint. A refused call returns a typed state code
  (`FORBIDDEN`, `NOT_FOUND`, `CONFIRMATION_MISMATCH`, `PROTECTED_RECORDS`,
  `DEPENDENCIES`, `SELF_LINKED`, `FAILED`) rather than an HTTP status, because the
  authorization decision is enforced at the action boundary.
- HR deactivation matrix change requires re-running the RBAC seed.
- Self-service profile ("my employee record") belongs to a later profile
  module (`profile.view`), not `employees.view`.

## 11. Database validation status

No reachable PostgreSQL instance was available during Phase 5 (no `.env` /
`DATABASE_URL`), so no migration was run and live CRUD was not executed.
`npm run lint`, `npx tsc --noEmit` and `npm run build` pass. Run the manual
validation checklist (README / Phase 5 report) once PostgreSQL is available.

## 12. Employee Master Data 2.0 migration lineage

A read-only metadata check on 2026-09-25 confirmed that the production schema
contains `users.name`, all nine Employee Master Data 2.0 tables from 0016, and
the 0016 employee columns. The Drizzle ledger contains the hashes for 0000
through `0011_nasty_khan` and for the unjournaled payslip migrations
`0011_payslip_document_versions` through `0014_payslip_birth_date_snapshot`.

The hashes for journaled `0015_user_account_name` and
`0016_employee_master_data` are not present in the ledger, even though their
schema is present. The repository also contains two migrations with the 0011
prefix, omits the payslip 0011–0014 SQL files from `_journal.json`, and has no
0015 or 0016 snapshot. Snapshot `0011_snapshot.json` contains later schema
state than its filename implies.

Do not rename, renumber, rewrite, or retroactively journal these files, and do
not run `db:migrate` against production from this worktree. The safe next step
is a separately approved reconciliation against a database backup or staging
clone. Any eventual repair must use a new forward migration after the lineage
is understood; this remediation made no database or migration changes.

