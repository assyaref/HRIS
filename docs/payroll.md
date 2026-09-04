# Payroll — Phase 8

This document records the current Payroll implementation in the Enterprise HRIS project.

## 1. Scope implemented

Current Payroll scope includes:

- payroll period list at `/payroll`
- payroll period creation dialog
- payroll period detail at `/payroll/[periodId]`
- payroll component management at `/payroll/components`
- payroll item detail at `/payroll/items/[payrollItemId]`
- published payslip detail at `/payroll/payslips/[payslipId]`
- server-side payroll run workflow actions
- immutable payroll workflow events
- best-effort audit logging for important payroll mutations

## 2. Architecture

Payroll follows the existing project conventions:

- Next.js App Router
- Server Components by default
- Client Components only for interactive dialogs/action controls
- Server Actions for mutations
- Drizzle ORM for PostgreSQL access
- server-side RBAC via `lib/auth/rbac.ts`
- organization scope derived from `requireUser().organizationId`

No client-supplied organization id is trusted.

## 3. Routes

- `/payroll` — payroll hub / period list
- `/payroll/[periodId]` — payroll period detail + run workflow + items + payslip summary
- `/payroll/components` — payroll component management
- `/payroll/items/[payrollItemId]` — payroll item detail
- `/payroll/payslips/[payslipId]` — published payslip detail

## 4. Business rules

- All payroll queries are organization-scoped.
- Cross-organization ids resolve to forbidden behavior rather than disclosing existence.
- Payroll periods are created in `draft` status.
- Only draft periods can be calculated/recalculated.
- Locked payroll is immutable.
- Payroll items snapshot employee number/name and component data for historical stability.
- Payslip detail reads only published payslips.

## 5. Workflow

Current workflow exposed by the existing actions:

1. create payroll period
2. calculate payroll run
3. submit run for approval
4. approve run
5. reject submitted run
6. lock finalized run
7. cancel draft period
8. generate payslips for approved/locked run
9. publish payslips

Workflow transitions are revalidated server-side and use transactions/row locking where implemented.

## 6. RBAC

Permissions reused from the shared catalog:

- `payroll.view`
- `payroll.create`
- `payroll.calculate`
- `payroll.update`
- `payroll.approve`
- `payroll.lock`
- `payroll.manage`
- `payslip.view`
- `payslip.publish`
- `payslip.manage`

UI visibility is only a convenience. Server guards remain authoritative.

## 7. Audit and events

Payroll actions append immutable workflow rows to `payroll_events` and also attempt safe audit entries for:

- payroll period creation
- payroll calculation
- payroll submission
- payroll approval
- payroll rejection
- payroll locking
- payroll cancellation
- payslip generation
- payslip publication

No passwords, secrets, session tokens, or raw auth material are logged.

## 8. Payslips

The current schema already supports payslip rows and published payslip detail reads.

Implemented surface:

- published payslips are listed on payroll period detail when generated
- published payslip detail is viewable at `/payroll/payslips/[payslipId]`

Not implemented:

- PDF generation
- separate employee payslip hub outside the current payroll surfaces

## 9. Validation status

Completed in this environment:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

Live PostgreSQL validation is blocked because `DATABASE_URL` / PostgreSQL is unavailable in this environment.
No database migration or seed execution was performed here.