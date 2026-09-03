# Enterprise HRIS

A human resource information system built in incremental phases: employee
records and organization, attendance (clock-in/out with face recognition and
geofencing), leave, payroll and payslips, notifications, reports, and a
mobile-first PWA experience.

**Current phase: 4 — RBAC.**

## Technology stack

- **Framework:** Next.js 16 (App Router, React Server Components, Turbopack)
- **UI:** React 19, TypeScript (strict), Tailwind CSS v4 design tokens
- **UI primitives:** in-house `components/ui/*` (no UI framework dependency)
- **Data:** PostgreSQL + Drizzle ORM (`drizzle-orm`, `pg`)
- **Auth:** session-based, DB-backed (Server Actions + `lib/auth/*`,
  Argon2id password hashing)
- **Authorization:** server-side RBAC (Drizzle-backed roles/permissions,
  org-scoped, no client-trusted roles)
- **Design docs:** `docs/auth.md` (authentication) · `docs/rbac.md` (RBAC)

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
- `/settings/roles` — role administration (requires `roles.view`)
- `/settings/permissions` — permission catalog (requires `permissions.view`)
- `/forbidden` (special file) — 403 UI rendered by RBAC guards

> **Database note:** Phase 4 could not be validated against PostgreSQL in the
> development environment (no reachable `DATABASE_URL`). Lint and build pass;
> see `docs/rbac.md` §10 for the limitation and the manual validation steps.

## Project architecture

The full specification lives in `docs/architecture.md`.

```
app/            App Router routes, thin UI
├── (auth)/     Public route group (login)
├── (dashboard)/ Authenticated shell (sidebar + header + content)
│   └── settings/  RBAC admin (roles, permissions)
components/
├── ui/         Reusable, accessible primitives (Button, Input, Dialog, …)
└── layout/     Application shell components (role-aware navigation)
features/       Domain modules (auth, rbac — later HR modules)
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
docs/           Architecture, auth design, RBAC design, ADRs
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
4. RBAC **(this phase)**
5. Employee management
6. Organization / projects
7. Attendance
8. Face recognition
9. Geofencing
10. Leave & permission
11. Payroll
12. Payslip
13. Notifications
14. Reports & dashboard
15. PWA / offline / push
16. Security hardening
17. Testing
18. CI/CD
19. Production deployment

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
