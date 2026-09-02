# HRIS — Phase 0: Repository Audit & Architecture Proposal

> Repository: `github.com/assyaref/HRIS` · Date: 2026-09-02
> Scope: Analysis & planning only. **No application code is implemented in this phase.**

---

## 1. Repository Audit

### 1.1 Current state
- Fresh `create-next-app` scaffold. No HRIS code yet. Working tree **clean**, 2 commits on `main`, remote `origin → github.com/assyaref/HRIS.git`.
- `package.json` `name` is `hris-temp` (placeholder) — rename to `hris` in Phase 1.
- Baseline `npm run lint` passes (exit 0).

### 1.2 Dependencies (current)
| Category | Package | Version |
|---|---|---|
| Framework | `next` | 16.3.4 |
| UI | `react`, `react-dom` | 19.2.8 |
| Language | `typescript` | ^5 |
| Styling | `tailwindcss`, `@tailwindcss/postcss` | ^4 |
| Lint | `eslint`, `eslint-config-next` | ^9 / 16.3.4 |
| Types | `@types/node`, `@types/react`, `@types/react-dom` | ^20 / ^19 |

**Missing (deferred to later phases):** DB/ORM, auth library, validation (`zod`), testing (unit/integration/e2e), PWA/service worker, email, object-storage SDK, PDF generation, charting, face-recognition client.

### 1.3 Configuration snapshot
- `next.config.ts` — empty `NextConfig`. No PWA, headers, image domains, or `serverActions` config.
- `tsconfig.json` — `strict: true`, `moduleResolution: "bundler"`, alias `@/* → ./*`, Next.js plugin. Good.
- `eslint.config.mjs` — ESLint 9 flat config (`core-web-vitals` + `typescript`), ignores `.next/out/build/next-env.d.ts`.
- `postcss.config.mjs` — `@tailwindcss/postcss` (Tailwind v4).
- `app/globals.css` — `@import "tailwindcss"` + `@theme inline` tokens; dark mode via `prefers-color-scheme`.
- `.gitignore` — excludes `node_modules`, `.next`, `out`, `build`, `*.pem`, `.env*`, `.vercel`, `*.tsbuildinfo`, `next-env.d.ts`. Secrets already excluded (good).

### 1.4 Next.js 16 breaking changes to respect (from in-repo docs)
- `params` / `searchParams` are **Promises** — always `await` them.
- `cookies()` / `headers()` are **async** — `await cookies()`.
- Typed layouts (`LayoutProps<'/'>`) and route context (`RouteContext<'/users/[id]'>`).
- Turbopack is the default bundler; `fetch` is **not cached** by default (opt-in via `use cache` + `cacheLife`).
- Mutations via **Server Functions/Actions** (`'use server'`, POST-only, Origin↔Host checked).
- Recommended new-project data pattern: **Data Access Layer (DAL)** guarded by `server-only`.

### 1.5 Problems / risks (baseline)
1. Placeholder identity: package name + metadata ("Create Next App").
2. No `src/`-vs-root decision recorded (currently root `app/`).
3. No PWA manifest, icons, or service worker.
4. No auth / RBAC / DB / ORM / migrations / seed strategy.
5. No validation or input-sanitization layer.
6. No testing, lint-staged, or CI/CD.
7. No `.env.example` / environment contract.
8. No rate limiting, security headers, or CSP.
9. Turbopack may need `transpilePackages` for future native/ML dependencies.

### 1.6 Files to keep vs. change
- **Keep as-is (scaffold):** `app/globals.css`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `tsconfig.json`, `next-env.d.ts`, `public/*`, `.git`.
- **Change later:** `package.json` (rename + scripts), `app/layout.tsx` (metadata/shell/theme), `app/page.tsx` (auth redirect), `next.config.ts` (PWA/headers/images/CSP).
- **Never touch:** `.git/config`, `next-env.d.ts` (generated), `AGENTS.md` (auto re-added by `next dev`).
---

## 2. Architecture Recommendation

### A. Application

- **Framework:** Next.js 16 App Router, React 19 Server Components, TypeScript strict, Tailwind v4, Turbopack.
- **Rendering model:** Server Components for data fetching + static shell; Client Components only where interactivity is required. Async `params`/`cookies()` everywhere.
- **PWA:** Installable, mobile-first. `manifest.webmanifest`, theme color, apple touch/mask icons, standalone display, `app.manifest.ts` (Next metadata file route).
- **Responsive:** mobile-first breakpoints (base < `sm` < `md` < `lg` < `xl`). Collapsible sidebar → bottom nav on mobile. Touch targets ≥ 44px. Tables degrade to cards on small screens.
- **Offline strategy:** Read-mostly screens (dashboard, announcements, own payslips, my attendance) are cached for offline read; writes (clock-in/out, forms) require connectivity and are queued only when explicitly safe (see H).
- **Service worker strategy:** generated SW (e.g. Serwist) with:
  - **Precache** app shell (layout, icons, core chunks).
  - **Runtime cache** static assets (`_next/static`, fonts, images) — cache-first.
  - **Network-first** for API/Route Handler data with fallback to cache on failure.
  - **Stale-while-revalidate** for slow-changing content (announcements, dictionaries).
  - **Never cache** auth, payroll, or face/geolocation endpoints.

