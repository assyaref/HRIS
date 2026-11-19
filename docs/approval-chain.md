# Persetujuan bertingkat: atasan langsung → HR (migration 0032)

**Opt-in, default off.** Until switched on, leave / permission / overtime
approvals work exactly as before (one level).

## Settings

`/settings/approval-flow` (Pengaturan → Alur Persetujuan, settings.manage):
switch the direct-manager step on per request type — Cuti, Izin, Lembur.

## Flow when on

1. The employee submits as usual.
2. If the employee has a **direct manager** — `employees.manager_id` (the
   "Atasan" field) pointing to an *active* employee who has a user account —
   that manager decides first in **Persetujuan Tim** (`/team-approvals`,
   shown only to users who manage at least one active employee):
   - **Setujui** → recorded; the request waits for HR;
   - **Tolak** (reason required) → the request is rejected through the same
     code path as an HR rejection (leave: pending balance released, event
     and audit written).
3. HR (existing approvers) decides as before. While the manager has not
   approved, the HR approve/reject buttons answer *"Menunggu persetujuan
   atasan langsung (Nama) terlebih dahulu."* and the Persetujuan inbox shows
   *Menunggu atasan langsung* under the status.

Rules: no manager / manager without an account / inactive manager → straight
to HR; an HR approver who is also the employee's manager may decide
directly; nobody reviews their own request. Pure gate:
`features/approval-chain/rules.ts` (unit-tested).

Implementation notes: the leave and permission decision code was moved into
non-exported functions (`decideLeaveRequest`, `decidePermissionRequest`)
used by both the HR action (now gated) and the manager action; the logic
itself is unchanged. Audit: `*.manager_approved`, `approval_settings.updated`.

## Database

Additive: `approval_settings` (per organization + request type) and
`approval_steps` (one manager decision per request). No change to the
request tables; no employee reference. Before 0032 nothing is gated and the
new pages show "Modul belum aktif".

`DATABASE_URL='<prod>' npm run db:migrate`; rollback (only if unused):
`DROP TABLE approval_steps, approval_settings;` and remove the
`0032_approval_chain` row from `drizzle.__drizzle_migrations`.
