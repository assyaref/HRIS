# Security Rotation — Implementation (Phase A / B / C)

**Status: CODE + TEMPLATES ONLY. NOTHING HAS BEEN APPLIED TO PRODUCTION.**

The credential exposure is real: `DATABASE_URL` and
`FACE_TEMPLATE_ENCRYPTION_KEY` were both readable from
`/opt/hris/.env.production` by any process running as the `hris` user, and the
face key decrypts every stored biometric template. This document describes how
to apply the rotation safely. Every production step in it is **unexecuted** and
requires a separate change window and approval.

---

## 1. What changed in the repository

| Area | File | Change |
|---|---|---|
| Key ring | `lib/attendance/template-cipher.ts` | Added `FACE_TEMPLATE_ENCRYPTION_KEY_PREVIOUS`, `FACE_TEMPLATE_KEY_VERSION`, `resolveTemplateKeyRing`, `resolveKeyForVersion`, and `*WithKey` variants that take decoded key bytes. |
| Seams | `lib/attendance/face-recognition.ts` | Encrypts with the **primary** key and returns `templateKeyVersion`. Decrypts by the row's **own** `key_version`. Reads the ring through the credential snapshot. |
| Write path | `features/employees/face-enrollment.actions.ts` | Both enrollment paths now persist `keyVersion` explicitly. |
| Read path | `features/employees/face-verification.queries.ts`, `.../face-verification.actions.ts` | Selects and threads `keyVersion`. |
| Schema | `db/schema/face_enrollments.ts` | Dropped `.default("v1")` to match 0019. |
| Migration | `db/migrations/0019_face_template_key_version.sql` | **DDL only.** `ALTER COLUMN key_version DROP DEFAULT`. |
| Re-key tool | `scripts/face-template-rekey.mts` | Transactional, abort-on-first-failure, idempotent audited transformation. |
| Credentials | `lib/config/credentials.ts` (new) | Reads systemd credentials, falls back to the env var. |
| Config | `lib/config/env.ts` | Routes the three secrets through the credential resolver. **No call site changed.** |
| Preflight | `scripts/validate-env.mjs` | Reports which secret source is live, never a value. |
| Deploy | `deploy/systemd/hris.service.d/10-credentials.conf` | Drop-in **template**, not installed. |
| Deploy | `deploy/systemd/provision-credential.sh` | stdin-only credential provisioning helper. |
| Deploy | `deploy/security/verify-db-rotation.sh` | Phase B five-check verifier. |
| Tests | `tests/attendance/template-keyring.test.ts` (new) | Rotation invariants. |
| Tests | `tests/attendance/face-template-rekey.test.ts` (new) | Re-key contract + disposable-DB tier. |
| Tests | `tests/attendance/credentials.test.ts` (new) | Credential resolution. |
| Docs | `SECURITY-ROTATION-ROLLBACK.md` | Rollback, including the matched-pair rule. |
| `package.json` | | `db:rekey-face-templates`, `db:rekey-face-templates:dry-run`. |

**Not modified:** `db/index.ts`, `drizzle.config.ts`, the migration journal,
`.env.production`, any production database, any service unit, any unrelated
HRIS feature.

---

## 2. Phase A — systemd credentials

### 2.1 Mechanism

`LoadCredentialEncrypted=` makes systemd decrypt a credential with the host key
and expose it as a **file** in `$CREDENTIALS_DIRECTORY`, not as an environment
variable. The application therefore has to read it, which
`lib/config/credentials.ts` does.

Verified on this host with a throwaway transient unit (systemd 255, no
production service involved):

| Property | Result |
|---|---|
| Secret in `/proc/<pid>/environ` | **0 occurrences** |
| Secret in command line (`ps`) | **0 occurrences** |
| `$CREDENTIALS_DIRECTORY` contains | a path only |
| Credential file mode | `0440 root:root`, readable by `hris` via ACL |
| Works with `ProtectSystem=full` + `NoNewPrivileges=true` | yes |

### 2.2 Credential IDs

Must match `SECRET_SOURCES` in `lib/config/credentials.ts`:

| Credential ID | Environment variable |
|---|---|
| `database_url` | `DATABASE_URL` |
| `face_template_encryption_key` | `FACE_TEMPLATE_ENCRYPTION_KEY` |
| `face_template_encryption_key_previous` | `FACE_TEMPLATE_ENCRYPTION_KEY_PREVIOUS` (rotation window only) |

### 2.3 Provisioning

```bash
# Generate and provision without the secret ever touching argv or history.
openssl rand -base64 32 | sudo ./deploy/systemd/provision-credential.sh \
  face_template_encryption_key
# -> PASS: ... provisioned at /etc/credstore/face_template_encryption_key.cred

sudo ./deploy/systemd/provision-credential.sh database_url < /root/new-db-url.txt

sudo install -m 0644 deploy/systemd/hris.service.d/10-credentials.conf \
  /etc/systemd/system/hris.service.d/10-credentials.conf   # production step
sudo systemctl daemon-reload
```

