import { sql } from "drizzle-orm";

/** Anything that can run `execute(sql…)`: the db or a transaction. */
interface SqlExecutor {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }>;
}

/**
 * Whether `public.<name>` exists. Uses `to_regclass`, which returns NULL
 * instead of raising, so it is safe inside a transaction (a failed statement
 * would abort it). Lets code ship before an additive migration is applied:
 * modules check readiness, and the deletion plans skip tables that are not
 * there yet.
 */
export async function tableExists(executor: SqlExecutor, name: string): Promise<boolean> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid table name: ${name}`);
  const result = await executor.execute(
    sql`SELECT to_regclass(${`public.${name}`}) IS NOT NULL AS present`
  );
  const row = result.rows[0] as { present?: boolean } | undefined;
  return row?.present === true;
}
