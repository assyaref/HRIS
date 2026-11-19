import "server-only";

import { createModuleReadiness } from "@/lib/db/module-readiness";

export const ORG_MASTER_MIGRATION = "0030_org_master";
export const ORG_MASTER_GUIDE = "docs/org-master.md";

/** Whether migration 0030 (organization master) has been applied. */
export const isOrgMasterReady = createModuleReadiness(["departments", "job_positions", "job_grades"]);
