import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * At-rest template encryption (Phase 10.2).
 *
 * Self-hosted face engines return an embedding that must be stored so Phase
 * 10.3 can match a later capture against it. This module encrypts that
 * embedding with AES-256-GCM before it is persisted. The browser never sees
 * the key, the plaintext embedding, or the ciphertext.
 *
 * Rules:
 * - Standard AES-256-GCM via `node:crypto` (never home-grown crypto).
 * - Key = 32 random bytes supplied as base64 in the server-only environment
 *   variable `FACE_TEMPLATE_ENCRYPTION_KEY`.
 * - A fresh random 12-byte nonce is used per encryption.
 * - Stored layout: nonce(12) || ciphertext || authTag(16).
 * - Failure to authenticate (wrong key / tampering) throws; callers map it to
 *   a safe "processing failed" result — never a raw crypto error to the user.
 *
 * KEY RING (credential rotation)
 * ------------------------------------------------------------------
 * A single global key cannot be replaced safely: AES-256-GCM is
 * authenticated, so every template written under the old key becomes
 * permanently unreadable the moment the key is replaced, and the caller
 * cannot distinguish "wrong key" from "corrupt ciphertext".
 *
 * Rotation therefore needs a key ring SELECTED BY `key_version`:
 * - `FACE_TEMPLATE_ENCRYPTION_KEY` is the PRIMARY key. All new encryptions
 *   use it and are stamped with `FACE_TEMPLATE_KEY_VERSION`.
 * - `FACE_TEMPLATE_ENCRYPTION_KEY_PREVIOUS` is an OPTIONAL fallback key,
 *   present only for the duration of a rotation window. It decrypts rows
 *   whose stored `key_version` is not the current version.
 * - A row is decrypted with the ONE key named by its own `key_version`.
 *   There is deliberately no trial-decrypt across keys: the version label is
 *   the authority, so the decrypt path can never be used as an oracle and the
 *   existing "wrong key is indistinguishable from corruption" property is
 *   preserved exactly.
 *
 * The ring is a *rotation mechanism*, not long-term multi-key storage. After a
 * rotation completes, remove the previous key and re-enrol or re-key any
 * remaining rows still carrying the old version label.
 */
export const FACE_TEMPLATE_KEY_ENV = "FACE_TEMPLATE_ENCRYPTION_KEY";
/** Optional rotation-window fallback key. Absent outside a rotation. */
export const FACE_TEMPLATE_PREVIOUS_KEY_ENV =
  "FACE_TEMPLATE_ENCRYPTION_KEY_PREVIOUS";
/** Version label written on encrypt and used to select a key on decrypt. */
export const FACE_TEMPLATE_KEY_VERSION_ENV = "FACE_TEMPLATE_KEY_VERSION";
export const FACE_TEMPLATE_NONCE_BYTES = 12;
export const FACE_TEMPLATE_TAG_BYTES = 16;
export const FACE_TEMPLATE_KEY_BYTES = 32;
/** Version label assumed when none is configured; matches the legacy column. */
export const FACE_TEMPLATE_DEFAULT_KEY_VERSION = "v1";

export type TemplateKeySource = string | undefined;

