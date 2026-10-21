-- ============================================================================
-- 0022 — Employee deletion scope: RETAIN time/employment history, DELETE payroll
-- ============================================================================
--
-- REVISED SCOPE (owner-approved 2026-10-21)
--   This migration previously implemented docs/employee-permanent-delete-0022-
--   detach-design.md, which retained the eleven "protected" tables including
--   payroll and payslips. The project owner has since explicitly approved a
--   WIDER permanent-deletion scope: payroll history (payroll component
--   assignments, payroll items, payslips and the payslip document/version
--   chain) is DELETED with the employee.
--
--   This rewrite keeps the retention detach for the SIX time/employment-history
--   tables and moves the FIVE payroll/payslip tables back to
--   `ON DELETE RESTRICT` + NOT NULL, removing the now-unused identity snapshot
--   columns and their CHECK constraints. The application's permanent-delete
--   plan removes payroll rows explicitly (children first), and the payroll
--   RESTRICT foreign keys make a missed row fail loudly.
--
--   RETAINED + DETACHED (ON DELETE SET NULL + identity snapshots):
--     attendance_records, attendance_events, leave_balances, leave_requests,
--     permission_requests, employee_employment_history
--   DELETED WITH THE EMPLOYEE (ON DELETE RESTRICT + NOT NULL):
--     employee_payroll_components, payroll_items, payslips, payslip_documents,
--     payslip_document_versions
--
--   For each RETAINED table:
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
--        change is deployed.
--
--   Creation-time snapshots on DELETED payroll tables are NOT touched:
--   `payroll_items.employee_number_snapshot` / `employee_name_snapshot` remain
--   NOT NULL (historical payslip reporting data) and `payslips.
--   employee_number_snapshot` / `birth_date_snapshot` remain (PDF password
--   contract). Only the retention-only columns added by the earlier 0022 draft
--   are removed here.
--
-- !!! DO NOT APPLY WITHOUT SIGN-OFF !!!
--   Requires DBA + Legal/Compliance + DPO review of the WIDENED deletion scope
--   (docs/employee-deletion-payroll-scope-decision-record.md) and a verified
--   backup. Apply to the staging restore first, then the approved window.
--
-- DELIBERATELY NOT JOURNALED
--   Follows the out-of-band pattern of 0019/0020/0021: the Drizzle lineage in
--   this repository is inconsistent and must be repaired by the approved
--   reconciliation change. Do not run `drizzle-kit generate`/`migrate`.
--
-- SAFETY
--   - One transaction. Additive columns are nullable; no row is deleted by the
--     schema change itself, no production value is overwritten. The DROP
--     statements only remove retention-only columns/CHECKs introduced by the
--     (unapplied) earlier 0022 draft; on a fresh database they are no-ops.
--   - Idempotent: every schema change is guarded (IF EXISTS / IF NOT EXISTS /
--     IS NULL), and the closing verification validates schema invariants that
--     hold before and after the first permanent deletion.
--   - Rollback notes: docs/employee-deletion-payroll-scope-decision-record.md.
--
-- LOCKING (DBA note)
--   ALTER TABLE takes a short ACCESS EXCLUSIVE lock per table; the FK change
--   validates existing rows (one scan per retained table). Run inside the
--   approved low-traffic window.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- RETAINED tables: snapshot columns + backfill + nullability + SET NULL + CHECK
-- ---------------------------------------------------------------------------
-- The per-table sections are written out explicitly (no dynamic SQL for the
-- schema changes) so the migration reads as exactly what it does.

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
-- DELETED payroll/payslip tables: RESTORE RESTRICT + NOT NULL, drop retention
-- ---------------------------------------------------------------------------
-- These tables are removed explicitly by the permanent-delete plan. The
-- RESTRICT foreign key is the backstop: if the plan misses a row the employee
-- DELETE fails (23503) and the whole transaction rolls back.

