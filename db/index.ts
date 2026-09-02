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
 * - The Pool is lazy (no sockets are opened until the first query) and is
 *   cached on `globalThis` in development to survive HMR without creating
 *   duplicate pools.
 * - Production builds create one Pool per server process; if a serverless
 *   external pooler (e.g. PgBouncer in transaction mode) is used later, the
 *   connection string already supports it.
 */
const globalForDb = globalThis as unknown as {
  hrisDatabase?: HrisDatabase;
};

function createDatabase(): HrisDatabase {
  const pool = new Pool({
    connectionString: getRequiredEnv("DATABASE_URL"),
  });
  return drizzle(pool, { schema });
}

export const db: HrisDatabase = globalForDb.hrisDatabase ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.hrisDatabase = db;
}
