import {
  boolean,
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

/**
 * Announcements — management publications / employee information center.
 *
 * Status values (application-level contract): draft | published | unpublished.
 * Priority values: normal | important | urgent.
 * Target values: all_employees | selected_employees.
 *
 * Design notes:
 * - `read_count` only ever increments (append-only read metric). Deletion is
 *   blocked once any employee has read the announcement (see
 *   features/announcements/policy.ts).
 * - Recipients for `all_employees` announcements are created lazily (on read)
 *   so publishing never materializes one row per employee. `selected_employees`
 *   announcements pre-materialize exactly the chosen recipients.
 * - Attachments live in `/opt/hris-private/announcements/<announcement_id>`;
 *   only server-generated storage keys are referenced here.
 * - Visibility window is computed in application time: published AND
 *   (scheduled_at IS NULL OR scheduled_at <= now) AND (expires_at IS NULL OR
 *   expires_at > now).
 */
export const announcements = pgTable(
  "announcements",
  {
    id: uuidId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("draft"),
    priority: text("priority").notNull().default("normal"),
    targetType: text("target_type").notNull().default("all_employees"),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    pinned: boolean("pinned").notNull().default(false),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      mode: "date",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    readCount: integer("read_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("announcements_organization_id_idx").on(table.organizationId),
    index("announcements_status_idx").on(table.status),
    index("announcements_author_user_id_idx").on(table.authorUserId),
  ]
);

/**
 * Per-employee per-announcement read state.
 *
 * For `all_employees` announcements the row appears lazily when the employee
 * opens the announcement; for `selected_employees` announcements the row is
 * created at publish time for each chosen employee.
 */
export const announcementRecipients = pgTable(
  "announcement_recipients",
  {
    id: uuidId(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("announcement_recipients_announcement_employee_unique").on(
      table.announcementId,
      table.employeeId
    ),
    index("announcement_recipients_organization_employee_idx").on(
      table.organizationId,
      table.employeeId
    ),
  ]
);

/**
 * Uploaded attachments for an announcement.
 *
 * Files are stored on the private filesystem; `storage_key` is the
 * server-generated relative name inside `/opt/hris-private/announcements/<id>/`.
 */
export const announcementAttachments = pgTable(
  "announcement_attachments",
  {
    id: uuidId(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    uploaderUserId: uuid("uploader_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    originalFilename: text("original_filename").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("announcement_attachments_announcement_idx").on(
      table.announcementId
    ),
    index("announcement_attachments_organization_idx").on(
      table.organizationId
    ),
  ]
);