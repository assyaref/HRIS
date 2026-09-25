import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, deletedAt, updatedAt, uuidId } from "./common";
import { employees } from "./employees";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Administrable custom employee fields (Employee Master Data 2.0).
 *
 * Administrators create fields entirely from the UI — no source-code change is
 * needed to add "Blood Type", "Shirt Size", "Vehicle Number", etc. Field
 * definitions are organization scoped (a tenant can never see another
 * tenant's fields) and values are tied to both a field definition and an
 * employee, so cross-organization access is impossible.
 *
 * Field type values (application-level contract):
 *   text | textarea | number | currency | email | phone | date | datetime |
 *   checkbox | select | multiselect | radio | url
 *
 * Section values: built-in sections are Personal | Contact | Employment |
 * Address | Insurance | Family | Education | Other; administrators may also
 * use a free-form custom section name (e.g. "Uniform Information").
 *
 * Status values: active | inactive | archived. Archived is the soft-delete
 * sentinel: a field with employee values is never physically deleted.
 *
 * Scalar values are kept in the typed column matching the field type:
 *   select/multiselect/radio → value_json (array of option values)
 *   checkbox → value_boolean     | date → value_date
 *   number/currency → value_number | everything else → value_text
 */

export const employeeCustomFieldDefinitions = pgTable(
  "employee_custom_field_definitions",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** Unique per organization (e.g. `blood_type`). */
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    fieldType: text("field_type").notNull(),
    section: text("section").notNull().default("Other"),
    isRequired: boolean("is_required").notNull().default(false),
    /**
     * Lifecycle: active | inactive | archived.
     * Archived behaves like a soft delete (historical values stay readable).
     */
    status: text("status").notNull().default("active"),
    displayOrder: integer("display_order").notNull().default(0),
    /** Allowed option labels for select/multiselect/radio. */
    options: jsonb("options")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Role codes permitted to view this field (empty = every role). */
    visibilityConfig: jsonb("visibility_config")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Role codes permitted to edit this field (empty = every editor). */
    editableByConfig: jsonb("editable_by_config")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex("employee_custom_field_definitions_org_key_unique").on(
      table.organizationId,
      table.fieldKey
    ),
    index("employee_custom_field_definitions_org_status_idx").on(
      table.organizationId,
      table.status
    ),
    index("employee_custom_field_definitions_org_section_idx").on(
      table.organizationId,
      table.section
    ),
  ]
);

/**
 * One current value per (employee, field definition). The unique index makes
 * each employee hold at most one value per field; saving a value upserts on
 * that key. Historical values survive field archival because the value row
 * is not removed when a field is soft-deleted.
 */
export const employeeCustomFieldValues = pgTable(
  "employee_custom_field_values",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    fieldDefinitionId: uuid("field_definition_id")
      .notNull()
      .references(() => employeeCustomFieldDefinitions.id, {
        onDelete: "restrict",
      }),
    valueText: text("value_text"),
    valueNumber: numeric("value_number"),
    valueDate: timestamp("value_date", { withTimezone: true, mode: "date" }),
    valueBoolean: boolean("value_boolean"),
    valueJson: jsonb("value_json").$type<unknown[]>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("employee_custom_field_values_employee_field_unique").on(
      table.organizationId,
      table.employeeId,
      table.fieldDefinitionId
    ),
    index("employee_custom_field_values_org_field_idx").on(
      table.organizationId,
      table.fieldDefinitionId
    ),
    index("employee_custom_field_values_org_employee_idx").on(
      table.organizationId,
      table.employeeId
    ),
  ]
);