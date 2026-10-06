/**
 * Announcements — shared row/domain types (pure, type-only).
 */

import type {
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementTargetType,
} from "./constants";

export interface AnnouncementRecord {
  id: string;
  organizationId: string;
  title: string;
  content: string;
  status: AnnouncementStatus;
  priority: AnnouncementPriority;
  targetType: AnnouncementTargetType;
  authorUserId: string | null;
  pinned: boolean;
  scheduledAt: Date | null;
  expiresAt: Date | null;
  publishedAt: Date | null;
  readCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnouncementAttachmentRecord {
  id: string;
  announcementId: string;
  organizationId: string;
  uploaderUserId: string | null;
  originalFilename: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  createdAt: Date;
}

export interface AnnouncementRecipientRecord {
  id: string;
  announcementId: string;
  organizationId: string;
  employeeId: string;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Author display name fallback chain: account name → employee name → email. */
export interface AnnouncementAuthor {
  id: string;
  displayName: string;
}

/** Announcement row enriched for the self-service list / dashboard. */
export interface AnnouncementListItem extends AnnouncementRecord {
  /** TRUE when the announcement is already read by the viewing employee. */
  isRead: boolean;
  attachmentCount: number;
  /**
   * Id of the first image attachment, when one exists. Used as the employee
   * carousel cover via the existing authorised download route; NULL otherwise.
   */
  coverAttachmentId: string | null;
  author: AnnouncementAuthor | null;
}

/** Full announcement view for the detail page / edit form. */
export interface AnnouncementDetail extends AnnouncementRecord {
  attachments: AnnouncementAttachmentRecord[];
  /** The viewing employee's own read timestamp (NULL when unread). */
  myReadAt: Date | null;
  recipientIds: string[];
  author: AnnouncementAuthor | null;
}