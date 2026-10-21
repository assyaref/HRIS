-- ============================================================================
-- Employee deletion control-plane regression (migration 0021 integration)
-- ============================================================================
-- Run ONLY against a disposable database created from a staging/production
-- backup, AFTER applying db/migrations/0021_employee_deletion_controls.sql and
-- 0022_employee_retention_detach.sql. The script aborts unless the database
-- name starts with an approved disposable prefix.
--
-- It proves, at the database level:
--   1. released holds and terminal requests detach with identity snapshots;
--   2. an ACTIVE hold still blocks the employee DELETE (CHECK -> rollback);
--   3. PENDING and APPROVED requests still block the employee DELETE;
--   4. after release/rejection, the same delete completes.
--
-- It creates synthetic rows and does not clean them up; drop the database
-- afterwards. It never touches a production database (guard below).
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() !~ '^hris_(control_fk|force_delete_rehearsal)_[0-9TZ]+$' THEN
    RAISE EXCEPTION
      'Refusing to run destructive control-FK regression on database % (not a disposable rehearsal database)',
      current_database();
  END IF;
END $$;

\pset pager off

-- Catalog invariants -------------------------------------------------------
DO $$
DECLARE
  v_hold_del "char";
  v_request_del "char";
  v_approval_del "char";
  v_checks int;
BEGIN
  SELECT confdeltype INTO v_hold_del
  FROM pg_constraint
  WHERE conname = 'employee_legal_holds_employee_id_fkey';
  SELECT confdeltype INTO v_request_del
  FROM pg_constraint
  WHERE conname = 'employee_deletion_requests_employee_id_fkey';
  SELECT confdeltype INTO v_approval_del
  FROM pg_constraint
  WHERE conname = 'employee_deletion_approvals_request_id_fkey';

  IF v_hold_del <> 'n' THEN
    RAISE EXCEPTION 'legal hold employee FK is not SET NULL: %', v_hold_del;
  END IF;
  IF v_request_del <> 'n' THEN
    RAISE EXCEPTION 'deletion request employee FK is not SET NULL: %', v_request_del;
  END IF;
  IF v_approval_del <> 'r' THEN
    RAISE EXCEPTION 'approval request FK must stay RESTRICT: %', v_approval_del;
  END IF;

  SELECT count(*) INTO v_checks
  FROM pg_constraint
  WHERE conname IN (
    'employee_legal_holds_active_requires_employee',
    'employee_deletion_requests_active_requires_employee'
  )
  AND contype = 'c';
  IF v_checks <> 2 THEN
    RAISE EXCEPTION 'expected 2 live-control CHECKs, found %', v_checks;
  END IF;
  RAISE NOTICE 'PASS catalog: SET NULL for released/terminal history, RESTRICT approvals, 2 live-control CHECKs';
END $$;

-- Scenario 1: released hold + rejected request detach with identity ---------
DO $$
DECLARE
  v_org uuid;
  v_emp uuid;
  v_hold uuid;
  v_request uuid;
  v_hold_emp uuid;
  v_hold_number text;
  v_hold_name text;
  v_request_emp uuid;
BEGIN
  INSERT INTO organizations (name, code)
  VALUES ('Control FK Regression Org A', 'CTRL-FK-A-' || substr(gen_random_uuid()::text, 1, 8))
  RETURNING id INTO v_org;

  INSERT INTO employees (organization_id, employee_number, first_name, last_name)
  VALUES (v_org, 'CTRL-A-' || substr(gen_random_uuid()::text, 1, 8), 'Synthetic', 'ReleasedHold')
  RETURNING id INTO v_emp;

  INSERT INTO employee_legal_holds (
    organization_id, employee_id, employee_number_snapshot, employee_name_snapshot,
    reason, active, released_at, release_reason
  ) VALUES (
    v_org, v_emp, 'CTRL-HOLD-SNAPSHOT', 'Synthetic ReleasedHold',
    'synthetic released hold', false, now(), 'synthetic release'
  ) RETURNING id INTO v_hold;

  INSERT INTO employee_deletion_requests (
    organization_id, employee_id, employee_number, employee_name,
    reason, tier, status, required_approvals
  ) VALUES (
    v_org, v_emp, 'CTRL-REQ-SNAPSHOT', 'Synthetic ReleasedHold',
    'synthetic terminal request', 'direct', 'rejected', 1
  ) RETURNING id INTO v_request;

  DELETE FROM employees WHERE id = v_emp;

  SELECT employee_id, employee_number_snapshot, employee_name_snapshot
  INTO v_hold_emp, v_hold_number, v_hold_name
  FROM employee_legal_holds WHERE id = v_hold;
  SELECT employee_id INTO v_request_emp
  FROM employee_deletion_requests WHERE id = v_request;

  IF v_hold_emp IS NOT NULL THEN
    RAISE EXCEPTION 'released hold still references deleted employee';
  END IF;
  IF v_hold_number <> 'CTRL-HOLD-SNAPSHOT' OR v_hold_name <> 'Synthetic ReleasedHold' THEN
    RAISE EXCEPTION 'released hold lost its identity snapshot';
  END IF;
  IF v_request_emp IS NOT NULL THEN
    RAISE EXCEPTION 'terminal request still references deleted employee';
  END IF;
  RAISE NOTICE 'PASS scenario 1: released hold and terminal request detached with snapshots';
END $$;

-- Scenario 2: active hold blocks, release unblocks --------------------------
DO $$
DECLARE
  v_org uuid;
  v_emp uuid;
  v_hold uuid;
  v_constraint text;
  v_remaining int;
