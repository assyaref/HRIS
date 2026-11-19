import "server-only";

import { createModuleReadiness } from "@/lib/db/module-readiness";

export const AGENDA_MIGRATION = "0031_agenda";
export const AGENDA_GUIDE = "docs/agenda.md";

/** Whether migration 0031 (agenda) has been applied. */
export const isAgendaReady = createModuleReadiness(["agenda_events", "agenda_responses"]);
