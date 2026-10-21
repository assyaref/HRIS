# Migration 0022 — Isolated Rehearsal Evidence Record (Operator-Executed)

**Document type:** OPERATOR-EXECUTED REHEARSAL EVIDENCE — **isolated local
staging database only**.
This is **not** an approval, a signed authorization, a change record, or a
production verification. It records what an operator executed on 2026-10-21
against a disposable database restored from a staging dump. It advances no
governance gate: every Part A row (`A1`–`A14`), every Part B row (`B1`–`B13`),
and every staging gate (`G1-S`–`G5-S`) remains `PENDING`/`BLOCKED` in
`docs/employee-permanent-delete-0022-staging-evidence-intake-register.md`.

**Status:** EVIDENCE RECORDED — **NOT A GATE PASS** (see §7 limits).

**Date executed:** 2026-10-21
**Repository:** `/opt/hris`, git `main`, HEAD `e735f47d23e83da97cd1f97faead34221eaa18b5`
(working tree = release candidate; no commit/push made by the rehearsal).
**Migration artifacts:** `db/migrations/0021_employee_deletion_controls.sql`
(sha256 `0e234c6e…07764`), `db/migrations/0022_employee_retention_detach.sql`
(sha256 `724db82d…c765c`, matches the reviewed design anchor).
**Application helper code under test:** `features/employees/queries.ts`
(`listEmployeeDeletionDependencies`, `countEmployeeDirectReports`,
`deleteEmployeeDeletableRecords`, `snapshotEmployeeRetainedRecords`) and
`features/employees/permanent-delete-policy.ts`.

> **Boundary observed.** No Zimbra contact. `.env.production` never read.
> No production database, migration, service, deployment, or journal was
> touched. All database work used `sudo -n -u postgres` over the local unix
> socket (no stored credentials). No existing working-tree change was
> overwritten, reset, cleaned, or checked out. The Next.js action wrapper
> (`permanentlyDeleteEmployeeAction`) was **not** executed directly because it
> imports `next/headers`; the harness exercised the same transactional helper
> functions and the same scoped SQL the action calls.

---

## 1. Environment

| Item | Value |
| --- | --- |
| Source dump | `staging-db-20261021T005459Z-pre-0022.dump` (349481 B, sha256 `a73e9c85…90d70`) |
| Restored database | `hris_force_delete_staging_20261021` (disposable) |
| Cluster | local PostgreSQL 16.15, **same cluster** as the restore source |
| Isolation | separate database + separate roles (`hris_app`, `hris_rehearsal`, `hris_staging_owner`) — **database-level only, not cluster-level** |
| Baseline restored rows | 12 employees, 3 organizations, 2 attendance records, 6 users, 46 public tables |
| Control plane at preflight | `DELETION_EXECUTION_ENABLED = false`, `RETENTION_ELIGIBLE_CATEGORIES = []` |

## 2. Schema rehearsal (§5.1–§5.7)

- **Before:** 11 protected employee FKs were `RESTRICT` + `NOT NULL`; 0
  retained-identity checks; `payroll_items` identity snapshots `NOT NULL`;
  11 deletable FKs `RESTRICT`; 0021 tables absent.
- **Apply 0021 then 0022:** both committed. 0022 backfills:
  `attendance_records` UPDATE 2, `attendance_events` UPDATE 8,
  `employee_employment_history` UPDATE 30.
- **Idempotency (pre-deletion):** re-running 0022 exited 0 with 11 zero-row
  updates and only `already exists, skipping` notices. This is the first
  runtime idempotency evidence for blocker `B-15`; it is **not** an approval.
- **After:** 11 protected FKs `SET NULL` + nullable; exactly 11
  `*_retained_identity_check` constraints
  (`CHECK ((employee_id IS NOT NULL) OR (employee_number_snapshot IS NOT NULL))`);
  no employee-FK `CASCADE`; 0 detached/anonymous rows; 0021 tables present.

## 3. Atomicity / compatibility tests (§5.9–§5.10)

- **Test A — migration atomicity:** injected `SELECT 1/0` before `COMMIT`.
  Result: exit 3, `division by zero`, catalog fingerprint unchanged
  (`6200a784fea0b79ca01cec1f6d01d40f`), row counts unchanged. **PASS.**
- **Test C — pre-0022 fail-closed:** on a pre-0022 clone
  (`hris_force_delete_disposable_20261021`), deleting an employee with
  attendance events failed with
  `FK attendance_events_employee_id_employees_id_fk` (`RESTRICT`); employee
  and child rows intact. **PASS.**

## 4. Functional rehearsal (§5.8) — through the application helper transaction

Harness: `/tmp/opencode/rehearsal-20261021/force-delete-rehearsal.ts`
(seed: one synthetic org `REH-FD-20261021-*` with employees A target, B control,
C rollback, each with 15 record types). Result: `HARNESS_RESULT=PASS`, 568 ms.

- **A deleted; B and C intact.**
- **Protected tables (11):** totals preserved; each holds exactly 1 detached
  row with identity snapshots (`employee_number_snapshot`,
  `employee_name_snapshot`, and payroll `birth_date_snapshot`).
- **Deletable tables (7):** only A's rows removed; B's rows untouched.
  Removed summary: Documents 1, Face ID 2, Projects 1, Other 2.
- **Retained scope surfaced before execution:** Attendance 2, Leave 2,
  Permission 1, Payroll 2, Payslip 3, Employment history 1.
- **Identity-preserving access:** payslip PDF password reconstructed purely
  from snapshots (`EMP-RH-FD-A-2026102109051991`, i.e. employee number +
  DDMMYYYY); detached records remained listed and searchable by snapshot
  identity.
- **Audit:** one `employee.permanently_deleted` row with `result=success`,
  deletion reason, and removed/retained/snapshotted scopes.

