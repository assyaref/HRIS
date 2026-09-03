#!/usr/bin/env node
/**
 * DEV-ONLY helper: create or reset a local login user for manually validating
 * Phase 3 authentication (login/logout/session expiry) against a local
 * PostgreSQL instance.
 *
 * Usage:
 *   node scripts/create-auth-user.mjs <email> <password> [orgCode] [orgName]
 *
 * Examples:
 *   node scripts/create-auth-user.mjs admin@acme.test "s3cure-pass!" HQ "Acme Inc"
 *   node scripts/create-auth-user.mjs admin@acme.test "s3cure-pass!"          # no organization
 *
 * Requirements: a reachable PostgreSQL (DATABASE_URL in .env.local/.env) with
 * the Phase 2/3 migrations applied. This is NOT a registration endpoint — it
 * is a terminal tool for developers only and refuses to run in production.
 *
 * It stores an Argon2id hash (never the plaintext) and never prints the
 * password or the hash.
 */

import { config as loadEnv } from "dotenv";
import { hash } from "@node-rs/argon2";
import pg from "pg";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Create .env.local from .env.example first."
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run the dev user helper in production.");
  process.exit(1);
}

const [, , emailArg, passwordArg, orgCode, orgName] = process.argv;
if (!emailArg || !passwordArg) {
  console.error(
    "Usage: node scripts/create-auth-user.mjs <email> <password> [orgCode] [orgName]"
  );
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const pool = new pg.Pool({ connectionString: databaseUrl });

async function main() {
  const passwordHash = await hash(passwordArg);

  let organizationId = null;
  if (orgCode) {
    const { rows } = await pool.query(
      `SELECT id FROM organizations WHERE code = $1 LIMIT 1`,
      [orgCode]
    );
    if (rows[0]) {
      organizationId = rows[0].id;
    } else if (orgName) {
      const inserted = await pool.query(
        `INSERT INTO organizations (name, code, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [orgName, orgCode]
      );
      organizationId = inserted.rows[0].id;
      console.log(`Created organization "${orgCode}" (${organizationId}).`);
    } else {
      console.error(
        `Organization code "${orgCode}" not found and no orgName given.`
      );
      process.exit(1);
    }
  }

  const existing = await pool.query(
    `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE users SET password_hash = $1, status = 'active', updated_at = now()
       WHERE id = $2`,
      [passwordHash, existing.rows[0].id]
    );
    console.log(`Updated existing user ${email} (${existing.rows[0].id}).`);
  } else {
    const inserted = await pool.query(
      `INSERT INTO users (organization_id, email, status, password_hash)
       VALUES ($1, $2, 'active', $3)
       RETURNING id`,
      [organizationId, email, passwordHash]
    );
    console.log(`Created user ${email} (${inserted.rows[0].id}).`);
  }

  console.log("Done. Sign in at http://localhost:3000/login");
}

main()
  .catch((error) => {
    console.error("Failed to create user:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
