# Payroll Deletion Scope — Decision Record and Reconciliation

**Document type:** POLICY / SCOPE DECISION RECORD. It records a *blocked*
decision; it is not an approval and it changes no code.
**Status:** **BLOCKED — payroll-history deletion NOT implemented.** The
implemented and approved scope **retains** payroll history.
**Date:** 2026-10-21 (UTC) · **Repo:** `/opt/hris`, local `main`, HEAD
`831027b` (not pushed)

Related: `docs/employee-permanent-delete-policy.md` §4, §7.3.1, §7.4, §7.7;
`docs/employee-deletion-approval-matrix.md` §3;
`docs/employee-deletion-lineage-reconciliation-record-20261021.md` §4;
`docs/employee-permanent-delete-0022-detach-design.md`.

---

## 1. The two facts that must be reconciled

| # | Fact | Source |
| --- | --- | --- |
| 1 | The release request requires **permanent deletion of payroll history** (payroll components, payroll items, payslips, payslip documents/versions). | Release request / task instruction |
| 2 | The current destructive flow reports **`payroll rows deleted = 0`**; payroll rows are retained and detached. | Isolated rehearsal 2026-10-21 (below) and `docs/SUPERADMIN-FORCE-DELETE-PRODUCTION-REPORT.md` §3.3 |

Both facts are true. They are not a bug and a test failure; they are a
**scope conflict** between the requested behaviour and the approved design.

---

## 2. Why the result is `0` (root cause)

1. `0022_employee_retention_detach.sql` intentionally changes the 11 protected
   history tables — including the 5 payroll/payslip tables — to nullable
   `employee_id` + `ON DELETE SET NULL` + identity snapshots. It contains **no**
   payroll deletion.
2. `features/employees/queries.ts` builds an explicit delete plan that contains
   only the 11 deletable tables; payroll/payslip tables are in the *retained
   snapshot* plan, not the *deleted* plan. The plan is asserted fail-fast
   against the policy.
3. `docs/employee-permanent-delete-policy.md` §7.3.1/§7.4 mark payroll as
   **Retained** and state that payroll-history deletion "is not implemented or
   approved".
4. The control plane is disabled: `DELETION_EXECUTION_ENABLED = false`,
   `RETENTION_ELIGIBLE_CATEGORIES = []` — tier 2 (delete protected records) is
   impossible by construction.

Therefore `0` is the **designed** result.

---

## 3. Decision gate — result: **NOT SATISFIED**

Per the release request, payroll deletion may be implemented and tested in an
isolated database **only if both** conditions hold:

| Condition | Required evidence | Found | Result |
| --- | --- | --- | --- |
| (a) The policy decision is recorded | Signed §4.1 rows selecting payroll as retention-eligible / deletion-approved, with the retention window | All 6 §4.1 rows `☐ pending`; matrix §3 `BLOCKED` | **NOT SATISFIED** |
| (b) The scope is explicitly approved | Named Legal/Compliance + DPO + HR/Payroll + Data Owner approval of "permanently delete payroll history", including payslip originals/versions | None present | **NOT SATISFIED** |

**Both conditions fail → implementation is prohibited.**

A request from the release owner, a test expectation, or the wording "permanent
delete" **does not** satisfy (a) or (b). No signature was fabricated to make the
gate pass.

---

## 4. Evidence of the current (retention) behaviour

Disposable database `hris_force_delete_rehearsal_20261021T040023Z`, restored
from `staging-db-20261021T005459Z-pre-0022.dump` (staging dump, **not
production**), `0021` + `0022` applied, then the real application helpers driven
by `force-delete-rehearsal.ts`.

Harness result: **`HARNESS_RESULT=PASS`** (377 ms).

| Table | Pre (synthetic org) | Post | Deleted | Detached with identity |
| --- | ---: | ---: | ---: | ---: |
| `employee_payroll_components` | 3 | 3 | **0** | 1 |
| `payroll_items` | 3 | 3 | **0** | 1 |
| `payslips` | 3 | 3 | **0** | 1 |
| `payslip_documents` | 3 | 3 | **0** | 1 |
| `payslip_document_versions` | 3 | 3 | **0** | 1 |

Direct post-run SQL for the synthetic organization:

```
PAYROLL_ITEMS_IN_TARGET_ORG=3
EMPLOYEE_PAYROLL_COMPONENTS_IN_TARGET_ORG=3
PAYSLIPS_IN_TARGET_ORG=3
DETACHED_PAYROLL_ITEMS=1
DETACHED_EMPLOYEE_PAYROLL_COMPONENTS=1
DETACHED_PAYSLIPS=1
PAYROLL_ROWS_WITHOUT_IDENTITY_SNAPSHOT=0
TARGET_ORG_PAYROLL_ROWS=9
```

