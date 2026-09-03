# RBAC — Phase 4

This document records the role-based access control design, role/permission
catalog, authorization flow, organization isolation model, protected
SUPERADMIN rules and the known database-validation limitation. It is a
companion to `docs/architecture.md` (PHASE 4) and `docs/auth.md` (Phase 3).

## 1. Architecture overview

Authorization is **server-side only** and uses PostgreSQL as the source of
truth. The existing Phase 2 schema is used as-is — no RBAC tables were added
and no migration was required.

| Concern | Location |
| --- | --- |
| Permission catalog (typed, single source) | `lib/auth/permissions.ts` |
| Role catalog + reserved codes | `lib/auth/roles.ts` |
| RBAC evaluation + guards (`hasRole`, `requirePermission`, …) | `lib/auth/rbac.ts` |
| Audit writer (append-only) | `lib/auth/audit.ts` |
| RBAC admin queries | `features/rbac/queries.ts` |
| RBAC admin server actions | `features/rbac/actions.ts` |
| RBAC admin UI | `app/(dashboard)/settings/roles`, `app/(dashboard)/settings/permissions` |
| 403 page | `app/forbidden.tsx` |
| Idempotent seed | `scripts/seed-rbac.mts` (`npm run db:seed:rbac`) |

Authentication ("who is this user?") and authorization ("what may this user
do?") stay conceptually separate. The Phase 3 flow is untouched:
`getCurrentUser()`, `requireUser()`, `authenticateUser()`, sessions and login
behaviour are unchanged.

### Authorization flow

1. A Server Component / Server Action authenticates: `const user = await requireUser()`.
2. It authorizes: `await requirePermission(user.id, PERMISSIONS.USERS_VIEW)`.
3. `requirePermission` resolves the user's roles + permissions from
   `user_roles → roles → role_permissions → permissions` and renders a real
   HTTP 403 (`app/forbidden.tsx`) when the capability is missing.

Nothing role/permission related is ever trusted from cookies, client state,
`localStorage` or request bodies.

## 2. Role catalog

Seven system roles are defined in `lib/auth/roles.ts`:

| Code | Name | Level |
| --- | --- | --- |
| `SUPERADMIN` | Super Administrator | system |
| `ADMIN` | Organization Administrator | organization |
| `MANAGEMENT` | Management | organization |
| `HR` | Human Resources | organization |
| `FINANCE` | Finance | organization |
| `SUPERVISOR` | Supervisor | organization |
| `EMPLOYEE` | Employee | organization |

No other business roles are seeded. Organizations may create additional
*custom* roles with non-reserved codes.

## 3. Permission catalog

Permissions use `resource.action` naming (`users.view`, `attendance.approve`,
…) and are defined **once** in `lib/auth/permissions.ts`. The `permissions`
table stores `code`, `module` and `description`; `resource`/`action` are
derived from the code for display.

Modules: `dashboard`, `profile`, `users`, `roles`, `permissions`, `employees`,
`attendance`, `leave`, `permission`, `payroll`, `payslip`, `projects`,
`reports`, `settings`, `audit`.

> The catalog is **RBAC capability metadata only**. The Employee, Attendance,
> Leave, Payroll, Payslip and other modules land in later phases and will check
> these same identifiers.

## 4. Role → permission matrix (seed default)

Granted capabilities are the seed matrix in `scripts/seed-rbac.mts`:

| Capability | SUPERADMIN | ADMIN | MANAGEMENT | HR | FINANCE | SUPERVISOR | EMPLOYEE |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `dashboard.view` | ● | ● | ● | ● | ● | ● | ● |
| `profile.view`, `profile.update` | ● | ● | ● | ● | ● | ● | ● |
| `users.*` | ● | ● | – | – | – | – | – |
| `roles.*` | ● | ● | – | – | – | – | – |
| `permissions.view` | ● | ● | – | – | – | – | – |
| `permissions.manage` | ● | – | – | – | – | – | – |
| `employees.view` | ● | ● | ● | ● | ● | ● | – |
| `employees.create`, `employees.update` | ● | ● | – | ● | – | – | – |
| `employees.delete` (deactivation) | ● | ● | – | – | – | – | – |
| `attendance.view` | ● | ● | ● | ● | – | ● | ● |
| `attendance.manage` | ● | ● | ● | ● | – | – | – |
| `attendance.check_in` | ● | ● | – | – | – | – | ● |
| `attendance.check_out` | ● | ● | – | – | – | – | ● |
| `attendance.approve` | ● | – | – | – | – | ● | – |
| `leave.view` | ● | ● | ● | ● | – | ● | ● |
| `leave.create` | ● | ● | – | ● | – | – | ● |
| `leave.manage` | ● | ● | ● | ● | – | – | – |
| `leave.approve` | ● | ● | ● | ● | – | ● | – |
| `permission.view` | ● | ● | ● | ● | – | ● | ● |
| `permission.create` | ● | ● | – | – | – | – | ● |
| `permission.manage` | ● | ● | ● | ● | – | – | – |
| `permission.approve` | ● | ● | ● | ● | – | ● | – |
| `payroll.view`, `payroll.manage` | ● | – | – | – | ● | – | – |
| `payslip.view` | ● | – | – | – | ● | – | ● |
| `projects.view` | ● | ● | ● | – | – | ● | – |
| `projects.manage` | ● | ● | – | – | – | – | – |
| `reports.view` | ● | ● | ● | ● | ● | ● | – |
| `audit.view` | ● | ● | ● | – | – | – | – |
| `settings.view`, `settings.manage` | ● | ● | – | – | – | – | – |

`SUPERADMIN` holds every catalog permission (both as a seeded grant and as an
evaluation-time bypass in `lib/auth/rbac.ts`). Row-level scoping (supervisor →
team, employee → self, finance → payroll) is enforced by the future modules'
data-access layer, not by this capability layer.

> **Phase 5 semantics:** `employees.delete` maps to *deactivation* (employment
> status → `inactive`) rather than physical deletion, because HRIS person
> records are retained and later modules reference them. HR edits employee
> profiles (`employees.create`/`employees.update`) but does not deactivate;
> that is an ADMIN capability.

## 5. Organization isolation

The reserved **SYSTEM** organization (`code = "SYSTEM"`, seeded by
`db:seed:rbac`) hosts system-level roles. Every real organization hosts the six
organization-level catalog roles.

- `roles.code` is unique per organization (DB constraint).
- Evaluation is **grant-based and org-scoped**: a user's effective roles are
  the roles granted to them in `user_roles` that belong to their *own*
  organization (`users.organization_id`). A role with the same code in another
  organization never confers anything.
- Role administration (list/detail/create/update/delete) is scoped to the
  actor's organization in both the queries and the server actions.
- A user with no organization has no roles and no permissions (deny by
  default).

## 6. Protected SUPERADMIN rules

SUPERADMIN is structurally protected:

- It is seeded **only** under the SYSTEM organization. Tenant organization
  role lists/scopes never contain it, so a tenant ADMIN cannot view, edit,
  delete or assign it.
- `createRoleAction` rejects reserved catalog codes (including `SUPERADMIN`),
  so a SUPERADMIN role cannot be forged in any organization.
- `updateRoleAction` allows SUPERADMIN changes only for SUPERADMIN holders and
  forbids removing all SUPERADMIN permissions.
- `deleteRoleAction` forbids deleting SUPERADMIN and all `is_system` roles.
- Roles with assigned users cannot be deleted.
- The role admin UI renders SUPERADMIN editing only for SUPERADMIN holders and
  never exposes the danger zone for system roles.


## 7. Audit logging

RBAC administrative actions are appended to `audit_logs` via
`lib/auth/audit.ts` (INSERT-only; no update/delete path). Actions:

- `rbac.role.created`
- `rbac.role.updated`
- `rbac.role.permissions.updated`
- `rbac.role.deleted`

Metadata captures safe values only (role code/name/permission codes, IP,
user-agent). Passwords, session tokens and hashes are never logged.

## 8. Seed

`npm run db:seed:rbac` (or `node scripts/seed-rbac.mts`) is deterministic and
idempotent:

- upserts the permission catalog (keyed by `code`);
- ensures the reserved SYSTEM organization;
- seeds SUPERADMIN into SYSTEM and ADMIN/MANAGEMENT/HR/FINANCE/SUPERVISOR/
  EMPLOYEE into every organization;
- replaces each seeded role's grants to match the matrix (the seed is
  authoritative for catalog roles).