`EnvironmentFile=` is intentionally **kept** during the transition. The
resolver prefers the credential and falls back to the environment variable, so
the two coexist and the change is reversible by deleting the drop-in.

### 2.4 Permissions

| Path | Mode | Owner | Why |
|---|---|---|---|
| `/etc/credstore` | `0700` | `root:root` | Only root may request decryption |
| `/etc/credstore/*.cred` | `0644` | `root:root` | Value is encrypted; mode only gates who can ask |
| `/var/lib/systemd/credential.secret` | `0400` | `root:root` | Host key |
| `$CREDENTIALS_DIRECTORY/<id>` | `0440` | `root:root` | systemd-managed, ACL'd to the service user |

**Known limitation, not configurable away:** systemd reports the host key is
"not located on encrypted media", so a root-level attacker can still recover
the secret. This is a real improvement over a plaintext env file, but it is not
a substitute for a managed secret store. SOPS+age or Vault is the follow-up.

### 2.5 Rotation and rollback

Rotation = provision a new credential under a **new id**, update the drop-in,
`daemon-reload`, restart. Rollback = restore the previous drop-in + credential.
Full procedure in `SECURITY-ROTATION-ROLLBACK.md`.

---

## 3. Phase B — `DATABASE_URL`

`pg` only authenticates at connect time, and the pool reaps idle clients after
10s, so the ordering below is what makes the bad state unreachable.

```bash
# 0. Back up, and record the ledger baseline.
pg_dump -Fc ... > /root/pre-rotation-$(date -u +%Y%m%dT%H%M%SZ).dump
LEDGER=$(psql -Atc 'SELECT count(*) FROM drizzle.__drizzle_migrations')

# 1. STAGE the new credential (not yet referenced by any unit).
./deploy/systemd/provision-credential.sh database_url_next < /root/new-db-url.txt

# 2. Prove the staged value works BEFORE changing the role.
PGPASSWORD=... psql -h ... -U hris_app -d hris -c 'SELECT 1'

# 3. ALTER ROLE — needs a SUPERUSER session (hris_app has no memberships).
sudo -u postgres psql -c "ALTER ROLE hris_app PASSWORD '<new>'"

# 4. Point the unit at the new credential, daemon-reload, ONE restart (~1-3s).
# 5. Verify.
sudo DATABASE_URL_CRED_ID=database_url LEDGER_EXPECTED=$LEDGER \
  ./deploy/security/verify-db-rotation.sh
```

### Required verification

`verify-db-rotation.sh` performs all five checks and exits non-zero on any
failure. It was exercised end-to-end against a disposable database, including a
deliberately wrong ledger baseline, which correctly failed.

1. **Application DB connection succeeds** — the app's own `pg` pool, same
   resolution path as the running service.
2. **Independent `psql` connection succeeds** — separate process, password in
   the environment, never in argv.
3. **Old credential is rejected** — a deliberately wrong password must fail.
   This proves authentication is enforced *without* holding the old password.
4. **Migration ledger unchanged** — compares against a recorded baseline and
   distinguishes "table absent" from "connection problem".
5. **No authentication errors in `journalctl`** — scans for
   `password authentication failed` / `28P01` over the window.

### Cost of step 4

One restart drops in-flight requests: roughly **1–3 seconds** of downtime. This
is not zero-downtime and should not be described as such. It is the only
interruption, and both rotations need a restart anyway.

---

## 4. Phase C — face template key rotation

### 4.1 Why a key ring

AES-256-GCM is authenticated, so replacing the key outright makes every
existing template permanently unreadable, and the caller cannot tell "wrong
key" from "corrupt data". The ring selects a key by the row's own
`key_version`:

```
OLD_KEY  ─┐
          ├─> key ring ─> decrypt by key_version ─> re-encrypt ─> atomic UPDATE (ciphertext + label)
NEW_KEY  ─┘
```

There is deliberately **no trial decryption across keys**. The label is the
authority, so the decrypt path is never an oracle and the pre-existing
"wrong key is indistinguishable from tampering" property is preserved exactly.

### 4.2 Properties

| # | Requirement | How |
|---|---|---|
| 1 | Key ring selected by `key_version` | `resolveKeyForVersion(ring, label)` |
| 2 | Existing v1 template decryptable with OLD_KEY | previous key in the ring |
| 3 | New templates use NEW_KEY | encryption always uses `ring.primary` |
| 4 | Re-key decrypts with OLD, encrypts with NEW | `face-template-rekey.mts` |
| 5 | `key_version` updated atomically with ciphertext | single `UPDATE ... SET secret = $2, key_version = $3` |
| 6 | No plaintext written to disk | plaintext exists only in a local variable |
| 7 | No key in migration SQL | 0019 is one `ALTER TABLE` |
| 8 | Wrong key / tamper still tested | `template-keyring.test.ts` |
| 9 | Template count unchanged | re-key only updates; never inserts/deletes |