/** Parse a base64-encoded 32-byte key. Returns null when absent/invalid. */
export function resolveTemplateEncryptionKey(
  source: TemplateKeySource
): Buffer | null {
  if (!source || source.trim() === "") return null;
  try {
    const decoded = Buffer.from(source.trim(), "base64");
    if (decoded.length !== FACE_TEMPLATE_KEY_BYTES) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** True when an at-rest template key is configured. */
export function isTemplateEncryptionConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return resolveTemplateEncryptionKey(env[FACE_TEMPLATE_KEY_ENV]) !== null;
}

/** One resolved key slot in the ring. Never holds more than what it needs. */
export interface TemplateKeySlot {
  /** Version label this key encrypts/decrypts. */
  version: string;
  /** Decoded 32-byte key material. */
  key: Buffer;
}

/**
 * The resolved key ring: a primary key (always present when configured) plus an
 * optional previous key used only while a rotation is in flight.
 */
export interface TemplateKeyRing {
  primary: TemplateKeySlot;
  previous: TemplateKeySlot | null;
}

/**
 * Resolve the key ring from the environment.
 *
 * Returns `null` when no usable primary key is configured, so callers keep the
 * existing "engine not configured" behaviour rather than failing open.
 *
 * A configured previous key that is malformed is IGNORED (treated as absent)
 * rather than throwing: a broken fallback must never take down verification
 * for rows that are already on the current key. `validate-env.mjs` reports the
 * misconfiguration separately.
 */
export function resolveTemplateKeyRing(
  env: Record<string, string | undefined> = process.env
): TemplateKeyRing | null {
  const primaryKey = resolveTemplateEncryptionKey(env[FACE_TEMPLATE_KEY_ENV]);
  if (!primaryKey) return null;

  const rawVersion = (env[FACE_TEMPLATE_KEY_VERSION_ENV] ?? "").trim();
  const primaryVersion =
    rawVersion === "" ? FACE_TEMPLATE_DEFAULT_KEY_VERSION : rawVersion;

  const previousKey = resolveTemplateEncryptionKey(
    env[FACE_TEMPLATE_PREVIOUS_KEY_ENV]
  );

  return {
    primary: { version: primaryVersion, key: primaryKey },
    previous: previousKey
      ? { version: FACE_TEMPLATE_DEFAULT_KEY_VERSION, key: previousKey }
      : null,
  };
}

/**
 * Select the key for a stored `key_version` label.
 *
 * Returns `null` when no key is registered for that label. Callers MUST treat
 * `null` as a decryption failure and must NOT try another key: the label is
 * authoritative, and falling back across keys would mask a genuinely corrupt
 * or foreign ciphertext.
 */
export function resolveKeyForVersion(
  ring: TemplateKeyRing,
  keyVersion: string | undefined | null
): TemplateKeySlot | null {
  const label = (keyVersion ?? "").trim();
  if (label === "") return null;
  if (label === ring.primary.version) return ring.primary;
  if (ring.previous && label === ring.previous.version) return ring.previous;
  return null;
}

/** Encrypt an embedding/descriptor payload for storage. */
export function encryptTemplateSecret(
  plaintext: Uint8Array,
  keyBase64: string
): Buffer {
  const key = resolveTemplateEncryptionKey(keyBase64);
  if (!key) {
    throw new Error("face template encryption key is not configured");
  }
  return encryptTemplateSecretWithKey(plaintext, key);
}

/**
 * Encrypt with already-decoded key material. Used by the key ring so resolved
 * key bytes are not round-tripped back through base64.
 */
export function encryptTemplateSecretWithKey(
  plaintext: Uint8Array,
  key: Buffer
): Buffer {
  const nonce = randomBytes(FACE_TEMPLATE_NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ciphertext, tag]);
}

/** Decrypt a payload previously produced by `encryptTemplateSecret`. */
export function decryptTemplateSecret(
  blob: Uint8Array,
  keyBase64: string
): Buffer {
  const key = resolveTemplateEncryptionKey(keyBase64);
  if (!key) {
    throw new Error("face template encryption key is not configured");
  }
  return decryptTemplateSecretWithKey(blob, key);
}

/**
 * Decrypt with already-decoded key material. Used by the key ring and the
 * re-key tool. Throws on wrong key / tampering, exactly like the base64 form.
 */
export function decryptTemplateSecretWithKey(
  blob: Uint8Array,
  key: Buffer
): Buffer {
  const buffer = Buffer.from(blob);
  const minimumLength =
    FACE_TEMPLATE_NONCE_BYTES + FACE_TEMPLATE_TAG_BYTES;
  if (buffer.length < minimumLength) {
    throw new Error("face template secret is malformed");
  }
  const nonce = buffer.subarray(0, FACE_TEMPLATE_NONCE_BYTES);
  const tag = buffer.subarray(buffer.length - FACE_TEMPLATE_TAG_BYTES);
  const ciphertext = buffer.subarray(
    FACE_TEMPLATE_NONCE_BYTES,
    buffer.length - FACE_TEMPLATE_TAG_BYTES
  );
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
