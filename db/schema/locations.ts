import {
  doublePrecision,
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { organizations } from "./organizations";
import { projects } from "./projects";

/**
 * Work locations — physical places where employees attend (geofence anchor).
 * Status values (application-level contract): active | inactive.
 *
 * Phase 2 is database foundation only. Geofence *validation*, GPS accuracy
 * checks and radius enforcement arrive with Phase 9.
 */
export const workLocations = pgTable(
  "work_locations",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    radiusMeters: doublePrecision("radius_meters"),
    maxGpsAccuracyMeters: doublePrecision("max_gps_accuracy_meters"),
    timezone: text("timezone"),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("work_locations_organization_id_idx").on(table.organizationId),
    index("work_locations_project_id_idx").on(table.projectId),
  ]
);
