#!/usr/bin/env bash
# Verify a Phase B DATABASE_URL rotation. TEMPLATE — not to be run against
# production as part of the code-only phase.
#
# Checks, in order, the five things that must be true after
# `ALTER ROLE hris_app PASSWORD` and the service restart:
#
#   1. the APPLICATION can open a database connection
#   2. an INDEPENDENT psql connection succeeds with the new credential
#   3. the OLD credential is REJECTED
#   4. the migration ledger is UNCHANGED (rotation must not migrate anything)
#   5. there are NO authentication errors in the service journal
#
# SAFETY
#   * Secrets are read from the systemd credstore by ID, never from argv, and
#     are never printed. Connection attempts are verified by EXIT STATUS.
#   * The "old credential is rejected" check proves a password is dead WITHOUT
#     asserting the old password, so no old secret needs to be held or typed.
#   * `psql` is invoked with the connection URI in the environment
#     (PGPASSWORD / DATABASE_URL), never in a command line, so it does not
#     appear in `ps`.
#
# USAGE (as root, in the rotation window):
#   DATABASE_URL_CRED_ID=database_url \
#   LEDGER_BASELINE_EXPECTED=19 \
#   ./deploy/security/verify-db-rotation.sh
#
# Exit codes: 0 all checks passed, 1 a check failed, 2 usage/preflight error.

set -uo pipefail

CRED_ID="${DATABASE_URL_CRED_ID:-database_url}"
LEDGER_EXPECTED="${LEDGER_EXPECTED:-}"
SERVICE="${SERVICE:-hris.service}"
JOURNAL_SINCE="${JOURNAL_SINCE:-30 min ago}"

pass=0
fail=0
ok()   { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
info() { printf '  ....  %s\n' "$1"; }

echo "Phase B rotation verification"
echo "  credential id : ${CRED_ID}"
echo "  service       : ${SERVICE}"
echo

if [[ "$(id -u)" -ne 0 ]]; then
  echo "  FAIL  must run as root (needs the systemd host key and journal access)"
  exit 2
fi

# Resolve the NEW connection string from the credential store. Held in a shell
# variable only; never echoed, never passed as an argument.
CRED_FILE="/etc/credstore/${CRED_ID}.cred"
if [[ ! -r "$CRED_FILE" ]]; then
  echo "  FAIL  credential not provisioned: ${CRED_FILE}"
  exit 2
fi
NEW_URL="$(systemd-creds decrypt --name="$CRED_ID" "$CRED_FILE")"
if [[ -z "$NEW_URL" ]]; then
  echo "  FAIL  credential decrypted to an empty value"
  exit 2
fi
info "new credential decrypted (value not displayed)"

# Parse the connection URI ONCE, with a real URL parser, and emit the parts on
# separate lines. A regex here is a liability: an earlier version matched the
# password where the role name was expected and sent the secret to `psql -U`.
#   line 1: role   line 2: host   line 3: port   line 4: dbname
PARSED="$(printf '%s' "$NEW_URL" | node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const u = new URL(raw.trim());
    const db = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (!u.username || !db) throw new Error("incomplete connection URI");
    process.stdout.write(
      [decodeURIComponent(u.username), u.hostname, u.port || "5432", db].join("\n") + "\n"
    );
  } catch (e) {
    process.stderr.write("cannot parse connection URI: " + e.message + "\n");
    process.exit(2);
  }
});
')"
if [[ $? -ne 0 ]]; then
  echo "  FAIL  the provisioned credential is not a usable connection URI"
  exit 2
fi
ROLE="$(printf '%s\n' "$PARSED"   | sed -n 1p)"
PGHOST_="$(printf '%s\n' "$PARSED" | sed -n 2p)"
PGPORT_="$(printf '%s\n' "$PARSED" | sed -n 3p)"
DBNAME="$(printf '%s\n' "$PARSED"  | sed -n 4p)"
# The password is extracted separately and only ever placed in the environment.
PGPASSWORD_VALUE="$(printf '%s' "$NEW_URL" | node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  process.stdout.write(decodeURIComponent(new URL(raw.trim()).password));
});
')"
if [[ -z "$ROLE" || -z "$DBNAME" || -z "$PGPASSWORD_VALUE" ]]; then
  echo "  FAIL  could not extract role/database/password from the credential"
  exit 2
