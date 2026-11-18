import "server-only";

import { createModuleReadiness } from "@/lib/db/module-readiness";

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

/** Whether migration 0024 (time management) has been applied (see createModuleReadiness). */
export const isTimeModuleReady = createModuleReadiness(TIME_TABLES);
