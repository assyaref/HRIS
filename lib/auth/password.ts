import "server-only";

import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing — Argon2id via `@node-rs/argon2` (N-API, prebuilt binaries,
 * automatically externalized by Next.js server bundling).
 *
 * Algorithm decision (documented in docs/auth.md):
 * - Argon2id (hybrid of Argon2i + Argon2d) is the OWASP-recommended password
 *   KDF and the default algorithm of `@node-rs/argon2`; the produced PHC
 *   strings begin with `$argon2id$` (v=19, m=19456, t=2, p=1).
 * - Passwords are never stored, logged, or returned. Only the encoded hash is
 *   persisted (users.password_hash).
 *
 * Node's `crypto.scrypt` was the fallback candidate; it was not needed because
 * `@node-rs/argon2` installs cleanly (prebuilt N-API) on this toolchain.
 */

/**
 * Hash a plaintext password into an Argon2id PHC string.
 *
 * A random 16-byte salt is generated internally on every call — never reuse a
 * salt, and never call this with a password you intend to keep in memory.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/**
 * Verify a plaintext password against a stored Argon2id hash.
 *
 * Returns `false` (never throws) for malformed/foreign hashes so callers do
 * not have to special-case corrupt rows.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0) return false;
  if (typeof storedHash !== "string" || storedHash.length === 0) return false;
  try {
    return await verify(storedHash, password);
  } catch {
    // Unsupported/malformed hash string — treat as a failed verification,
    // never as an authentication bypass.
    return false;
  }
}

/**
 * A throwaway Argon2id hash used purely for timing equalization.
 *
 * When an email does not exist (or the account has no password yet) we still
 * run one Argon2id verification against this hash so the response time does
 * not reveal whether the account exists. The plaintext below is a dummy — it
 * is not a credential and is safe to embed.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$d9Nfdc6RZHpHb90BR68iYg$Zk2X6MQd0zaYwTHF6MIbaejtDk2MPBBtm8yOaKgiwGg";

/**
 * Perform a dummy Argon2id verification for the "user not found / no password"
 * branch of login so timing stays comparable to a real verification.
 */
export function verifyPasswordTimingEqualizer(password: string): Promise<boolean> {
  return verifyPassword(password, DUMMY_HASH);
}
