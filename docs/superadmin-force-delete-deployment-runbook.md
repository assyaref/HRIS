# Superadmin Force Delete — Release Candidate & Deployment Runbook

Status: **RELEASE PREPARED, NOT DEPLOYED** — held by the organizational gates
in `SUPERADMIN-FORCE-DELETE-PRODUCTION-REPORT.md` §15.7 (rows 7–12).
Owner authorization covers release **preparation** only; production deployment
and migration additionally require the DBA/Security/Legal/DPO approvals
listed there. Nothing in this runbook is pre-authorized to run automatically.

- Release candidate: **`g6sGasldWHsmQLXJg2EBP`**, built out-of-tree from
  commit `8a078c498890ebd243ba0a313e2b8a7a85d19d5d` (branch `main`, clean,
  12 commits ahead of `origin/main`, **not pushed**).
- Durable archive:
  `/opt/hris-backups/releases/20261022-164719-8a078c498890-g6sGasldWHsmQLXJg2EBP/`
  (`source/.next`, `manifest.sha256` of 1,210 files, `build.log`,
  `smoke-test.out`, `RELEASE-NOTES.txt`).
- Migration pair under review: `0021_employee_deletion_controls.sql`
  (sha256 `585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452`)
  and `0022_employee_retention_detach.sql`
  (sha256 `3750812f76be5cef1f3356eaf7872208494a31b26b4a2d5ef7433c1ae69160b5`).
- Currently running production build: `J5cpppAYMdIb8Q5QViGP9`
  (deployed 2026-10-19 from `e735f47d23e8`; the durable archive
  `20261019-141513-e735f47d23e8-J5cpppAYMdIb8Q5QViGP9` is the app-rollback
  source).

## M-1 Preconditions (all must be green before M-2)

1. Report §15.7 gates 7–10 and 12 signed off (DBA + Security migration review,
   Policy §4 retention/legal-hold approvals, staging rehearsal, Part A/B
   signatures, branch protection + push authorization).
2. Fresh backups taken in the approved window and **verified recoverable**:
   - DB dump (postgres 0600) + sha256 sidecar under `/var/lib/postgresql/hris-backups/`.
   - Private tree archive created **as root** with
     `tar --acls --xattrs --numeric-owner -czf <file> -C /opt hris-private`
     plus `.sha256` sidecar under `/opt/hris-backups/backups/`.
3. Confirm production matches the preflight baseline (read-only):
   `select count(*) from drizzle.__drizzle_migrations;` → **18**;
   `employee_legal_holds` / `employee_deletion_requests` /
   `employee_deletion_approvals` absent; no `*_retained_identity_check`
   constraints; payroll tables `employee_id NOT NULL`.
4. Announce the low-traffic window (0022 takes short ACCESS EXCLUSIVE locks
   per table and re-validates FKs; it is one transaction).

## M-2 Migration application (DBA-supervised, order 0021 → 0022)

**Do not run `npm run db:migrate` or `drizzle-kit generate` from this worktree**
(the lineage is inconsistent until step 1 lands; see report §15.2). Two
approved paths — choose exactly one:

### Path A (preferred): reconcile lineage first, then apply by tool

1. **Reconciliation change (separate commit, DBA-reviewed):**
   - Backfill ledger rows for 0015/0016 with their journal `when`
     (`1790152070913`) — inserted **after** current id 18 but with the
     historical `created_at`, so ordering semantics are unchanged.
   - Record the 0019/0020 disposition (0019 still pending — journal it or
     withdraw it explicitly; 0020 is applied — backfill a row with its file
     `when` or document it as out-of-band).
   - Append journal entries for `0021_employee_deletion_controls` and
     `0022_employee_retention_detach` with **fresh `when`
     (`Date.now()`, strictly > `1790661254287`)** — a stale or tied `when`
     is **silently skipped forever** (drill-proven).
   - Have the DBA regenerate/refresh `meta` snapshots (currently stopping at
     `0014`) so `drizzle-kit generate` becomes safe again.
2. Apply: `DATABASE_URL=<prod> npm run db:migrate` in the approved window.
   Verify afterwards: 0021 control tables exist; 6 retained tables have
   `*_retained_identity_check` + `ON DELETE SET NULL` + nullable
   `employee_id` + backfilled snapshots; 5 payroll tables `RESTRICT` +
   `NOT NULL`; ledger now records 0021/0022.

### Path B (fallback): DBA-supervised psql, same transaction semantics

```bash
# verify hashes first — abort on mismatch
sha256sum db/migrations/0021_employee_deletion_controls.sql   # 585dd2d7…c452
sha256sum db/migrations/0022_employee_retention_detach.sql    # 3750812f…0b5
sudo -u postgres psql -d hris -v ON_ERROR_STOP=1 \
  -f db/migrations/0021_employee_deletion_controls.sql        # own BEGIN/COMMIT
sudo -u postgres psql -d hris -v ON_ERROR_STOP=1 \
  -f db/migrations/0022_employee_retention_detach.sql         # own BEGIN/COMMIT + verification block
# record lineage honestly (out-of-band pattern):
#   INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
#     ('585dd2d79a5e1147a57127bc1cb569985cdb76224714b9754498e8f6b028c452', <fresh ms>),
#     ('3750812f76be5cef1f3356eaf7872208494a31b26b4a2d5ef7433c1ae69160b5', <fresh ms>);
```

Post-apply verification (both paths): re-run the §15.3 checks —
`select count(*) from pg_constraint where conname like '%retained_identity_check';`
→ 6; `select is_nullable from information_schema.columns where
table_name='attendance_records' and column_name='employee_id';` → YES;
snapshot backfill complete for every live row (the 0022 in-migration
verification block already asserts this and aborts otherwise).

