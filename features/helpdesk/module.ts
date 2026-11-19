import "server-only";

import { createModuleReadiness } from "@/lib/db/module-readiness";

export const HELPDESK_MIGRATION = "0026_helpdesk";
export const HELPDESK_GUIDE = "docs/helpdesk.md";

/** Whether migration 0026 (helpdesk) has been applied. */
export const isHelpdeskModuleReady = createModuleReadiness([
  "helpdesk_categories",
  "helpdesk_tickets",
  "helpdesk_messages",
]);
