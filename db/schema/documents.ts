import {
  boolean,
  date,
  index,
  integer,
  jsonb,
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
 * Outgoing letter numbering ("No Surat") and generated letters such as the
 * PKWT contract (migration 0027).
 *
 * `issued_documents.employee_id` is optional and `ON DELETE RESTRICT`;
 * permanent deletion / the test-data purge remove the employee's letters
 * explicitly ("Other related records" / "Issued letters").
 */

export const NUMBER_RESET_PERIODS = ["yearly", "monthly", "never"] as const;

export const documentTypes = pgTable(
  "document_types",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** Short code used in the number, e.g. "SK", "PKWT". */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Tokens: {seq} {code} {month} {roman} {year} {yy}. Must contain {seq}. */
    numberFormat: text("number_format").notNull(),
    sequencePadding: integer("sequence_padding").notNull().default(3),
    /** yearly | monthly | never */
    resetPeriod: text("reset_period").notNull().default("yearly"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("document_types_org_code_unique").on(table.organizationId, table.code)]
);

export const issuedDocuments = pgTable(
  "issued_documents",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    documentTypeId: uuid("document_type_id")
      .notNull()
      .references(() => documentTypes.id, { onDelete: "restrict" }),
    /** Numbering period this sequence belongs to: "2026", "2026-11" or "all". */
    period: text("period").notNull(),
    sequence: integer("sequence").notNull(),
    documentNumber: text("document_number").notNull(),
    issuedDate: date("issued_date", { mode: "string" }).notNull(),
    subject: text("subject").notNull(),
    recipient: text("recipient"),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "restrict" }),
    /** Generated-letter data (e.g. PKWT terms), rendered by the print view. */
    content: jsonb("content").$type<Record<string, unknown>>(),
    notes: text("notes"),
    voided: boolean("voided").notNull().default(false),
    voidReason: text("void_reason"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    issuedBy: uuid("issued_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("issued_documents_type_period_seq_unique").on(
      table.organizationId,
      table.documentTypeId,
      table.period,
      table.sequence
    ),
    uniqueIndex("issued_documents_org_number_unique").on(table.organizationId, table.documentNumber),
    index("issued_documents_org_date_idx").on(table.organizationId, table.issuedDate),
    index("issued_documents_org_employee_idx").on(table.organizationId, table.employeeId),
  ]
);

/**
 * Letter templates (migration 0028): plain-text bodies with {{merge}} fields,
 * rendered from employee data into an issued letter of `document_type_id`.
 * No employee reference (nothing to clean up on employee deletion).
 */
export const letterTemplates = pgTable(
  "letter_templates",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    documentTypeId: uuid("document_type_id")
      .notNull()
      .references(() => documentTypes.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Title printed on the letter, e.g. "SURAT KETERANGAN KERJA". */
    title: text("title").notNull(),
    /** Paragraphs separated by blank lines; {{field}} placeholders. */
    body: text("body").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("letter_templates_org_name_unique").on(table.organizationId, table.name)]
);
