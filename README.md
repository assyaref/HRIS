# Enterprise HRIS

A human resource information system built in incremental phases: employee
records and organization, attendance (clock-in/out with face recognition and
geofencing), leave, payroll and payslips, notifications, reports, and a
mobile-first PWA experience.

**Current phase: 8 — Payroll.**

## Technology stack

- **Framework:** Next.js 16 (App Router, React Server Components, Turbopack)
- **UI:** React 19, TypeScript (strict), Tailwind CSS v4 design tokens
- **UI primitives:** in-house `components/ui/*` (no UI framework dependency)
- **Data:** PostgreSQL + Drizzle ORM (`drizzle-orm`, `pg`)
- **Auth:** session-based, DB-backed (Server Actions + `lib/auth/*`,
  Argon2id password hashing)
- **Authorization:** server-side RBAC (Drizzle-backed roles/permissions,
  org-scoped, no client-trusted roles)
- **Design docs:** `docs/auth.md` (authentication) · `docs/rbac.md` (RBAC) ·
  `docs/employees.md` (employee management) · `docs/attendance.md` (attendance) ·
  `docs/leave.md` (leave) · `docs/permission.md` (permission requests) ·
  `docs/payroll.md` (payroll)

## Requirements

- Node.js 20+ (developed against Node 24)
- npm

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Database (requires a reachable PostgreSQL and a local `DATABASE_URL`):

```bash
cp .env.example .env.local   # then edit DATABASE_URL
npm run db:migrate           # apply migrations
npm run db:seed:rbac         # seed permissions + roles + role_permissions
```

Seed the RBAC catalog (roles/permissions/grants) before administering roles.
The seed is deterministic and idempotent and creates no users.

Create a local login user for manual auth validation (dev tool, not a
registration endpoint):

```bash
node scripts/create-auth-user.mjs admin@acme.test "change-me" HQ "Acme Inc"
```

Routes:

- `/` — auth-aware entry: redirects to `/dashboard` or `/login`
- `/login` — professional sign-in (Server Action backed)
- `/dashboard` — authenticated application shell (server-side guard)
- `/employees` — employee directory (search/filter/pagination, `employees.view`)
- `/employees/[employeeId]` — employee profile + edit (org-scoped)
- `/attendance` — employee check-in/check-out + history (`attendance.view`)
- `/attendance/management` — org attendance view (`attendance.manage`)
- `/attendance/[attendanceId]` — attendance detail + immutable events
- `/leave` — leave hub (balances + requests) · `/leave/balances` · `/leave/[requestId]` · `/leave/management`
- `/permission` — permission requests hub · `/permission/[requestId]` · `/permission/management`
- `/payroll` — payroll period hub · `/payroll/[periodId]` · `/payroll/components` · `/payroll/items/[payrollItemId]` · `/payroll/payslips/[payslipId]`
- `/settings/roles` — role administration (requires `roles.view`)
- `/settings/permissions` — permission catalog (requires `permissions.view`)
- `/forbidden` (special file) — 403 UI rendered by RBAC guards

> **Database note:** Phases 4–8 could not be validated against PostgreSQL in the
> development environment (no reachable `DATABASE_URL`). Lint and build pass.
> See the docs for each phase for limitations and manual validation steps.

## Project architecture

The full specification lives in `docs/architecture.md`.

```
app/            App Router routes, thin UI
├── (auth)/     Public route group (login)
├── (dashboard)/ Authenticated shell (sidebar + header + content)
│   ├── employees/ Employee management (list, profile)
│   ├── attendance/ Attendance (self-service, management, detail)
│   ├── leave/     Leave (hub, balances, detail, management)
│   ├── permission/ Permission requests (hub, detail, management)
│   ├── payroll/   Payroll (hub, period detail, items, components, payslips)
│   └── settings/  RBAC admin (roles, permissions)
components/
├── ui/         Reusable, accessible primitives (Button, Input, Dialog, …)
└── layout/     Application shell components (role-aware navigation)
features/       Domain modules (auth, rbac, employees, attendance, leave, permission, payroll)
lib/
├── config/     Safe env-only configuration (server-only)
├── auth/       Authentication (password, session, auth orchestration)
│               + Authorization (permissions/roles catalogs, rbac, audit)
└── utils/      Small shared utilities (cn, focus)
services/       Server integrations (later phases)
db/             Drizzle schema, connection, migrations
hooks/ · store/ Client hooks/state (as needed)
types/          Shared foundational types (navigation)
scripts/        Tooling scripts (dev user helper, RBAC seed)
public/         Static assets
docs/           Architecture, auth, RBAC, employees, attendance, leave, permission, payroll, ADRs
```

Key conventions:

- **Server Components by default**; `"use client"` only for interactive leaves.
- **Secrets are environment-only**, never hardcoded, and never reach client
  components (`lib/config` is `server-only`).
- Route groups separate public (`(auth)`) and authenticated (`(dashboard)`);
  the dashboard layout runs the server-side auth guard.
- **Authorization is server-only** (`lib/auth/rbac.ts` is `server-only`).
  Role/permission data in the browser is display-only, never a source of truth.

## Roadmap

1. Project foundation **(complete)**
2. Database & ORM (Drizzle) **(complete)**
3. Authentication **(complete)**
4. RBAC **(complete)**
5. Employee management **(complete)**
6. Attendance **(complete)**
7. Leave & permission management **(complete)**
8. Payroll **(current phase)**
9. Face recognition
10. Geofencing
11. Notifications
12. Reports & dashboard
13. PWA / offline / push
14. Security hardening
15. Testing
16. CI/CD
17. Production deployment

## Commands

```bash
npm run dev       # development server
npm run lint      # ESLint
npm run build     # production build
npm run start     # serve the production build
npm run db:generate # create a new Drizzle migration from the schema
npm run db:migrate  # apply migrations (requires DATABASE_URL + Postgres)
npm run db:seed:rbac # seed RBAC catalog (requires DATABASE_URL + Postgres)
npm run db:studio   # Drizzle Studio (requires DATABASE_URL + Postgres)
```
