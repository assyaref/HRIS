import "server-only";

import { createModuleReadiness } from "@/lib/db/module-readiness";

/** Tables created by migration 0023 (compliance). */
export const COMPLIANCE_TABLES = [
  "medical_checkups",
  "training_masters",
  "employee_trainings",
  "training_requirements",
] as const;

/** Whether migration 0023 (compliance) has been applied (see createModuleReadiness). */
export const isComplianceModuleReady = createModuleReadiness(COMPLIANCE_TABLES);
