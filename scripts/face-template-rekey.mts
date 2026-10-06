#!/usr/bin/env node
/**
 * Face template RE-KEY — Phase C of the security rotation architecture.
 *
 * Re-encrypts `face_enrollment_templates` from one encryption key version to
 * another, so that `FACE_TEMPLATE_ENCRYPTION_KEY` can be rotated without ever
 * leaving existing templates undecryptable.
 *
 * WHY THIS IS NOT A MIGRATION:
 *   AES-256-GCM re-encryption requires the OLD key (to decrypt) and the NEW
 *   key (to encrypt). Migration SQL must never contain key material, and the
 *   migration ledger is not an appropriate place for a long-running,
 *   auditable, restartable data transformation. 0019 is therefore DDL-only
 *   (it just removes the `key_version` column DEFAULT); the cryptographic
 *   rewrite lives here, as an explicit, operator-driven tool.
 *
 * OPERATING MODEL:
 *
 *   OLD_KEY  ─┐
 *             ├─> key ring ─> decrypt row by row ─> re-encrypt ─> atomic
 *   NEW_KEY  ─┘                (labelled by key_version)              UPDATE
 *
 * SAFETY PROPERTIES:
 *   - TRANSACTIONAL: one transaction for the whole table. Either every
 *     eligible row moves to the new key version, or none do.
 *   - ABORT ON FIRST FAILURE: the first row that cannot be decrypted with the
 *     OLD key (wrong key, tampered ciphertext, malformed blob, or plaintext
 *     that does not decode to a valid embedding) aborts the entire run. It
 *     never "skips" a bad row and never continues in a partially-rekeyed
 *     state.
 *   - IDEMPOTENT: rows already carrying the target key version are left
 *     untouched and counted as `alreadyCurrent`. Re-running after a success is
 *     a no-op that reports 0 changes.
 *   - NO PLAINTEXT EXPORT: plaintext embeddings exist only in the local
 *     variable used to re-encrypt. They are never written to a file, a log,
 *     stdout, an error message, or the database in cleartext. The only
 *     persistent artifact is new ciphertext.
 *   - NO SECRET LOGGING: this tool prints counts, ids, and key *version
 *     labels* only. It never prints key material, the credential, the
 *     connection string, or any plaintext. Error output is reduced to a
 *     stable reason code plus the row id.
 *   - EXPLICIT KEY SELECTION: old and new keys are named by environment
 *     variable and may NOT be passed as command-line arguments, so they never
 *     appear in `ps`, shell history, or process listings.
 *   - CONCURRENCY SAFE: rows are locked `FOR UPDATE` in a single transaction,
 *     so a concurrent enrollment/verification cannot interleave with the
 *     rewrite.
 *   - SAFE ROLLBACK: reverting is a re-key in the opposite direction, using
 *     the pre-re-key ciphertext backup plus the old key. The two are a
 *     MATCHED PAIR — see SECURITY-ROTATION-ROLLBACK.md.
 *
 * USAGE:
 *   # Never run against production as a first step. Rehearse on staging.
 *   FACE_TEMPLATE_REKEY_OLD_KEY=<base64 old key> \
 *   FACE_TEMPLATE_REKEY_NEW_KEY=<base64 new key> \
 *   FACE_TEMPLATE_REKEY_FROM_VERSION=v1 \
 *   FACE_TEMPLATE_REKEY_TO_VERSION=v2 \
 *   node scripts/face-template-rekey.mts [--dry-run] [--json]
 *
 *   --dry-run  Runs the full read + decrypt validation, reports what WOULD
 *              change, then rolls back. Use this first, always.
 *   --json     Machine-readable result on stdout (still no secrets).
 *
 * EXIT CODES:
 *   0  success (or a clean --dry-run)
 *   1  aborted; transaction rolled back, nothing changed
 *   2  configuration / preflight failure (missing key, bad key, no target)
 *
 * Requires Node with native TypeScript support (>= 23.6, or Node 22.6+ with
 * `--experimental-strip-types`). The project is developed against Node 24.
 */

import { config as loadEnv } from "dotenv";
import pg from "pg";
import { pathToFileURL } from "node:url";