-- ============================ employee_payroll_components =================
-- Retention-only columns/CHECK removed (introduced by the unapplied earlier draft).
ALTER TABLE employee_payroll_components
  DROP CONSTRAINT IF EXISTS employee_payroll_components_retained_identity_check;
ALTER TABLE employee_payroll_components
  DROP COLUMN IF EXISTS employee_number_snapshot;
ALTER TABLE employee_payroll_components
  DROP COLUMN IF EXISTS employee_name_snapshot;

ALTER TABLE employee_payroll_components
  DROP CONSTRAINT IF EXISTS employee_payroll_components_employee_id_employees_id_fk;
ALTER TABLE employee_payroll_components
  ADD CONSTRAINT employee_payroll_components_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE employee_payroll_components
  ALTER COLUMN employee_id SET NOT NULL;

-- ============================ payroll_items ===============================
-- Creation-time snapshots stay NOT NULL. Only the retention-only CHECK is
-- removed and the FK action restored to RESTRICT.
ALTER TABLE payroll_items
  DROP CONSTRAINT IF EXISTS payroll_items_retained_identity_check;

ALTER TABLE payroll_items
  DROP CONSTRAINT IF EXISTS payroll_items_employee_id_employees_id_fk;
ALTER TABLE payroll_items
  ADD CONSTRAINT payroll_items_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE payroll_items
  ALTER COLUMN employee_id SET NOT NULL;

-- ============================ payslips ====================================
-- employee_number_snapshot + birth_date_snapshot (PDF password contract) stay.
-- Only the retention-only name snapshot and CHECK are removed.
ALTER TABLE payslips
  DROP CONSTRAINT IF EXISTS payslips_retained_identity_check;
ALTER TABLE payslips
  DROP COLUMN IF EXISTS employee_name_snapshot;

ALTER TABLE payslips
  DROP CONSTRAINT IF EXISTS payslips_employee_id_employees_id_fk;
ALTER TABLE payslips
  ADD CONSTRAINT payslips_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE payslips
  ALTER COLUMN employee_id SET NOT NULL;

-- ============================ payslip_documents ==========================
ALTER TABLE payslip_documents
  DROP CONSTRAINT IF EXISTS payslip_documents_retained_identity_check;
ALTER TABLE payslip_documents
  DROP COLUMN IF EXISTS employee_number_snapshot;
ALTER TABLE payslip_documents
  DROP COLUMN IF EXISTS employee_name_snapshot;

ALTER TABLE payslip_documents
  DROP CONSTRAINT IF EXISTS payslip_documents_employee_id_employees_id_fk;
ALTER TABLE payslip_documents
  ADD CONSTRAINT payslip_documents_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE payslip_documents
  ALTER COLUMN employee_id SET NOT NULL;

-- ============================ payslip_document_versions ===================
ALTER TABLE payslip_document_versions
  DROP CONSTRAINT IF EXISTS payslip_document_versions_retained_identity_check;
ALTER TABLE payslip_document_versions
  DROP COLUMN IF EXISTS employee_number_snapshot;
ALTER TABLE payslip_document_versions
  DROP COLUMN IF EXISTS employee_name_snapshot;

ALTER TABLE payslip_document_versions
  DROP CONSTRAINT IF EXISTS payslip_document_versions_employee_id_employees_id_fk;
ALTER TABLE payslip_document_versions
  ADD CONSTRAINT payslip_document_versions_employee_id_employees_id_fk
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE payslip_document_versions
  ALTER COLUMN employee_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Verification (lifecycle-independent schema + snapshot invariants)
