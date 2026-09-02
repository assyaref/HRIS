import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";

/**
 * Organizations — the tenant root of the HRIS.
 * Status values (application-level contract): active | inactive.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuidId(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("organizations_code_unique").on(table.code)]
);
