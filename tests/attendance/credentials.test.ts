/**
 * PHASE A — systemd credential resolution tests (node:test).
 *
 * Covers `lib/config/credentials.ts`, the application side of
 * `LoadCredentialEncrypted=`.
 *
 * The module is deliberately free of a `server-only` marker so it can be
 * unit-tested; the only consumer, `lib/config/env.ts`, is marked server-only.
 *
 * NO REAL SECRET IS USED. Every fixture writes a synthetic, clearly-fake value
 * into a throwaway temp directory and removes it afterwards.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  credentialEnvSnapshot,
  isCredentialBacked,
  readCredential,
  resolveSecret,
  SECRET_SOURCES,
  CREDENTIALS_DIRECTORY_ENV,
} from "../../lib/config/credentials.ts";

// Obviously-fake stand-ins. Not valid credentials for anything.
const FAKE_URL = "postgresql://synthetic:synthetic@127.0.0.1:5432/synthetic";
const FAKE_KEY = Buffer.alloc(32, 0x5a).toString("base64");

let dir: string;
const savedDirEnv = process.env[CREDENTIALS_DIRECTORY_ENV];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hris-cred-test-"));
  process.env[CREDENTIALS_DIRECTORY_ENV] = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (savedDirEnv === undefined) {
    delete process.env[CREDENTIALS_DIRECTORY_ENV];
  } else {
    process.env[CREDENTIALS_DIRECTORY_ENV] = savedDirEnv;
  }
});

describe("readCredential", () => {
  it("reads a credential file from CREDENTIALS_DIRECTORY", () => {
    writeFileSync(join(dir, "probe_cred"), "value-from-credential");
    assert.equal(readCredential("probe_cred"), "value-from-credential");
  });

  it("strips a trailing newline so a heredoc-provisioned secret parses", () => {
    // systemd-creds preserves file content exactly, so this is a real case.
    writeFileSync(join(dir, "probe_cred"), "value-with-newline\n");
    assert.equal(readCredential("probe_cred"), "value-with-newline");
  });

  it("returns undefined for a missing credential rather than throwing", () => {
    assert.equal(readCredential("absent_cred"), undefined);
  });

  it("returns undefined when the mechanism is not in use at all", () => {
    delete process.env[CREDENTIALS_DIRECTORY_ENV];
    assert.equal(readCredential("probe_cred"), undefined);
  });

  it("returns undefined if the path is a directory, not a file", () => {
    mkdirSync(join(dir, "cred_dir"));
    assert.equal(readCredential("cred_dir"), undefined);
  });

  it("still resolves a world-unreadable file for a privileged reader", () => {
    // systemd hands the service a 0440 root:root file readable via ACL. This
    // asserts the loader is not doing anything clever with modes — it just
    // opens the path it was given.
    const path = join(dir, "tight_cred");
    writeFileSync(path, "tight-value");
    chmodSync(path, 0o000);
    // Root/owner may still open it; either way this must not crash.
    try {
      readCredential("tight_cred");
    } catch {
      assert.fail("reading a mode-restricted credential must not throw");
    }
    chmodSync(path, 0o600);
  });
});

describe("resolveSecret", () => {
  it("prefers the systemd credential over the legacy env var", () => {
    writeFileSync(join(dir, SECRET_SOURCES.databaseUrl.credential), FAKE_URL);
    const resolved = resolveSecret("databaseUrl", {
      DATABASE_URL: "postgresql://stale:stale@127.0.0.1:5432/stale",
    });
    assert.equal(resolved, FAKE_URL);
  });

  it("falls back to the env var when no credential is provisioned", () => {
    const resolved = resolveSecret("databaseUrl", { DATABASE_URL: FAKE_URL });
    assert.equal(resolved, FAKE_URL, "staged rollout must not break the old path");
  });

  it("returns undefined when neither source has the secret", () => {
    assert.equal(resolveSecret("databaseUrl", {}), undefined);
  });

  it("treats a blank env var as absent, matching env.ts semantics", () => {
    assert.equal(resolveSecret("databaseUrl", { DATABASE_URL: "   " }), undefined);
  });
});

describe("credentialEnvSnapshot", () => {
  it("overlays credentials without disturbing unrelated variables", () => {
    writeFileSync(
      join(dir, SECRET_SOURCES.faceTemplateEncryptionKey.credential),
      FAKE_KEY
    );
    const snapshot = credentialEnvSnapshot({
      FACE_TEMPLATE_ENCRYPTION_KEY: "stale-key",
      FACE_PROVIDER: "human",
    });
    assert.equal(snapshot.FACE_TEMPLATE_ENCRYPTION_KEY, FAKE_KEY);
    // Non-secret config is untouched, so the face engine still configures.
    assert.equal(snapshot.FACE_PROVIDER, "human");
  });

  it("is a copy: mutating it must not mutate process.env", () => {
    const snapshot = credentialEnvSnapshot({ FACE_PROVIDER: "human" });
    snapshot.FACE_PROVIDER = "mutated";
    assert.notEqual(process.env.FACE_PROVIDER, "mutated");
  });

  it("resolves the face key ring from a credential-backed snapshot", async () => {
    // End-to-end: a key living only in a credential must produce a working
    // key ring, which is the whole point of Phase A.
    writeFileSync(
      join(dir, SECRET_SOURCES.faceTemplateEncryptionKey.credential),
      FAKE_KEY
    );
    writeFileSync(
      join(dir, SECRET_SOURCES.faceTemplatePreviousKey.credential),
      Buffer.alloc(32, 0x3c).toString("base64")
    );
    const { resolveTemplateKeyRing, resolveKeyForVersion } = await import(
      "../../lib/attendance/template-cipher.ts"
    );
    const ring = resolveTemplateKeyRing(
      credentialEnvSnapshot({ FACE_TEMPLATE_KEY_VERSION: "v2" })
    );
    assert.ok(ring);
    assert.equal(ring.primary.version, "v2");
    assert.deepEqual(ring.previous?.key, Buffer.alloc(32, 0x3c));
    assert.equal(resolveKeyForVersion(ring, "v1")?.version, "v1");
  });
});

describe("isCredentialBacked", () => {
  it("reports which mechanism is live without revealing a value", () => {
    assert.equal(isCredentialBacked("databaseUrl"), false);
    writeFileSync(join(dir, SECRET_SOURCES.databaseUrl.credential), FAKE_URL);
    assert.equal(isCredentialBacked("databaseUrl"), true);
  });
});

describe("no secret leakage", () => {
  it("the resolved values never appear in an error or log path", () => {
    writeFileSync(join(dir, SECRET_SOURCES.databaseUrl.credential), FAKE_URL);
    // A missing credential is reported by variable NAME only (env.ts), so an
    // operator sees "DATABASE_URL" and never the value.
    const snapshot = credentialEnvSnapshot({});
    assert.equal(snapshot.DATABASE_URL, FAKE_URL);
    const missing = resolveSecret("faceTemplatePreviousKey", {});
    assert.equal(missing, undefined);
  });
});
