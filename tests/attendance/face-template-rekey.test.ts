/**
 * PHASE C — Face template re-key tests (node:test).
 *
 * Exercises `scripts/face-template-rekey.mts`, the application-level
 * transformation that moves `face_enrollment_templates` from one key version
 * to another.
 *
 * ALL KEYS AND TEMPLATES IN THIS FILE ARE SYNTHETIC. The embedded faces are
 * constant float32 vectors, not real biometric data, and no production row,
 * ciphertext, or key is read at any point.
 *
 * The suite runs in two tiers:
 *   - Unit tier: an in-memory stub client. Always runs, and proves the
 *     transactional / abort / idempotency contract with no database.
 *   - Integration tier: a real disposable staging database, exercised only
 *     when `FACE_REKEY_STAGING_DATABASE_URL` is set (see
 *     SECURITY-ROTATION-IMPLEMENTATION.md). Skipped otherwise, so the normal
 *     `npm test` run never touches any database at all.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";

import {
  rekeyFaceTemplates,
  type RekeyClient,
  type RekeyReport,
} from "../../scripts/face-template-rekey.mts";
import {
  decryptTemplateSecretWithKey,
  encryptTemplateSecretWithKey,
} from "../../lib/attendance/template-cipher.ts";

const OLD_KEY = Buffer.alloc(32, 0x11);
const NEW_KEY = Buffer.alloc(32, 0x22);

function syntheticEmbedding(fill: number): Buffer {
  const view = new Float32Array(1024);
  view.fill(fill);
  return Buffer.from(new Uint8Array(view.buffer));
}

/* ------------------------------------------------------------------ */
/* In-memory stub client                                              */
/* ------------------------------------------------------------------ */

/**
 * Minimal in-memory stand-in for a `pg` client that understands only the four
 * statements the re-key tool issues. Updates are staged and applied on COMMIT
 * so a test can prove that ROLLBACK really discards them.
 */
function createStubClient(
  rows: Array<{ id: string; key_version: string; secret: Buffer }>
) {
  const statements: string[] = [];
  const staged = new Map<string, { key_version: string; secret: Buffer }>();
  let committed: Array<{ id: string; key_version: string; secret: Buffer }> =
    rows.map((r) => ({ ...r }));

  const client: RekeyClient & {
    statements: string[];
    current: () => Array<{ id: string; key_version: string; secret: Buffer }>;
  } = {
    statements,
    current: () =>
      committed.map((r) => {
        const s = staged.get(r.id);
        return s ? { ...r, ...s } : { ...r };
      }),
    async query(text: string, values?: unknown[]) {
      const verb = text.trim().split(/\s+/)[0].toUpperCase();
      if (verb === "BEGIN") {
        statements.push("BEGIN");
        return { rows: [] };
      }
      if (verb === "COMMIT") {
        statements.push("COMMIT");
        committed = client.current();
        staged.clear();
        return { rows: [] };
      }
      if (verb === "ROLLBACK") {
        statements.push("ROLLBACK");
        staged.clear();
        return { rows: [] };
      }
      if (verb === "SELECT") {
        statements.push("SELECT");
        return { rows: client.current() };
      }
      if (verb === "UPDATE") {
        statements.push("UPDATE");
        const [id, secret, keyVersion] = values as [string, Buffer, string];
        staged.set(id, { key_version: keyVersion, secret });
        const current = client.current().find((r) => r.id === id)!;
        return { rows: [current], rowCount: 1 };
      }
      throw new Error(`unexpected statement in stub: ${verb}`);
    },
    release() {},
  };
  return client;
}

const BASE_ROW = {
  id: "tpl_synthetic_0001",
  key_version: "v1",
  secret: encryptTemplateSecretWithKey(syntheticEmbedding(0.25), OLD_KEY),
};
const PLAINTEXT_1 = syntheticEmbedding(0.25);

/* ------------------------------------------------------------------ */
/* Unit tier                                                          */
/* ------------------------------------------------------------------ */

