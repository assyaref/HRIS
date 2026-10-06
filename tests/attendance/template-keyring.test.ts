/**
 * PHASE C — Face template key-ring tests (node:test).
 *
 * Covers the credential-rotation architecture introduced so
 * `FACE_TEMPLATE_ENCRYPTION_KEY` can be replaced without destroying existing
 * templates.
 *
 * ALL KEYS IN THIS FILE ARE SYNTHETIC (`Buffer.alloc(32, n)`). No production
 * key material, no production ciphertext, and no real face data is used.
 *
 * Invariants under test:
 *   1. a template written under the OLD key still decrypts while the previous
 *      key is registered;
 *   2. the same template does NOT decrypt under the NEW key before re-key
 *      (this is the property that makes rotation safe to stage);
 *   3. a template written under the NEW key does not decrypt under the OLD key;
 *   4. key selection is driven by the row's `key_version` label, never by
 *      trying keys in turn;
 *   5. an unknown or missing label fails closed rather than guessing;
 *   6. wrong key and tampered ciphertext are indistinguishable, and both fail.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decryptTemplateSecret,
  decryptTemplateSecretWithKey,
  encryptTemplateSecret,
  encryptTemplateSecretWithKey,
  resolveKeyForVersion,
  resolveTemplateKeyRing,
  FACE_TEMPLATE_DEFAULT_KEY_VERSION,
  FACE_TEMPLATE_KEY_ENV,
  FACE_TEMPLATE_KEY_VERSION_ENV,
  FACE_TEMPLATE_PREVIOUS_KEY_ENV,
} from "../../lib/attendance/template-cipher.ts";

// Synthetic keys. Deterministic so failures reproduce; not real secrets.
const OLD_KEY = Buffer.alloc(32, 0x11);
const NEW_KEY = Buffer.alloc(32, 0x22);
const OLD_KEY_B64 = OLD_KEY.toString("base64");
const NEW_KEY_B64 = NEW_KEY.toString("base64");

/** A synthetic 1024-float32 "embedding" (the real decoded size). */
function syntheticEmbedding(fill = 0.25): Uint8Array {
  const view = new Float32Array(1024);
  view.fill(fill);
  return new Uint8Array(view.buffer);
}

const PLAINTEXT = syntheticEmbedding();

/** Env shape for a steady-state (pre-rotation) deployment. */
const preRotationEnv = {
  [FACE_TEMPLATE_KEY_ENV]: OLD_KEY_B64,
};

/** Env shape mid-rotation: NEW is primary for writes, OLD decrypts v1 rows. */
const rotationEnv = {
  [FACE_TEMPLATE_KEY_ENV]: NEW_KEY_B64,
  [FACE_TEMPLATE_KEY_VERSION_ENV]: "v2",
  [FACE_TEMPLATE_PREVIOUS_KEY_ENV]: OLD_KEY_B64,
};

describe("resolveTemplateKeyRing", () => {
  it("returns null when no primary key is configured", () => {
    assert.equal(resolveTemplateKeyRing({}), null);
    assert.equal(
      resolveTemplateKeyRing({ [FACE_TEMPLATE_KEY_ENV]: "not-base64-32b" }),
      null
    );
  });

  it("defaults the version label to v1 to match the legacy column", () => {
    const ring = resolveTemplateKeyRing(preRotationEnv);
    assert.equal(ring?.primary.version, FACE_TEMPLATE_DEFAULT_KEY_VERSION);
    assert.equal(ring?.previous, null);
  });

  it("uses the configured version label for the primary key", () => {
    const ring = resolveTemplateKeyRing(rotationEnv);
    assert.equal(ring?.primary.version, "v2");
    assert.deepEqual(ring?.previous?.key, OLD_KEY);
  });

  it("ignores a malformed previous key rather than taking the app down", () => {
    const ring = resolveTemplateKeyRing({
      [FACE_TEMPLATE_KEY_ENV]: NEW_KEY_B64,
      [FACE_TEMPLATE_KEY_VERSION_ENV]: "v2",
      [FACE_TEMPLATE_PREVIOUS_KEY_ENV]: "garbage",
    });
    assert.equal(ring?.primary.version, "v2");
    // A broken fallback must not become a hard failure: rows already on the
    // current key are still readable, and the operator gets a loud signal from
    // validate-env instead of a total outage.
    assert.equal(ring?.previous, null);
  });
});

