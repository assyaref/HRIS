import {
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidId } from "./common";
import { employees } from "./employees";
import { organizations } from "./organizations";
import { projects } from "./projects";
import { workLocations } from "./locations";

/**
 * Attendance foundation (Phase 6).
 *
 * Attendance is a geofenced, server-validated check-in/check-out flow. Only
 * the *result* of an accepted check-in creates an `attendance_records` row;
 * every attempt (including rejected ones) is written to the append-only
 * `attendance_events` trail.
 *
 * Privacy:
 * - Raw camera frames, photos and biometric templates are NEVER stored in
 *   these tables. Coordinates/distance/accuracy are retained only because
 *   attendance is geofence-based and the location status must be auditable.
 */

/**
 * Attendance records — one row per employee per attendance day (enforced by a
 * unique (employee_id, attendance_date) index).
 *
 * Status contract (application level): present | completed | incomplete |
 * rejected. A fresh check-in creates the row with `present`; a successful
 * check-out moves it to `completed`. `rejected`/`incomplete` are reserved for
 * later management reconciliation and are not produced by the Phase 6 flow.
 *
 * Location status contract: valid | outside_geofence | unavailable | denied.
 * Verification status contract: pending | verified | failed | unavailable.
 * Method contract: face | camera | manual.
 */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    workLocationId: uuid("work_location_id").references(
      () => workLocations.id,
      { onDelete: "set null" }
    ),

    // Attendance day (server-derived in the work-location timezone).
    attendanceDate: date("attendance_date", { mode: "date" }).notNull(),

    // Check-in.
    checkInAt: timestamp("check_in_at", { withTimezone: true, mode: "date" }),
    checkInLatitude: numeric("check_in_latitude", {
      precision: 10,
      scale: 7,
      mode: "number",
    }),
    checkInLongitude: numeric("check_in_longitude", {
      precision: 10,
      scale: 7,
      mode: "number",
    }),
    checkInAccuracyMeters: numeric("check_in_accuracy_meters", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    checkInDistanceMeters: numeric("check_in_distance_meters", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    checkInLocationStatus: text("check_in_location_status"),
    checkInVerificationStatus: text("check_in_verification_status"),
    checkInMethod: text("check_in_method"),

    // Check-out.
    checkOutAt: timestamp("check_out_at", {
      withTimezone: true,
      mode: "date",
    }),
    checkOutLatitude: numeric("check_out_latitude", {
      precision: 10,
      scale: 7,
      mode: "number",
    }),
    checkOutLongitude: numeric("check_out_longitude", {
      precision: 10,
      scale: 7,
      mode: "number",
    }),
    checkOutAccuracyMeters: numeric("check_out_accuracy_meters", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    checkOutDistanceMeters: numeric("check_out_distance_meters", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    checkOutLocationStatus: text("check_out_location_status"),
    checkOutVerificationStatus: text("check_out_verification_status"),
    checkOutMethod: text("check_out_method"),

    status: text("status").notNull().default("present"),
    notes: text("notes"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("attendance_records_employee_date_unique").on(
      table.employeeId,
      table.attendanceDate
    ),
    index("attendance_records_org_date_idx").on(
      table.organizationId,
      table.attendanceDate
    ),
    index("attendance_records_project_id_idx").on(table.projectId),
    index("attendance_records_work_location_id_idx").on(
      table.workLocationId
    ),
    index("attendance_records_status_idx").on(table.status),
  ]
);

/**
 * Attendance events — the immutable per-attendance audit trail.
 *
 * Append-only by design: the application never UPDATEs or DELETEs rows here.
 * Rejected attempts have no `attendance_records` row, so `attendance_id` is
 * nullable for those events.
 */
export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    attendanceId: uuid("attendance_id").references(
      () => attendanceRecords.id,
      { onDelete: "set null" }
    ),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    latitude: numeric("latitude", {
      precision: 10,
      scale: 7,
      mode: "number",
    }),
    longitude: numeric("longitude", {
      precision: 10,
      scale: 7,
      mode: "number",
    }),
    accuracyMeters: numeric("accuracy_meters", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    distanceMeters: numeric("distance_meters", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    verificationMethod: text("verification_method"),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (table) => [
    index("attendance_events_org_idx").on(table.organizationId),
    index("attendance_events_attendance_id_idx").on(table.attendanceId),
    index("attendance_events_employee_id_idx").on(table.employeeId),
    index("attendance_events_org_event_at_idx").on(
      table.organizationId,
      table.eventAt
    ),
  ]
);