### B. Frontend

- **UI architecture:** layered design system — `components/ui/*` primitives (Button, Input, Select, Card, Badge, Skeleton, Dialog, Toaster, Table) built on Tailwind v4 tokens. Server Components default; client wrappers opt-in.
- **Reusable components:** presentational + container split. Feature components live in `features/<domain>/components`; only truly shared primitives live in `components/ui`.
- **Layout architecture:** root layout → `(auth)` route group (public) and `(dashboard)` route group (authenticated app shell with sidebar + topbar + breadcrumbs). Per-feature layouts nested under `(dashboard)`.
- **Form architecture:** Server Actions for submission; `zod` schemas as single source of truth shared between client + server; client validation via `useActionState`/controlled fields; field-level errors; loading states via `useTransition`/`useFormStatus`.
- **Table architecture:** server-paginated/sorted/filtered data tables with a single `DataTable` primitive (URL-driven query params). Row actions, selection, and empty state as slots.
- **Modal architecture:** accessible `Dialog` primitive (focus trap, `Esc` close, backdrop, `aria-labelledby`). Confirm dialogs for destructive actions.
- **Notification/toast:** `Toaster` primitive; toasts for transient success/error; persistent in-app notifications in a notifications center (see M).
- **Loading/error/empty states:** `loading.tsx` skeletons per route, `error.tsx` + `global-error.tsx` boundaries, and a reusable `EmptyState` component. Every async surface has a state.
- **Accessibility:** WCAG 2.2 AA — semantic HTML, focus management, `aria-*` labels, keyboard navigation, color contrast, reduced-motion support, screen-reader live regions for toasts/attendance result.

### C. Backend

**Recommendation: Hybrid (Route Handlers + Server Actions) behind a single Data Access Layer (DAL).**

| Path | Used for |
|---|---|
| **Server Actions** | Form-driven, UI-bound mutations (login, CRUD forms, approvals, clock in/out) with tight revalidation + optimistic UI. |
| **Route Handlers** (`app/api/**`) | REST API for external/system consumers: face recognition callbacks, payroll batch jobs, webhooks, push/geolocation endpoints, and future mobile/native clients. |
| **DAL** (`lib/dal`, `server-only`) | The **only** place that talks to the DB. Enforces authN + authZ + row ownership on every query. Returns DTOs only. |

- **Why not "separate API only":** premature for a PWA monolith; adds an auth hop and latency with no current consumer.
- **Why not "Server Actions only":** face/geo/payroll need real, versioned, independently-testable HTTP endpoints and background/batch entry points.
- **Escalation path:** the DAL boundary means the Route-Handler surface can later be extracted into a standalone API service with no rewrite of business logic.

---
### D. Database

- **Engine:** PostgreSQL (relational, ACID, strong for payroll/attendance integrity, `timestamptz` + `CITEXT`/`UUID`).
- **ORM:** **Drizzle ORM** + `drizzle-kit` migrations (SQL-first, lightweight, Turbopack/serverless-friendly, full control for complex payroll queries + raw SQL when needed). Alternative: Prisma (richer DX/Studio, heavier runtime).
- **Conventions:** UUID PKs (or `bigint` identity), `created_at`/`updated_at`, soft-delete `deleted_at`, optimistic concurrency `version` (or `updated_at` compare) for payroll/attendance writes. All timestamps stored **UTC** (`timestamptz`); timezone is a display concern resolved per-entity.
- **Tenancy/org scoping:** single-organization for now, but schema should carry `organization_id` on core entities to avoid a later painful split.

### E. Authentication