describe("resolveKeyForVersion", () => {
  it("selects by the row's own label, not by trial decryption", () => {
    const ring = resolveTemplateKeyRing(rotationEnv)!;
    assert.deepEqual(resolveKeyForVersion(ring, "v2")?.key, NEW_KEY);
    assert.deepEqual(resolveKeyForVersion(ring, "v1")?.key, OLD_KEY);
  });

  it("fails closed for an unknown label instead of guessing", () => {
    const ring = resolveTemplateKeyRing(rotationEnv)!;
    assert.equal(resolveKeyForVersion(ring, "v7"), null);
    assert.equal(resolveKeyForVersion(ring, ""), null);
    assert.equal(resolveKeyForVersion(ring, null), null);
    assert.equal(resolveKeyForVersion(ring, undefined), null);
  });

  it("fails closed once the previous key is withdrawn", () => {
    // Post-rotation steady state: OLD key removed. A straggler v1 row is
    // unreadable, and the caller must see that as a failure, not guess.
    const ring = resolveTemplateKeyRing({
      [FACE_TEMPLATE_KEY_ENV]: NEW_KEY_B64,
      [FACE_TEMPLATE_KEY_VERSION_ENV]: "v2",
    })!;
    assert.equal(resolveKeyForVersion(ring, "v1"), null);
  });
});

describe("rotation invariants (synthetic data only)", () => {
  it("1. existing v1 template still decrypts with the old key", () => {
    const legacy = encryptTemplateSecretWithKey(PLAINTEXT, OLD_KEY);
    const ring = resolveTemplateKeyRing(rotationEnv)!;
    const slot = resolveKeyForVersion(ring, "v1")!;
    assert.equal(slot.version, "v1");
    assert.deepEqual(decryptTemplateSecretWithKey(legacy, slot.key), Buffer.from(PLAINTEXT));
  });

  it("2. that same template does NOT decrypt with the new key before re-key", () => {
    // This is the property that lets a rotation be staged safely: proving the
    // new key cannot read old ciphertext, so a silent mislabel is impossible.
    const legacy = encryptTemplateSecretWithKey(PLAINTEXT, OLD_KEY);
    assert.throws(() => decryptTemplateSecretWithKey(legacy, NEW_KEY));
  });

  it("3. new templates are written with the new key only", () => {
    const fresh = encryptTemplateSecretWithKey(PLAINTEXT, NEW_KEY);
    assert.throws(() => decryptTemplateSecretWithKey(fresh, OLD_KEY));
    assert.deepEqual(decryptTemplateSecretWithKey(fresh, NEW_KEY), Buffer.from(PLAINTEXT));
  });

  it("6. wrong key fails, and is indistinguishable from tampering", () => {
    const fresh = encryptTemplateSecretWithKey(PLAINTEXT, NEW_KEY);
    const wrongKey = Buffer.alloc(32, 0x33);

    const wrongKeyError = (() => {
      try {
        decryptTemplateSecretWithKey(fresh, wrongKey);
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    })();
    assert.ok(wrongKeyError);

    // 7. tamper the final auth-tag byte.
    const tampered = Buffer.from(fresh);
    tampered[tampered.length - 1] ^= 0xff;
    const tamperError = (() => {
      try {
        decryptTemplateSecretWithKey(tampered, NEW_KEY);
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    })();
    assert.equal(tamperError, wrongKeyError);
  });

  it("8. re-key round-trip changes the ciphertext but not the plaintext", () => {
    const legacy = encryptTemplateSecretWithKey(PLAINTEXT, OLD_KEY);
    const rekeyed = encryptTemplateSecretWithKey(
      decryptTemplateSecretWithKey(legacy, OLD_KEY),
      NEW_KEY
    );
    assert.notDeepEqual(rekeyed, legacy, "ciphertext must change");
    assert.deepEqual(decryptTemplateSecretWithKey(rekeyed, NEW_KEY), Buffer.from(PLAINTEXT));
  });

  it("uses a fresh nonce per encryption, so equal plaintexts differ", () => {
    const a = encryptTemplateSecretWithKey(PLAINTEXT, OLD_KEY);
    const b = encryptTemplateSecretWithKey(PLAINTEXT, OLD_KEY);
    assert.notDeepEqual(a, b);
  });

  it("preserves the existing base64 helpers used by the pre-rotation path", () => {
    // Regression guard: the public base64 API is still used elsewhere and by
    // the original test suite, so the WithKey refactor must not change it.
    const blob = encryptTemplateSecret(PLAINTEXT, OLD_KEY_B64);
    assert.deepEqual(decryptTemplateSecret(blob, OLD_KEY_B64), Buffer.from(PLAINTEXT));
    assert.throws(() => encryptTemplateSecret(PLAINTEXT, "short"));
  });
});
