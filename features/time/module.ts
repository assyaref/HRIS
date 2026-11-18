import "server-only";

import { db } from "@/db";
import { tableExists } from "@/lib/db/table-exists";

/** Tables created by migration 0024 (time management). */
export const TIME_TABLES = [
  "holidays",
  "shifts",
  "work_groups",
  "work_group_members",
  "overtime_requests",
] as const;

export const TIME_MIGRATION = "0024_time_management";
export const TIME_GUIDE = "docs/time-management.md";

let ready = false;

/**
 * Whether migration 0024 has been applied. Same contract as the compliance
 * module: pages show "module not active yet" instead of failing, a positive
 * answer is cached, a negative one is re-checked on the next request.
 */
export async function isTimeModuleReady(): Promise<boolean> {
  if (ready) return true;
  for (const name of TIME_TABLES) {
    if (!(await tableExists(db, name))) return false;
  }
  ready = true;
  return true;
}
