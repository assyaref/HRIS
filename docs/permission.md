# Permission Requests — Phase 7

Records the permission (time-based absence) module, e.g. errands or
home-office sessions that are not leave.

## 1. Architecture

Server-side only; same conventions as leave (no balances).

| Concern | Location |
| --- | --- |
| Statuses/types | `features/permission/constants.ts` |
| Zod | `features/permission/schemas.ts` |
| DAL | `features/permission/queries.ts` |
| Actions | `features/permission/actions.ts` |
| Display | `features/permission/format.ts` |
| Client | `features/permission/permission-create-dialog.tsx`, `permission-request-actions.tsx` |
| Routes | `/permission`, `/permission/[requestId]`, `/permission/management` |
| Tables | `permission_requests`, `permission_request_events` |

## 2. Schema

- `permission_requests` — org-scoped, time-window requests (`start_at` /
  `end_at` timestamptz), controlled `permission_type`, reason, status
  (`pending | approved | rejected | cancelled`), reviewer fields.
- `permission_request_events` — append-only transition history.

Permission types (app-level): `personal`, `errand`, `home_office`,
`official_business`, `other`.

## 3. Routes & permissions

| Route | Access |
| --- | --- |
| `/permission` | `permission.view` (own requests) |
| `/permission/[requestId]` | owner, or `permission.approve`/`permission.manage` |
| `/permission/management` | `permission.approve`/`permission.manage` |

Role semantics: SUPERADMIN all; ADMIN full; HR/MANAGEMENT view/approve/manage;
SUPERVISOR view/approve; EMPLOYEE own view/create/cancel.

## 4. Rules & concurrency

- Employees submit for themselves only. Server resolves the employee from the
  session; a client-supplied employee id is never trusted.
- `pending → approved | rejected | cancelled` only; a requester cannot review
  their own request.
- Review/cancel run inside a transaction with `SELECT … FOR UPDATE` on the
  request row, preventing double approval.
- Submission/review timestamps come from the server.

## 5. Isolation & audit

Org scope always from `requireUser()`. Cross-org request ids → `forbidden()`.
Every transition appends an event row + best-effort audit entry
(`permission.created|cancelled|approved|rejected`) with safe metadata.

## 6. Security review

Auth/RBAC server-side; zod server validation; parameterized SQL; no sensitive
values in audit; no client DB access; no localStorage.

## 7. Known limitations / deferred

- No push/email notification on state change (future phase).
- No payroll/time-sheet reconciliation.
- `permission` codes are distinct from the RBAC `permissions` catalog module
  to avoid ambiguity; the catalog labels this module "Permission Requests".

## 8. Database validation status

Tables are part of `db/migrations/0003_light_la_nuit.sql` (generated and
reviewed; **not applied** — no PostgreSQL available). Live checks are BLOCKED.
`npm run lint`, `npx tsc --noEmit`, `npm run build` pass.