It creates **no users and no credentials**. For local validation, bootstrap a
user manually afterwards, e.g.:

```bash
# 1) create a user account in the SYSTEM org (dev-only helper)
node scripts/create-auth-user.mjs superadmin@acme.test "change-me" SYSTEM

# 2) assign the SUPERADMIN role (uuid from the roles table)
psql "$DATABASE_URL" -c "INSERT INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u, roles r WHERE u.email = 'superadmin@acme.test' AND r.code = 'SUPERADMIN';"
```

Requires Node with native TypeScript support (≥ 23.6; the project is developed
against Node 24). On Node 22.6+ run with `--experimental-strip-types`.

## 9. Security decisions

1. All authorization is server-side; PostgreSQL is the source of truth.
2. Roles/permissions are never derived from client state or cookies.
3. No password hashes or session tokens are exposed to components.
4. Org scoping is enforced in queries and actions — cross-organization role
   access returns 403, never a data leak.
5. All queries are Drizzle-parameterized.
6. SUPERADMIN protection is structural (SYSTEM org) plus enforced in every
   write action.
7. Permission strings live in one typed catalog; role codes in one catalog.
8. `forbidden()` / `app/forbidden.tsx` return a genuine 403 (Next.js
   `experimental.authInterrupts`), without leaking implementation details.
9. The role editor renders checkboxes from the server-provided catalog; the
   server action re-validates every submitted code against that same catalog.
10. Role deletion is blocked while user assignments exist (no accidental
    cascade).

## 10. Known DB validation limitation

No reachable PostgreSQL instance was available in the development environment
during Phase 4 (no `.env` / `DATABASE_URL`). Consequently:

- `npm run lint` and `npm run build` were executed and passed.
- `npm run db:migrate`, `npm run db:seed:rbac` and manual request-level RBAC
  validation could **not** be executed.
- Seed idempotency and permission checks are implemented and code-reviewed but
  were **not** verified against a live database.

Run the seed and the manual validation checklist (README / Phase 4 report)
once a PostgreSQL instance and `DATABASE_URL` are available.

