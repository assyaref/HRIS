import "server-only";

import { and, asc, count, desc, eq, inArray, isNull, lt, gt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  announcementAttachments,
  announcementRecipients,
  announcements,
  employees,
  users,
} from "@/db/schema";

import type {
  AnnouncementAttachmentRecord,
  AnnouncementDetail,
  AnnouncementListItem,
  AnnouncementRecord,
} from "./types";
import type { AnnouncementStatus } from "./constants";

const authorDisplayName = sql<string | null>`coalesce(
  ${users.name},
  nullif(concat_ws(' ', ${employees.firstName}, ${employees.lastName}), ''),
  ${users.email}
)`;

function toAuthor(row: {
  authorUserId: string | null;
  authorDisplayName: string | null;
}): AnnouncementListItem["author"] {
  return row.authorUserId
    ? { id: row.authorUserId, displayName: row.authorDisplayName ?? "Unknown" }
    : null;
}

const announcementBase = {
  id: announcements.id,
  organizationId: announcements.organizationId,
  title: announcements.title,
  content: announcements.content,
  status: announcements.status,
  priority: announcements.priority,
  targetType: announcements.targetType,
  authorUserId: announcements.authorUserId,
  pinned: announcements.pinned,
  scheduledAt: announcements.scheduledAt,
  expiresAt: announcements.expiresAt,
  publishedAt: announcements.publishedAt,
  readCount: announcements.readCount,
  createdAt: announcements.createdAt,
  updatedAt: announcements.updatedAt,
} as const;

/** Priority sort key: urgent first, then important, then normal. */
const priorityOrder = sql<number>`case
  when ${announcements.priority} = 'urgent' then 0
  when ${announcements.priority} = 'important' then 1
  else 2
end`;

/**
 * Self-service feed: announcements currently visible to one employee,
 * newest/pinned first, each flagged with its read state for that employee.
 *
 * Audience rule: `all_employees` is visible to everyone; `selected_employees`
 * is visible only when a recipient row exists for the employee.
 */
export async function listMyAnnouncements(input: {
  organizationId: string;
  employeeId: string;
  limit?: number;
}): Promise<AnnouncementListItem[]> {
  const now = new Date();
  const rows = await db
    .select({
      ...announcementBase,
      authorId: users.id,
      authorDisplayName,
    })
    .from(announcements)
    .leftJoin(users, eq(announcements.authorUserId, users.id))
    .leftJoin(employees, eq(users.id, employees.userId))
    .where(
      and(
        eq(announcements.organizationId, input.organizationId),
        eq(announcements.status, "published"),
        or(
          isNull(announcements.scheduledAt),
          lt(announcements.scheduledAt, now)
        ),
        or(
          isNull(announcements.expiresAt),
          gt(announcements.expiresAt, now)
        )
      )
    )
    .orderBy(
      desc(announcements.pinned),
      priorityOrder,
      desc(announcements.publishedAt)
    );

  const announcementIds = rows.map((row) => row.id);
  if (announcementIds.length === 0) return [];

  const [recipients, attachmentCounts, coverAttachments] = await Promise.all([
    db
      .select()
      .from(announcementRecipients)
      .where(
        and(
          inArray(
            announcementRecipients.announcementId,
            announcementIds
          ),
          eq(announcementRecipients.employeeId, input.employeeId)
        )
      ),
    attachmentCountsByAnnouncement(announcementIds),
    firstImageAttachmentsByAnnouncement(announcementIds),
  ]);

  const recipientByAnnouncement = new Map(
    recipients.map((recipient) => [recipient.announcementId, recipient])
  );

  const items: AnnouncementListItem[] = [];
  for (const row of rows) {
    const recipient = recipientByAnnouncement.get(row.id) ?? null;
    if (row.targetType === "selected_employees" && !recipient) continue;
    items.push({
      id: row.id,
      organizationId: row.organizationId,
      title: row.title,
      content: row.content,
      status: row.status as AnnouncementRecord["status"],
      priority: row.priority as AnnouncementRecord["priority"],
      targetType: row.targetType as AnnouncementRecord["targetType"],
      authorUserId: row.authorUserId,
      pinned: row.pinned,
      scheduledAt: row.scheduledAt,
      expiresAt: row.expiresAt,
      publishedAt: row.publishedAt,
      readCount: row.readCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isRead: Boolean(recipient?.readAt),
      attachmentCount: attachmentCounts.get(row.id) ?? 0,
      coverAttachmentId: coverAttachments.get(row.id) ?? null,
      author: toAuthor(row),
    });
  }

  const limit = input.limit ?? items.length;
  return items.slice(0, limit);
}

/** Unread count for the employee dashboard card. */
export async function countMyUnreadAnnouncements(input: {
  organizationId: string;
  employeeId: string;
}): Promise<number> {
  const items = await listMyAnnouncements({
    organizationId: input.organizationId,
    employeeId: input.employeeId,
  });
  return items.filter((item) => !item.isRead).length;
}

