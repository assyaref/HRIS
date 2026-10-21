-- ============================================================================
-- 0022 — Employee retention-compatible deletion (DETACH + IDENTITY SNAPSHOTS)
-- ============================================================================
--
-- PURPOSE
--   Implements docs/employee-permanent-delete-0022-detach-design.md: allow the
--   authorized Super Administrator to permanently delete the `employees` row
--   while every PROTECTED historical record is RETAINED with its identity.
--
--   For the eleven retention-bound tables (attendance, leave, permission,
--   payroll components, payroll items, payslips, payslip documents + versions,
--   employment history):
--     1. add immutable identity snapshots (employee number + display name),
--        nullable, backfilled from the current employee record;
--     2. widen employee_id to nullable;
--     3. switch the employee FK from ON DELETE RESTRICT to ON DELETE SET NULL
--        so deleting the employee atomically DETACHES (never deletes) the
--        retained row;
--     4. add <table>_retained_identity_check:
--        employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL
--        — a retained row can never be anonymous by accident, and the design
--        fails closed if an old application deletes an employee before this
--        change is deployed (post-migration rows without a snapshot violate
--        the CHECK and the DELETE rolls back).
--
--   `payroll_items` already carries NOT NULL creation-time snapshots (no new
--   columns). `payslips` already carries employee_number_snapshot (PDF
--   password contract) — only employee_name_snapshot is added. Creation-time
--   snapshots are NEVER overwritten: every backfill fills NULLs only.
--
--   DELETABLE tables (documents, face ID, project assignments, master data,
--   announcement recipients) KEEP ON DELETE RESTRICT + NOT NULL — they are
--   removed explicitly by the delete plan, and the RESTRICT backstop keeps
--   refusing a racing insert (23503 -> rollback).
--
-- !!! DO NOT APPLY WITHOUT SIGN-OFF !!!
--   Requires DBA + Legal/Compliance + DPO review
--   (docs/employee-permanent-delete-0022-detach-design.md §7) and a verified
--   backup. Apply to the staging restore first, then the approved window.
--
-- DELIBERATELY NOT JOURNALED
--   Follows the out-of-band pattern of 0019/0020/0021: the Drizzle lineage in
--   this repository is inconsistent (unjournaled files, snapshots stop at
--   0014) and must be repaired by the approved reconciliation change. Do not
--   run `drizzle-kit generate`/`migrate` from the worktree.
--
-- SAFETY
--   - One transaction. Additive columns are nullable; no column is dropped,
--     no row is deleted, no production value is overwritten.
--   - Idempotent and lifecycle-independent: every schema change is guarded
--     (IF EXISTS / IF NOT EXISTS / IS NULL), and the closing verification
--     validates schema + snapshot invariants that hold BEFORE and AFTER the
--     first permanent deletion. A legitimate detached row (employee_id IS NULL
--     with a populated identity snapshot) does not fail a re-run. Static SQL
--     review only — runtime idempotency is UNPROVEN until the staging
--     rehearsal records it (docs/employee-permanent-delete-0022-staging-runbook.md §2/§5.6).
--   - Rollback notes: docs/employee-permanent-delete-0022-detach-design.md §6.1.
--
-- LOCKING (DBA note)
--   ALTER TABLE takes a short ACCESS EXCLUSIVE lock per table; adding the FK
--   validates existing rows (one scan per table). Run inside the approved
--   low-traffic window.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared block: snapshot columns + backfill + nullability + FK + CHECK
-- ---------------------------------------------------------------------------
-- The per-table sections below are written out explicitly (no dynamic SQL for
-- the schema changes) so the migration reads as exactly what it does.

-- ============================ attendance_records ===========================
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS employee_number_snapshot text;
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;

UPDATE attendance_records t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE attendance_records
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_employee_id_employees_id_fk;
ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_records_retained_identity_check'
      AND conrelid = 'attendance_records'::regclass
  ) THEN
    ALTER TABLE attendance_records
      ADD CONSTRAINT attendance_records_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ============================ attendance_events ===========================
ALTER TABLE attendance_events
  ADD COLUMN IF NOT EXISTS employee_number_snapshot text;
ALTER TABLE attendance_events
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;

UPDATE attendance_events t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE attendance_events
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE attendance_events
  DROP CONSTRAINT IF EXISTS attendance_events_employee_id_employees_id_fk;
ALTER TABLE attendance_events
  ADD CONSTRAINT attendance_events_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_events_retained_identity_check'
      AND conrelid = 'attendance_events'::regclass
  ) THEN
    ALTER TABLE attendance_events
      ADD CONSTRAINT attendance_events_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ============================ leave_balances ===============================
ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS employee_number_snapshot text;
ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;

