# Approved Staging Rehearsal — Checklist, Fixtures, Invariants & Evidence

**Document type:** REHEARSAL CHECKLIST (prepared, **not yet executable**).
**Status:** **BLOCKED — NOT AUTHORIZED.** Part A (`A1`–`A14`) is `0/14`
recorded and staging gates `G1-S`–`G5-S` are `BLOCKED`
(`docs/employee-deletion-approval-matrix.md`). This checklist may be executed
**only** inside an opened change record, on an isolated staging environment,
with `A1`/`A2` signed.
**Prepared:** 2026-10-21 (UTC) · **Repo:** `/opt/hris`, local `main`, HEAD
`831027b` (not pushed).
**Artifacts under rehearsal:** `0021` = `585dd2d7…c452`,
`0022` = `724db82d…65c`.

Related: `docs/employee-permanent-delete-0022-staging-runbook.md` §5,
`docs/employee-deletion-0021-staging-runbook.md` §3,
`docs/employee-permanent-delete-0022-rehearsal-evidence-20261021.md`.

> The 2026-10-21 operator rehearsal is **evidence only, not a gate pass**.
> This checklist does not convert it into one.

---

## 1. Entry gate (all must be true before step 0)

| Gate | Requirement | Current |
| --- | --- | --- |
| A1 | DBA authorization signed | **BLOCKED** |
| A2 | Application Lead authorization signed | **BLOCKED** |
| A3/H3 | Change record: ID, UTC window, rollback owner, incident commander | **BLOCKED** |
| A4/G5-S | Staging isolation attested (separate cluster/roles/secrets/storage; no production route) | **BLOCKED** |
| A5/F1–F6 | Pre-apply backup + restore-tested into a disposable DB | **BLOCKED** |
| A6/B-14/G4 | In-rehearsal DBA checksum re-verification | **BLOCKED** |
| A7/B-05 | Lineage assessment accepted; safe `when` known | **BLOCKED** |
| A8/G1/G2 | Build pinned; deployment order fixed (migration first) | **BLOCKED** |
| A9/A10/A11 | Rollback, historical-reporting and evidence/STOP plans accepted | **BLOCKED** |
| A12/B-08 | Staging guard attested for the shell | **BLOCKED** |
| A13/B-13 | Synthetic-data / no-production-PII attestation | **BLOCKED** |
| A14/B-09/G3 | Control plane disabled, evidenced from config **and** tests | **BLOCKED** |

**If any row is still BLOCKED: STOP. Do not run step 0.**

---

## 2. Staging guard (mandatory for every modifying command)

```sh
# STAGING GUARD — evaluate in the same shell that runs the commands
export HRIS_ENV=staging
export STAGING_DATABASE_URL="postgresql:///hris_staging?host=/var/run/postgresql"
unset DATABASE_URL
test "$HRIS_ENV" = "staging" || { echo "REFUSE: HRIS_ENV"; exit 1; }
test -n "$STAGING_DATABASE_URL" || { echo "REFUSE: no STAGING_DATABASE_URL"; exit 1; }
test -z "${DATABASE_URL:-}" || { echo "REFUSE: DATABASE_URL must be unset"; exit 1; }
psql "$STAGING_DATABASE_URL" -Atc "select current_database()"   # must print the staging DB
```

Record the guard output (variable **values redacted**) as artifact
`EVD-GUARD-A12-<ts>-01.md`.

---

## 3. Test employee fixture (synthetic only)

The rehearsal seeds **three** synthetic employees in a **new** synthetic
organization. No production PII is used or copied.

| Item | Fixture value |
| --- | --- |
| Organization name | `REHEARSAL Force Delete <YYYYMMDD> (synthetic)` |
| Organization code | `REH-FD-<YYYYMMDD>-<random>` |
| Employee A (target) | number `EMP-RH-FD-A-<YYYYMMDD>`, name synthetic, status active |
| Employee B (control) | number `EMP-RH-FD-B-<YYYYMMDD>` — must never be touched |
| Employee C (rollback) | number `EMP-RH-FD-C-<YYYYMMDD>` — used for injected-failure rollback |
| Rows per employee | see table below (1 row per table except Face ID = 2) |
| Deletion reason | ≥ 10 characters, synthetic: `Rehearsal: synthetic employee A permanent delete` |
| Confirmation | typed employee number of A (exact match required) |
| Actor | synthetic SUPERADMIN user row (session layer simulated; authorization pinned by unit tests) |

