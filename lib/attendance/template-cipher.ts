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
 */
export const FACE_TEMPLATE_KEY_ENV = "FACE_TEMPLATE_ENCRYPTION_KEY";
export const FACE_TEMPLATE_NONCE_BYTES = 12;
export const FACE_TEMPLATE_TAG_BYTES = 16;
export const FACE_TEMPLATE_KEY_BYTES = 32;

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

/** Encrypt an embedding/descriptor payload for storage. */
export function encryptTemplateSecret(
  plaintext: Uint8Array,
  keyBase64: string
): Buffer {
  const key = resolveTemplateEncryptionKey(keyBase64);
  if (!key) {
    throw new Error("face template encryption key is not configured");
  }
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