UPDATE leave_balances t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE leave_balances
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE leave_balances
  DROP CONSTRAINT IF EXISTS leave_balances_employee_id_employees_id_fk;
ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leave_balances_retained_identity_check'
      AND conrelid = 'leave_balances'::regclass
  ) THEN
    ALTER TABLE leave_balances
      ADD CONSTRAINT leave_balances_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ============================ leave_requests ==============================
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS employee_number_snapshot text;
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;

UPDATE leave_requests t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE leave_requests
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_employee_id_employees_id_fk;
ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leave_requests_retained_identity_check'
      AND conrelid = 'leave_requests'::regclass
  ) THEN
    ALTER TABLE leave_requests
      ADD CONSTRAINT leave_requests_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ============================ permission_requests =========================
ALTER TABLE permission_requests
  ADD COLUMN IF NOT EXISTS employee_number_snapshot text;
ALTER TABLE permission_requests
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;

UPDATE permission_requests t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE permission_requests
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE permission_requests
  DROP CONSTRAINT IF EXISTS permission_requests_employee_id_employees_id_fk;
ALTER TABLE permission_requests
  ADD CONSTRAINT permission_requests_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'permission_requests_retained_identity_check'
      AND conrelid = 'permission_requests'::regclass
  ) THEN
    ALTER TABLE permission_requests
      ADD CONSTRAINT permission_requests_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ============================ employee_payroll_components =================
ALTER TABLE employee_payroll_components
  ADD COLUMN IF NOT EXISTS employee_number_snapshot text;
ALTER TABLE employee_payroll_components
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;

UPDATE employee_payroll_components t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE employee_payroll_components
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE employee_payroll_components
  DROP CONSTRAINT IF EXISTS employee_payroll_components_employee_id_employees_id_fk;
ALTER TABLE employee_payroll_components
  ADD CONSTRAINT employee_payroll_components_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employee_payroll_components_retained_identity_check'
      AND conrelid = 'employee_payroll_components'::regclass
  ) THEN
    ALTER TABLE employee_payroll_components
      ADD CONSTRAINT employee_payroll_components_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ============================ payroll_items ===============================
-- Creation-time snapshots already exist and are NOT NULL: no new columns,
-- the backfill only guards against unexpected NULLs, and the CHECK is
-- trivially satisfied. Only nullability + the FK action change.

UPDATE payroll_items t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE payroll_items
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE payroll_items
  DROP CONSTRAINT IF EXISTS payroll_items_employee_id_employees_id_fk;
ALTER TABLE payroll_items
  ADD CONSTRAINT payroll_items_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_items_retained_identity_check'
      AND conrelid = 'payroll_items'::regclass
  ) THEN
    ALTER TABLE payroll_items
      ADD CONSTRAINT payroll_items_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ============================ payslips ====================================
-- employee_number_snapshot (PDF password contract) and birth_date_snapshot
-- already exist; only the display-name snapshot is added. The existing
-- snapshots are never overwritten.

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;

UPDATE payslips t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE payslips
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE payslips
  DROP CONSTRAINT IF EXISTS payslips_employee_id_employees_id_fk;
ALTER TABLE payslips
  ADD CONSTRAINT payslips_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payslips_retained_identity_check'
      AND conrelid = 'payslips'::regclass
  ) THEN
    ALTER TABLE payslips
      ADD CONSTRAINT payslips_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ============================ payslip_documents ==========================
ALTER TABLE payslip_documents
  ADD COLUMN IF NOT EXISTS employee_number_snapshot text;
ALTER TABLE payslip_documents
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;

UPDATE payslip_documents t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE payslip_documents
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE payslip_documents
  DROP CONSTRAINT IF EXISTS payslip_documents_employee_id_employees_id_fk;
ALTER TABLE payslip_documents
  ADD CONSTRAINT payslip_documents_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payslip_documents_retained_identity_check'
      AND conrelid = 'payslip_documents'::regclass
  ) THEN
    ALTER TABLE payslip_documents
      ADD CONSTRAINT payslip_documents_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ============================ payslip_document_versions ===================
ALTER TABLE payslip_document_versions
  ADD COLUMN IF NOT EXISTS employee_number_snapshot text;
ALTER TABLE payslip_document_versions
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;

UPDATE payslip_document_versions t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE payslip_document_versions
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE payslip_document_versions
  DROP CONSTRAINT IF EXISTS payslip_document_versions_employee_id_employees_id_fk;
ALTER TABLE payslip_document_versions
  ADD CONSTRAINT payslip_document_versions_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payslip_document_versions_retained_identity_check'
      AND conrelid = 'payslip_document_versions'::regclass
  ) THEN
    ALTER TABLE payslip_document_versions
      ADD CONSTRAINT payslip_document_versions_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ============================ employee_employment_history =================
ALTER TABLE employee_employment_history
  ADD COLUMN IF NOT EXISTS employee_number_snapshot text;
ALTER TABLE employee_employment_history
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;

