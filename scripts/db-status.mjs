#!/usr/bin/env node
/**
 * Migration status: compares db/migrations/meta/_journal.json with the
 * migrations recorded in drizzle.__drizzle_migrations.
 *
 *   DATABASE_URL=postgres://… npm run db:status
 *
 * Exit code 0 when everything is applied, 1 when migrations are pending,
 * 2 on connection / configuration errors. Read-only.
 *
 * Note: `drizzle-kit migrate` applies every journal entry whose `when` is
 * newer than the LAST recorded migration. An entry older than that which is
 * not recorded would be skipped — reported here as "SKIPPED".
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Same order as drizzle.config.ts (dotenv never overrides a set variable).
try {
  const dotenv = require("dotenv");
  for (const file of [".env.production", ".env.local", ".env"]) dotenv.config({ path: join(root, file), quiet: true });
} catch {
  // dotenv is optional
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL.");
  process.exit(2);
}

const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8"));
const { Client } = require("pg");
const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });

try {
  await client.connect();
} catch (error) {
  console.error(`Cannot connect: ${error.message}`);
  process.exit(2);
}

let applied = new Set();
try {
  const exists = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ok");
  if (exists.rows[0].ok) {
    const rows = await client.query("SELECT created_at FROM drizzle.__drizzle_migrations");
    applied = new Set(rows.rows.map((r) => Number(r.created_at)));
  }
} finally {
  await client.end();
}

const { migrationStatus } = await import("../lib/db/migration-status.ts");
const status = migrationStatus(journal.entries, [...applied]);
for (const item of status.items) {
  console.log(`${(item.state === "applied" ? "applied" : item.state.toUpperCase()).padEnd(8)} ${item.tag}`);
}
const { pending, skipped } = status;
console.log(
  `\n${status.items.length} migrations · ${status.applied} applied · ${pending} pending${skipped ? ` · ${skipped} SKIPPED (apply manually)` : ""}`
);
if (pending) console.log("Run: npm run db:migrate  (back up first)");
process.exit(pending || skipped ? 1 : 0);
