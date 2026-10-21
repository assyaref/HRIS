-- ============================================================================
-- 0021 — Employee permanent-deletion CONTROL PLANE (ADDITIVE)
-- ============================================================================
--
-- PURPOSE
--   Add the legal-hold and dual-control approval tables that gate the Super
--   Administrator permanent-deletion policy
--   (features/employees/deletion-control-policy.ts).
--
-- !!! DO NOT APPLY WITHOUT SIGN-OFF !!!
--   This migration adds control-plane constraints that BLOCK employee deletion
--   while a hold is active or a request is pending/approved.
--   It must not be applied as part of a destructive release until the retention
--   policy in docs/employee-permanent-delete-policy.md §4 is approved by
--   HR/Payroll, DBA, Security and Legal/Compliance.
--
-- DELIBERATELY NOT JOURNALED
--   The Drizzle lineage in this repository is already inconsistent: migration
--   files 0019/0020 exist but are absent from meta/_journal.json, and snapshot
--   files stop at 0014. This file follows the existing out-of-band pattern and
--   is intentionally NOT added to _journal.json. Do not run
--   `drizzle-kit migrate`/`generate` from the worktree. Apply through the
--   approved DBA change after the lineage is reconciled.
--
-- SAFETY
--   - Additive only: CREATE TABLE IF NOT EXISTS + indexes. No DROP, no ALTER,
--     no data migration.
--   - An ACTIVE legal hold and a PENDING/APPROVED deletion request still block
--     ANY employee DELETE. They do so through a NOT NULL-style CHECK after the
--     employee reference is cleared (SET NULL), so the block is enforced by the
--     database, not only by application code:
--       * employee_legal_holds_active_requires_employee
--       * employee_deletion_requests_active_requires_employee
--   - RELEASED holds and TERMINAL requests (rejected/cancelled/executed) are
--     control-plane HISTORY. Their employee reference is ON DELETE SET NULL so
--     they no longer block a later, legitimate deletion; the identity snapshot
--     columns preserve who the record was about.
--   - Operator references are ON DELETE SET NULL and cannot unblock a hold.
--   - Safe to run inside a transaction (BEGIN/COMMIT).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- employee_legal_holds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  -- Nullable ONLY for released holds whose employee row has been deleted.
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  -- Immutable identity captured when the hold is placed, so released hold
  -- history remains attributable after the employee row is gone.
  employee_number_snapshot text NOT NULL,
  employee_name_snapshot text NOT NULL,
  reason text NOT NULL,
  authority text,
  reference text,
  placed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  placed_by_email text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  released_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  released_by_email text,
  released_at timestamptz,
  release_reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- An ACTIVE hold can never lose its employee reference. Deleting the
  -- employee fires SET NULL, this CHECK rejects it and the whole transaction
  -- rolls back: the database still enforces "an active hold blocks deletion".
  CONSTRAINT employee_legal_holds_active_requires_employee
    CHECK (NOT active OR employee_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS employee_legal_holds_employee_idx
  ON employee_legal_holds (organization_id, employee_id, active);

-- At most ONE active hold per employee per organization. Partial so released
-- hold history remains unlimited. Closes the race between concurrent places;
-- a second concurrent place fails with 23505 and is refused.
CREATE UNIQUE INDEX IF NOT EXISTS employee_legal_holds_active_hold_unique
  ON employee_legal_holds (organization_id, employee_id) WHERE active;

-- ---------------------------------------------------------------------------
-- employee_deletion_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  -- Nullable ONLY for terminal requests whose employee row has been deleted.
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_number text NOT NULL,
  employee_name text NOT NULL,
  requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_email text,
  reason text NOT NULL,
  tier text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  required_approvals integer NOT NULL DEFAULT 1,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Pending/approved requests are live control-plane state and must keep the
  -- employee reference (they block deletion). Rejected/cancelled/executed
  -- requests are terminal history and may be detached when the employee row is
  -- later deleted. Unknown statuses fail closed (they require the reference).
  CONSTRAINT employee_deletion_requests_active_requires_employee
    CHECK (
      employee_id IS NOT NULL
      OR status IN ('rejected', 'cancelled', 'executed')
    )
);

CREATE INDEX IF NOT EXISTS employee_deletion_requests_org_employee_idx
  ON employee_deletion_requests (organization_id, employee_id);
CREATE INDEX IF NOT EXISTS employee_deletion_requests_status_idx
  ON employee_deletion_requests (organization_id, status);

-- ---------------------------------------------------------------------------
-- employee_deletion_approvals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_deletion_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES employee_deletion_requests(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  approver_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approver_email text,
  decision text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_deletion_approvals_request_approver_unique
  ON employee_deletion_approvals (request_id, approver_user_id);
CREATE INDEX IF NOT EXISTS employee_deletion_approvals_request_idx
  ON employee_deletion_approvals (request_id);

COMMIT;
