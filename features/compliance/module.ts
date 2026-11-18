import "server-only";

import { db } from "@/db";
import { tableExists } from "@/lib/db/table-exists";

/** Tables created by migration 0023 (compliance). */
export const COMPLIANCE_TABLES = [
  "medical_checkups",
  "training_masters",
  "employee_trainings",
  "training_requirements",
] as const;

let ready = false;

/**
 * Whether migration 0023 has been applied. The code ships before the
 * migration (production migrations run manually), so the MCU / Training pages
 * show a "module not active yet" notice instead of failing. A positive answer
 * is cached for the process lifetime; a negative one is re-checked.
 */
export async function isComplianceModuleReady(): Promise<boolean> {
  if (ready) return true;
  for (const name of COMPLIANCE_TABLES) {
    if (!(await tableExists(db, name))) return false;
  }
  ready = true;
  return true;
}