### 3.1 Per-employee record set (15 record types)

| # | Table | A | B | C |
| --- | --- | ---: | ---: | ---: |
| 1 | `attendance_records` | 1 | 1 | 1 |
| 2 | `attendance_events` | 1 | 1 | 1 |
| 3 | `leave_balances` | 1 | 1 | 1 |
| 4 | `leave_requests` | 1 | 1 | 1 |
| 5 | `permission_requests` | 1 | 1 | 1 |
| 6 | `employee_payroll_components` | 1 | 1 | 1 |
| 7 | `payroll_items` (+ run/period) | 1 | 1 | 1 |
| 8 | `payslips` | 1 | 1 | 1 |
| 9 | `payslip_documents` | 1 | 1 | 1 |
| 10 | `payslip_document_versions` | 1 | 1 | 1 |
| 11 | `employee_employment_history` | 1 | 1 | 1 |
| 12 | `employee_documents` | 1 | 1 | 1 |
| 13 | `employee_addresses` | 1 | 1 | 1 |
| 14 | `employee_bank_accounts` | 1 | 1 | 1 |
| 15 | `employee_project_assignments` | 1 | 1 | 1 |
| 16 | `employee_face_enrollments` | 1 | 1 | 1 |
| 17 | `face_enrollment_templates` | 1 | 1 | 1 |

Expected pre-counts (per synthetic org): `employees = 3`; every protected table
`= 3`; every deletable table `= 3`; `face_enrollment_templates = 3`.

---

## 4. Backup / restore verification (before any apply)

### 4.1 Backup

```sh
TS=$(date -u +%Y%m%dT%H%M%SZ)
BK=/secure/staging-backups
sudo -n -u postgres pg_dump -Fc -d "$STAGING_DB" \
  -f "$BK/staging-db-${TS}-pre-0022.dump"
sudo -n -u postgres chmod 0600 "$BK/staging-db-${TS}-pre-0022.dump"
sha256sum "$BK/staging-db-${TS}-pre-0022.dump" | tee "$BK/staging-db-${TS}-pre-0022.dump.sha256"
```

### 4.2 Restore into a disposable database

```sh
VERIFY_DB="hris_backup_verify_${TS}"
sudo -n -u postgres createdb "$VERIFY_DB"
sudo -n -u postgres pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname="$VERIFY_DB" "$BK/staging-db-${TS}-pre-0022.dump"
sudo -n -u postgres psql -At -d "$VERIFY_DB" -c "select current_database()"
```

### 4.3 Reconciliation (must match)

```sql
select 'employees', count(*) from employees
union all select 'organizations', count(*) from organizations
union all select 'users', count(*) from users
union all select 'audit_logs', count(*) from audit_logs;
select count(*) from drizzle.__drizzle_migrations;
select max(created_at) from drizzle.__drizzle_migrations;
```

Record: dump size, SHA-256, restore exit code, target DB identity, row-count
comparison, ledger count/max. **STOP** if any count differs or restore errors.

Artifacts: `EVD-E5-1..6-<ts>-*` (manifest/checksum, verification log, restore
log, PITR posture, private-file restore, explicit yes/no).

### 4.4 Private files

- Restore into `<STAGING_PRIVATE_ROOT>` only.
- Reconcile payslip file size + SHA-256 against `payslip_documents` /
  `payslip_document_versions`.
- Produce an employee-document manifest (relative path, size, SHA-256; counts
  referenced/missing/orphan/path-escape). **Quarantine orphans — never delete.**

---

## 5. Expected database invariants

### 5.1 Before apply (BEFORE contract)

| Invariant | Expected |
| --- | --- |
| FKs referencing `employees` | **24** = 22 `r` + 2 `n` + 0 `c` |
| Protected tables `employee_id` | `NOT NULL`, FK `RESTRICT` |
| Retained-identity CHECKs | **0** |
| 0021 control tables | **absent** |
| `payroll_items` identity snapshots | `NOT NULL` (both) |
| `payslips` snapshots | `employee_number_snapshot`, `birth_date_snapshot` present |
| Deletable tables FK | `RESTRICT` (11) |
| Snapshot inventory | recorded as baseline |

### 5.2 After `0021` + `0022`

