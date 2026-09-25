import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { organizations } from "./organizations";
import { users } from "./users";
import { workLocations } from "./locations";

/**
 * Employees — the person records consumed by later HR modules.
 *
 * Status values (application-level contract): active | inactive.
 *
 * EMPLOYEE MASTER DATA 2.0: this table carries the core personal and
 * employment identity columns (extended additively — every new column is
 * nullable so existing employee rows remain valid). Related master-data
 * records (addresses, insurance, bank accounts, dependents, education,
 * documents, employment history) live in `employee_details`; administrable
 * custom fields are modeled in `employee_custom_fields`. No circular FK:
 * `users` does not reference `employees`. `manager_id` self-references the
 * same table and is `SET NULL` so manager removal never deletes employees.
 */
export const employees = pgTable(
  "employees",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    employeeNumber: text("employee_number").notNull(),

    /** Indonesian national identity number (NIK). */
    nik: text("nik"),
    /** Employee date of birth. */
    birthDate: date("birth_date", { mode: "date" }),

    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    employmentStatus: text("employment_status").notNull().default("active"),
    hireDate: date("hire_date", { mode: "date" }),

    /* ---------------------------------------------------------------- */
    /* Personal details (Employee Master Data 2.0)                       */
    /* ---------------------------------------------------------------- */
    nickname: text("nickname"),
    birthPlace: text("birth_place"),
    gender: text("gender"),
    religion: text("religion"),
    maritalStatus: text("marital_status"),
    nationality: text("nationality"),
    personalEmail: text("personal_email"),
    /** Profile photo — server-generated storage key inside the private store. */
    profilePhotoUrl: text("profile_photo_url"),

    /* ---------------------------------------------------------------- */
    /* Employment details (Employee Master Data 2.0)                     */
    /* ---------------------------------------------------------------- */
    division: text("division"),
    department: text("department"),
    position: text("position"),
    workLocationId: uuid("work_location_id").references(
      () => workLocations.id,
      { onDelete: "set null" }
    ),
    /** Direct reporting line — self-referencing, org-scoped by policy. */
    managerId: uuid("manager_id").references(
      (): AnyPgColumn => employees.id,
      {
        onDelete: "set null",
      }
    ),
    employmentType: text("employment_type"),
    contractStart: date("contract_start", { mode: "date" }),
    contractEnd: date("contract_end", { mode: "date" }),
    resignationDate: date("resignation_date", { mode: "date" }),
    terminationDate: date("termination_date", { mode: "date" }),
    reasonForLeaving: text("reason_for_leaving"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("employees_org_employee_number_unique").on(
      table.organizationId,
      table.employeeNumber
    ),

    /**
     * NIK must be unique inside one organization.
     *
     * PostgreSQL permits multiple NULL values in a normal unique index,
     * which allows legacy employees to remain without identity data.
     */
    uniqueIndex("employees_org_nik_unique").on(
      table.organizationId,
      table.nik
    ),

    index("employees_user_id_idx").on(table.userId),
    index("employees_org_status_idx").on(
      table.organizationId,
      table.employmentStatus
    ),
    index("employees_org_dept_idx").on(table.organizationId, table.department),
    index("employees_org_position_idx").on(
      table.organizationId,
      table.position
    ),
    index("employees_work_location_idx").on(
      table.organizationId,
      table.workLocationId
    ),
    index("employees_manager_idx").on(table.organizationId, table.managerId),
  ]
);