async function attachmentCountsByAnnouncement(
  announcementIds: string[]
): Promise<Map<string, number>> {
  if (announcementIds.length === 0) return new Map();
  const rows = await db
    .select({
      announcementId: announcementAttachments.announcementId,
      attachmentCount: count(),
    })
    .from(announcementAttachments)
    .where(
      inArray(announcementAttachments.announcementId, announcementIds)
    )
    .groupBy(announcementAttachments.announcementId);
  return new Map(
    rows.map((row) => [row.announcementId, row.attachmentCount])
  );
}

/**
 * The first image attachment per announcement (oldest first), used as the
 * employee carousel cover. Only server-stored attachment ids are returned; the
 * client never receives storage keys.
 */
async function firstImageAttachmentsByAnnouncement(
  announcementIds: string[]
): Promise<Map<string, string>> {
  if (announcementIds.length === 0) return new Map();
  const rows = await db
    .select({
      announcementId: announcementAttachments.announcementId,
      id: announcementAttachments.id,
      mimeType: announcementAttachments.mimeType,
    })
    .from(announcementAttachments)
    .where(
      and(
        inArray(announcementAttachments.announcementId, announcementIds),
        sql`${announcementAttachments.mimeType} like 'image/%'`
      )
    )
    .orderBy(asc(announcementAttachments.createdAt));

  const result = new Map<string, string>();
  for (const row of rows) {
    if (!result.has(row.announcementId)) {
      result.set(row.announcementId, row.id);
    }
  }
  return result;
}

/**
 * Management detail: attachments, chosen recipients and the author (for the
 * edit screen and the management detail view).
 */
export async function getAnnouncementDetail(input: {
  announcementId: string;
  organizationId: string;
  /** When provided, resolves `myReadAt` for that employee. */
  employeeId?: string;
}): Promise<AnnouncementDetail | null> {
  const rows = await db
    .select({
      ...announcementBase,
      authorId: users.id,
      authorDisplayName,
    })
    .from(announcements)
    .leftJoin(users, eq(announcements.authorUserId, users.id))
    .leftJoin(employees, eq(users.id, employees.userId))
    .where(
      and(
        eq(announcements.id, input.announcementId),
        eq(announcements.organizationId, input.organizationId)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [recipients, attachments] = await Promise.all([
    db
      .select()
      .from(announcementRecipients)
      .where(eq(announcementRecipients.announcementId, row.id)),
    db
      .select()
      .from(announcementAttachments)
      .where(eq(announcementAttachments.announcementId, row.id))
      .orderBy(desc(announcementAttachments.createdAt)),
  ]);

  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    content: row.content,
    status: row.status as AnnouncementRecord["status"],
    priority: row.priority as AnnouncementRecord["priority"],
    targetType: row.targetType as AnnouncementRecord["targetType"],
    authorUserId: row.authorUserId,
    pinned: row.pinned,
    scheduledAt: row.scheduledAt,
    expiresAt: row.expiresAt,
    publishedAt: row.publishedAt,
    readCount: row.readCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    attachments: attachments as AnnouncementAttachmentRecord[],
    myReadAt: input.employeeId
      ? (recipients.find(
          (recipient) => recipient.employeeId === input.employeeId
        )?.readAt ?? null)
      : null,
    recipientIds: recipients.map((recipient) => recipient.employeeId),
    author: toAuthor(row),
  };
}

/**
 * Management list with optional status + text filter, newest first.
 */
export async function listManageableAnnouncements(input: {
  organizationId: string;
  status?: AnnouncementStatus | null;
  query?: string | null;
  limit?: number;
}): Promise<AnnouncementRecord[]> {
  const conditions = [
    eq(announcements.organizationId, input.organizationId),
  ];
  if (input.status) {
    conditions.push(eq(announcements.status, input.status));
  }
  if (input.query?.trim()) {
    const like = `%${input.query.trim()}%`;
    conditions.push(
      or(
        sql`${announcements.title} ILIKE ${like}`,
        sql`${announcements.content} ILIKE ${like}`
      )!
    );
  }

  const rows = await db
    .select(announcementBase)
    .from(announcements)
    .where(and(...conditions))
    .orderBy(desc(announcements.updatedAt))
    .limit(input.limit ?? 100);

  return rows.map((row) => ({
    ...row,
    status: row.status as AnnouncementRecord["status"],
    priority: row.priority as AnnouncementRecord["priority"],
    targetType: row.targetType as AnnouncementRecord["targetType"],
  }));
}

/** Counts by status for the management page state filters. */
export async function getAnnouncementStatusCounts(input: {
  organizationId: string;
}): Promise<Record<AnnouncementStatus, number>> {
  const rows = await db
    .select({
      status: announcements.status,
      statusCount: count(),
    })
    .from(announcements)
    .where(eq(announcements.organizationId, input.organizationId))
    .groupBy(announcements.status);

  const counts: Record<AnnouncementStatus, number> = {
    draft: 0,
    published: 0,
    unpublished: 0,
  };
  for (const row of rows) {
    if (row.status in counts) {
      counts[row.status as AnnouncementStatus] = row.statusCount;
    }
  }
  return counts;
}