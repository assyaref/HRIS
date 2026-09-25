import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
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
import { workLocations } from "./locations";

/**
 * Employee Master Data 2.0 — related person records (Phase "Employees 2.0").
 *
 * Every table is organization scoped. The application always resolves the
 * caller's organization from the authenticated session and never accepts an
 * `organization_id` from the browser. Related rows are reachable exclusively
 * through an employee id that itself belongs to the caller's organization.
 *
 * Historical records (addresses, dependents, education, bank accounts,
 * employment history, documents) are never physically destroyed by normal
 * CRUD — deletion of dependents/education/bank rows is a deliberate explicit
 * user action, while documents follow the upload/delete lifecycle and
 * employment history is append-only.
 */

/**
 * Employee addresses — one KTP and one Domicile record per employee.
 *
 * `type` values (application-level contract): ktp | domicile.
 * A partial unique index guarantees at most one row per type.
 */
export const employeeAddresses = pgTable(
  "employee_addresses",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    address: text("address"),
    rtRw: text("rt_rw"),
    village: text("village"),
    district: text("district"),
    city: text("city"),
    province: text("province"),
    postalCode: text("postal_code"),
    /** Domicile convenience: same as KTP address. */
    sameAsKtp: boolean("same_as_ktp").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("employee_addresses_employee_type_unique").on(
      table.organizationId,
      table.employeeId,
      table.type
    ),
    index("employee_addresses_org_employee_idx").on(
      table.organizationId,
      table.employeeId
    ),
  ]
);

/**
 * Insurance & government registrations — at most one per employee.
 *
 * NIK lives on `employees`; this table holds NPWP and BPJS registrations.
 */
export const employeeInsurances = pgTable(
  "employee_insurances",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    npwp: text("npwp"),
    bpjsKesehatanNumber: text("bpjs_kesehatan_number"),
    bpjsKesehatanStatus: text("bpjs_kesehatan_status"),
    bpjsKesehatanClass: text("bpjs_kesehatan_class"),
    bpjsKetenagakerjaanNumber: text("bpjs_ketenagakerjaan_number"),
    bpjsKetenagakerjaanStatus: text("bpjs_ketenagakerjaan_status"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("employee_insurances_employee_unique").on(
      table.organizationId,
      table.employeeId
    ),
    index("employee_insurances_org_idx").on(table.organizationId),
  ]
);

/**
 * Employee bank accounts — multiple account rows are supported.
 * `is_primary` marks the primary account (enforced by a partial unique index
 * so an employee can only have one primary account at a time).
 */
export const employeeBankAccounts = pgTable(
  "employee_bank_accounts",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    bankName: text("bank_name").notNull(),
    accountNumber: text("account_number").notNull(),
    accountHolder: text("account_holder").notNull(),
    branch: text("branch"),
    /** Account lifecycle (application-level): active | inactive. */
    status: text("status").notNull().default("active"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("employee_bank_accounts_org_employee_idx").on(
      table.organizationId,
      table.employeeId
    ),
    uniqueIndex("employee_bank_accounts_primary_unique")
      .on(table.organizationId, table.employeeId)
      .where(sql`is_primary = true`),
  ]
);

/**
 * Family / dependents — multiple records per employee.
 * Relationship values (application-level): spouse | child | parent | other.
 */
export const employeeDependents = pgTable(
  "employee_dependents",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relationship: text("relationship").notNull(),
    nik: text("nik"),
    birthDate: date("birth_date", { mode: "date" }),
    gender: text("gender"),
    occupation: text("occupation"),
    dependentStatus: text("dependent_status"),
    bpjsStatus: text("bpjs_status"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("employee_dependents_org_employee_idx").on(
      table.organizationId,
      table.employeeId
    ),
  ]
);

/**
 * Education records — multiple records per employee.
 */
export const employeeEducations = pgTable(
  "employee_educations",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    educationLevel: text("education_level").notNull(),
    institution: text("institution").notNull(),
    major: text("major"),
    startYear: integer("start_year"),
    graduationYear: integer("graduation_year"),
    gpaScore: text("gpa_score"),
    certificateNumber: text("certificate_number"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("employee_educations_org_employee_idx").on(
      table.organizationId,
      table.employeeId
    ),
  ]
);

/**
 * Employee documents — uploaded files with server-generated storage keys.
 *
 * Files live on the private filesystem under
 * `/opt/hris-private/employee-documents/<organization_id>/<employee_id>/`;
 * only the DB row (never the raw path) is exposed to the application.
 * Document type values (application-level): ktp | kk | npwp | bpjs | ijazah |
 * certificate | employment_contract | appointment_letter | resignation_letter
 * | paklaring | other.
 */
export const employeeDocuments = pgTable(
  "employee_documents",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    documentNumber: text("document_number"),
    originalFilename: text("original_filename").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull().default(0),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiryDate: date("expiry_date", { mode: "date" }),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (table) => [
    index("employee_documents_org_employee_idx").on(
      table.organizationId,
      table.employeeId
    ),
    index("employee_documents_uploader_idx").on(table.uploadedByUserId),
  ]
);

/**
 * Employment history — append-only snapshots of employment attributes.
 *
 * When department, division, position, manager, work location, employment
 * type or employment status changes (via the Employment tab), a new history
 * row is written and the employee row is updated. Toggling employment status
 * also snapshots the change here so termination/activation history survives.
 */
export const employeeEmploymentHistory = pgTable(
  "employee_employment_history",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    position: text("position"),
    department: text("department"),
    division: text("division"),
    managerId: uuid("manager_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    workLocationId: uuid("work_location_id").references(
      () => workLocations.id,
      { onDelete: "set null" }
    ),
    employmentType: text("employment_type"),
    employmentStatus: text("employment_status"),
    /** When this employment snapshot took effect. */
    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (table) => [
    index("employee_employment_history_org_employee_idx").on(
      table.organizationId,
      table.employeeId
    ),
    index("employee_employment_history_effective_idx").on(
      table.employeeId,
      table.effectiveFrom
    ),
  ]
);