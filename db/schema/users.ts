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
 * Users — identity accounts (authentication foundation for Phase 3).
 *
 * Status values (application-level contract): pending | active | suspended | locked.
 *
 * Phase 2 deliberately excludes credential columns (password_hash, MFA fields,
 * lockout counters, last_login_at). They arrive with the Phase 3
 * authentication work so no storage or format decision is made early.
 * Passwords are never stored in plaintext.
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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_organization_id_idx").on(table.organizationId),
  ]
);
