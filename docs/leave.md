# Leave — Phase 7

Records the leave module: schema, routes, permissions, approval flow, balance
rules, organization isolation, audit, security, limitations and DB validation
status.

## 1. Architecture

Server-side only. Employees submit/cancel their own leave through the
authenticated user's linked employee record; HR/management review requests.
Days are inclusive calendar days computed on the server.

| Concern | Location |
| --- | --- |
| Statuses | `features/leave/constants.ts` |
| Zod | `features/leave/schemas.ts` |
| DAL | `features/leave/queries.ts` |
| Actions | `features/leave/actions.ts` |
| Display | `features/leave/format.ts` |
| Client | `features/leave/leave-create-dialog.tsx`, `leave-request-actions.tsx` |
| Routes | `/leave`, `/leave/balances`, `/leave/[requestId]`, `/leave/management` |
| Tables | `leave_types`, `leave_balances`, `leave_requests`, `leave_request_events` |

## 2. Schema

- `leave_types` — org-scoped categories (unique org+code), optional
  `default_allowance_days`.
- `leave_balances` — per employee/type/year (unique triple): entitlement,
  used, pending, adjustment. Employees cannot edit balances.
- `leave_requests` — org-scoped submissions with `pending | approved |
  rejected | cancelled`, dates, server-computed `total_days`, reviewer fields.
- `leave_request_events` — append-only transition history.

## 3. Routes & permissions

| Route | Access |
| --- | --- |
| `/leave` | `leave.view` (own balances + requests) |
| `/leave/balances` | `leave.view` |
| `/leave/[requestId]` | owner, or `leave.approve`/`leave.manage` reviewer |
| `/leave/management` | `leave.approve`/`leave.manage` |

Role semantics: SUPERADMIN all; ADMIN full; HR manage/approve/create/view;
MANAGEMENT view/manage/approve; SUPERVISOR view/approve; EMPLOYEE own
view/create.

## 4. Approval & balance rules

- Submit: validate type org + active, no overlapping pending/approved request,
  balance availability. If no balance row exists, a first balance is created
  from `default_allowance_days`; otherwise the request is rejected.
- Submit adds `pending`; approval moves `pending → used`; rejection/cancellation
  releases `pending`. Negative balances are rejected.
- Review requires `leave.approve`/`leave.manage`; a requester can never review
  their own request.
- Valid transitions: `pending → approved|rejected|cancelled`. Anything else is
  rejected.
- Concurrency: decision/cancel run in a transaction with `SELECT … FOR UPDATE`
  on the request row and balance row; double approval cannot commit.

## 5. Organization isolation & audit

Every query/action uses `currentUser.organizationId`. Cross-org request ids
return `forbidden()` (existence is never revealed). All transitions append a
`leave_request_events` row and a best-effort `audit_logs` entry
(`leave.created|cancelled|approved|rejected`) with employee number + safe
metadata only.

## 6. Security review

Auth + RBAC server-side; employee/org never accepted from the browser; zod at
the action boundary; parameterized Drizzle queries; generic errors to users;
no localStorage; no client-supplied timestamps used as authoritative values.

## 7. Known limitations / deferred

- No HR leave-type or balance editor UI (insert balances via a future admin
  flow or SQL); defaults come from `leave_types.default_allowance_days`.
- Calendar-day counting (no weekend/holiday exclusion) is the documented rule.
- Permission requests live in `features/permission` (see docs/permission.md).

## 8. Database validation status

Migration `db/migrations/0003_light_la_nuit.sql` generated and reviewed but
**not applied** (no `DATABASE_URL`/PostgreSQL). Live checks are BLOCKED.
`npm run lint`, `npx tsc --noEmit`, `npm run build` pass.
