import "server-only";

import { createModuleReadiness } from "@/lib/db/module-readiness";

export const PROFILE_CHANGE_MIGRATION = "0025_profile_change_requests";
export const PROFILE_CHANGE_GUIDE = "docs/profile-change-requests.md";

/** Whether migration 0025 (profile change requests) has been applied. */
export const isProfileChangeModuleReady = createModuleReadiness(["profile_change_requests"]);