## M-3 Application deployment (Ops-supervised)

**Never build in the live checkout.** Either deploy the prepared RC or build a
fresh one out-of-tree (identical procedure to §15.5):

```bash
# (only if a new candidate is needed) out-of-tree build:
mkdir -p /tmp/opencode/rc-<commit> && git -C /opt/hris archive <commit> \
  | tar -x -C /tmp/opencode/rc-<commit>/source
cp -a /opt/hris/node_modules /tmp/opencode/rc-<commit>/source/
cd /tmp/opencode/rc-<commit>/source && set -a; . /opt/hris/.env.production; \
  set +a; NODE_ENV=production npm run build        # record the BUILD_ID
```

Install atomically and verify **before** the restart:

```bash
REL=/opt/hris-backups/releases/20261022-164719-8a078c498890-g6sGasldWHsmQLXJg2EBP
sha256sum -c "$REL/manifest.sha256"               # 1,210 files must match
test "$(cat $REL/source/.next/BUILD_ID)" = "g6sGasldWHsmQLXJg2EBP"
cd /opt/hris && sudo tar --acls --xattrs --numeric-owner -czf \
  /opt/hris-backups/backups/hris-next-pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).tar.gz .next
sudo mv .next .next.pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)   # keep the running build
sudo cp -a "$REL/source/.next" /opt/hris/.next
test "$(cat /opt/hris/.next/BUILD_ID)" = "g6sGasldWHsmQLXJg2EBP"
sudo systemctl restart hris.service
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/login   # 200
curl -s http://127.0.0.1:3000/login | grep -o 'g6sGasldWHsmQLXJg2EBP' | head -1
# asset smoke: fetch /login once, then curl each /_next/static/... URL it references -> all 200
```

The archive directory name **must** carry the commit and `BUILD_ID`, and the
archived `BUILD_ID` **must** equal what the running service serves — never
trust an unlabeled or mislabeled snapshot (the `kR0L8QnWCFjO3oU4Qb4w3`
directory is the standing counter-example).

## M-4 Post-deployment verification

1. Service health: `systemctl show hris.service -p NRestarts -p MainPID`
   (NRestarts should be 0 after the planned restart), `GET /login → 200`,
   served build id = deployed candidate.
2. Migration state (read-only): control tables exist; retained/payroll FK
   invariants as in M-2; ledger records 0021/0022.
3. Control-plane smoke (staging first, then production with a disposable test
   employee): an ACTIVE legal hold blocks permanent deletion; a PENDING
   request blocks deletion; release/reject unblocks.
4. File sweep: `node scripts/purge-deleted-employee-pdfs.mjs` (dry-run) —
   expected `purged=0 left_behind=0`, orphans report-only.
5. Record: deployed build id, deploy timestamp, migration ledger tail, and
   the operator name in the release notes file inside the release directory.

## M-5 Application rollback (no data loss)

```bash
sudo systemctl stop hris.service
sudo rm -rf /opt/hris/.next && sudo cp -a \
  /opt/hris-backups/releases/20261019-141513-e735f47d23e8-J5cpppAYMdIb8Q5QViGP9/source/.next \
  /opt/hris/.next
test "$(cat /opt/hris/.next/BUILD_ID)" = "J5cpppAYMdIb8Q5QViGP9"
sudo systemctl start hris.service && curl -s -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:3000/login
```

## M-6 Migration rollback — READ THE LIMITS FIRST (report §15.3)

- **Before any permanent deletion has occurred** (drill-proven): reverse 0022
  per retained table (drop `*_retained_identity_check`, restore FK
  `ON DELETE RESTRICT`, `SET NOT NULL`, drop the two snapshot columns), then
  reverse 0021 (`DROP TABLE employee_deletion_approvals,
  employee_deletion_requests, employee_legal_holds` — destroys control-plane
  history). Verify the schema equals the baseline afterwards.
- **After the first permanent deletion: 0022 is NOT reversible.** Detached
  history rows carry NULL `employee_id` (`SET NOT NULL` fails 23502); their
  identity survives only as snapshots. Do not attempt partial restores.
- 0021 rollback loses hold/request/approval history — acceptable only with
  explicit owner + Legal sign-off.

## M-7 Files & data preservation contract (for approvers)

- Retained (detached, never deleted): attendance records/events, leave
  balances/requests, permission requests, employment history — each keeps
  employee number + display-name snapshots and can never be anonymous.
- Deleted with the employee (owner-approved widened scope): payroll component
  assignments, payroll items, payslips, payslip documents and versions; any
  row the plan misses fails loudly (RESTRICT backstop).
- Blocking controls (database-enforced): ACTIVE legal hold, PENDING/APPROVED
  deletion request; dual-control approvals recorded in `employee_deletion_approvals`.
- The two pre-existing orphan payslip PDFs remain **report-only** until the
  Data Owner + Security decide retention vs audited removal.

## M-8 Standing operational hazards (each caused a real incident or drill finding)

1. **Never run `npm run build` in the live checkout** — it replaces the
   running build's `.next` (static assets 500'd on 2026-10-22 before repair).
2. **Never run reverse-0022 statements on a live system** — a single
   `SET NOT NULL` silently reverts a retention invariant (drill-proven).
3. **Journal entries with stale/tied `when` are silently skipped by drizzle**
   — fresh `Date.now()` only, after ledger backfill.
4. **Archive `BUILD_ID` must be cross-checked against the running service**
   before and after every deploy; never keep the only copy under `/tmp`.
5. **Filesystem backups require `--acls --xattrs --numeric-owner` and root
   restore** — plain tar loses the ACLs the `hris` service account depends
   on (functionally unrecoverable). Automation of this backup is still
   outstanding.
