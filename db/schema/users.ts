import {
  index,
  pgTable,
  text,
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
 */
export const users = pgTable(
  "users",
  {
    id: uuidId(),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "set null" }
    ),
    email: text("email").notNull(),
    status: text("status").notNull().default("active"),
    passwordHash: text("password_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_organization_id_idx").on(table.organizationId),
  ]
);
