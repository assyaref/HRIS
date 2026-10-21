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
--   This migration adds RESTRICT foreign keys that BLOCK employee deletion.
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
--   - Every employee/request reference is ON DELETE RESTRICT, consistent with
--     migration 0017, so a legal hold physically blocks ANY employee DELETE.
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
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
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
  updated_at timestamptz NOT NULL DEFAULT now()
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
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
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
  updated_at timestamptz NOT NULL DEFAULT now()
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
