# HRIS backup automation (deploy/backup/)

Closes the filesystem-backup-automation blocker of
`docs/SUPERADMIN-FORCE-DELETE-PRODUCTION-REPORT.md` §15.7 row 5 (FAIL:
"automation still outstanding") and §14.9 row 6.

## What runs

| Unit / file | Purpose |
| --- | --- |
| `/usr/local/sbin/hris-backup` | the backup procedure (DB dump + ACL-correct private-tree archive + retention + status file) |
| `hris-backup.service` | oneshot unit running the script as root |
| `hris-backup.timer` | **daily at 01:30 local**, `RandomizedDelaySec=10m`, `Persistent=true` (catches up after downtime) |
| `hris-backup-failure.service` | `OnFailure` alert: journal entry at alert priority via `systemd-cat` |

## Cadence and artifacts

- **Database**: `pg_dump -Fc hris` →
  `/var/lib/postgresql/hris-backups/production-db-<UTCts>-scheduled.dump`
  (`postgres:postgres`, `0600`) + `.sha256` sidecar. Self-verified each run
  with `pg_restore -l` (TOC readability) and a non-empty size check.
- **Filesystem**: `tar --acls --xattrs --numeric-owner -czf … -C /opt
  hris-private` → `/opt/hris-backups/backups/hris-private-<UTCts>-scheduled.tar.gz`
  (`root:root`, `0600`) + `.sha256` sidecar. Self-verified each run with
  `gzip -t`. **Plain tar is not application-recoverable on this host** — the
  `hris` service account reaches payslips through POSIX ACLs, which only
  `--acls` preserves (drill-proven, report §14.2).
- **Retention**: only files matching the `-scheduled` name marker older than
  14 days are pruned (DB + FS). Manual, `pre-*` and release archives are
  never touched by the automation.
- **Status/monitoring**: every run ends with a journal summary line
  `HRIS_BACKUP_RESULT=PASS|FAIL …`; a failure activates
  `hris-backup-failure.service` (journal entry at **alert** priority);
  `/opt/hris-backups/backups/.last-scheduled-run` always holds the newest
  run's timestamps, file paths, sizes and sha256 values.

## Recovery procedure

Database (as root):

```bash
TS=$(awk '{print $1}' /opt/hris-backups/backups/.last-scheduled-run | cut -d= -f2)
DB_FILE=$(ls -t /var/lib/postgresql/hris-backups/production-db-*-scheduled.dump | head -1)
sha256sum -c "$DB_FILE.sha256"
sudo -u postgres createdb hris_restore_rehearsal   # disposable, never the live DB
sudo -u postgres pg_restore -d hris_restore_rehearsal --no-owner "$DB_FILE"
```

Filesystem (as root, restores ACLs):

```bash
FS_FILE=$(ls -t /opt/hris-backups/backups/hris-private-*-scheduled.tar.gz | head -1)
sha256sum -c "$FS_FILE.sha256"
mkdir -p /tmp/opencode/fs-restore-verify && tar -xzf "$FS_FILE" -C /tmp/opencode/fs-restore-verify \
  --same-owner --preserve-permissions --acls --xattrs
# functional check: the hris service account must be able to read payslips
sudo -u hris test -r /tmp/opencode/fs-restore-verify/hris-private/payslips
```

`files are NOT in pg_dump`: a purged payslip file is unrecoverable without
the filesystem archive — the two artifacts must be restored together.

## Evidence

See the release report addendum for the timer-triggered execution proof and
the restore rehearsal (row counts, byte-identity, ACL equality, `hris`
service-account readability of the restored tree).
