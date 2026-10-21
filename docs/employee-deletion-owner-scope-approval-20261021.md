# Owner Scope Approval — Superadmin Force Delete Release (OWNER APPROVAL ONLY)

**Document type:** SCOPE APPROVAL RECORD (owner-level only).
**Date recorded:** 2026-10-21 (UTC)
**Repository:** `/opt/hris`, local branch `main` (work on top of commit `00e4655`;
see `docs/SUPERADMIN-FORCE-DELETE-PRODUCTION-REPORT.md` §11 for the exact
resulting commit).
**Scope of this record:** the release owner's explicit authorization of the
permanent employee deletion scope, including payroll history.

---

## 1. What the owner approved

On 2026-10-21 (UTC) the project owner issued an explicit authorization for the
Superadmin Force Delete release. Its operative content, quoted from the owner
authorization:

> "The project owner explicitly approves proceeding with the Superadmin Force
> Delete release, including the intended permanent employee deletion scope and
> the request to include payroll history in the deletion scope."

Recorded approvals (owner-level):

| # | Approved item | Level |
| --- | --- | --- |
| 1 | Proceeding with the Superadmin Force Delete release (implementation and verification work) | Owner |
| 2 | The permanent employee deletion scope as implemented (employee row + deletable related records; retention of attendance, leave, permission and employment history with identity snapshots) | Owner |
| 3 | **Inclusion of payroll history in the deletion scope** — `employee_payroll_components`, `payroll_items` (+ cascaded `payroll_item_components`), `payslips`, `payslip_documents`, `payslip_document_versions` are permanently deleted with the employee | Owner |

The owner's approval resolves the *scope conflict* recorded in
`docs/employee-deletion-payroll-scope-decision-record.md` §1 at the
**data-owner level**: payroll history is now an owner-approved **deletable**
category, and the retention-detach design for payroll tables has been replaced
by explicit, ordered deletion with `ON DELETE RESTRICT` as the database
backstop (revised migration `0022`, checksum
`3750812f76be5cef1f3356eaf7872208494a31b26b4a2d5ef7433c1ae69160b5`).

---

## 2. What this approval is NOT

This record is **owner approval only**. It is explicitly **not**:

1. **Not a DBA attestation or approval.** No DBA has reviewed or accepted the
   revised `0022` (or `0021`) SQL, checksums, locking behaviour or rollback
   plan. `A6`/`B1` and the DBA rows of the approval matrix remain **BLOCKED**.
2. **Not a Legal/Compliance, DPO, HR/Payroll or Security approval.** The policy
   §4 retention sign-off rows remain pending. The owner's scope decision does
   not satisfy, waive or replace any of them (matrix §0, §3, §6).
3. **Not staging rehearsal authorization.** Part A (`A1`–`A14`) is still 0/14;
   the isolated operator rehearsals on disposable databases are evidence
   only, not a gate pass.
4. **Not production authorization.** Nothing in this record authorizes a push
   to `origin/main`, a production migration apply, a deployment, or the
   deletion of any production record. Production remains untouched:
   migrations `0019`/`0021`/`0022` are not applied, the ledger has 18 rows,
   and the deployed build `kR0L8QnWCFjO3oU4Qb4w3` is preserved.
5. **Not a waiver of dual control.** The control plane
   (`DELETION_EXECUTION_ENABLED = false`,
   `RETENTION_ELIGIBLE_CATEGORIES = []`) stays exactly as reviewed.

No signature of any DBA, Legal, DPO, HR/Payroll, Security or Application Lead
role has been fabricated anywhere in this repository.

---

## 3. Consequences of this approval

| Consequence | State |
| --- | --- |
| Payroll/payslip tables may be treated as **deletable** in the delete plan, schema and migration `0022` | Implemented and tested (isolated DBs only) |
| The retention-only payroll snapshot columns and CHECKs are removed from the design | Implemented in revised `0022` (unapplied anywhere persistent) |
| The payroll-scope decision record flips from DEFERRED/BLOCKED to RESOLVED (owner-approved), with third-party approvals outstanding | Updated 2026-10-21 |
| Production migration, deployment, push, or production deletion | **Still blocked** — unchanged by this record |
| Final release status | **RELEASE BLOCKED** (see the production report §11) |

---

## 4. Approval identity and traceability

| Field | Value |
| --- | --- |
| Approver | Project owner (requesting owner of this release) — authorization received 2026-10-21 (UTC) via the owner release instruction directing this work; name/signature not supplied in the authorization text and therefore **not recorded here** |
| Approver role | Project owner / Data Owner of the HRIS system |
| Authorization channel | Owner release instruction ("OWNER AUTHORIZATION — CONTINUE HRIS FORCE DELETE RELEASE"), 2026-10-21 (UTC) |
| Recorded by | Release operator (this repository's local working tree; no third-party signature recorded) |
| Witnessed by | — (no independent witness; no signature fabricated) |

**If a named, signed owner authorization artifact is later produced, attach it
to this record. Until then this record cites the owner authorization text
only and grants nothing beyond the owner level.**