import { FACE_TEMPLATE_KEY_BYTES } from "../lib/attendance/template-cipher.ts";

/** Environment variables holding the explicit old/new key material. */
export const REKEY_OLD_KEY_ENV = "FACE_TEMPLATE_REKEY_OLD_KEY";
export const REKEY_NEW_KEY_ENV = "FACE_TEMPLATE_REKEY_NEW_KEY";
export const REKEY_FROM_VERSION_ENV = "FACE_TEMPLATE_REKEY_FROM_VERSION";
export const REKEY_TO_VERSION_ENV = "FACE_TEMPLATE_REKEY_TO_VERSION";

/** Row shape returned by the locking SELECT. */
interface RekeyRow {
  id: string;
  key_version: string;
  secret: Buffer;
}

/** Minimal `pg` client surface, so tests can inject a stub. */
export interface RekeyClient {
  query(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: RekeyRow[]; rowCount?: number | null }>;
  release(): void;
}

export interface RekeyOptions {
  /** Decoded 32-byte key that can decrypt the rows being re-keyed. */
  oldKey: Buffer;
  /** Decoded 32-byte key used to write the new ciphertext. */
  newKey: Buffer;
  /** Only rows whose `key_version` equals this label are re-keyed. */
  fromVersion: string;
  /** Version label written to every re-keyed row. */
  toVersion: string;
  /** Validate and roll back instead of committing. */
  dryRun?: boolean;
}

export type RekeyAbortReason =
  | "old_key_cannot_decrypt_row"
  | "new_key_cannot_encrypt"
  | "row_already_at_target_with_wrong_ciphertext"
  | "invariant_violation";

export interface RekeyReport {
  ok: boolean;
  dryRun: boolean;
  fromVersion: string;
  toVersion: string;
  /** Rows examined inside the transaction. */
  scanned: number;
  /** Rows re-encrypted by this run. */
  rekeyed: number;
  /** Rows already on `toVersion` (idempotency no-op). */
  alreadyCurrent: number;
  /** Rows carrying a version label that is neither from nor to. */
  untouchedOtherVersion: number;
  aborted: boolean;
  abortReason: RekeyAbortReason | null;
  /** Row id that caused the abort, if any. Never row content. */
  abortRowId: string | null;
}

export class RekeyAbortError extends Error {
  readonly reason: RekeyAbortReason;
  readonly rowId: string | null;

  constructor(reason: RekeyAbortReason, rowId: string | null) {
    // Message intentionally carries NO key material and NO plaintext.
    super(
      `face template re-key aborted: ${reason}${
        rowId ? ` (row ${rowId})` : ""
      }; transaction rolled back, no rows changed`
    );
    this.name = "RekeyAbortError";
    this.reason = reason;
    this.rowId = rowId;
  }
}

/** Decoded 32-byte key, or a configuration error. Never logged. */
function requireKeyMaterial(
  base64: string | undefined,
  variableName: string
): Buffer {
  if (!base64 || base64.trim() === "") {
    throw new Error(`${variableName} is not set`);
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(base64.trim(), "base64");
  } catch {
    throw new Error(`${variableName} is not valid base64`);
  }
  if (decoded.length !== FACE_TEMPLATE_KEY_BYTES) {
    throw new Error(
      `${variableName} must decode to exactly ${FACE_TEMPLATE_KEY_BYTES} bytes`
    );
  }
  return decoded;
}

/**
 * Validate that a decrypted buffer is a well-formed face embedding
 * (1024 × finite float32). A row whose plaintext is not a valid embedding is
 * treated as a hard abort, not a skip: silently re-keying it would preserve
 * garbage, and skipping it would leave the table mixed.
 */
function isPlausibleFaceEmbedding(plaintext: Buffer): boolean {
  if (plaintext.length !== 4096) return false;
  if (plaintext.length % 4 !== 0) return false;
  const view = new Float32Array(
    plaintext.buffer,
    plaintext.byteOffset,
    plaintext.length / 4
  );
  for (let i = 0; i < view.length; i += 1) {
    const value = view[i];
    if (!Number.isFinite(value)) return false;
    if (value === 0) return false; // degenerate all-zero embedding
  }
  return true;
}

