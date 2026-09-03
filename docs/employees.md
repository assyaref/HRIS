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
No new permission rows are needed.

| Role | Employees capability |
| --- | --- |
| SUPERADMIN | all (bypass) |
| ADMIN | view/create/update + deactivate (`employees.delete`) |
| HR | view/create/update |
| MANAGEMENT / FINANCE / SUPERVISOR | view |
| EMPLOYEE | none via `employees.*` (self-service profile arrives with its own module) |

The seed matrix in `scripts/seed-rbac.mts` was updated so HR no longer receives
`employees.delete`. **Re-run `npm run db:seed:rbac`** against an existing
database to apply the new matrix.

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

**Deactivation instead of physical delete:**
No physical delete exists in Phase 5. Removing someone from the active roster
is a status change to `inactive`, which is the `employees.delete` capability.
HRIS person records are retained because later modules (attendance, leave,
payroll) reference employees. Employee numbers stay unique within the org
regardless of status.

## 8. Audit events

Written through `lib/auth/audit.ts` (append-only, best-effort after commit):

- `employee.created`
- `employee.updated` (metadata: employee number + changed field names)
- `employee.status_changed` (metadata: employee number + `from`/`to`)

PII is minimized in audit metadata (field names, never full values); passwords,
session tokens and hashes are never logged.

## 9. User-account linkage

`employees.user_id → users` is used in Phase 5 as an optional, org-safe link.
HR/Admin can link an employee to an existing user account in the same org or
unlink it. No credentials are created here — account provisioning belongs to a
future user-management phase. A user can be linked to at most one employee per
organization (enforced in the module).

## 10. Known limitations / deferred

- Project assignment: the schema has no `employee → project` relation; left
  out and documented. Requires a junction table in a later phase.
- Position/department/manager/job title: not present; deferred with the
  module that owns organizational structure.
- Physical deletion intentionally not implemented (see §7).
- HR deactivation matrix change requires re-running the RBAC seed.
- Self-service profile ("my employee record") belongs to a later profile
  module (`profile.view`), not `employees.view`.

## 11. Database validation status

No reachable PostgreSQL instance was available during Phase 5 (no `.env` /
`DATABASE_URL`), so no migration was run and live CRUD was not executed.
`npm run lint`, `npx tsc --noEmit` and `npm run build` pass. Run the manual
validation checklist (README / Phase 5 report) once PostgreSQL is available.