describe("rekeyFaceTemplates (in-memory stub)", () => {
  it("3/4/5. converts old ciphertext to new ciphertext and updates key_version", async () => {
    const stub = createStubClient([{ ...BASE_ROW }]);
    const report = await rekeyFaceTemplates(stub, {
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
      fromVersion: "v1",
      toVersion: "v2",
    });

    assert.equal(report.ok, true);
    assert.equal(report.aborted, false);
    assert.equal(report.rekeyed, 1);
    assert.equal(report.alreadyCurrent, 0);

    const [row] = stub.current();
    assert.equal(row.key_version, "v2", "key_version must be updated");

    // Ciphertext must have changed AND be readable with the new key.
    assert.notDeepEqual(row.secret, BASE_ROW.secret);
    assert.deepEqual(decryptTemplateSecretWithKey(row.secret, NEW_KEY), PLAINTEXT_1);
    // 2. And no longer readable with the old key.
    assert.throws(() => decryptTemplateSecretWithKey(row.secret, OLD_KEY));

    // 10. Template count is untouched.
    assert.equal(stub.current().length, 1);
  });

  it("8. is idempotent: a second run reports 0 changes and rewrites nothing", async () => {
    const stub = createStubClient([{ ...BASE_ROW }]);
    const first = await rekeyFaceTemplates(stub, {
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
      fromVersion: "v1",
      toVersion: "v2",
    });
    const afterFirst = stub.current()[0];

    const second = await rekeyFaceTemplates(stub, {
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
      fromVersion: "v1",
      toVersion: "v2",
    });

    assert.equal(first.rekeyed, 1);
    assert.equal(second.rekeyed, 0);
    assert.equal(second.alreadyCurrent, 1);
    assert.equal(second.ok, true);
    // Ciphertext must be byte-identical: no pointless churn on re-run.
    assert.deepEqual(stub.current()[0].secret, afterFirst.secret);
    assert.equal(stub.current().length, 1);
  });

  it("6/9. aborts on first failure when the old key is wrong, changing nothing", async () => {
    const stub = createStubClient([{ ...BASE_ROW }]);
    const report = await rekeyFaceTemplates(stub, {
      oldKey: NEW_KEY, // deliberately wrong
      newKey: Buffer.alloc(32, 0x44),
      fromVersion: "v1",
      toVersion: "v2",
    });

    assert.equal(report.ok, false);
    assert.equal(report.aborted, true);
    assert.equal(report.abortReason, "old_key_cannot_decrypt_row");
    assert.equal(report.rekeyed, 0);

    // 9. The rollback must have discarded every change, and the transaction
    // must never have been committed.
    assert.deepEqual(stub.current()[0], { ...BASE_ROW });
    assert.equal(stub.statements.at(-1), "ROLLBACK");
    assert.equal(stub.statements.includes("COMMIT"), false);
  });

  it("7/9. aborts and rolls back when a row is tampered", async () => {
    const tampered = Buffer.from(BASE_ROW.secret);
    tampered[tampered.length - 5] ^= 0xff; // corrupt ciphertext body
    const stub = createStubClient([{ ...BASE_ROW, secret: tampered }]);

    const report = await rekeyFaceTemplates(stub, {
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
      fromVersion: "v1",
      toVersion: "v2",
    });

    assert.equal(report.aborted, true);
    assert.equal(report.abortReason, "old_key_cannot_decrypt_row");
    assert.deepEqual(stub.current()[0].secret, tampered, "unchanged");
    assert.equal(stub.statements.includes("COMMIT"), false);
  });

  it("aborts when plaintext does not decode to a valid embedding", async () => {
    // A row that decrypts but holds a degenerate buffer is refused rather than
    // re-keyed, so garbage is never carried forward under a new key.
    const junk = Buffer.alloc(16, 0x01);
    const stub = createStubClient([
      {
        id: "tpl_synthetic_0002",
        key_version: "v1",
        secret: encryptTemplateSecretWithKey(junk, OLD_KEY),
      },
    ]);

    const report = await rekeyFaceTemplates(stub, {
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
      fromVersion: "v1",
      toVersion: "v2",
    });
    assert.equal(report.aborted, true);
    assert.equal(stub.statements.includes("COMMIT"), false);
  });

  it("rolls back the whole batch when only one of several rows is bad", async () => {
    const good = { ...BASE_ROW, id: "tpl_synthetic_0010" };
    const bad = {
      id: "tpl_synthetic_0011",
      key_version: "v1",
      secret: encryptTemplateSecretWithKey(syntheticEmbedding(0.5), NEW_KEY),
    };
    const stub = createStubClient([good, bad]);

    const report = await rekeyFaceTemplates(stub, {
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
      fromVersion: "v1",
      toVersion: "v2",
    });

    assert.equal(report.aborted, true);
    // The good row was processed first but must be left untouched: the tool is
    // all-or-nothing, never "best effort".
    assert.deepEqual(stub.current()[0], good);
    assert.equal(stub.statements.includes("COMMIT"), false);
  });

  it("--dry-run validates and rolls back without changing anything", async () => {
    const stub = createStubClient([{ ...BASE_ROW }]);
    const report = await rekeyFaceTemplates(stub, {
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
      fromVersion: "v1",
      toVersion: "v2",
      dryRun: true,
    });

    assert.equal(report.ok, true);
    assert.equal(report.rekeyed, 0, "dry run commits nothing");
    assert.equal(stub.statements.at(-1), "ROLLBACK");
    assert.deepEqual(stub.current()[0], { ...BASE_ROW });
  });

  it("ignores rows carrying an unrelated key version", async () => {
    const foreign = {
      id: "tpl_synthetic_0020",
      key_version: "v0",
      secret: encryptTemplateSecretWithKey(syntheticEmbedding(0.75), NEW_KEY),
    };
    const stub = createStubClient([{ ...BASE_ROW }, foreign]);

    const report = await rekeyFaceTemplates(stub, {
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
      fromVersion: "v1",
      toVersion: "v2",
    });
    assert.equal(report.rekeyed, 1);
    assert.equal(report.untouchedOtherVersion, 1);
    assert.deepEqual(stub.current()[1], foreign);
  });

  it("rejects a no-op rotation where from and to are the same", async () => {
    const stub = createStubClient([{ ...BASE_ROW }]);
    await assert.rejects(
      () =>
        rekeyFaceTemplates(stub, {
          oldKey: OLD_KEY,
          newKey: NEW_KEY,
          fromVersion: "v1",
          toVersion: "v1",
        }),
      /must differ/
    );
  });

  it("refuses to re-key a key onto itself", async () => {
    // Regression guard. Found during the staging rehearsal: passing the same
    // key material as both old and new silently re-labelled every row with the
    // new version while leaving the ciphertext encrypted under the OLD key.
    // The table then looked migrated, and the next real rotation could not
    // read a single row.
    const stub = createStubClient([{ ...BASE_ROW }]);
    await assert.rejects(
      () =>
        rekeyFaceTemplates(stub, {
          oldKey: OLD_KEY,
          newKey: Buffer.from(OLD_KEY),
          fromVersion: "v1",
          toVersion: "v2",
        }),
      /identical/
    );
    assert.deepEqual(stub.current()[0], { ...BASE_ROW });
    assert.equal(stub.statements.includes("BEGIN"), false, "no work started");
  });

  it("11/12. never leaks plaintext or key material into its report", async () => {
    const stub = createStubClient([{ ...BASE_ROW }]);
    const report = await rekeyFaceTemplates(stub, {
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
      fromVersion: "v1",
      toVersion: "v2",
    });
    const serialized = JSON.stringify(report);
    // Version labels are expected; raw key bytes are not.
    assert.equal(serialized.includes(OLD_KEY.toString("base64")), false);
    assert.equal(serialized.includes(NEW_KEY.toString("base64")), false);
    assert.equal(serialized.includes(PLAINTEXT_1.toString("base64")), false);
    // The only row-identifying field is an id, never content.
    assert.equal(Object.keys(report).includes("secret"), false);
  });
});

