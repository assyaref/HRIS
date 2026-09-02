import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, uuidId } from "./common";
import { users } from "./users";

/**
 * Sessions — database-backed session foundation (Phase 3).
 *
 * Only a hash of the session token is stored (`token_hash`, unique), never the
 * token itself. `expires_at`, `revoked_at` and `last_activity_at` support
 * expiry, revocation and sliding sessions.
 *
 * No login/session behavior is implemented in Phase 2.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuidId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" })
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    lastActivityAt: timestamp("last_activity_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);