| Invariant | Expected |
| --- | --- |
| FKs referencing `employees` | **26** = 15 `n` + 11 `r` + **0 `c`** |
| Protected tables `employee_id` | nullable, `SET NULL` |
| Retained-identity CHECKs | **11** (`CHECK (employee_id IS NOT NULL OR employee_number_snapshot IS NOT NULL)`) |
| Control tables | **3**; 6 declared indexes; 2 live-control CHECKs; approval FK `RESTRICT` |
| Anonymous retained rows | **0** |
| `employee_legal_holds` / `employee_deletion_requests` `employee_id` | nullable |
| `employee_legal_holds` snapshots | `employee_number_snapshot` / `employee_name_snapshot` `NOT NULL` |
| Re-apply `0021` / `0022` | exit 0, no data change (idempotent) |

### 5.3 After the destructive rehearsal (employee A)

| Assertion | Expected |
| --- | --- |
| Employee A | **deleted** |
| Employees B and C | **intact** (all rows) |
| 11 protected tables — totals | preserved; exactly **1 detached row** for A with identity snapshots |
| Deletable tables — rows | only A's rows removed; B/C untouched |
| Payroll/payslip rows deleted | **0** (retained; detached) |
| `PAYROLL_ROWS_WITHOUT_IDENTITY_SNAPSHOT` | **0** |
| Payslip PDF password | reconstructs from snapshots (A's employee number + birth date) |
| Detached rows | still listed/searchable by snapshot identity |
| Audit | exactly one `employee.permanently_deleted` `SUCCESS` row with reason + removed/retained/snapshotted scope |
| Injected failure (employee C) | full atomic rollback (employee + snapshots + deletables); `FAILED` audit row |

### 5.4 Control-plane invariants (separate disposable DB)

`scripts/verify-employee-deletion-control-fks.sql` must return
**`CONTROL_FK_REGRESSION_PASS`**:

1. Catalog: `SET NULL` history, `RESTRICT` approvals, 2 live-control CHECKs.
2. Released hold + terminal request detach with snapshots.
3. Active hold blocks; after release, delete allowed.
4. Pending request blocks; rejected request detaches.
5. Approved request blocks.

Observed on 2026-10-21 in a disposable DB (evidence, not a gate pass):
`/tmp/opencode/migreg-20261021-20261021T035639Z/11-control-fk-regression.out`
(SHA-256 `96976f07a8b1f856caba8466df90bac0787b62de67bf1b3c08d09d785da7e1a5`).

---

## 6. Execution checklist (run only after §1 is clear)

| # | Step | Evidence artifact | PASS criterion | State |
| --- | --- | --- | --- | --- |
| 0 | Evaluate staging guard (§2) | `EVD-GUARD-A12-<ts>-01.md` | guard passes, DB identity = staging | ☐ **BLOCKED** |
| 1 | Capture environment identity + isolation | `EVD-E1-*`, `EVD-ISO-C1-*` | all 7 controls attested | ☐ **BLOCKED** |
| 2 | Capture ledger + catalog before | `EVD-E2-*`, `EVD-E3-*` | 0019–0022 classified, zero `unexplained` | ☐ **BLOCKED** |
| 3 | Backup + restore test (§4) | `EVD-E5-*` | counts match, restore exit 0 | ☐ **BLOCKED** |
| 4 | Re-verify checksums (DBA, in-session) | `EVD-A6-*` | `585dd2d7…c452`, `724db82d…65c` | ☐ **BLOCKED** |
| 5 | Capture BEFORE contract (§5.1) | `EVD-E3-4-PRE-*` | 24 FKs, 0 CHECKs, tables absent | ☐ **BLOCKED** |
| 6 | Apply `0021` then `0022` | apply logs | both exit 0 / committed | ☐ **BLOCKED** |
| 7 | Validate AFTER contract (§5.2) | `EVD-E3-4-*` | 26 FKs, 11 CHECKs, 0 anonymous, 0 CASCADE | ☐ **BLOCKED** |
| 8 | Re-apply both (idempotency) | rerun logs | exit 0, no data change | ☐ **BLOCKED** |
| 9 | Seed fixture (§3) | seed log + pre-counts | counts as specified | ☐ **BLOCKED** |
| 10 | Drive delete of A through the app helpers | harness output | A deleted, B/C intact | ☐ **BLOCKED** |
| 11 | Assert retained/detached/snapshots/audit (§5.3) | assertion log | all PASS, payroll deleted = 0 | ☐ **BLOCKED** |
| 12 | Control-plane regression (§5.4) | regression output | `CONTROL_FK_REGRESSION_PASS` | ☐ **BLOCKED** |
| 13 | Rollback test A/B/C (§5.7) | rollback fingerprints | catalog + row counts unchanged after injected failure | ☐ **BLOCKED** |
| 14 | Historical reporting (§5.8) | reporting assertions | payslip PDF password resolves; detached rows listed | ☐ **BLOCKED** |
| 15 | Hash evidence, index it, hand to reviewers | `99-evidence-sha256.txt` | reviewer ≠ collector | ☐ **BLOCKED** |
| 16 | Drop/retain disposable DBs per change record | cleanup log | no production/staging residue | ☐ **BLOCKED** |

### 6.1 Stop conditions (any one halts immediately)

- Guard fails, or the target is not provably staging.
- Any checksum differs from the reviewed anchor.
- Any employee FK has `confdeltype = 'c'` (CASCADE).
- Any detached retained row lacks its identity snapshot.
- Re-running a migration errors or changes data.
- Rollback fingerprint changes (transaction guarantee broken).
- A retained record disappears from a listing, or a payslip PDF password
  cannot be reconstructed.
- Anyone attempts `drizzle-kit generate`/`push`, edits the journal, or edits
  ledger rows.
- `DELETION_EXECUTION_ENABLED` becomes `true` or
  `RETENTION_ELIGIBLE_CATEGORIES` becomes non-empty.
- Production is reachable from the rehearsal environment.

On STOP: do not retry, do not repair inline, preserve evidence, escalate to
DBA + Application Lead.

---

## 7. Evidence collection manifest

| Artifact | File pattern | Collector | Reviewer (≠ collector) |
| --- | --- | --- | --- |
| Guard attestation | `EVD-GUARD-A12-<ts>-01.md` | operator | DBA |
| Environment identity | `EVD-E1-{1,2,3}-<ts>-01.txt` | DBA | App Lead |
| Isolation matrix | `EVD-ISO-C1-<ts>-01.md` | DBA | App Lead |
| Role/grant export | `EVD-ROLE-C3-<ts>-01.csv` | DBA | App Lead |
| Ledger rows / summary / mapping | `EVD-E2-{1..5}-<ts>-*` | DBA | App Lead |
| Catalog markers 0019–0022 | `EVD-E3-{1..6}-<ts>-*` | DBA | App Lead |
| BEFORE/AFTER contracts | `EVD-E3-4-PRE-*`, `EVD-E3-4-*` | DBA | App Lead |
| Backup + restore | `EVD-E5-{1..6}-<ts>-*` | DBA | App Lead |
| Checksum re-verification | `EVD-A6-*` | DBA | App Lead |
| Build/compat/order | `EVD-E4-2-*`, `EVD-COMPAT-*`, `EVD-ORD-A8-*` | App Lead | DBA |
| Control-plane disabled | `EVD-A14-<ts>-01.md` | App Lead | DBA |
| Synthetic-data attestation | `EVD-A13-ATTEST-<ts>-01.md` | operator | DBA |
| Change record + STOP ack | `EVD-CR-A3-<ts>-01.md`, `EVD-A11-ACK-<ts>-01.md` | DBA + App Lead | each other |
| Rehearsal harness output | `harness-<ts>.out` | operator | DBA |
| Control regression | `control-fk-<ts>.out` | operator | DBA |
| Evidence index | `99-evidence-sha256.txt` | operator | DBA |

Rules:

- One row per file; record size, SHA-256, capture UTC, collector, reviewer.
- Redact secrets/endpoints/PII before submission; evidence is transferred only
  through the approved restricted channel (never Git, chat or a shared folder).
- The evidence index is hashed and referenced in the change record.
- A rehearsal PASS authorizes **only** "0022/0021 rehearsed on staging"; it does
  not authorize production.

---

## 8. Sign-off (blank — **BLOCKED**)

| Role | Name | Decision | UTC | Evidence ref |
| --- | --- | --- | --- | --- |
| DBA (`A1`) | *(blank)* | *(blank)* | *(blank)* | |
| Application Lead (`A2`) | *(blank)* | *(blank)* | *(blank)* | |
| Change record (`A3`) | *(blank)* | *(blank)* | *(blank)* | |
| Evidence + STOP acknowledgement (`A11`) | *(blank)* | *(blank)* | *(blank)* | |

**This checklist is prepared but NOT approved. Do not execute.**
