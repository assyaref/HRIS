/**
 * PHASE 10.2 — Template cipher tests (node:test).
 *
 * Exercises the AES-256-GCM at-rest encryption used before any face embedding
 * is persisted. The module is deliberately free of a `server-only` marker so
 * it can be unit-tested; it is imported exclusively from server modules.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decryptTemplateSecret,
  encryptTemplateSecret,
  FACE_TEMPLATE_KEY_ENV,
  FACE_TEMPLATE_NONCE_BYTES,
  FACE_TEMPLATE_TAG_BYTES,
  isTemplateEncryptionConfigured,
  resolveTemplateEncryptionKey,
} from "../../lib/attendance/template-cipher.ts";

const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

describe("resolveTemplateEncryptionKey", () => {
  it("accepts a base64 32-byte key", () => {
    const key = resolveTemplateEncryptionKey(VALID_KEY);
    assert.ok(key);
    assert.equal(key!.length, 32);
  });

  it("returns null when the key is absent or malformed", () => {
    assert.equal(resolveTemplateEncryptionKey(undefined), null);
    assert.equal(resolveTemplateEncryptionKey(""), null);
    assert.equal(resolveTemplateEncryptionKey("too-short"), null);
  });

  it("reports configuration from the process environment", () => {
    assert.equal(isTemplateEncryptionConfigured({}), false);
    assert.equal(
      isTemplateEncryptionConfigured({ [FACE_TEMPLATE_KEY_ENV]: VALID_KEY }),
      true
    );
  });
});

describe("encrypt/decrypt round trip", () => {
  it("round-trips an embedding payload", () => {
    const plaintext = new Uint8Array(new Float32Array([1, 2, 3, 4]).buffer);
    const secret = encryptTemplateSecret(plaintext, VALID_KEY);
    const restored = decryptTemplateSecret(secret, VALID_KEY);
    assert.deepEqual(new Uint8Array(restored), plaintext);
  });

  it("uses a fresh random nonce per encryption (non-deterministic ciphertext)", () => {
    const plaintext = new Uint8Array(64).fill(9);
    const first = encryptTemplateSecret(plaintext, VALID_KEY);
    const second = encryptTemplateSecret(plaintext, VALID_KEY);
    assert.notDeepEqual(new Uint8Array(first), new Uint8Array(second));
  });

  it("produces the expected length (nonce + ciphertext + tag)", () => {
    const plaintext = new Uint8Array(100);
    const secret = encryptTemplateSecret(plaintext, VALID_KEY);
    assert.equal(
      secret.length,
      FACE_TEMPLATE_NONCE_BYTES + plaintext.length + FACE_TEMPLATE_TAG_BYTES
    );
  });

  it("rejects tampered ciphertext via the auth tag", () => {
    const plaintext = new Uint8Array([1, 2, 3]);
    const secret = new Uint8Array(encryptTemplateSecret(plaintext, VALID_KEY));
    secret[secret.length - 1] ^= 0xff; // corrupt the tag
    assert.throws(() =>
      decryptTemplateSecret(secret, VALID_KEY)
    );
  });

  it("rejects decryption with the wrong key", () => {
    const plaintext = new Uint8Array([5, 6, 7]);
    const secret = encryptTemplateSecret(plaintext, VALID_KEY);
    const wrongKey = Buffer.alloc(32, 8).toString("base64");
    assert.throws(() => decryptTemplateSecret(secret, wrongKey));
  });

  it("rejects a malformed short blob", () => {
    assert.throws(() => decryptTemplateSecret(new Uint8Array(4), VALID_KEY));
  });
});