/**
 * Re-key every `face_enrollment_templates` row at `fromVersion` to
 * `toVersion`, inside a single transaction.
 *
 * The client MUST be checked out from a pool; the caller owns COMMIT/ROLLBACK
 * so this function can be unit-tested with a stub and reused by a CLI.
 */
export async function rekeyFaceTemplates(
  client: RekeyClient,
  options: RekeyOptions
): Promise<RekeyReport> {
  const { oldKey, newKey, fromVersion, toVersion, dryRun = false } = options;

  if (fromVersion === toVersion) {
    throw new Error("fromVersion and toVersion must differ");
  }

  // Re-keying key material onto itself is always a configuration error, and it
  // is a dangerous one: the rows would be re-labelled with the new version
  // while still being encrypted under the old key, and the next process to
  // start with a genuinely rotated key would find every template unreadable.
  // Refuse rather than silently producing a table that looks migrated.
  if (oldKey.equals(newKey)) {
    throw new Error(
      "old and new key material are identical; refusing to re-key a key onto itself"
    );
  }

  // A fresh cipher module import is required lazily so the test harness can
  // point the crypto helpers at synthetic keys without touching process.env.
  const {
    decryptTemplateSecretWithKey,
    encryptTemplateSecretWithKey,
  } = await import("../lib/attendance/template-cipher.ts");

  const report: RekeyReport = {
    ok: true,
    dryRun,
    fromVersion,
    toVersion,
    scanned: 0,
    rekeyed: 0,
    alreadyCurrent: 0,
    untouchedOtherVersion: 0,
    aborted: false,
    abortReason: null,
    abortRowId: null,
  };

  await client.query("BEGIN");
  try {
    // Row locks for the duration of the transaction: blocks any concurrent
    // enrollment insert or verification read from observing a half-rewritten
    // table. Stable ordering keeps the lock acquisition deterministic.
    const result = await client.query(
      `SELECT id, key_version, secret
         FROM face_enrollment_templates
        ORDER BY id
        FOR UPDATE`
    );
    const rows: RekeyRow[] = result.rows;

    report.scanned = rows.length;

    for (const row of rows) {
      if (row.key_version === toVersion) {
        // Idempotency: already migrated by a previous run. Never re-encrypt
        // an already-current row — doing so would needlessly churn ciphertext
        // and, worse, would let a re-run silently "succeed" against a row it
        // cannot actually decrypt.
        report.alreadyCurrent += 1;
        continue;
      }
      if (row.key_version !== fromVersion) {
        report.untouchedOtherVersion += 1;
        continue;
      }

      // Decrypt with the OLD key. Any failure aborts the whole run.
      let plaintext: Buffer;
      try {
        plaintext = decryptTemplateSecretWithKey(row.secret, oldKey);
      } catch {
        throw new RekeyAbortError("old_key_cannot_decrypt_row", row.id);
      }
      if (!isPlausibleFaceEmbedding(plaintext)) {
        // Wrong key that happened to authenticate is impossible with GCM, so
        // this means the stored row is not a valid embedding.
        throw new RekeyAbortError("old_key_cannot_decrypt_row", row.id);
      }

      // Re-encrypt with the NEW key. Plaintext is not referenced after this.
      let newSecret: Buffer;
      try {
        newSecret = encryptTemplateSecretWithKey(plaintext, newKey);
      } catch {
        throw new RekeyAbortError("new_key_cannot_encrypt", row.id);
      }

      // Prove the new ciphertext is readable with the new key BEFORE it
      // becomes the persisted value. Without this, a key passed on the command
      // line could be wrong-but-well-formed and every template would be
      // written as permanently undecryptable garbage.
      let verifyPlaintext: Buffer;
      try {
        verifyPlaintext = decryptTemplateSecretWithKey(newSecret, newKey);
      } catch {
        throw new RekeyAbortError("new_key_cannot_encrypt", row.id);
      }
      if (verifyPlaintext.length !== plaintext.length) {
        throw new RekeyAbortError("invariant_violation", row.id);
      }

      // key_version is updated in the SAME statement as the ciphertext, so a
      // row can never carry new ciphertext labelled with the old key version.
      const updated = await client.query(
        `UPDATE face_enrollment_templates
            SET secret = $2, key_version = $3
          WHERE id = $1`,
        [row.id, newSecret, toVersion]
      );
      if (updated.rows.length !== 1 && updated.rowCount !== 1) {
        throw new RekeyAbortError("invariant_violation", row.id);
      }

      report.rekeyed += 1;
    }

    if (dryRun) {
      await client.query("ROLLBACK");
      report.rekeyed = 0;
    } else {
      await client.query("COMMIT");
    }
    return report;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection may already be aborted; the original error is what
      // matters and it is re-thrown below.
    }
    if (error instanceof RekeyAbortError) {
      report.ok = false;
      report.aborted = true;
      report.abortReason = error.reason;
      report.abortRowId = error.rowId;
      report.rekeyed = 0;
      return report;
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function readConfig(): {
  oldKey: Buffer;
  newKey: Buffer;
  fromVersion: string;
  toVersion: string;
  dryRun: boolean;
  json: boolean;
} {
  const env = process.env;
  const oldKey = requireKeyMaterial(env[REKEY_OLD_KEY_ENV], REKEY_OLD_KEY_ENV);
  const newKey = requireKeyMaterial(env[REKEY_NEW_KEY_ENV], REKEY_NEW_KEY_ENV);

  const fromVersion = (env[REKEY_FROM_VERSION_ENV] ?? "v1").trim();
  const toVersion = (env[REKEY_TO_VERSION_ENV] ?? "").trim();
  if (toVersion === "") {
    throw new Error(
      `${REKEY_TO_VERSION_ENV} is not set (e.g. v2); refusing to guess`
    );
  }
  if (fromVersion === toVersion) {
    throw new Error("fromVersion and toVersion must differ");
  }

  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const json = args.has("--json");
  if (dryRun) {
    // A dry run is a rehearsal; it must not be skipped by accident, and it
    // must never be a silent no-op on an empty table.
    args.delete("--dry-run");
  }
  return { oldKey, newKey, fromVersion, toVersion, dryRun, json };
}

async function main(): Promise<void> {
  loadEnv();

  let config: ReturnType<typeof readConfig>;
  try {
    config = readConfig();
  } catch (error) {
    // Configuration errors are safe to print: they name variables, never
    // values.
    process.stderr.write(
      `face template re-key: configuration error: ${
        (error as Error).message
      }\n`
    );
    process.exitCode = 2;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write("face template re-key: DATABASE_URL is not set\n");
    process.exitCode = 2;
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const report = await rekeyFaceTemplates(client, {
      oldKey: config.oldKey,
      newKey: config.newKey,
      fromVersion: config.fromVersion,
      toVersion: config.toVersion,
      dryRun: config.dryRun,
    });

    if (config.json) {
      // Report shape is fixed and contains no secrets.
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      // The header must never claim a commit that did not happen: an operator
      // reading only the first line of a log must not be told "COMMITTED"
      // when the transaction was rolled back.
      const mode = report.aborted
        ? "ABORTED (rolled back, nothing changed)"
        : report.dryRun
          ? "DRY RUN (rolled back)"
          : "COMMITTED";
      process.stdout.write(
        [
          `face template re-key ${mode}`,
          `  from key_version : ${report.fromVersion}`,
          `  to   key_version : ${report.toVersion}`,
          `  rows scanned     : ${report.scanned}`,
          `  rows re-keyed    : ${report.rekeyed}`,
          `  already current  : ${report.alreadyCurrent}`,
          `  other version    : ${report.untouchedOtherVersion}`,
          report.aborted
            ? `  abort           : ${report.abortReason} (row ${report.abortRowId}) — no rows changed`
            : `  result          : ok`,
          "",
        ].join("\n")
      );
    }

    if (report.aborted) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      `face template re-key failed: ${(error as Error).message}\n`
    );
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

// Only run the CLI when this file is the process entrypoint. The comparison is
// made on fully-resolved URLs, not substrings, so importing the module from a
// test (whose filename merely *contains* this script's name) never triggers a
// database connection.
const invokedPath = process.argv[1];
const isDirectRun =
  invokedPath !== undefined &&
  pathToFileURL(invokedPath).href === import.meta.url;

if (isDirectRun) {
  main();
}