/* ------------------------------------------------------------------ */
/* Integration tier — disposable staging DB only                      */
/* ------------------------------------------------------------------ */

const STAGING_URL = process.env.FACE_REKEY_STAGING_DATABASE_URL;

describe("rekeyFaceTemplates (disposable staging database)", { skip: !STAGING_URL }, () => {
  let pool: pg.Pool;

  before(async () => {
    pool = new pg.Pool({ connectionString: STAGING_URL });
    const client = await pool.connect();
    try {
      // Start from the PRE-0019 production shape, including the key_version
      // DEFAULT, so the test exercises the real migration rather than
      // asserting a state it manufactured itself.
      await client.query(`
        CREATE TABLE IF NOT EXISTS face_enrollment_templates (
          id                 text PRIMARY KEY,
          organization_id    text NOT NULL,
          employee_id        text NOT NULL,
          enrollment_id      text NOT NULL,
          template_version   text NOT NULL,
          key_version        text NOT NULL DEFAULT 'v1',
          secret             bytea NOT NULL
        )
      `);
      await client.query(`DELETE FROM face_enrollment_templates`);

      const pre = await client.query(`
        SELECT column_default FROM information_schema.columns
         WHERE table_name = 'face_enrollment_templates'
           AND column_name = 'key_version'
      `);
      assert.equal(
        pre.rows[0]?.column_default,
        "'v1'::text",
        "precondition: the DEFAULT 'v1' must exist before 0019 runs"
      );
    } finally {
      client.release();
    }
  });

  after(async () => {
    if (pool) {
      await pool.query(`DROP TABLE IF EXISTS face_enrollment_templates`);
      await pool.end();
    }
  });

  async function seed(
    rows: Array<{ id: string; key_version: string; secret: Buffer }>
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Each staged test starts from a known state, so a row left behind by an
      // earlier test cannot be mistaken for a row this test created.
      await client.query("DELETE FROM face_enrollment_templates");
      for (const row of rows) {
        await client.query(
          `INSERT INTO face_enrollment_templates
             (id, organization_id, employee_id, enrollment_id,
              template_version, key_version, secret)
           VALUES ($1,'org_synthetic','emp_synthetic','enr_synthetic',
                   'human-faceres-v1',$2,$3)`,
          [row.id, row.key_version, row.secret]
        );
      }
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  }

  it("staged: applies the real 0019 file, which drops the DEFAULT", async () => {
    // Execute the shipped migration verbatim, not a paraphrase of it.
    const migration = readFileSync(
      new URL("../../db/migrations/0019_face_template_key_version.sql", import.meta.url),
      "utf8"
    );
    const client = await pool.connect();
    try {
      await client.query(migration);

      const column = await client.query(`
        SELECT column_default, is_nullable
          FROM information_schema.columns
         WHERE table_name = 'face_enrollment_templates'
           AND column_name = 'key_version'
      `);
      assert.equal(column.rows[0]?.column_default, null, "DEFAULT must be gone");
      assert.equal(column.rows[0]?.is_nullable, "NO", "column stays NOT NULL");

      // Omitting key_version must now fail rather than silently default to v1.
      // This is the defect 0019 exists to remove: a template written under a
      // rotated key but labelled 'v1' is unreadable.
      await assert.rejects(() =>
        client.query(
          `INSERT INTO face_enrollment_templates
             (id, organization_id, employee_id, enrollment_id,
              template_version, secret)
           VALUES ('tpl_should_fail','o','e','r','human-faceres-v1',$1)`,
          [Buffer.alloc(0)]
        )
      );

      // Idempotent: re-applying is a no-op.
      await client.query(migration);
    } finally {
      client.release();
    }
  });

  it("staged: full re-key then verify old/new behaviour and counts", async () => {
    const rows = [
      {
        id: "tpl_s1",
        key_version: "v1",
        secret: encryptTemplateSecretWithKey(syntheticEmbedding(0.1), OLD_KEY),
      },
      {
        id: "tpl_s2",
        key_version: "v1",
        secret: encryptTemplateSecretWithKey(syntheticEmbedding(0.2), OLD_KEY),
      },
    ];
    await seed(rows);

    const before = await pool.query(
      `SELECT count(*)::int AS n, string_agg(key_version,',') AS kv
         FROM face_enrollment_templates`
    );
    assert.equal(before.rows[0].n, 2);
    assert.equal(before.rows[0].kv, "v1,v1");

    const client = await pool.connect();
    let report: RekeyReport;
    try {
      // Dry run first, always.
      const dry = await rekeyFaceTemplates(client, {
        oldKey: OLD_KEY,
        newKey: NEW_KEY,
        fromVersion: "v1",
        toVersion: "v2",
        dryRun: true,
      });
      assert.equal(dry.ok, true);
      assert.equal(dry.rekeyed, 0);

      const afterDry = await pool.query(
        `SELECT string_agg(key_version,',') AS kv
           FROM face_enrollment_templates`
      );
      assert.equal(afterDry.rows[0].kv, "v1,v1", "dry run must not commit");

      report = await rekeyFaceTemplates(client, {
        oldKey: OLD_KEY,
        newKey: NEW_KEY,
        fromVersion: "v1",
        toVersion: "v2",
      });
    } finally {
      client.release();
    }

    assert.equal(report.rekeyed, 2);
    assert.equal(report.aborted, false);

    // 4/5. New ciphertext, new labels, readable with the NEW key only.
    const rowsAfter = await pool.query(
      `SELECT id, key_version, secret FROM face_enrollment_templates ORDER BY id`
    );
    assert.equal(rowsAfter.rows.length, 2, "10. count unchanged");
    for (const row of rowsAfter.rows) {
      assert.equal(row.key_version, "v2");
      assert.deepEqual(
        decryptTemplateSecretWithKey(row.secret, NEW_KEY),
        syntheticEmbedding(row.id === "tpl_s1" ? 0.1 : 0.2)
      );
      assert.throws(() => decryptTemplateSecretWithKey(row.secret, OLD_KEY));
    }

    // 8. Idempotent against a real database.
    const again = await pool.connect();
    try {
      const second = await rekeyFaceTemplates(again, {
        oldKey: OLD_KEY,
        newKey: NEW_KEY,
        fromVersion: "v1",
        toVersion: "v2",
      });
      assert.equal(second.rekeyed, 0);
      assert.equal(second.alreadyCurrent, 2);
    } finally {
      again.release();
    }
  });

  it("staged: failure inside a real transaction leaves the table untouched", async () => {
    const rows = [
      {
        id: "tpl_s3",
        key_version: "v1",
        secret: encryptTemplateSecretWithKey(syntheticEmbedding(0.3), OLD_KEY),
      },
      {
        id: "tpl_s4",
        key_version: "v1",
        // Encrypted with the wrong key: forces the abort mid-batch.
        secret: encryptTemplateSecretWithKey(syntheticEmbedding(0.4), NEW_KEY),
      },
    ];
    await seed(rows);
    const beforeRows = await pool.query(
      `SELECT id, key_version, secret FROM face_enrollment_templates ORDER BY id`
    );

    const client = await pool.connect();
    try {
      const report = await rekeyFaceTemplates(client, {
        oldKey: OLD_KEY,
        newKey: Buffer.alloc(32, 0x55),
        fromVersion: "v1",
        toVersion: "v2",
      });
      assert.equal(report.aborted, true);
      assert.equal(report.abortReason, "old_key_cannot_decrypt_row");
    } finally {
      client.release();
    }

    const afterRows = await pool.query(
      `SELECT id, key_version, secret FROM face_enrollment_templates ORDER BY id`
    );
    assert.deepEqual(
      afterRows.rows.map((r) => [r.id, r.key_version, r.secret]),
      beforeRows.rows.map((r) => [r.id, r.key_version, r.secret]),
      "9. rollback must restore every row byte-for-byte"
    );
  });

  it("staged: the same tool re-keys backwards to roll a rotation back", async () => {
    // Self-contained: start from rows that really are on the NEW key, which is
    // the state a rollback has to recover from.
    await seed([
      {
        id: "tpl_s3",
        key_version: "v2",
        secret: encryptTemplateSecretWithKey(syntheticEmbedding(0.3), NEW_KEY),
      },
      {
        id: "tpl_s4",
        key_version: "v2",
        secret: encryptTemplateSecretWithKey(syntheticEmbedding(0.4), NEW_KEY),
      },
    ]);

    const client = await pool.connect();
    try {
      const report = await rekeyFaceTemplates(client, {
        oldKey: NEW_KEY,
        newKey: OLD_KEY,
        fromVersion: "v2",
        toVersion: "v1",
      });
      assert.equal(report.ok, true);
      assert.equal(report.rekeyed, 2);
    } finally {
      client.release();
    }
    const rows = await pool.query(
      `SELECT id, key_version, secret FROM face_enrollment_templates ORDER BY id`
    );
    assert.equal(rows.rows.length, 2, "10. count unchanged by a rollback");
    for (const row of rows.rows) {
      assert.equal(row.key_version, "v1");
      assert.deepEqual(
        decryptTemplateSecretWithKey(row.secret, OLD_KEY),
        syntheticEmbedding(row.id === "tpl_s3" ? 0.3 : 0.4)
      );
      assert.throws(() => decryptTemplateSecretWithKey(row.secret, NEW_KEY));
    }
  });
});