- **Library:** evaluate **Better Auth** vs **Auth.js (NextAuth v5)** in Phase 3 for credentials + **DB-backed sessions**; final choice must be verified against Next.js 16.3.4/Turbopack. Regardless of library, authorization (RBAC/PBAC) is **custom** in the DAL (libraries' RBAC is too coarse for HRIS).
- **Login:** username/email + password via Server Action; `useActionState` for errors; `argon2id` password hashing (fallback bcrypt); constant-time compare; generic "invalid credentials" message.
- **Password security:** min length 12+, complexity policy, breach-list check (HaveIBeenPwned API or zxcvbn), per-user salt, mandatory reset on first login + rotation policy.
- **Session:** opaque random session token, hashed at rest in DB (`sessions` table), delivered as `httpOnly; Secure; SameSite=Lax` cookie. Absolute expiry + sliding renewal. Session revocation on logout/password change/admin lock.
- **Session expiration:** absolute TTL (e.g. 12h) + idle timeout (e.g. 30m) configurable via env; server re-checks every request.
- **RBAC:** role → role_permissions (see J). **PBAC:** granular permission checks in the DAL (`can(user, 'attendance:approve', scope)`), including row-level ownership.
- **Account status:** `pending | active | suspended | locked`. Login lockout after N failed attempts (e.g. 5) with progressive backoff; admin unlock/reset.
- **Logout:** Server Action clears + revokes session server-side.
- **Audit:** every login success/failure, lockout, password change, logout, and permission-denied event → `audit_logs`.

---
### F. Face Recognition

- **Model:** face recognition runs **outside** the Next.js process as a dedicated service (self-hosted container with an inference API, or a managed ML API). Next.js only orchestrates via the DAL + object storage. Never ship model weights in the Next bundle.
- **Enrollment:** HR/admin initiates; employee captures N registered samples (e.g. 3–5) via webcam (controlled lighting, no glasses policy). Service extracts embeddings; embeddings are stored (encrypted) in object storage / `face_records`, keyed to `employee_id`. Raw images retained only if a retention policy requires it.
- **Verification:** capture → extract embedding → compare against enrolled embeddings (cosine similarity / Euclidean distance) → map to **confidence score** 0.0–1.0.
- **Threshold:** `similarity_threshold` is **configurable per work location / project** and stored in DB (not hard-coded). Default suggested 0.6–0.7, tuned per false-accept/false-reject targets. Documented per environment.
- **Liveness detection:** active challenge (blink / head-turn) or passive liveness SDK to reject photos/replays. Result is one input to the final decision, not the only one.
- **Failed attempts:** per-employee cooldown + daily cap; after N consecutive failures → block automatic verification and require **manual verification fallback** (supervisor/HR approves with a reason).
- **Manual fallback:** always available; records approver + reason; fully audited.
- **Audit trail:** `face_records` logs every attempt: timestamp, confidence score, threshold used, liveness result, device, IP, geolocation, decision, fallback approver.
- **Principle:** face match is **never 100%** — it is one signal combined with liveness + geofence + account state; threshold is configurable and its rationale documented.

### G. Geolocation / Geofencing

- **Config:** per work location/project geofence (`geofence_configurations`): `latitude`, `longitude`, `radius_meters`, optional `allowed_accuracy_meters`, active hours.
- **Capture:** browser Geolocation API (HTTPS required) with `enableHighAccuracy`; send `latitude`, `longitude`, `accuracy` (meters), and `timestamp` to the server.
- **Validation (server-side):** (1) GPS accuracy ≤ configured max, else reject as "low accuracy"; (2) Haversine distance between device point and geofence center ≤ radius.
- **Distance calc:** Haversine (adequate for HR radii) — great-circle distance in meters.
- **Failure:** on low accuracy / outside fence / denied permission → block auto-accept and route to **manual verification** (supervisor/HR), with a reason recorded.
- **Audit trail:** every check records raw coordinates (redacted display), accuracy, computed distance, fence config snapshot, decision, and fallback approver.

### H. Attendance

- **Flow:** employee clock-in/out → capture device time + location + face → server validates (face + geofence + schedule) → persist atomically → return status + remaining state.
- **Status:** `present | late | early_departure | overtime | absent | on_leave | holiday`. Derived from shift/schedule rules + clock events.
- **Duplicate prevention (critical for concurrency):** idempotency key per submission + unique constraint `(employee_id, work_date, type)`; server-side transaction; "first write wins" or "reject duplicate" per policy. Designed so N employees clocking in at ~09:00 do not create duplicate rows.
- **High concurrency:** short transactions, unique constraints (not app-level checks), connection pooling (PgBouncer/serverless pool), and optional outbox/queue for post-write side-effects (notifications) so the write path stays fast.
- **Timezone:** store all events in UTC; schedule/employee timezone determines "work date", late/early/overtime windows, and DST behavior.
- **Location + face:** both must pass (or be manually verified) before the event is accepted (see F, G).
- **Audit:** every event + any correction/adjustment → `attendance_logs` + `audit_logs`.

---
### I. Payroll

- **Periods:** `payroll_periods` define open/closed/approved cycles (e.g. monthly, 25th–24th). Payroll runs are immutable once approved.
- **Components:** configurable salary components — basic, allowances, deductions, overtime, bonuses, reimbursements, tax fields (taxable/non-taxable, tax bracket inputs) — as `payroll_details` line items per employee per period.
- **Calculation:** deterministic, idempotent, server-side job (Route Handler / scheduled function) that reads attendance + leave + components → computes gross/net, tax, and totals. Every run snapshots inputs (config, rates, attendance) for auditability.
- **Approval:** draft → submitted → approved (FINANCE/ADMIN) → locked. Approval is role-gated + audited.
- **Payslip generation:** render to PDF server-side; store encrypted in object storage; employee can view/download own payslip only (row-level authorization).
- **Employee access:** read-only, own payslips only, watermarked/encrypted, with audit of every access.

### J. RBAC (preliminary roles)

Roles are **not** equal in capability. Permission matrix (● = granted):

| Capability | SUPERADMIN | ADMIN HR | MANAGEMENT | HR | FINANCE | PM | SUPERVISOR | EMPLOYEE |
|---|---|---|---|---|---|---|---|---|
| System config, secrets, roles | ● | – | – | – | – | – | – | – |
| User & role admin | ● | ● | – | ●(scoped) | – | – | – | – |
| Employee data (full) | ● | ● | – | ● | – | – | – | – |
| Employee data (own) | ● | ● | ● | ● | ● | ● | ● | ● |
| Attendance: view team | ● | ● | ● | ● | – | ● | ● | – |
| Attendance: approve/correct | ● | ● | ● | ● | – | – | ●(team) | – |
| Leave/permission approve | ● | ● | ● | ● | – | ● | ●(team) | – |
| Payroll run & approve | – | – | – | – | ● | – | – | – |
| Payslip view (own) | ● | ● | ● | ● | ● | ● | ● | ● |
| Reports/dashboard | ● | ● | ● | ● | ● | ●(project) | ●(team) | own only |
| Announcements publish | ● | ● | ● | ● | – | ● | – | – |
| Geofence/face config | ● | ● | – | – | – | – | – | – |

- Scope is enforced in the DAL: PM → own projects; SUPERVISOR → own team; EMPLOYEE → self. Row-level checks on every query.

### K. Security

- **Authentication:** argon2id/bcrypt, DB sessions, lockout, TOTP/MFA for admin+finance roles (Phase 3+), breach checks.
- **Authorization:** central `can()` in DAL; deny-by-default; ownership checks on every record; never trust client-claimed roles.
- **CSRF:** Server Actions POST-only + Origin↔Host check; `SameSite=Lax` cookies; explicit CSRF token for any cross-site cookie flows.
- **XSS:** React auto-escaping; no `dangerouslySetInnerHTML` without sanitizer (DOMPurify); strict CSP.
- **SQL injection:** parameterized queries via ORM; raw SQL only through typed query builder; input validated by zod before DAL.
- **Rate limiting:** on login, attendance, face, and API routes (per-IP + per-user); progressive backoff.
- **Input validation:** zod schemas at every boundary (Server Actions, Route Handlers, DAL DTOs); no implicit `any`.
- **File upload:** allowlist (MIME + magic bytes), size caps, no execution, private buckets, signed/expiring URLs, optional malware scan.
- **Audit logs:** append-only `audit_logs` (actor, action, entity, before/after, IP, user-agent, timestamp); tamper-evident; retention policy.
- **Secrets:** env vars only (`.env.local`/platform secrets), never committed; `.env.example` documents shape without values.
- **Secure headers:** CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` via `next.config.ts` headers/middleware.
- **Session security:** httpOnly + Secure + SameSite; rotation on privilege change; absolute/idle expiry; revocation list.

---
### L. File Storage

- **Engine:** S3-compatible object storage (e.g. AWS S3 / Cloudflare R2 / Backblaze B2) with **private-by-default** buckets.
- **Uploads:** server-side only (never direct client→bucket for sensitive docs). Client → Route Handler → validate → upload → store object key in DB. Signed, short-lived upload/download URLs where direct transfer is needed.
- **Categories & buckets:** `profile-photos`, `identity-documents`, `attendance-evidence`, `payslips`, `hr-documents` — separate prefixes with distinct retention + access policies.
- **Security:** allowlist MIME + magic-byte validation, size caps, server-side encryption (SSE-KMS), no public ACL, expiring signed URLs, optional malware scanning for identity/payslip uploads, full access auditing.
- **Access:** all downloads flow through an authorization check (DAL) → generate expiring signed URL; payslips/identity docs never public.

### M. Email / Notification

- **Email:** transactional email service (Resend/SES/Postmark) via a server-side `EmailService`. Templates for reset, welcome, payroll, approval requests, alerts. Never block the main request — send async via outbox/queue.
- **In-app notifications:** `notifications` table (recipient, type, title, body, entity link, read state) rendered in a notifications center; real-time via polling (PWA-friendly) with Web Push later.
- **Push:** Web Push (VAPID) via service worker for mobile/offline delivery; subscribe on login; per-user `notification_preferences`.
- **Preferences:** per-channel (email / in-app / push) and per-event-type toggles; defaults set by role; mandatory system notifications bypass preferences.

### N. Deployment (production)

```
GitHub (source) ──► GitHub Actions (CI: lint, typecheck, test, build; CD: deploy)
        │
        ▼
  Vercel (Next.js 16 app — serverless functions for Route Handlers/Actions)
        │
        ├──► PostgreSQL (managed: Neon / Supabase / RDS)  ← DAL, sessions, data
        ├──► Object storage (S3 / R2 / B2)                ← files, payslips, embeddings
        ├──► Face recognition service (container / managed ML API)  ← inference only
        ├──► Email provider (Resend/SES)                  ← transactional mail
        └──► Web Push (VAPID)                             ← PWA notifications
```

- **Vercel:** app + serverless API, edge network, preview deploys per PR.
- **Database:** managed Postgres, connection pooling (serverless-friendly), automated backups + PITR.
- **Object storage:** separate from app; lifecycle rules per bucket.
- **Face recognition:** isolated service (GPU optional) called over private network/API key; never on the public edge.
- **Secrets:** injected per environment via Vercel/CI secret stores; never in the repo.

### O. Development Workflow

- **Branches:** `main` (production) ← `develop` (integration) ← `feature/*`, `fix/*`, `chore/*`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- **PRs:** required review + status checks (lint, typecheck, test, build) before merge; squash-merge to keep history linear.
- **Environment variables:** `.env.local` (dev, untracked), `.env.example` (tracked, shape only); CI/Vercel per-environment secrets; validation of required vars at boot.
- **Environments:** `development` (local) → `staging` (preview deploy on PR + `develop`) → `production` (`main`).
- **Migrations:** versioned `drizzle-kit` migrations in `db/migrations`, applied via CI/migration job; never destructive without backup + forward-only in prod.
- **Backups:** automated DB backups (daily + PITR) + object-storage versioning; restore drills; retention policy.

---
### P. Folder Structure (proposed)

Keeps the existing root `app/` (no breaking move to `src/`). Layered: routing (`app`) · UI primitives (`components/ui`) · feature modules (`features`) · cross-cutting logic (`lib`) · data (`db`).

```
hris/
├── app/                                # App Router — routes, thin UI, API
│   ├── (auth)/                         # public group
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx           # if self-service
│   │   └── layout.tsx
│   ├── (dashboard)/                    # authenticated shell group
│   │   ├── layout.tsx                  # sidebar + topbar + breadcrumbs
│   │   ├── dashboard/page.tsx
│   │   ├── employees/…                  # list/[id]/page.tsx, actions.ts
│   │   ├── departments/…
│   │   ├── projects/…
│   │   ├── attendance/…
│   │   ├── leave/…
│   │   ├── payroll/…
│   │   ├── payslips/…
│   │   ├── announcements/…
│   │   ├── settings/…
│   │   └── reports/…
│   ├── api/                            # Route Handlers (REST / system)
│   │   ├── auth/…
│   │   ├── employees/route.ts
│   │   ├── attendance/route.ts
│   │   ├── payroll/route.ts
│   │   ├── face/route.ts
│   │   ├── geo/route.ts
│   │   ├── notifications/route.ts
│   │   └── webhooks/…
│   ├── layout.tsx                      # root layout + metadata + theme
│   ├── globals.css
│   ├── error.tsx / global-error.tsx
│   ├── loading.tsx
│   ├── not-found.tsx
│   ├── manifest.ts                     # PWA manifest (Next metadata route)
│   └── page.tsx                        # auth redirect
│
├── components/                         # shared design system
│   └── ui/                             # Button, Input, Select, Card, Badge,
│                                       # Dialog, Toaster, Table, Skeleton, EmptyState…
├── features/                           # domain modules (vertical slices)
│   ├── employees/{components,actions,queries,schemas}
│   ├── attendance/{…}
│   ├── leave/{…}
│   ├── payroll/{…}
│   ├── face/{…}
│   └── geofence/{…}
├── lib/                                # cross-cutting logic
│   ├── auth/                           # session, login, password, rbac
│   ├── dal/                            # data access layer (server-only)
│   ├── validation/                     # zod schemas
│   ├── config/                         # env-typed config
│   ├── rate-limit/
│   └── utils/
├── services/                           # server integrations
│   ├── email/
│   ├── storage/
│   ├── face/
│   ├── geo/
│   └── push/
├── db/                                 # database
│   ├── schema/                         # tables (users, roles, …)
│   ├── migrations/
│   ├── seed/
│   └── index.ts                        # db client + pooling
├── hooks/                              # client hooks
├── store/                              # client state (if needed)
├── types/                              # shared DTOs/types
├── public/
│   ├── icons/                          # PWA icons (192/512, maskable)
│   └── …
├── docs/                               # architecture & ADRs (this file)
├── scripts/                            # tooling (seed, migrate, gen)
├── .env.example
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
└── postcss.config.mjs
```

**Conventions:** Server Components default; `'use client'` only in leaf interactive components. DAL (`lib/dal`) is `server-only` and the sole DB entry point. Zod schemas colocated with each feature. All DB access returns DTOs — never raw rows to client components.

---
---

## 3. Database Entity Overview

> All tables: UUID PK, `created_at`/`updated_at` timestamptz (UTC), `deleted_at` soft-delete where applicable, `organization_id` for future multi-org. Junction tables listed inline.

**Identity & Access**
- `users` — id, email (unique), username (unique), password_hash, status (`pending|active|suspended|locked`), failed_login_count, locked_until, last_login_at, must_change_password, mfa_enabled, timezone.
- `roles` — id, code (`SUPERADMIN|ADMIN_HR|…`), name, description, is_system.
- `permissions` — id, code (`attendance:approve`, `payroll:run`), description, module.
- `role_permissions` — role_id, permission_id (PK pair).
- `user_roles` — user_id, role_id, scope (org/project/department), scope_id, granted_by.
- `sessions` — id, user_id, token_hash, ip, user_agent, created_at, expires_at, revoked_at.

**Organization**
- `employees` — id, user_id (nullable), employee_no, first_name, last_name, email, phone, hire_date, status, department_id, position_id, manager_id, timezone, photo_key.
- `departments` — id, name, code, parent_id, manager_id.
- `positions` — id, title, code, grade/level, department_id (optional).
- `projects` — id, name, code, status, manager_id, start/end dates.
- `work_locations` — id, name, address, project_id (nullable), timezone.
- `employee_projects` / `employee_locations` — junction tables for assignments.

**Attendance**
- `shifts` / `work_schedules` — id, employee_id (or template), day_of_week, start_time, end_time, timezone, effective dates. *(recommended addition — needed for late/early/overtime rules)*
- `attendance` — id, employee_id, work_date, shift_id, clock_in, clock_out, status (`present|late|early_departure|overtime|absent|on_leave|holiday`), total_minutes, overtime_minutes, is_manual, verified_by. Unique `(employee_id, work_date)`.
- `attendance_logs` — id, employee_id, attendance_id, type (`in|out`), recorded_at, device_time, source, ip, device, idempotency_key (unique), geo_result, face_result, status. Unique `(employee_id, work_date, type)` + `idempotency_key`.
- `attendance_adjustments` — id, attendance_id, requested_by, approved_by, old/new values, reason, status.

**Leave & Requests**
- `leave_types` — id, code (annual/sick/unpaid…), name, balance policy, requires_approval.
- `leave_requests` — id, employee_id, leave_type_id, start_date, end_date, days, reason, status (`draft|submitted|approved|rejected|cancelled`), approver_id, approved_at.
- `permission_requests` — id, employee_id, type (`permit|wfh|late_in|early_out`), date/time, reason, status, approver_id. *(avoids clash with RBAC `permissions`)*

**Payroll**
- `salary_components` — id, code, name, type (`earning|deduction|tax`), taxable flag, default amount/rate.
- `payroll_periods` — id, name, start_date, end_date, status (`open|closed|approved|paid`), locked_by.
- `payroll` — id, period_id, status (`draft|submitted|approved|locked`), totals (gross/net/tax), run_by, approved_by.
- `payroll_details` — id, payroll_id, employee_id, component_id, amount, quantity/rate, snapshot fields.
- `payslips` — id, payroll_id, employee_id, storage_key (encrypted PDF), checksum, issued_at, viewed_at.

**Communication & Audit**
- `announcements` — id, title, body, audience (role/department/project), author_id, published_at, expires_at.
- `notifications` — id, user_id, type, title, body, entity_type/entity_id, link, read_at, channel.
- `notification_preferences` — id, user_id, event_type, email/in_app/push booleans.
- `audit_logs` — id, actor_id, action, entity_type, entity_id, before (jsonb), after (jsonb), ip, user_agent, created_at. Append-only.

**Face & Geofence**
- `face_records` — id, employee_id, kind (`enrollment|verification`), embedding_ref (storage key), confidence_score, threshold_used, liveness_result, decision (`pass|fail|manual`), device, ip, created_at.
- `geofence_configurations` — id, work_location_id, project_id, latitude, longitude, radius_meters, allowed_accuracy_meters, active_from/to, similarity_threshold (per-location face threshold).

---
---

## 4. Phased Roadmap (Q)

Each phase ships working, buildable code. Dependencies are added only when their phase starts.

### PHASE 0 — Repository audit & architecture (this phase)
- **Objective:** audit repo, lock architecture, produce this document. **Deliverable:** `docs/architecture.md`.

### PHASE 1 — Project foundation
- **Objective:** rename package, set metadata/theme, establish folder structure, lint/format scripts, `.env.example`, path aliases, base design tokens.
- **Files:** `package.json`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (redirect), `components/ui/*` primitives, `.env.example`, `next.config.ts` (base).
- **Deps:** none new (optional Prettier). **DB/API:** none. **UI:** base shell + primitives.
- **Security:** define env contract (no values), metadata. **Testing:** lint passes, build passes. **Acceptance:** app boots, redirects to `/login`, primitives render, `npm run lint` clean.

### PHASE 2 — Database & ORM
- **Objective:** Postgres + Drizzle, schema for identity/org/RBAC, migrations, seed (roles + superadmin).
- **Files:** `db/schema/*`, `db/index.ts`, `db/migrations/*`, `db/seed/*`, `scripts/migrate.ts`.
- **Deps:** `drizzle-orm`, `drizzle-kit`, `pg` (+ pool), `dotenv`. **DB:** core tables + junctions. **API:** none public. **UI:** none.
- **Security:** env-only credentials, parameterized queries. **Testing:** migration up/down, seed idempotent. **Acceptance:** `db:migrate` + `db:seed` run; tables exist; lint/build green.

### PHASE 3 — Authentication
- **Objective:** login/logout, sessions, password hashing, lockout, account status, audit events.
- **Files:** `app/(auth)/login`, `features/auth/actions.ts`, `lib/auth/*`, `lib/dal/session.ts`, `app/api/auth/…`.
- **Deps:** auth library (Better Auth/Auth.js) + `argon2` (or bcrypt), `zod`. **DB:** `sessions`, `audit_logs` enabled. **API:** auth endpoints. **UI:** login form, protected shell gate.
- **Security:** argon2id, httpOnly/Secure/SameSite cookie, rate limiting, lockout, generic errors. **Testing:** unit (hash/verify, lockout), e2e (login/logout). **Acceptance:** valid/invalid login, lockout after N fails, session expiry, logout revokes.

### PHASE 4 — RBAC
- **Objective:** roles/permissions, `can()` in DAL, route/menu guards, row-level scoping.
- **Files:** `lib/auth/rbac.ts`, `features/auth/*`, seed roles/permissions, middleware/proxy guard.
- **Deps:** none new. **DB:** roles/permissions/role_permissions/user_roles seeded. **API:** none new. **UI:** role-aware nav.
- **Security:** deny-by-default, server-side enforcement. **Testing:** permission matrix tests. **Acceptance:** each role sees only permitted UI + API; ownership scoping works.

### PHASE 5 — Employee management
- **Objective:** CRUD employees, departments, positions; profile + photo upload.
- **Files:** `features/employees/*`, `app/(dashboard)/employees/*`, `app/(dashboard)/departments/*`, `app/api/employees/*`, `services/storage/*`.
- **Deps:** storage SDK. **DB:** employees/departments/positions/junctions. **API:** employee REST + actions. **UI:** list/table, form, detail, photo.
- **Security:** RBAC scoping, upload validation, private buckets. **Testing:** CRUD unit/e2e, upload validation. **Acceptance:** full lifecycle works; roles respected; photos stored securely.

### PHASE 6 — Organization / project management
- **Objective:** projects, work locations, assignments (employee↔project/location).
- **Files:** `features/projects/*`, `features/locations/*`, routes under `(dashboard)/projects` & `settings/locations`.
- **Deps:** none new. **DB:** projects, work_locations, assignments. **API:** project/location CRUD. **UI:** management screens.
- **Security:** scoped management. **Testing:** assignment integrity. **Acceptance:** projects/locations CRUD + employee assignment.

---
### PHASE 7 — Attendance
- **Objective:** clock in/out, schedules/shifts, statuses (late/early/overtime), duplicate prevention, timezone, audit.
- **Files:** `features/attendance/*`, `app/(dashboard)/attendance/*`, `app/api/attendance/*`, `features/shifts/*`.
- **Deps:** none new. **DB:** shifts, attendance, attendance_logs (+ unique constraints). **API:** clock in/out endpoint + actions. **UI:** punch card, my-attendance, team view.
- **Security:** idempotency, rate limiting, RBAC approval, audit. **Testing:** concurrency test (N simultaneous clock-ins), timezone/DST, duplicate rejection. **Acceptance:** concurrent submissions produce exactly one row; statuses correct.

### PHASE 8 — Face recognition
- **Objective:** enrollment + verification integration, configurable threshold, liveness, manual fallback, audit.
- **Files:** `features/face/*`, `services/face/*`, `app/api/face/*`, `components/face/*` (capture UI).
- **Deps:** face SDK/service client. **DB:** `face_records` (embeddings refs). **API:** enroll/verify endpoints. **UI:** webcam capture, result state.
- **Security:** never ship model weights; embeddings encrypted; threshold configurable per location; fallback + audit. **Testing:** unit (threshold/score), integration (mock service), e2e (happy/fail/fallback). **Acceptance:** verify passes/fails per threshold; failures route to manual; all attempts audited.

### PHASE 9 — Geofencing
- **Objective:** geofence config per project/location, GPS accuracy check, Haversine validation, manual fallback, audit.
- **Files:** `features/geofence/*`, `services/geo/*`, `app/api/geo/*`.
- **Deps:** none new. **DB:** `geofence_configurations`. **API:** geofence config + location-validate endpoint. **UI:** map/radius editor (or numeric), validation status.
- **Security:** server-side validation only; never trust client GPS. **Testing:** distance/accuracy boundary tests, outside-fence rejection. **Acceptance:** inside fence passes, outside/low-accuracy routes to manual + audit.

### PHASE 10 — Leave & permission
- **Objective:** leave types, balances, requests, approval workflow; permission requests (permit/WFH/early-out).
- **Files:** `features/leave/*`, `features/requests/*`, routes under `(dashboard)/leave`.
- **Deps:** none new. **DB:** leave_types, leave_requests, permission_requests, balances. **API:** request CRUD + approve/reject. **UI:** request forms, my requests, approval queue.
- **Security:** approval RBAC scoping, audit. **Testing:** workflow state machine, balance deduction. **Acceptance:** full request lifecycle; balances correct; approvals scoped.

### PHASE 11 — Payroll
- **Objective:** periods, components, run calculation (gross/net/tax/overtime), approval, immutability.
- **Files:** `features/payroll/*`, `app/(dashboard)/payroll/*`, `app/api/payroll/*`, `services/payroll/*`.
- **Deps:** none new (math in-house). **DB:** salary_components, payroll_periods, payroll, payroll_details. **API:** run/approve endpoints (FINANCE-gated). **UI:** period manager, component editor, run summary.
- **Security:** FINANCE/ADMIN-only, immutable runs, input snapshots, audit. **Testing:** calculation correctness (fixtures), idempotent re-run, approval lock. **Acceptance:** run produces correct figures; approved runs locked; audited.

### PHASE 12 — Payslip
- **Objective:** PDF generation, encrypted storage, employee self-service access, watermarking.
- **Files:** `features/payslips/*`, `app/(dashboard)/payslips/*`, `services/storage/*`, `services/pdf/*`.
- **Deps:** PDF lib (e.g. `@react-pdf/renderer` or `pdf-lib`). **DB:** `payslips`. **API:** generate/download (own-only). **UI:** payslip list/view/download.
- **Security:** own-payslip-only, signed URLs, access audit. **Testing:** PDF content, authorization (cross-user denied). **Acceptance:** employee sees only own payslips; PDF renders correctly.

---
### PHASE 13 — Notifications
- **Objective:** in-app + email + push notifications, preferences, announcements feed.
- **Files:** `features/notifications/*`, `features/announcements/*`, `services/email/*`, `services/push/*`, routes under `(dashboard)/announcements`.
- **Deps:** email provider SDK, Web Push lib. **DB:** notifications, notification_preferences, announcements. **API:** notifications list/read, push subscribe. **UI:** center, toasts, preferences.
- **Security:** authorization per notification; email templates injection-safe. **Testing:** channel routing, preference gating. **Acceptance:** events produce correct in-app/email/push per preferences.

### PHASE 14 — Reports & dashboard
- **Objective:** dashboards (attendance/payroll/headcount) and role-scoped reports with export.
- **Files:** `features/reports/*`, `app/(dashboard)/reports/*`, `app/(dashboard)/dashboard/*`.
- **Deps:** charting lib (if needed; keep light for PWA). **DB:** read models/aggregations. **API:** report endpoints. **UI:** cards/charts/tables.
- **Security:** role-scoped data (PM→project, SUPERVISOR→team). **Testing:** aggregation correctness, scoping. **Acceptance:** dashboards correct + scoped.

### PHASE 15 — PWA / offline / push optimization
- **Objective:** manifest + icons, service worker, offline caching strategy, install prompt, push integration.
- **Files:** `app/manifest.ts`, `public/icons/*`, SW config, `next.config.ts` (PWA/headers).
- **Deps:** SW tooling (e.g. Serwist). **DB/API:** none new. **UI:** install/offline indicators.
- **Security:** never cache auth/payroll/face; CSP for SW scope. **Testing:** Lighthouse PWA audit, offline smoke. **Acceptance:** installable, offline read works, safe assets cached.

### PHASE 16 — Security hardening
- **Objective:** CSP/security headers, rate limiting, MFA for privileged roles, input-sanitization sweep, secrets audit.
- **Files:** `next.config.ts` (headers), middleware, `lib/rate-limit/*`, `lib/auth/mfa.ts`.
- **Deps:** MFA/OTP lib. **DB:** mfa fields. **API/UI:** MFA setup/verify screens. **Testing:** header/CSP assertions, rate-limit tests, MFA e2e. **Acceptance:** headers present, rate limits enforce, MFA required for admin/finance.

### PHASE 17 — Testing
- **Objective:** full test pyramid — unit (vitest), integration (DB), e2e (Playwright) with CI gating.
- **Files:** `tests/*`, configs, fixtures. **Deps:** vitest, @testing-library, Playwright. **DB:** test fixtures. **Acceptance:** coverage targets met; CI blocks on failures.

### PHASE 18 — CI/CD
- **Objective:** GitHub Actions — lint, typecheck, test, build on PR; auto-deploy preview; migration job; release to staging/prod.
- **Files:** `.github/workflows/*`. **Deps:** none (GH-hosted). **Acceptance:** PR checks run; merges deploy; migrations automated.

### PHASE 19 — Production deployment
- **Objective:** provision prod Postgres/storage/face service, set prod secrets, DNS/SSL, monitoring/alerting, backup + restore drill, launch.
- **Files:** infra configs, runbooks, monitoring. **Deps:** observability (Sentry/Logging). **Acceptance:** prod stable, backups verified, restore tested, dashboards green.

---

## 5. Risks & Technical Decisions

**Key decisions (locked this phase):**
1. **PostgreSQL + Drizzle ORM** over Prisma — SQL-first control for payroll/attendance, lighter serverless runtime.
2. **Hybrid backend** (Server Actions + Route Handlers) over "Actions only" or "API only" — covers UI-bound CRUD *and* system integrations.
3. **DAL as single DB entry point** with `server-only` + DTOs — enforces authZ and keeps a future API-extraction path open.
4. **Root `app/` (no `src/`)** — avoids a breaking move from the current scaffold.
5. **Face recognition as external service**, embeddings (not raw images) stored, configurable per-location threshold — explicitly treats matching as probabilistic.
6. **Tailwind v4 design system** built in-house (no heavy UI framework) — smaller bundle, PWA-friendly.
7. **DB-backed sessions** (revocable, auditable) over stateless JWT-only.

**Risks & mitigations:**
| Risk | Impact | Mitigation |
|---|---|---|
| Attendance concurrency at peak (many clock-ins ~09:00) | duplicate/wrong rows | unique constraints + idempotency keys + short transactions + pooling |
| Face recognition false accept/reject | security vs. UX | probabilistic model, configurable threshold, liveness, manual fallback, audit |
| GPS spoofing / low accuracy | location fraud | server-side validation, accuracy caps, fallback + audit |
| Serverless cold starts + DB pool exhaustion | latency | connection pooling, keep DAL lean, outbox for side-effects |
| Turbopack incompat with native/ML libs | build failures | keep ML out of the Next bundle; `transpilePackages` as needed |
| Payroll miscalculation | compliance/financial | deterministic idempotent engine, input snapshots, approval locks, fixtures |
| Secrets leakage | breach | env-only, `.env*` ignored, platform secret stores, `.env.example` shape-only |
| Scope creep / premature features | instability | strict phase gating; buildable after every phase |

---
---

> **Next step:** Phase 1 (project foundation) begins after this proposal is reviewed and approved. No application code is implemented in Phase 0.