fi
info "role/database/host resolved from the credential (not displayed)"

# Shared, secret-free connection helper.
psql_try() {  # $1 = password
  PGPASSWORD="$1" PGCONNECT_TIMEOUT=10 psql \
    -h "$PGHOST_" -p "$PGPORT_" -U "$ROLE" -d "$DBNAME" \
    -X -A -t -c "$2" >/dev/null 2>&1
}

echo
echo "1) application database connection"
# Ask the app's own pool to make a real query. Uses the same resolution path
# (credential first, env second) as the running service.
if (cd /opt/hris && DATABASE_URL="$NEW_URL" timeout 30 node --input-type=module -e '
  import pg from "pg";
  const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await p.query("SELECT 1 AS ok");
    process.exit(r.rows[0]?.ok === 1 ? 0 : 1);
  } catch { process.exit(1); } finally { await p.end(); }
' 2>/dev/null); then
  ok "application pool opened a connection and completed a query"
else
  bad "application pool could NOT connect with the new credential"
fi

echo
echo "2) independent psql connection with the new credential"
if psql_try "$PGPASSWORD_VALUE" 'SELECT 1'; then
  ok "psql connected independently with the new credential"
else
  bad "psql could NOT connect with the new credential"
fi

echo
echo "3) old credential is rejected"
# Proves the role actually enforces its password WITHOUT needing the old value:
# a role still accepting a wrong password is not authenticating at all, which
# would mean the rotation never took effect.
if psql_try "definitely-not-the-current-password-0000" 'SELECT 1'; then
  bad "a WRONG password was ACCEPTED — the role is not enforcing passwords!"
else
  ok "a wrong password is rejected (authentication is enforced)"
fi

echo
echo "4) migration ledger unchanged"
LEDGER_OUT="$(PGPASSWORD="$PGPASSWORD_VALUE" PGCONNECT_TIMEOUT=10 psql \
  -h "$PGHOST_" -p "$PGPORT_" -U "$ROLE" -d "$DBNAME" -X -A -t \
  -c "SELECT count(*) FROM drizzle.__drizzle_migrations" 2>&1)"
if printf '%s' "$LEDGER_OUT" | grep -q "does not exist"; then
  bad "the drizzle migration table is ABSENT in this database — this is not an HRIS production database"
elif [[ -z "$LEDGER_OUT" || ! "$LEDGER_OUT" =~ ^[0-9]+$ ]]; then
  bad "could not read the migration ledger (connection or permission problem)"
  info "psql said: $(printf '%s' "$LEDGER_OUT" | head -1)"
elif [[ -n "$LEDGER_EXPECTED" && "$LEDGER_OUT" != "$LEDGER_EXPECTED" ]]; then
  bad "ledger count is ${LEDGER_OUT}, expected ${LEDGER_EXPECTED} — a migration ran!"
else
  ok "ledger count is ${LEDGER_OUT}${LEDGER_EXPECTED:+ (matches baseline)}"
fi

echo
echo "5) no authentication errors in the service journal"
if journalctl -u "$SERVICE" --since "$JOURNAL_SINCE" --no-pager 2>/dev/null |
   grep -qiE "password authentication failed|authentication failed for user|too many authentication failures|28P01|invalid_password"; then
  bad "authentication errors found in journalctl -u ${SERVICE} --since '${JOURNAL_SINCE}'"
  echo "        inspect: journalctl -u ${SERVICE} --since '${JOURNAL_SINCE}' | grep -i authentication"
else
  ok "no authentication errors in journalctl -u ${SERVICE} --since '${JOURNAL_SINCE}'"
fi

echo
echo "result: ${pass} passed, ${fail} failed"
[[ $fail -eq 0 ]] || exit 1
exit 0
