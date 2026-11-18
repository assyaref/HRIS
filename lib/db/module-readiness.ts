import "server-only";

import { db } from "@/db";

import { tableExists } from "./table-exists";

/**
 * Readiness probe for a module whose tables come from an additive migration
 * that production applies manually. Code ships before the migration: pages
 * call the probe and show "module not active yet" instead of failing. A
 * positive answer is cached for the process lifetime (tables never
 * disappear); a negative one is re-checked on every call.
 */
export function createModuleReadiness(tables: readonly string[]): () => Promise<boolean> {
  let ready = false;
  return async () => {
    if (ready) return true;
    for (const name of tables) {
      if (!(await tableExists(db, name))) return false;
    }
    ready = true;
    return true;
  };
}
