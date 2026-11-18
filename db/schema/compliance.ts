import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt, uuidId } from "./common";
import { employees } from "./employees";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Compliance records (migration 0023): medical check-ups, training masters,
 * employee trainings / certifications and the position × training matrix.
 *
 * Employee foreign keys are `ON DELETE RESTRICT` like every other
 * employee-scoped table (no CASCADE): permanent deletion removes these rows
 * explicitly through the deletion plan ("Other related records") and the
 * test-data purge ("Medical & training") before deleting the employee.
 */

export const MEDICAL_CHECKUP_RESULTS = [
  "fit",
  "fit_with_note",
  "temporary_unfit",
  "unfit",
] as const;

export const medicalCheckups = pgTable(
  "medical_checkups",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    checkupDate: date("checkup_date", { mode: "string" }).notNull(),
    validUntil: date("valid_until", { mode: "string" }),
    provider: text("provider"),
    location: text("location"),
    doctor: text("doctor"),
    /** fit | fit_with_note | temporary_unfit | unfit */
    result: text("result").notNull().default("fit"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("medical_checkups_org_employee_idx").on(table.organizationId, table.employeeId),
    index("medical_checkups_org_valid_until_idx").on(table.organizationId, table.validUntil),
  ]
);

export const TRAINING_TYPES = ["internal", "external", "certification"] as const;

export const trainingMasters = pgTable(
  "training_masters",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    category: text("category"),
    /** internal | external | certification */
    trainingType: text("training_type").notNull().default("internal"),
    durationHours: integer("duration_hours"),
    organizer: text("organizer"),
    /** Certificate validity in months; null = does not expire. */
    validityMonths: integer("validity_months"),
    isMandatory: boolean("is_mandatory").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("training_masters_org_name_unique").on(table.organizationId, table.name),
  ]
);

export const employeeTrainings = pgTable(
  "employee_trainings",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** Catalog entry, when the training is one of the organization's masters. */
    trainingMasterId: uuid("training_master_id").references(
      () => trainingMasters.id,
      { onDelete: "restrict" }
    ),
    title: text("title").notNull(),
    certificateNumber: text("certificate_number"),
    issuer: text("issuer"),
    location: text("location"),
    trainingDate: date("training_date", { mode: "string" }).notNull(),
    validUntil: date("valid_until", { mode: "string" }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("employee_trainings_org_employee_idx").on(table.organizationId, table.employeeId),
    index("employee_trainings_org_valid_until_idx").on(table.organizationId, table.validUntil),
    index("employee_trainings_master_idx").on(table.trainingMasterId),
  ]
);

/** Matrix: which trainings each position requires. */
export const trainingRequirements = pgTable(
  "training_requirements",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** Matches `employees.position` (case-insensitive in queries). */
    position: text("position").notNull(),
    trainingMasterId: uuid("training_master_id")
      .notNull()
      .references(() => trainingMasters.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("training_requirements_unique").on(
      table.organizationId,
      table.position,
      table.trainingMasterId
    ),
  ]
);