### 4.3 Procedure

```bash
# 1. Apply 0019 (schema only). Requires a separate approval: it must run AFTER
#    0018, and appending to the journal invalidates the approved 20-entry
#    candidate artifact.
npm run db:migrate

# 2. Deploy with the NEW key primary and the OLD key as previous:
#      FACE_TEMPLATE_ENCRYPTION_KEY         = new key   (v2)
#      FACE_TEMPLATE_KEY_VERSION            = v2
#      FACE_TEMPLATE_ENCRYPTION_KEY_PREVIOUS = old key
#    Restart. Old templates keep working; new ones are written under v2.

# 3. Rehearse, then re-key.
npm run db:rekey-face-templates:dry-run -- --dry-run
FACE_TEMPLATE_REKEY_OLD_KEY=<old> FACE_TEMPLATE_REKEY_NEW_KEY=<new> \
FACE_TEMPLATE_REKEY_FROM_VERSION=v1 FACE_TEMPLATE_REKEY_TO_VERSION=v2 \
  npm run db:rekey-face-templates

# 4. Verify: every row is v2 and decrypts with the new key; count unchanged.

# 5. Withdraw the previous key and close the window.
```

Keys are supplied **only** through environment variables, never argv, so they
never appear in `ps` or shell history.

### 4.4 The rotation window

There is a real window between step 2 and step 5 in which the OLD key must be
present. If a template is enrolled during that window it is written under the
new key and labelled v2, so it is fine; if the previous key is withdrawn while
any v1 row remains, those employees' verification fails closed as
`template_corrupt`. Check for stragglers before withdrawing:

```sql
SELECT key_version, count(*) FROM face_enrollment_templates GROUP BY 1;
```

The alternative for the one affected employee is revoke (which deletes the old
ciphertext) then re-enrol.

---

## 5. Staging rehearsal — performed

Fresh disposable database `hris_security_rotation_staging`, synthetic data only
(constant float32 vectors, never real biometrics), dedicated non-production role.

| Step | Result |
|---|---|
| Pre-0019 schema | `key_version` NOT NULL DEFAULT `'v1'` |
| 0019 applied | default dropped; re-applying is a no-op |
| 0019 rejects a missing `key_version` | NOT NULL violation, as designed |
| Seed 2 synthetic v1 rows under OLD_KEY | `2 \| v1,v1` |
| Pre-state behaviour | OLD_KEY decrypts, NEW_KEY fails |
| `--dry-run` | 0 re-keyed, fingerprint unchanged |
| Re-key v1 → v2 | 2 re-keyed, `2 \| v2,v2`, NEW_KEY decrypts, OLD_KEY fails |
| Idempotent re-run | 0 re-keyed, 2 already-current, fingerprint byte-identical |
| Rollback v2 → v1 | 2 re-keyed, OLD_KEY decrypts again |
| Tampered row mid-batch | ABORTED on the correct row, exit 1, **zero rows mutated** |
| Repeat successful path | 2 re-keyed, NEW_KEY decrypts |
| Plaintext/secret on disk or in output | 0 occurrences |

### Defect found and fixed during the rehearsal

The first rollback attempt passed the swapped keys as chained env prefix
assignments. Bash expands those **left to right**, so `NEW_KEY` picked up the
just-reassigned `OLD_KEY` and the tool silently re-labelled rows to `v1` while
still encrypting under the old material. The table looked migrated and every
row would have been unreadable at the next real rotation.

`rekeyFaceTemplates` now refuses when `oldKey` and `newKey` are identical, and
`face-template-rekey.test.ts` guards it. The CLI header also no longer claims
`COMMITTED` when a run aborted — an operator reading only the first line of a
log must not be misled.

---

## 6. Test results

| Suite | Result |
|---|---|
| `tests/attendance/template-cipher.test.ts` (pre-existing) | pass |
| `tests/attendance/template-keyring.test.ts` (new) | 14 pass |
| `tests/attendance/face-template-rekey.test.ts` (new) | 10 pass unit + 4 pass staging |
| `tests/attendance/credentials.test.ts` (new) | 15 pass |
| Full suite `npm test` | 1438 pass, 0 fail |
| `npx tsc --noEmit` | clean |
| `npx eslint` (all touched files) | clean |
| `npm run test:face-verification` | pass |

All keys in tests are `Buffer.alloc(32, n)` constants. No production face data
and no production secret is read by any test.

---

## 7. Outstanding approvals

- [ ] DBA approval for `0019` — **separate** from the `0018` candidate, which
      must land first.
- [ ] Change window for Phase A provisioning + drop-in install.
- [ ] Change window for Phase B (one restart, 1–3s interruption).
- [ ] Change window for Phase C (restart + re-key).
- [ ] Redaction of the now-superseded lines in `/opt/hris/.env.production`,
      after the rotation window closes.
- [ ] Follow-up: SOPS+age or Vault, to remove the host-key dependency.
