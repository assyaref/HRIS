import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getRequiredEnv } from "@/lib/config/env";
import * as schema from "./schema";

type HrisDatabase = NodePgDatabase<typeof schema>;

/**
 * Singleton Drizzle handle backed by a `pg` connection Pool.
 *
 * Safety rules:
 * - This module is `server-only`; importing it from a Client Component fails
 *   at build time, so `DATABASE_URL` can never reach the browser.
 * - Credentials come exclusively from the environment (`DATABASE_URL`).
 * - The Pool is lazy: it is created on the first actual query, not at module
 *   import time. This keeps builds, lint and framework page-data collection
 *   working when `DATABASE_URL` is absent (e.g. CI/build machines), and the
 *   requirement error surfaces at the first database access instead.
 * - The Pool is cached on `globalThis` in development to survive HMR without
 *   creating duplicate pools.
 * - Production builds create one Pool per server process; if a serverless
 *   external pooler (e.g. PgBouncer in transaction mode) is used later, the
 *   connection string already supports it.
 *
 * `db` is a lazy Proxy: the underlying Drizzle instance is created on first
 * property access (which happens inside a query call). The exported API and
 * types are identical to a direct `drizzle(...)` handle.
 */
const globalForDb = globalThis as unknown as {
  hrisDatabase?: HrisDatabase;
  hrisPool?: Pool;
};

function createDatabase(): HrisDatabase {
  const pool = new Pool({
    connectionString: getRequiredEnv("DATABASE_URL"),
  });
  globalForDb.hrisPool = pool;
  return drizzle(pool, { schema });
}

function getDatabase(): HrisDatabase {
  if (!globalForDb.hrisDatabase) {
    globalForDb.hrisDatabase = createDatabase();
  }
  return globalForDb.hrisDatabase;
}

export const db: HrisDatabase = new Proxy({} as HrisDatabase, {
  get(_target, prop: string | symbol) {
    const database = getDatabase();
    const value = Reflect.get(database, prop);
    return typeof value === "function" ? value.bind(database) : value;
  },
});

