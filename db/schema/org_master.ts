import { boolean, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, updatedAt, uuidId } from "./common";
import { organizations } from "./organizations";

/**
 * Organization master data (migration 0030): departments, job positions
 * (with job description and grade) and grades.
 *
 * Employees keep their free-text division / department / position columns
 * (no change to `employees`); the master is the curated list those values
 * are matched against (case- and space-insensitively), offered as
 * suggestions in employee forms, and used to rename values in bulk.
 * No employee foreign keys.
 */

export const jobGrades = pgTable(
  "job_grades",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Higher = more senior; used for ordering. */
    level: integer("level").notNull().default(1),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("job_grades_org_code_unique").on(table.organizationId, table.code)]
);

export const departments = pgTable(
  "departments",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    /** Division the department belongs to (free text, like employees.division). */
    division: text("division"),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("departments_org_name_unique").on(table.organizationId, table.name)]
);

export const jobPositions = pgTable(
  "job_positions",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    gradeId: uuid("grade_id").references(() => jobGrades.id, { onDelete: "set null" }),
    jobDescription: text("job_description"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("job_positions_org_name_unique").on(table.organizationId, table.name)]
);
