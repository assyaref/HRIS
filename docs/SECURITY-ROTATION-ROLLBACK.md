# Security Rotation — Rollback

**No production change has been made. This document is prepared, not executed.**

---

## 0. The rule that matters most

> **A pre-re-key ciphertext backup and the OLD key are a MATCHED PAIR.**
> Restoring one without the other produces a state that looks healthy and
> silently fails every face verification.

`face_enrollment_templates` stores no key identifier of its own beyond
`key_version`, and GCM offers no way to detect that a key is wrong other than
authentication failure. So "restored the backup" and "have the right key" must
travel together, and the pair must be recorded at the moment of the re-key.

Record these **before** touching anything:

```bash
openssl rand -base64 32            > /root/OLD_KEY.0600     # the key being replaced
pg_dump -Fc -t face_enrollment_templates \
  hris > /root/pre-rekey-$(date -u +%Y%m%dT%H%M%SZ).dump
sha256sum /root/pre-rekey-*.dump /root/OLD_KEY.0600 > /root/rotation-pair.sha256
```

---

## 1. Decision table

| Situation | Action | Blast radius |
|---|---|---|
| Re-key aborted (exit 1) | **Nothing to roll back.** The transaction rolled back. Confirm with the counts below. | none |
| Re-key succeeded, then a problem appears | Re-key **backwards** (section 3), *or* restore the pair (section 4) | face verification only |
| Re-key succeeded, no problem | Withdraw the previous key, close the window (section 5) | none |
| New key lost before re-key | Nothing to roll back — no row was changed | none |
| New key lost **after** re-key | Re-key backwards needs the old key, which is why the pair is mandatory | — |
| `DATABASE_URL` rotation broke the app | section 2 | app availability |
| 0019 needs reverting | section 6 | schema only |

---

## 2. Phase B rollback — `DATABASE_URL`

Interruption is a restart; recovery is a credential swap. No schema or data
change, so the migration ledger must stay exactly where it was.

```bash
# 1. Point the unit back at the previous credential id.
sudo cp /root/10-credentials.conf.pre-rotation \
     /etc/systemd/system/hris.service.d/10-credentials.conf
sudo systemctl daemon-reload
sudo systemctl restart hris.service

# 2. Verify.
sudo DATABASE_URL_CRED_ID=database_url LEDGER_EXPECTED=<baseline> \
  ./deploy/security/verify-db-rotation.sh
```

**If the previous credential is also gone**, re-establish access with a
superuser session and issue a fresh password:

```bash
sudo -u postgres psql -c "ALTER ROLE hris_app PASSWORD '<new>'"
# then provision it and restart, as in the forward procedure
```

> Rolling the password back re-activates the *exposed* credential. If the
> rollback is because of a suspected compromise, roll forward to a new random
> password instead and treat the old one as permanently burned.

**Verify a rollback worked:**

```bash
systemctl is-active hris.service
journalctl -u hris.service --since '5 min ago' | grep -iE 'auth|28P01' # expect nothing
psql "$DATABASE_URL" -Atc 'SELECT count(*) FROM drizzle.__drizzle_migrations'  # unchanged
```

---

## 3. Phase C rollback — re-key backwards (preferred)

Reversible with no data loss, because the tool is symmetric. Requires the
**new** key to decrypt and the **old** key to re-encrypt.

```bash
# NOTE: assign the variables as separate commands. Chained env prefix
# assignments are expanded left-to-right by bash and will silently give both
# variables the same value.
export FACE_TEMPLATE_REKEY_OLD_KEY="$(cat /root/NEW_KEY.0600)"
export FACE_TEMPLATE_REKEY_NEW_KEY="$(cat /root/OLD_KEY.0600)"
export FACE_TEMPLATE_REKEY_FROM_VERSION=v2
export FACE_TEMPLATE_REKEY_TO_VERSION=v1

npm run db:rekey-face-templates:dry-run
npm run db:rekey-face-templates
```

Then confirm every row is back on the old key:

```bash
psql "$DATABASE_URL" -Atc \
  "SELECT key_version, count(*) FROM face_enrollment_templates GROUP BY 1"
# expect: v1 | <original count>
```

If the tool reports `ABORTED` and changed nothing, the table is already in its
pre-re-key state — the rollback is complete.

### Restore-from-backup route (last resort)

Only if re-key backwards is impossible, e.g. the new key is lost:

```bash
systemctl stop hris.service                 # stop writers first
sha256sum -c /root/rotation-pair.sha256      # prove BOTH artifacts are intact
psql "$ADMIN_DATABASE_URL" -c \
  "TRUNCATE face_enrollment_templates"       # NOT a bare pg_restore over live rows
pg_restore --data-only --disable-triggers \
  -d hris /root/pre-rekey-*.dump
# re-key is now unnecessary: the dump is already v1 ciphertext
systemctl start hris.service
```

> Restoring the dump **without** the old key leaves every template
> undecryptable, and every affected employee will fail verification as
> `template_corrupt`. There is no recovery from that except re-enrolment.

---

## 4. Confirming "nothing changed"

```bash
psql "$DATABASE_URL" -Atc \
  "SELECT count(*), string_agg(key_version,',' ORDER BY key_version)
     FROM face_enrollment_templates"
```

Compare against the pre-rotation snapshot. Row count must be identical, and
after an aborted run every label must still be the original one.

---

## 5. Withdrawing the previous key (closing the window)

Only after every row is on the new version:

```sql
SELECT key_version, count(*) FROM face_enrollment_templates GROUP BY 1;
```

```bash
# Remove the previous key from the drop-in and the credstore, then restart.
sudo sed -i '/face_template_encryption_key_previous/d' \
  /etc/systemd/system/hris.service.d/10-credentials.conf
sudo rm -f /etc/credstore/face_template_encryption_key_previous.cred
sudo systemctl daemon-reload && sudo systemctl restart hris.service
node scripts/validate-env.mjs   # expect: credential:..._previous | ABSENT
```

**If a v1 row is still present when the old key is withdrawn**, that employee's
verification fails closed. The remedy is revoke (deletes the stale ciphertext)
then re-enrol. Check first, withdraw second.

Keep `/root/OLD_KEY.0600` until the window is fully closed and verified, then
destroy it — the whole point is that the old key stops existing.

---

## 6. 0019 rollback

```sql
ALTER TABLE face_enrollment_templates
  ALTER COLUMN key_version SET DEFAULT 'v1';
```

Safe **only** if no row has been re-keyed to a non-`v1` version: the default
only applies to inserts that omit the column, and the application always sets
it explicitly, so the default is a safety net rather than a behaviour
dependency. Application code does not need to change.

Note the drizzle ledger is **not** edited by hand. Reverting a migration that
has been recorded means a new forward migration, not a journal edit.

---

## 7. Verification after any rollback

```bash
node --test tests/attendance/template-keyring.test.ts \
         tests/attendance/face-template-rekey.test.ts
npm test
node scripts/validate-env.mjs
npm run test:face-verification
systemctl is-active hris.service
psql "$DATABASE_URL" -Atc 'SELECT count(*) FROM drizzle.__drizzle_migrations'
```

The last value must equal the recorded baseline. A credential rotation must
never move it.

---

## 8. Escalation

Stop and escalate rather than improvise if:

- the re-key aborts and the row count or labels do not match the snapshot;
- `face_enrollment_templates` count changed outside a migration;
- the ledger count differs from the baseline;
- a face verification fails for an employee whose template was not touched;
- the old key or the pre-re-key dump cannot be located — **the rotation cannot
  be rolled back without them**, so halt before starting, not after.
