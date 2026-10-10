import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { organizations } from "./organizations";

/**
 * Users — identity accounts (authentication foundation, Phase 3).
 *
 * Status values (application-level contract): pending | active | suspended | locked.
 * Only `active` accounts may authenticate (enforced by lib/auth).
 *
 * `password_hash` stores the Argon2id PHC hash only — never a plaintext or
 * reversibly-encrypted password. It is nullable so accounts can exist in a
 * pre-credential state (e.g. `pending` invitations); authenticating with a
 * NULL hash always fails with a generic error. MFA and lockout counters
 * arrive with the phases that own them.
 *
 * Password lifecycle (0020):
 * - `must_change_password` — set when the account is provisioned through the
 *   employee import (initial password = employee number) or after an
 *   administrator password reset. While true, every authenticated request is
 *   redirected to /change-password (see lib/auth/auth.ts).
 * - `password_changed_at` — when the current credential was last set by its
 *   owner; nulled by administrative resets.
 * - `last_login_at` — best-effort timestamp updated on successful login.
 */
export const users = pgTable(
  "users",
  {
    id: uuidId(),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "set null" }
    ),
    /** Display name for the account (nullable — legacy/employee-linked accounts fall back to the linked employee name). */
    name: text("name"),
    email: text("email").notNull(),
    status: text("status").notNull().default("active"),
    passwordHash: text("password_hash"),
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    passwordChangedAt: timestamp("password_changed_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastLoginAt: timestamp("last_login_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_organization_id_idx").on(table.organizationId),
  ]
);