Headline: **`payroll rows deleted = 0`** — expected for the approved scope,
mismatched with the requested scope.

Evidence (`/tmp/opencode/payroll-scope-20261021-20261021T040023Z/`):

| File | SHA-256 |
| --- | --- |
| `05-harness.out` | `e7cc226ec36ee9af1ed3abda40e9dd2e8dc66cc0e9bfb0d2e2b4b053181d7fe1` |
| `06-post-payroll-scope.txt` | `6e130c6115bd242fd557c9aef7fd6a6f2ab775bcd78ad2647a270fe4e2030002` |
| `07-payroll-rows-deleted.txt` | `cf4cb73873cae9ca3722ae352b86731a8dd2002715176ae837eb5efd7b4a597e` |

Regression coverage that pins the current behaviour (must be updated, not
deleted, if the scope ever changes):
`tests/employees/employee-retention-detach.test.ts`,
`tests/employees/employee-permanent-delete.test.ts`,
`tests/employees/employee-deletion-controls.test.ts`.

---

## 5. Decision recorded here

**No payroll deletion will be implemented in this change set.**

- The code, migrations, delete plan and tests remain unchanged.
- The implemented scope retains payroll/payslip history with identity snapshots
  (PDF password survives via `payslips` snapshots).
- The release remains bound by the approved retention design.
- If the business genuinely requires deletion, it must go through a **separate,
  formally approved** change (see §6), not through an unapproved edit to the
  permanent-delete path.

### 5.1 Why implementing it now would be unsafe

1. **Contradicts the signed design**: `0022` and the policy explicitly retain
   payroll; deleting rows would make the migration's snapshot backfill and
   retained-identity CHECKs pointless and would invalidate the reviewed
   checksum/design.
2. **Destroys financial records** that payroll reporting, payslip PDFs, audit
   and statutory retention depend on. The product contract states payroll
   historical data is immutable after publish.
3. **IRREVERSIBLE**: a `DELETE` of payroll rows cannot be undone by rollback of
   the migration; it requires restoring a backup.
4. **Unapproved data-protection impact**: payroll retention periods are a
   Legal/DPO decision (§4), not an engineering choice.
5. **No dual-control path**: tier 2 is disabled; bypassing it would create an
   unreviewed destructive capability.

---

## 6. What an approved payroll-deletion change would require

If, and only if, §3(a) and §3(b) are satisfied:

1. **Written decision**: dated §4.1 entries naming payroll/payslip as
   retention-eligible or deletion-mandated, with the retention window and the
   treatment of payslip documents/versions and PDF snapshots; Data Owner
   authorization; DBA backup/PITR position.
2. **New design document** covering: which payroll rows are deleted vs
   anonymised, order of deletion (children first), effect on payroll runs,
   reports, payslip PDF reconstruction, audit, and tax/statutory obligations.
3. **New additive migration** (do not rewrite `0021`/`0022`): e.g. relax
   `RESTRICT` where needed, add deletion-audit columns; never retro-edit an
   already reviewed artifact.
4. **Delete-plan change** in `features/employees/queries.ts` with fail-fast
   assertions, plus updated preflight counts and dialog copy.
5. **Tests**: replace the "payroll retained" regression assertions with
   "payroll deleted" ones, including a rollback/atomicity test.
6. **Isolated rehearsal** on a fresh disposable DB with explicit
   `payroll rows deleted = <expected>` evidence and a backup/restore proof.
7. **DBA review of the new migration** + a fresh approval matrix.
8. **Restore point**: because deletion is irreversible, a verified backup must
   exist and the RPO/RTO must be accepted by the Data Owner.

**Until all of the above exist, `payroll rows deleted = 0` is the correct,
approved result.**

---

## 7. Current status

| Item | State |
| --- | --- |
| Policy decision recorded (a) | **NO — BLOCKED** |
| Scope explicitly approved (b) | **NO — BLOCKED** |
| Payroll deletion implemented | **NO** (deliberately not implemented) |
| Payroll retention implemented | **YES** (approved design) |
| Isolated evidence of `0` deleted rows | **YES** (§4) |
| Code changes made by this record | **NONE** |
| Production touched | **NO** |

**Decision: DEFERRED / BLOCKED. Payroll history remains retained.**