## 5. Test B — injected mid-transaction failure

A `BEFORE DELETE` trigger `rehearsal_fail_on_delete()` was installed on a
deletable table; the harness then invoked the same transaction for employee C.

- Result: full rollback — employee C, its snapshots, and deletable rows all
  unchanged; post-counts confirmed (`employees=2`, deletables back to 2).
- A `FAILED` audit row was recorded after rollback.
- Injected trigger removed afterwards (`leftover_triggers=0`).

## 6. Post-deletion idempotency and identity integrity

- Re-ran 0022 **after** the deletion: exit 0, 19 `already exists, skipping`,
  1 `UPDATE 0`, `COMMIT`; 11 retained-identity checks still present.
- Anonymous-row scan across all 11 protected tables:
  **0 rows** with `employee_id IS NULL AND employee_number_snapshot IS NULL`.

## 7. What this record does NOT establish

1. **No authorization.** Staging execution rows `A1`/`A2` were not signed.
   This is an operator-executed isolated rehearsal, not an approved run.
   Checklist rows must **not** be marked `PASS` on the strength of this file.
2. **No cluster isolation attestation.** The staging database shares the local
   cluster with the restore source; `G5-S` remains open pending DBA attestation.
3. **No production verification.** 0022 is not applied to production; current
   production delete still fails closed (`23503`).
4. **No payroll-history deletion.** Approved scope retains payroll/payslips via
   `SET NULL` + identity snapshots. Deleting payroll remains outside the
   approved design and requires the policy §4 retention sign-off
   (Legal/DPO/HR) that is still pending.
5. **No release approval.** Part B approvals and the 47-artifact evidence set
   remain outstanding; pushing `main` would auto-deploy (`.github/workflows/deploy.yml`).

## 8. Evidence artifacts and checksums

Directory: `/tmp/opencode/rehearsal-20261021/` (operator workspace, not repo).

| File | sha256 |
| --- | --- |
| `01-preflight.txt` | `793e80614f50a62fdccb0ec26712f6517b5763f7935ab6ddbae51a4865362c5b` |
| `02-backup.txt` | `4cbd8cffaa5ab4f4773c40a3ad121ded497e62d269706fa3daa0293ee191e1ab` |
| `03-restore-verify.txt` | `ed23ecea8731b0433599af3c01af067553fba23ba07a0179770d6a6b0c506cfe` |
| `04-isolation.txt` | `6521b05ff52acb8106868bd712fb24a3ee78e4c02f391a08bab947df01be74bd` |
| `05-schema-before.txt` | `f49fee9057f9a5827a9fa33e217a39a25ed7cd701bb93d562b58e45045db6572` |
| `06-apply-0021-0022.txt` | `4f786fc3e773d79ccc079c01d51f5750a750fd293eb8976d5367a589bc249505` |
| `07-idempotency-pre.txt` | `c2ea89df89a0eb95eea25e2d9eef42aa36295a14c30da05cacffb9c76e800dd6` |
| `08-schema-after.txt` | `ddcc25a4b128b1988e9d19b5f220e18d9660071206054fb64bc93490c2f7eae2` |
| `10-testA-rollback.txt` | `e476f5cb6576f43682ead51e5466b7ecf6fe416b880f04f4b6f267a3304aafc0` |
| `11-testC-compat.txt` | `888534095725bc072e690ac4db62ef2ca568c5a597cb091d4c434ebea1356162` |
| `12-harness.out` | `8d54f196141e3bca4989210b744bd95b5f4af5e5d4f940353084babe9eb62def` |
| `13-anonymous-check.txt` | `28ed657d0b005b07630a2911864164c58c543d33c331394b706355a0f5db21c6` |
| `14-post-deletion-0022-rerun.txt` | `8b6526550fc50a7564eaebeb28336a4dade3b037c6b8a942e35be23acdfcce6d` |
| `staging-db-20261021T005459Z-pre-0022.dump` | `a73e9c85aad57d14972579e481ce4f284f498854825b6f51f3a55e08f4c90d70` |

Reproduction (operator only, disposable database):

```sh
D=/tmp/opencode/rehearsal-20261021
sudo -n -u postgres env -u DATABASE_URL HOME=/tmp \
  DATABASE_URL="postgresql:///hris_force_delete_staging_20261021?host=/var/run/postgresql" \
  node --import "$D/register.mjs" "$D/force-delete-rehearsal.ts"
```

---

## Addendum 2026-10-21 — revised 0021 control-plane integration

After the run above, `0021` was rewritten before any application so the live
delete path integrates with the control plane. This addendum records the
replacement disposable rehearsal; the 0021 checksum in the header above is
superseded for the current candidate.

- Revised `0021` SHA-256:
  `585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452`.
- Disposable DB `hris_force_delete_rehearsal_20261021T024301Z`, restored from
  `staging-db-20261021T005459Z-pre-0022.dump` (not production).
- Revised 0021 + 0022 applied and re-applied: both exit 0.
- Destructive harness: `HARNESS_RESULT=PASS` (316 ms); A deleted, B and C
  intact, 11 protected tables retained/detached with snapshots, zero payroll
  rows deleted.
- Control-plane DB regression
  (`scripts/verify-employee-deletion-control-fks.sql`):
  `CONTROL_FK_REGRESSION_PASS` — active hold blocks, pending and approved
  requests block, released/terminal history detaches with snapshots.
- Catalog after migration: 26 employee FKs = 15 `SET NULL` + 11 `RESTRICT`,
  0 `CASCADE`, 11 retained-identity CHECKs, 0 anonymous retained rows.

This remains **EVIDENCE ONLY, NOT A GATE PASS**. No approved staging or
production application occurred.
