import "server-only";

import { createModuleReadiness } from "@/lib/db/module-readiness";

export const TIMESHEET_MIGRATION = "0029_timesheets";
export const TIMESHEET_GUIDE = "docs/timesheets.md";

/** Whether migration 0029 (timesheets) has been applied. */
export const isTimesheetModuleReady = createModuleReadiness(["timesheet_entries"]);
