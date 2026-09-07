import { sql } from "drizzle-orm";
import {
  customType,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { employees } from "./employees";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Employee face enrollment (Phase 10.1 foundation).
 *
 * Stores ONLY an enrollment RECORD and a provider template REFERENCE — never
 * raw photos, screenshots, base64 images, or biometric vectors in this table.
 * The actual template lives behind the face-recognition provider (not yet
 * configured); `provider_template_ref` is the opaque reference the future
 * verification engine will resolve.
 *
 * Status contract (application level): active | revoked. A partial unique
 * index allows at most ONE active enrollment per (organization, employee).
 * Historical/revoked rows are retained for audit/history — never hard-deleted.
 *
 * Security: every row is organization scoped. `organization_id` always comes
 * from the authenticated session, never from the browser.
 */
export const employeeFaceEnrollments = pgTable(
  "employee_face_enrollments",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    /** Opaque provider-side template reference (set when an engine exists). */
    providerTemplateRef: text("provider_template_ref"),
    enrolledByUserId: uuid("enrolled_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    enrolledAt: timestamp("enrolled_at", {
      withTimezone: true,
      mode: "date",
    }).notNull().defaultNow(),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("employee_face_enrollments_org_idx").on(table.organizationId),
    index("employee_face_enrollments_employee_idx").on(table.employeeId),
    uniqueIndex("employee_face_enrollments_active_unique")
      .on(table.organizationId, table.employeeId)
      .where(sql`status = 'active'`),
  ]
);

/**
 * Face template vault (Phase 10.2) — encrypted at-rest biometric material.
 *
 * Self-hosted face engines (here @vladmandic/human) produce an embedding that
 * must be retained so Phase 10.3 can compare a later capture. This table keeps
 * that material OUT of the enrollment row: `employee_face_enrollments` stores
 * only the opaque `provider_template_ref`, while the encrypted AES-256-GCM
 * payload lives here, one row per enrollment.
 *
 * Security:
 * - The `secret` column is ciphertext only (nonce || ciphertext || tag); the
 *   raw embedding never exists in the database.
 * - Every row is organization-scoped and employee-scoped.
 * - The encryption key is a server-only environment secret
 *   (`FACE_TEMPLATE_ENCRYPTION_KEY`); it never reaches the browser.
 * - Revocation invalidates by clearing/never-reading the row for a revoked
 *   enrollment; rows for replaced enrollments are removed when the old
 *   enrollment is revoked.
 */
export const faceEnrollmentTemplates = pgTable(
  "face_enrollment_templates",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => employeeFaceEnrollments.id, { onDelete: "cascade" }),
    /** Provider/model version that produced the embedding (for future 10.3). */
    templateVersion: text("template_version").notNull(),
    /** AES-256-GCM ciphertext: nonce(12) || ciphertext || authTag(16). */
    secret: customType<{ data: Buffer }>({
      dataType: () => "bytea",
    })("secret").notNull(),
    /** Encryption key version used at write time. */
    keyVersion: text("key_version").notNull().default("v1"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("face_enrollment_templates_enrollment_unique").on(
      table.enrollmentId
    ),
    index("face_enrollment_templates_org_idx").on(table.organizationId),
    index("face_enrollment_templates_employee_idx").on(table.employeeId),
  ]
);