BEGIN
  INSERT INTO organizations (name, code)
  VALUES ('Control FK Regression Org B', 'CTRL-FK-B-' || substr(gen_random_uuid()::text, 1, 8))
  RETURNING id INTO v_org;

  INSERT INTO employees (organization_id, employee_number, first_name, last_name)
  VALUES (v_org, 'CTRL-B-' || substr(gen_random_uuid()::text, 1, 8), 'Synthetic', 'ActiveHold')
  RETURNING id INTO v_emp;

  INSERT INTO employee_legal_holds (
    organization_id, employee_id, employee_number_snapshot, employee_name_snapshot,
    reason, active
  ) VALUES (
    v_org, v_emp, 'CTRL-ACTIVE-HOLD', 'Synthetic ActiveHold',
    'synthetic active hold', true
  ) RETURNING id INTO v_hold;

  BEGIN
    DELETE FROM employees WHERE id = v_emp;
    RAISE EXCEPTION 'active legal hold did NOT block the delete';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'employee_legal_holds_active_requires_employee' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_remaining FROM employees WHERE id = v_emp;
  IF v_remaining <> 1 THEN
    RAISE EXCEPTION 'employee was deleted despite active hold';
  END IF;

  UPDATE employee_legal_holds
  SET active = false, released_at = now(), release_reason = 'synthetic release'
  WHERE id = v_hold;

  DELETE FROM employees WHERE id = v_emp;

  SELECT count(*) INTO v_remaining FROM employees WHERE id = v_emp;
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'released hold did not allow delete';
  END IF;
  RAISE NOTICE 'PASS scenario 2: active hold blocked at the database; released hold allowed detach';
END $$;

-- Scenario 3: pending/approved request blocks, rejection unblocks ----------
DO $$
DECLARE
  v_org uuid;
  v_emp uuid;
  v_request uuid;
  v_constraint text;
  v_remaining int;
  v_request_emp uuid;
BEGIN
  INSERT INTO organizations (name, code)
  VALUES ('Control FK Regression Org C', 'CTRL-FK-C-' || substr(gen_random_uuid()::text, 1, 8))
  RETURNING id INTO v_org;

  INSERT INTO employees (organization_id, employee_number, first_name, last_name)
  VALUES (v_org, 'CTRL-C-' || substr(gen_random_uuid()::text, 1, 8), 'Synthetic', 'PendingRequest')
  RETURNING id INTO v_emp;

  INSERT INTO employee_deletion_requests (
    organization_id, employee_id, employee_number, employee_name,
    reason, tier, status, required_approvals
  ) VALUES (
    v_org, v_emp, 'CTRL-PENDING-REQ', 'Synthetic PendingRequest',
    'synthetic pending request', 'special_approval', 'pending', 2
  ) RETURNING id INTO v_request;

  BEGIN
    DELETE FROM employees WHERE id = v_emp;
    RAISE EXCEPTION 'pending deletion request did NOT block the delete';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'employee_deletion_requests_active_requires_employee' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_remaining FROM employees WHERE id = v_emp;
  IF v_remaining <> 1 THEN
    RAISE EXCEPTION 'employee was deleted despite pending request';
  END IF;

  UPDATE employee_deletion_requests
  SET status = 'rejected', decided_at = now(), decision_reason = 'synthetic rejection'
  WHERE id = v_request;

  DELETE FROM employees WHERE id = v_emp;

  SELECT employee_id INTO v_request_emp
  FROM employee_deletion_requests WHERE id = v_request;
  IF v_request_emp IS NOT NULL THEN
    RAISE EXCEPTION 'rejected request still references deleted employee';
  END IF;
  RAISE NOTICE 'PASS scenario 3: pending request blocked at the database; rejected request detached';
END $$;

-- Scenario 4: approved request also blocks ---------------------------------
DO $$
DECLARE
  v_org uuid;
  v_emp uuid;
  v_request uuid;
  v_constraint text;
  v_remaining int;
BEGIN
  INSERT INTO organizations (name, code)
  VALUES ('Control FK Regression Org D', 'CTRL-FK-D-' || substr(gen_random_uuid()::text, 1, 8))
  RETURNING id INTO v_org;

  INSERT INTO employees (organization_id, employee_number, first_name, last_name)
  VALUES (v_org, 'CTRL-D-' || substr(gen_random_uuid()::text, 1, 8), 'Synthetic', 'ApprovedRequest')
  RETURNING id INTO v_emp;

  INSERT INTO employee_deletion_requests (
    organization_id, employee_id, employee_number, employee_name,
    reason, tier, status, required_approvals, decided_at
  ) VALUES (
    v_org, v_emp, 'CTRL-APPROVED-REQ', 'Synthetic ApprovedRequest',
    'synthetic approved request', 'special_approval', 'approved', 2, now()
  ) RETURNING id INTO v_request;

  BEGIN
    DELETE FROM employees WHERE id = v_emp;
    RAISE EXCEPTION 'approved deletion request did NOT block the delete';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'employee_deletion_requests_active_requires_employee' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_remaining FROM employees WHERE id = v_emp;
  IF v_remaining <> 1 THEN
    RAISE EXCEPTION 'employee was deleted despite approved request';
  END IF;
  RAISE NOTICE 'PASS scenario 4: approved request blocked at the database';
END $$;

SELECT 'CONTROL_FK_REGRESSION_PASS' AS result;