-- ---------------------------------------------------------------------------
-- One transaction: any statement that fails here (or above) aborts and rolls
-- back every change. The retained invariants hold BEFORE and AFTER the first
-- permanent deletion; the payroll invariants are the deletion backstop.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  retained_tables text[] := ARRAY[
    'attendance_records',
    'attendance_events',
    'leave_balances',
    'leave_requests',
    'permission_requests',
    'employee_employment_history'
  ];
  deleted_tables text[] := ARRAY[
    'employee_payroll_components',
    'payroll_items',
    'payslips',
    'payslip_documents',
    'payslip_document_versions'
  ];
  tbl              text;
  live_unfilled    bigint;
  anonymous        bigint;
  employee_notnull boolean;
  fk_action        text;
  check_present    bigint;
BEGIN
  -- RETAINED tables: nullable + SET NULL + retained-identity CHECK.
  FOREACH tbl IN ARRAY retained_tables LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE employee_id IS NOT NULL AND employee_number_snapshot IS NULL',
      tbl
    ) INTO live_unfilled;
    IF live_unfilled > 0 THEN
      RAISE EXCEPTION '%: % live rows are missing employee_number_snapshot (backfill incomplete)',
        tbl, live_unfilled;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM %I WHERE employee_id IS NULL AND employee_number_snapshot IS NULL',
      tbl
    ) INTO anonymous;
    IF anonymous > 0 THEN
      RAISE EXCEPTION '%: % anonymous retained rows (employee_id and snapshot both NULL)',
        tbl, anonymous;
    END IF;

    SELECT a.attnotnull INTO employee_notnull
    FROM pg_attribute a
    WHERE a.attrelid = tbl::regclass
      AND a.attname = 'employee_id'
      AND a.attnum > 0
      AND NOT a.attisdropped;
    IF employee_notnull IS DISTINCT FROM false THEN
      RAISE EXCEPTION '%: employee_id is still NOT NULL (or missing)', tbl;
    END IF;

    SELECT c.confdeltype::text INTO fk_action
    FROM pg_constraint c
    WHERE c.conrelid = tbl::regclass
      AND c.conname = tbl || '_employee_id_employees_id_fk'
      AND c.contype = 'f';
    IF fk_action IS DISTINCT FROM 'n' THEN
      RAISE EXCEPTION '%: employee FK is not ON DELETE SET NULL (confdeltype=%)',
        tbl, COALESCE(fk_action, 'missing');
    END IF;

    SELECT count(*) INTO check_present
    FROM pg_constraint
    WHERE conrelid = tbl::regclass
      AND conname = tbl || '_retained_identity_check'
      AND contype = 'c';
    IF check_present = 0 THEN
      RAISE EXCEPTION '%: retained_identity_check constraint is missing', tbl;
    END IF;
  END LOOP;

  -- DELETED payroll tables: NOT NULL + RESTRICT, and no retention CHECK.
  FOREACH tbl IN ARRAY deleted_tables LOOP
    SELECT a.attnotnull INTO employee_notnull
    FROM pg_attribute a
    WHERE a.attrelid = tbl::regclass
      AND a.attname = 'employee_id'
      AND a.attnum > 0
      AND NOT a.attisdropped;
    IF employee_notnull IS DISTINCT FROM true THEN
      RAISE EXCEPTION '%: employee_id must be NOT NULL (or missing)', tbl;
    END IF;

    SELECT c.confdeltype::text INTO fk_action
    FROM pg_constraint c
    WHERE c.conrelid = tbl::regclass
      AND c.conname = tbl || '_employee_id_employees_id_fk'
      AND c.contype = 'f';
    IF fk_action IS DISTINCT FROM 'r' THEN
      RAISE EXCEPTION '%: employee FK is not ON DELETE RESTRICT (confdeltype=%)',
        tbl, COALESCE(fk_action, 'missing');
    END IF;

    SELECT count(*) INTO check_present
    FROM pg_constraint
    WHERE conrelid = tbl::regclass
      AND conname = tbl || '_retained_identity_check'
      AND contype = 'c';
    IF check_present > 0 THEN
      RAISE EXCEPTION '%: retention-only retained_identity_check must not exist on a deleted table', tbl;
    END IF;
  END LOOP;
END
$$;

COMMIT;
