import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, uuidId } from "./common";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Audit log — append-only application audit trail.
 *
 * Phase 2 creates the storage foundation only. Rows are written exclusively
 * through the future audit service (Phase 3+); by application design there is
 * no UPDATE or DELETE path and no `updated_at` column. `entity_type` +
 * `entity_id` is a polymorphic reference to the affected record.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuidId(),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "set null" }
    ),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_organization_id_idx").on(table.organizationId),
    index("audit_logs_actor_user_id_idx").on(table.actorUserId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ]
);
