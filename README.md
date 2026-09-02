# Enterprise HRIS

A human resource information system built in incremental phases: employee
records and organization, attendance (clock-in/out with face recognition and
geofencing), leave, payroll and payslips, notifications, reports, and a
mobile-first PWA experience.

**Current phase: 2 — Database & ORM.**

## Technology stack

- **Framework:** Next.js 16 (App Router, React Server Components, Turbopack)
- **UI:** React 19, TypeScript (strict), Tailwind CSS v4 design tokens
- **UI primitives:** in-house `components/ui/*` (no UI framework dependency)
- **Data:** PostgreSQL + Drizzle ORM (`drizzle-orm`, `pg`)
- **Auth:** planned (Phase 3+)

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
```

- `/` — entry/landing page (auth-aware redirect arrives in Phase 3)
- `/dashboard` — authenticated application shell placeholder
- `/login` — authentication route-group placeholder (implemented in Phase 3)

## Project architecture

The full specification lives in `docs/architecture.md`.

```
app/            App Router routes, thin UI
├── (auth)/     Public route group (login placeholder)
├── (dashboard)/ Authenticated shell (sidebar + header + content)
components/
├── ui/         Reusable, accessible primitives (Button, Input, Dialog, …)
└── layout/     Application shell components
features/       Domain modules (land in later phases)
lib/
├── config/     Safe env-only configuration (server-only)
└── utils/      Small shared utilities (cn, focus)
services/       Server integrations (later phases)
db/             Drizzle schema, connection, migrations
hooks/ · store/ Client hooks/state (as needed)
types/          Shared foundational types
scripts/        Tooling scripts
public/         Static assets
docs/           Architecture and ADRs
```

Key conventions:

- **Server Components by default**; `"use client"` only for interactive leaves.
- **Secrets are environment-only**, never hardcoded, and never reach client
  components (`lib/config` is `server-only`).
- Route groups separate public (`(auth)`) and authenticated (`(dashboard)`)
  areas; auth guarding lands in Phase 3.

## Roadmap

1. Project foundation **(complete)**
2. Database & ORM (Drizzle) **(this phase)**
3. Authentication
4. RBAC
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
npm run db:studio   # Drizzle Studio (requires DATABASE_URL + Postgres)
```
