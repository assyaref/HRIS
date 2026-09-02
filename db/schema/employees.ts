import { date, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Employees — the person records consumed by later HR modules.
 *
 * Status values (application-level contract): active | inactive.
 *
 * Phase 2 keeps this to core identity/organization fields. Payroll, biometric,
 * attendance, department/position, manager and assignment columns arrive with
 * the phases that own them (Phase 5+). No circular FK: `users` does not
 * reference `employees`.
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
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    employmentStatus: text("employment_status").notNull().default("active"),
    hireDate: date("hire_date", { mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("employees_org_employee_number_unique").on(
      table.organizationId,
      table.employeeNumber
    ),
    index("employees_user_id_idx").on(table.userId),
  ]
);