UPDATE employee_employment_history t
SET employee_number_snapshot = COALESCE(t.employee_number_snapshot, e.employee_number),
    employee_name_snapshot   = COALESCE(t.employee_name_snapshot,   e.first_name || ' ' || e.last_name)
FROM employees e
WHERE t.employee_id = e.id
  AND (t.employee_number_snapshot IS NULL OR t.employee_name_snapshot IS NULL);

ALTER TABLE employee_employment_history
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE employee_employment_history
  DROP CONSTRAINT IF EXISTS employee_employment_history_employee_id_employees_id_fk;
ALTER TABLE employee_employment_history
  ADD CONSTRAINT employee_employment_history_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employee_employment_history_retained_identity_check'
      AND conrelid = 'employee_employment_history'::regclass
  ) THEN
    ALTER TABLE employee_employment_history
      ADD CONSTRAINT employee_employment_history_retained_identity_check
      CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Verification (lifecycle-independent schema + snapshot invariants)
-- ---------------------------------------------------------------------------
-- The whole migration is one transaction, so any statement that fails here (or
-- above) aborts and rolls back every change.
--
-- These checks deliberately NEVER depend on how many employees have been
-- permanently deleted. After the first deletion, retained rows legitimately
-- have `employee_id IS NULL` with a populated identity snapshot; a re-run used
-- to recover a partial/failed attempt (or a routine re-application) must still
-- succeed. The checked invariants are:
--   * a row still bound to a live employee MUST carry its number snapshot
--     (backfill completeness);
--   * a detached (retained) row MUST NOT be anonymous
--     (`employee_id IS NULL AND employee_number_snapshot IS NULL`) — this is
--     also enforced by every `<table>_retained_identity_check`;
--   * every PROTECTED `employee_id` is nullable, its employee FK is
--     `ON DELETE SET NULL` (confdeltype 'n', never 'c' CASCADE) and its
--     retained-identity CHECK exists.
-- The old `count(*) WHERE employee_id IS NULL = 0` assertion was removed: it
-- was only valid before any deletion and falsely made the migration one-time.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  protected_tables text[] := ARRAY[
    'attendance_records',
    'attendance_events',
    'leave_balances',
    'leave_requests',
    'permission_requests',
    'employee_payroll_components',
    'payroll_items',
    'payslips',
    'payslip_documents',
    'payslip_document_versions',
    'employee_employment_history'
  ];
  tbl              text;
  live_unfilled    bigint;
  anonymous        bigint;
  employee_notnull boolean;
  fk_action        text;
  check_present    bigint;
BEGIN
  FOREACH tbl IN ARRAY protected_tables LOOP
    -- 1. Backfill completeness: a live reference must have an identity snapshot.
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE employee_id IS NOT NULL AND employee_number_snapshot IS NULL',
      tbl
    ) INTO live_unfilled;
    IF live_unfilled > 0 THEN
      RAISE EXCEPTION '%: % live rows are missing employee_number_snapshot (backfill incomplete)',
        tbl, live_unfilled;
    END IF;

    -- 2. Snapshot integrity: a retained row must never be anonymous.
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE employee_id IS NULL AND employee_number_snapshot IS NULL',
      tbl
    ) INTO anonymous;
    IF anonymous > 0 THEN
      RAISE EXCEPTION '%: % anonymous retained rows (employee_id and snapshot both NULL)',
        tbl, anonymous;
    END IF;

    -- 3. Schema invariant: employee_id must be nullable.
    SELECT a.attnotnull INTO employee_notnull
    FROM pg_attribute a
    WHERE a.attrelid = tbl::regclass
      AND a.attname = 'employee_id'
      AND a.attnum > 0
      AND NOT a.attisdropped;
    IF employee_notnull IS DISTINCT FROM false THEN
      RAISE EXCEPTION '%: employee_id is still NOT NULL (or missing)', tbl;
    END IF;

    -- 4. Schema invariant: the employee FK must be ON DELETE SET NULL ('n').
    SELECT c.confdeltype::text INTO fk_action
    FROM pg_constraint c
    WHERE c.conrelid = tbl::regclass
      AND c.conname = tbl || '_employee_id_employees_id_fk'
      AND c.contype = 'f';
    IF fk_action IS DISTINCT FROM 'n' THEN
      RAISE EXCEPTION '%: employee FK is not ON DELETE SET NULL (confdeltype=%)',
        tbl, COALESCE(fk_action, 'missing');
    END IF;

    -- 5. Schema invariant: the retained-identity CHECK must exist.
    SELECT count(*) INTO check_present
    FROM pg_constraint
    WHERE conrelid = tbl::regclass
      AND conname = tbl || '_retained_identity_check'
      AND contype = 'c';
    IF check_present = 0 THEN
      RAISE EXCEPTION '%: retained_identity_check constraint is missing', tbl;
    END IF;
  END LOOP;
END
$$;

COMMIT;
