#!/usr/bin/env bash
# Provision / rotate an HRIS secret into the systemd credential store.
#
# Part of Phase A of the security rotation. TEMPLATE — NOT RUN AGAINST
# PRODUCTION as part of the code-only phase.
#
# WHY A SCRIPT
#   `systemd-creds encrypt` takes a file or stdin. Doing that by hand is how
#   secrets end up in shell history, in `ps` output, and in a file with loose
#   permissions. This helper:
#     * reads the secret from STDIN ONLY, never from argv, so it never appears
#       in `ps`, in shell history, or in the process listing;
#     * never echoes the secret, not even when asked;
#     * creates the staging file 0600 and removes it with a trap;
#     * installs the credential 0644 root:root (the value is encrypted; the
#       file mode only gates who may ask systemd to decrypt it);
#     * verifies the result by DECRYPTING it and comparing, printing only
#       PASS/FAIL.
#
# USAGE
#   # Secret on stdin. Generate one without ever typing it:
#   openssl rand -base64 32 | ./deploy/systemd/provision-credential.sh \
#       face_template_encryption_key
#
#   # Or read from an existing 0600 file, e.g. when staging a rotation:
#   sudo ./deploy/systemd/provision-credential.sh database_url < /root/new-db-url.txt
#
#   # Stage under a temporary name first, to prove the new value before the
#   # ALTER ROLE (see Phase B runbook):
#   openssl rand -base64 32 | ./deploy/systemd/provision-credential.sh \
#       face_template_encryption_key_next
#
# MUST BE RUN AS ROOT: it writes /etc/credstore and reads the systemd host key.

set -euo pipefail

CREDSTORE_DIR="${CREDSTORE_DIR:-/etc/credstore}"

usage() {
  echo "usage: $0 <credential-id> [credstore-dir]" >&2
  echo "  reads the secret value from STDIN" >&2
  echo "  example: openssl rand -base64 32 | $0 face_template_encryption_key" >&2
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 2
fi

CRED_ID="$1"
DEST_DIR="${2:-$CREDSTORE_DIR}"

if [[ ! "$CRED_ID" =~ ^[a-z0-9_]+$ ]]; then
  echo "error: credential id must be lowercase [a-z0-9_]+ (systemd convention)" >&2
  exit 2
fi

if [[ ! -t 0 ]]; then
  :
else
  echo "error: no secret on stdin; pipe the value in (never pass it as an argument)" >&2
  exit 2
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "error: must run as root to write ${DEST_DIR} and read the host key" >&2
  exit 2
fi

STAGING="$(mktemp -d)"
cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT

umask 077
# Newline-trimmed: the application strips trailing whitespace, and a stray
# newline in a credential file is a classic silent-misconfiguration source.
cat > "${STAGING}/secret"
printf '%s' "$(cat "${STAGING}/secret")" > "${STAGING}/secret.trimmed"
if [[ ! -s "${STAGING}/secret.trimmed" ]]; then
  echo "error: refusing to provision an EMPTY credential" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
chmod 0700 "$DEST_DIR"

# `--name` must equal the file stem or systemd-creds refuses to decrypt later.
systemd-creds encrypt --name="$CRED_ID" \
  "${STAGING}/secret.trimmed" "${DEST_DIR}/${CRED_ID}.cred" 2>&1 |
  grep -v "not located on encrypted media" || true
chmod 0644 "${DEST_DIR}/${CRED_ID}.cred"

# Verify by round-trip, comparing without printing either value.
if systemd-creds decrypt --name="$CRED_ID" "${DEST_DIR}/${CRED_ID}.cred" |
  cmp -s - "${STAGING}/secret.trimmed"; then
  echo "PASS: ${CRED_ID} provisioned at ${DEST_DIR}/${CRED_ID}.cred and verified"
  echo "      (host key: /var/lib/systemd/credential.secret, mode 0400 root)"
  exit 0
else
  echo "FAIL: ${CRED_ID} did not round-trip; do NOT restart the service" >&2
  exit 1
fi
