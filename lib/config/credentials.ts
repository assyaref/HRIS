import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * systemd credential resolution (Phase A of the security rotation).
 *
 * ## Why this exists
 *
 * `hris.service` currently loads secrets from `EnvironmentFile=`
 * (`/opt/hris/.env.production`). That file is the thing that leaked. Any
 * process running as the `hris` user can read it, and a plaintext copy sits
 * on disk for the lifetime of the credential.
 *
 * systemd credentials (`LoadCredentialEncrypted=`) move the secret out of the
 * environment and onto a per-service mount that systemd materialises just
 * before `ExecStart`. Verified on this host (systemd 255):
 *   - the secret does NOT appear in `/proc/<pid>/environ`;
 *   - it is NOT in the command line, so `ps` cannot show it;
 *   - `$CREDENTIALS_DIRECTORY` contains only a PATH;
 *   - the file is mode 0440 root:root, readable by the service user via ACL.
 *
 * ## The contract
 *
 * systemd does not put credentials in the environment — it exposes a directory
 * of files and sets one variable, `CREDENTIALS_DIRECTORY`. So the application
 * has to read them. This module is the single place that knows how, and it
 * resolves in a fixed order:
 *
 *   1. `$CREDENTIALS_DIRECTORY/<credential-name>`   (preferred, encrypted)
 *   2. `process.env[envVarName]`                    (legacy fallback)
 *
 * The fallback is what makes this a no-op today: with no
 * `CREDENTIALS_DIRECTORY` set, behaviour is byte-identical to the current
 * `EnvironmentFile=` deployment, so this change cannot break the running
 * service before the credentials are actually provisioned.
 *
 * ## Rules
 *
 * - Values are NEVER logged, returned in errors, or included in any thrown
 *   message. Errors name the variable/credential, never its contents.
 * - A missing credential file is indistinguishable from an unset variable, so
 *   callers keep their existing "required variable missing" behaviour.
 * - Trailing newlines are stripped. `systemd-creds encrypt` faithfully
 *   preserves file content, so a credential provisioned with a trailing
 *   newline must still parse.
 * - This module deliberately carries NO `server-only` marker, following the
 *   same convention as `lib/attendance/template-cipher.ts`, so it can be
 *   unit-tested. The public surface stays server-side: the only consumer is
 *   `lib/config/env.ts`, which IS marked `server-only`, and this module uses
 *   `node:fs`, which cannot be bundled for the browser at all.
 */

/** The one environment variable systemd sets for credentialed units. */
export const CREDENTIALS_DIRECTORY_ENV = "CREDENTIALS_DIRECTORY";

/**
 * Logical name -> (systemd credential id, legacy environment variable).
 *
 * The credential id is lowercase by systemd convention and is what appears in
 * `LoadCredentialEncrypted=` and in `$CREDENTIALS_DIRECTORY`.
 */
export const SECRET_SOURCES = {
  /** PostgreSQL connection string, including the role password. */
  databaseUrl: {
    credential: "database_url",
    envVar: "DATABASE_URL",
  },
  /** Base64 32-byte AES-256-GCM key for face template encryption. */
  faceTemplateEncryptionKey: {
    credential: "face_template_encryption_key",
    envVar: "FACE_TEMPLATE_ENCRYPTION_KEY",
  },
  /** Optional rotation-window fallback key (see template-cipher.ts). */
  faceTemplatePreviousKey: {
    credential: "face_template_encryption_key_previous",
    envVar: "FACE_TEMPLATE_ENCRYPTION_KEY_PREVIOUS",
  },
} as const;

export type SecretKey = keyof typeof SECRET_SOURCES;

/**
 * Read one credential file from `$CREDENTIALS_DIRECTORY`.
 *
 * Returns `undefined` when the mechanism is not in use, the directory does not
 * exist, or the named file is absent — all normal, non-error conditions during
 * a staged rollout.
 */
export function readCredential(credentialId: string): string | undefined {
  const directory = process.env[CREDENTIALS_DIRECTORY_ENV];
  if (!directory || directory.trim() === "") return undefined;
  try {
    // `readFileSync` on a directory or missing file throws; treat as absent.
    const raw = readFileSync(join(directory, credentialId), "utf8");
    return raw.replace(/\s+$/, "");
  } catch {
    return undefined;
  }
}

/** A single secret's two possible homes. */
interface SecretSource {
  credential: string;
  envVar: string;
}

/**
 * Resolve a secret from its systemd credential, falling back to the legacy
 * environment variable. This is the one place the precedence is decided.
 */
function resolveSource(
  source: SecretSource,
  env: Record<string, string | undefined>
): string | undefined {
  const fromCredential = readCredential(source.credential);
  if (fromCredential !== undefined && fromCredential !== "") {
    return fromCredential;
  }
  const fromEnv = env[source.envVar];
  return typeof fromEnv === "string" && fromEnv.trim() !== ""
    ? fromEnv
    : undefined;
}

/**
 * Resolve a secret by logical name.
 */
export function resolveSecret(
  key: SecretKey,
  env: Record<string, string | undefined> = process.env
): string | undefined {
  return resolveSource(SECRET_SOURCES[key], env);
}

/**
 * An environment-shaped view in which credential-backed secrets are overlaid.
 *
 * Existing code keeps using its familiar variable names, so migrating a secret
 * to a credential is a deployment change only — no call-site edits.
 */
export function credentialEnvSnapshot(
  env: Record<string, string | undefined> = process.env
): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = { ...env };
  for (const source of Object.values(SECRET_SOURCES)) {
    const value = resolveSource(source, env);
    if (value !== undefined) snapshot[source.envVar] = value;
  }
  return snapshot;
}

/**
 * True when systemd credentials are actually supplying secrets. Used by
 * `scripts/validate-env.mjs` and the runbooks so an operator can confirm which
 * mechanism is live without revealing any value.
 */
export function isCredentialBacked(key: SecretKey): boolean {
  const source = SECRET_SOURCES[key];
  const fromCredential = readCredential(source.credential);
  return fromCredential !== undefined && fromCredential !== "";
}
