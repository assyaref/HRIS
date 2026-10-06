"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { db } from "@/db";
import {
  announcementAttachments,
  announcementRecipients,
  announcements,
  employees,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import {
  writeAuditLog,
  type AnnouncementAuditAction,
} from "@/lib/auth/audit";
import { getUserAuthorization } from "@/lib/auth/rbac";
import {
  deleteAnnouncementAttachment,
  deleteAnnouncementStorage,
  storeAnnouncementAttachment,
} from "@/lib/announcements/attachment-storage";
import { getEmployeeByUserId } from "@/features/employees/queries";

import {
  ANNOUNCEMENT_ATTACHMENT_MAX_SIZE_BYTES,
  ANNOUNCEMENT_MAX_ATTACHMENTS,
  isAnnouncementTargetType,
  type AnnouncementStatus,
} from "./constants";
import { classifyAttachment, sanitizeOriginalFilename } from "./attachment-metadata";
import {
  buildAnnouncementActionDecision,
  buildAnnouncementDeletionDecision,
  buildAnnouncementVisibility,
} from "./policy";
import { resolveAnnouncementPermissions } from "./permissions";
import {
  createAnnouncementSchema,
  extractCreateAnnouncementFormData,
  extractUpdateAnnouncementFormData,
  updateAnnouncementSchema,
} from "./validation";
import type { AnnouncementRecord } from "./types";

/**
 * Announcements — server actions (R18 announcement center).
 *
 * Security rules (identical contract to the other modules):
 * - Every action re-authenticates (`requireUser`) and re-authorizes against
 *   the effective permission set. Nothing in the body selects the
 *   organization — it always comes from the session.
 * - All reads/writes are org-scoped; a foreign announcement/attachment id is
 *   treated as not-found (no existence leak).
 * - Attachments are validated BEFORE anything is written (magic bytes,
 *   extension, MIME, size, count) and stored only on the private volume.
 * - `read_count` is append-only; announcements that have been read are never
 *   deletable.
 */

export interface AnnouncementFormState {
  ok: boolean;
  message: string;
  announcementId?: string;
}

function formError(message: string): AnnouncementFormState {
  return { ok: false, message };
}

function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function toDateValue(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

/** `YYYY-MM-DDTHH:mm` (as sent by datetime-local) parses as local time. */

function revalidateAnnouncement(announcementId: string): void {
  revalidatePath("/dashboard");
  revalidatePath("/");
  revalidatePath("/announcements");
  revalidatePath("/announcements/management");
  revalidatePath(`/announcements/${announcementId}`);
}

async function audit(
  organizationId: string | null,
  actorUserId: string,
  action: AnnouncementAuditAction,
  entityId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await writeAuditLog({
      organizationId,
      actorUserId,
      action,
      entityType: "announcement",
      entityId,
      metadata,
    });
  } catch {
    // Audit is best-effort: a log write must never break the underlying action.
  }
}

async function requireAnnouncementContext() {
  const user = await requireUser();
  const authorization = await getUserAuthorization(user.id);
  const perms = resolveAnnouncementPermissions(
    authorization.permissionCodes
  );
  return { user, perms };
}

async function loadAnnouncementForOrganization(opts: {
  announcementId: string;
  organizationId: string;
}): Promise<AnnouncementRecord | null> {
  const rows = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.id, opts.announcementId),
        eq(announcements.organizationId, opts.organizationId)
      )
    )
    .limit(1);
  return rows[0]
    ? ({
        ...rows[0],
        status: rows[0].status as AnnouncementStatus,
      } as AnnouncementRecord)
    : null;
}

interface PreparedAttachment {
  bytes: Buffer;
  extension: string;
  mimeType: string;
  originalFilename: string;
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string";
}

async function collectActiveFileUploads(
  formData: FormData
): Promise<{ attachments: PreparedAttachment[]; error?: string }> {
  const files = formData
    .getAll("attachments")
    .filter(isUploadedFile)
    .filter((file) => file.size > 0);

  if (files.length > ANNOUNCEMENT_MAX_ATTACHMENTS) {
    return {
      attachments: [],
      error: `A maximum of ${ANNOUNCEMENT_MAX_ATTACHMENTS} attachments is allowed per announcement.`,
    };
  }

  const attachments: PreparedAttachment[] = [];
  for (const file of files) {
    const sourceName = file.name;
    if (file.size > ANNOUNCEMENT_ATTACHMENT_MAX_SIZE_BYTES) {
      return {
        attachments: [],
        error: `"${sourceName}" exceeds the 10 MB attachment limit.`,
      };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const classification = classifyAttachment({
      filename: sourceName,
      mimeType: file.type,
      magic: bytes,
    });
    if (!classification.ok) {
      return {
        attachments: [],
        error: `"${sourceName}" is not an allowed attachment type (PDF, PNG, JPG, DOC/DOCX or XLS/XLSX).`,
      };
    }

    attachments.push({
      bytes,
      extension: classification.extension,
      mimeType: classification.mimeType,
      originalFilename: sanitizeOriginalFilename(sourceName),
    });
  }
  return { attachments };
}

/**
 * Persist validated attachments (files first, then rows) and roll back the
 * written files if the corresponding rows fail.
 */
async function persistAttachments(opts: {
  announcementId: string;
  organizationId: string;
  uploaderUserId: string;
  attachments: PreparedAttachment[];
}): Promise<void> {
  const stored: Array<{
    storageKey: string;
    extension: string;
  }> = [];
  try {
    for (const attachment of opts.attachments) {
      const result = await storeAnnouncementAttachment({
        announcementId: opts.announcementId,
        bytes: attachment.bytes,
        extension: attachment.extension,
      });
      stored.push({ storageKey: result.storageKey, extension: attachment.extension });
      await db.insert(announcementAttachments).values({
        announcementId: opts.announcementId,
        organizationId: opts.organizationId,
        uploaderUserId: opts.uploaderUserId,
        originalFilename: attachment.originalFilename,
        storageKey: result.storageKey,
        mimeType: attachment.mimeType,
        fileSize: result.fileSize,
        sha256: result.sha256,
      });
      await audit(
        opts.organizationId,
        opts.uploaderUserId,
        "announcement.attachment.uploaded",
        opts.announcementId,
        { attachmentStorageKey: result.storageKey }
      );
    }
  } catch (error) {
    for (const item of stored) {
      await deleteAnnouncementAttachment(item.storageKey);
    }
    throw error;
  }
}

/** Create a draft announcement (with optional recipients + attachments). */
export async function createAnnouncementAction(
  _prevState: AnnouncementFormState,
  formData: FormData
): Promise<AnnouncementFormState> {
  const { user, perms } = await requireAnnouncementContext();
  if (!user.organizationId) return formError("Your account has no organization.");
  if (
    !buildAnnouncementActionDecision({
      action: "create",
      canView: perms.canView,
      canCreate: perms.canCreate,
      canUpdate: perms.canUpdate,
      canDelete: perms.canDelete,
      canPublish: perms.canPublish,
    }).allowed
  ) {
    return formError("You do not have permission to create announcements.");
  }

  const parsed = createAnnouncementSchema.safeParse(
    extractCreateAnnouncementFormData(formData)
  );
  if (!parsed.success) return formError(firstZodMessage(parsed.error));
  const data = parsed.data;

  const uploaded = await collectActiveFileUploads(formData);
  if (uploaded.error) return formError(uploaded.error);

  let recipientEmployeeIds: string[] = [];
  if (data.targetType === "selected_employees") {
    const selected = await db
      .select({ id: employees.id })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, user.organizationId),
          inArray(employees.id, data.employeeIds)
        )
      );
    const found = new Set(selected.map((row) => row.id));
    const missing = data.employeeIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return formError(
        "One or more selected employees do not exist in your organization."
      );
    }
    recipientEmployeeIds = data.employeeIds;
  }

  const inserted = await db
    .insert(announcements)
    .values({
      organizationId: user.organizationId,
      title: data.title,
      content: data.content,
      priority: data.priority,
      status: "draft",
      targetType: data.targetType,
      pinned: data.pinned,
      scheduledAt: toDateValue(data.scheduledAt),
      expiresAt: toDateValue(data.expiresAt),
      authorUserId: user.id,
      readCount: 0,
    })
    .returning({ id: announcements.id });

  const announcementId = inserted[0].id;

  try {
    if (recipientEmployeeIds.length > 0) {
      await db.insert(announcementRecipients).values(
        recipientEmployeeIds.map((employeeId) => ({
          announcementId,
          organizationId: user.organizationId as string,
          employeeId,
        }))
      );
    }
    if (uploaded.attachments.length > 0) {
      await persistAttachments({
        announcementId,
        organizationId: user.organizationId,
        uploaderUserId: user.id,
        attachments: uploaded.attachments,
      });
    }
  } catch {
    await deleteAnnouncementStorage(announcementId);
    throw new Error("Failed to save the announcement. Please try again.");
  }

  await audit(
    user.organizationId,
    user.id,
    "announcement.created",
    announcementId,
    { title: data.title, targetType: data.targetType }
  );
  revalidateAnnouncement(announcementId);

  return {
    ok: true,
    message: "Announcement created.",
    announcementId,
  };
}

/** Update announcement fields (and append attachments for non-published items). */
export async function updateAnnouncementAction(
  _prevState: AnnouncementFormState,
  formData: FormData
): Promise<AnnouncementFormState> {
  const { user, perms } = await requireAnnouncementContext();
  if (!user.organizationId) return formError("Your account has no organization.");

  const announcementId = String(formData.get("announcementId") ?? "");
  if (!announcementId) return formError("Announcement id is missing.");

  const row = await loadAnnouncementForOrganization({
    announcementId,
    organizationId: user.organizationId,
  });
  if (!row) return formError("Announcement not found.");

  const decision = buildAnnouncementActionDecision({
    action: "update",
    status: row.status,
    canView: perms.canView,
    canCreate: perms.canCreate,
    canUpdate: perms.canUpdate,
    canDelete: perms.canDelete,
    canPublish: perms.canPublish,
  });
  if (!decision.allowed) {
    return formError(
      row.status === "published"
        ? "Published announcements can only be edited by a publish holder."
        : "You do not have permission to update announcements."
    );
  }

  const parsed = updateAnnouncementSchema.safeParse(
    extractUpdateAnnouncementFormData(formData)
  );
  if (!parsed.success) return formError(firstZodMessage(parsed.error));
  const data = parsed.data;

  const uploaded = await collectActiveFileUploads(formData);
  if (uploaded.error) return formError(uploaded.error);

  if (uploaded.attachments.length > 0) {
    const attachmentDecision = buildAnnouncementActionDecision({
      action: "add_attachment",
      status: row.status,
      canView: perms.canView,
      canCreate: perms.canCreate,
      canUpdate: perms.canUpdate,
      canDelete: perms.canDelete,
      canPublish: perms.canPublish,
    });
    if (!attachmentDecision.allowed) {
      return formError(
        "Attachments can only be added to draft or unpublished announcements."
      );
    }
  }

  await db
    .update(announcements)
    .set({
      title: data.title,
      content: data.content,
      priority: data.priority,
      pinned: data.pinned,
      scheduledAt: toDateValue(data.scheduledAt),
      expiresAt: toDateValue(data.expiresAt),
    })
    .where(eq(announcements.id, announcementId));

  if (uploaded.attachments.length > 0) {
    await persistAttachments({
      announcementId,
      organizationId: user.organizationId,
      uploaderUserId: user.id,
      attachments: uploaded.attachments,
    });
  }

  await audit(user.organizationId, user.id, "announcement.updated", announcementId, {
    title: data.title,
  });
  revalidateAnnouncement(announcementId);

  return { ok: true, message: "Announcement updated.", announcementId };
}

/** Re-select the audience of a draft/unpublished announcement. */
export async function updateAnnouncementTargetAction(input: {
  announcementId: string;
  targetType: string;
  employeeIds: string[];
}): Promise<AnnouncementFormState> {
  const { user, perms } = await requireAnnouncementContext();
  if (!user.organizationId) return formError("Your account has no organization.");

  const row = await loadAnnouncementForOrganization({
    announcementId: input.announcementId,
    organizationId: user.organizationId,
  });
  if (!row) return formError("Announcement not found.");

  const decision = buildAnnouncementActionDecision({
    action: "change_target",
    status: row.status,
    canView: perms.canView,
    canCreate: perms.canCreate,
    canUpdate: perms.canUpdate,
    canDelete: perms.canDelete,
    canPublish: perms.canPublish,
  });
  if (!decision.allowed) {
    return formError(
      decision.reason === "published.locked"
        ? "The audience of a published announcement cannot be changed."
        : "You do not have permission to change the audience."
    );
  }

  if (!isAnnouncementTargetType(input.targetType)) {
    return formError("Invalid target type.");
  }

  let employeeIds: string[] = [];
  if (input.targetType === "selected_employees") {
    if (input.employeeIds.length === 0) {
      return formError("Select at least one employee when targeting selected employees.");
    }
    const selected = await db
      .select({ id: employees.id })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, user.organizationId),
          inArray(employees.id, input.employeeIds)
        )
      );
    const found = new Set(selected.map((r) => r.id));
    const missing = input.employeeIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return formError("One or more selected employees do not exist in your organization.");
    }
    employeeIds = input.employeeIds;
  }

  await db
    .update(announcements)
    .set({ targetType: input.targetType })
    .where(eq(announcements.id, input.announcementId));

  await db
    .delete(announcementRecipients)
    .where(eq(announcementRecipients.announcementId, input.announcementId));

  if (employeeIds.length > 0) {
    await db.insert(announcementRecipients).values(
      employeeIds.map((employeeId) => ({
        announcementId: input.announcementId,
        organizationId: user.organizationId as string,
        employeeId,
      }))
    );
  }

  await audit(user.organizationId, user.id, "announcement.updated", input.announcementId, {
    targetType: input.targetType,
    recipientCount: input.targetType === "selected_employees" ? employeeIds.length : null,
  });
  revalidateAnnouncement(input.announcementId);

  return { ok: true, message: "Audience updated.", announcementId: input.announcementId };
}

/** Publish a draft/unpublished announcement (or re-apply the published state). */
export async function publishAnnouncementAction(input: {
  announcementId: string;
}): Promise<AnnouncementFormState> {
  const { user, perms } = await requireAnnouncementContext();
  if (!user.organizationId) return formError("Your account has no organization.");

  const row = await loadAnnouncementForOrganization({
    announcementId: input.announcementId,
    organizationId: user.organizationId,
  });
  if (!row) return formError("Announcement not found.");

  const decision = buildAnnouncementActionDecision({
    action: "publish",
    status: row.status,
    canView: perms.canView,
    canCreate: perms.canCreate,
    canUpdate: perms.canUpdate,
    canDelete: perms.canDelete,
    canPublish: perms.canPublish,
  });
  if (!decision.allowed) {
    return formError("You do not have permission to publish announcements.");
  }

  await db
    .update(announcements)
    .set({
      status: "published",
      publishedAt: row.publishedAt ?? new Date(),
    })
    .where(eq(announcements.id, input.announcementId));

  await audit(
    user.organizationId,
    user.id,
    "announcement.published",
    input.announcementId,
    { scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null }
  );
  revalidateAnnouncement(input.announcementId);

  return { ok: true, message: "Announcement published.", announcementId: input.announcementId };
}

/** Unpublish a published announcement (keeps its read history). */
export async function unpublishAnnouncementAction(input: {
  announcementId: string;
}): Promise<AnnouncementFormState> {
  const { user, perms } = await requireAnnouncementContext();
  if (!user.organizationId) return formError("Your account has no organization.");

  const row = await loadAnnouncementForOrganization({
    announcementId: input.announcementId,
    organizationId: user.organizationId,
  });
  if (!row) return formError("Announcement not found.");

  const decision = buildAnnouncementActionDecision({
    action: "unpublish",
    status: row.status,
    canView: perms.canView,
    canCreate: perms.canCreate,
    canUpdate: perms.canUpdate,
    canDelete: perms.canDelete,
    canPublish: perms.canPublish,
  });
  if (!decision.allowed) {
    return formError(
      row.status !== "published"
        ? "Only published announcements can be unpublished."
        : "You do not have permission to unpublish announcements."
    );
  }

  await db
    .update(announcements)
    .set({ status: "unpublished", publishedAt: null })
    .where(eq(announcements.id, input.announcementId));

  await audit(user.organizationId, user.id, "announcement.unpublished", input.announcementId);
  revalidateAnnouncement(input.announcementId);

  return { ok: true, message: "Announcement unpublished.", announcementId: input.announcementId };
}

/**
 * Delete an announcement. Blocked as soon as ANY employee has read it — the
 * read history is append-only and must outlive every announcement.
 */
export async function deleteAnnouncementAction(input: {
  announcementId: string;
}): Promise<AnnouncementFormState> {
  const { user, perms } = await requireAnnouncementContext();
  if (!user.organizationId) return formError("Your account has no organization.");

  const row = await loadAnnouncementForOrganization({
    announcementId: input.announcementId,
    organizationId: user.organizationId,
  });
  if (!row) return formError("Announcement not found.");

  const decision = buildAnnouncementDeletionDecision({
    status: row.status,
    hasReads: row.readCount > 0,
    canDelete: perms.canDelete,
    canPublish: perms.canPublish,
  });
  if (!decision.allowed) {
    return formError(
      decision.reason === "blocked.reads"
        ? "This announcement has already been read by employees and cannot be deleted."
        : "You do not have permission to delete announcements."
    );
  }

  await db
    .delete(announcementAttachments)
    .where(eq(announcementAttachments.announcementId, input.announcementId));
  await db
    .delete(announcementRecipients)
    .where(eq(announcementRecipients.announcementId, input.announcementId));
  await db
    .delete(announcements)
    .where(eq(announcements.id, input.announcementId));
  await deleteAnnouncementStorage(input.announcementId);

  await audit(user.organizationId, user.id, "announcement.deleted", input.announcementId, {
    title: row.title,
  });
  revalidatePath("/announcements");
  revalidatePath("/announcements/management");
  revalidatePath("/dashboard");
  redirect("/announcements/management");
}

/** Remove one attachment (draft/unpublished announcements only). */
export async function removeAnnouncementAttachmentAction(input: {
  attachmentId: string;
  announcementId: string;
}): Promise<AnnouncementFormState> {
  const { user, perms } = await requireAnnouncementContext();
  if (!user.organizationId) return formError("Your account has no organization.");

  const rows = await db
    .select({
      id: announcementAttachments.id,
      announcementId: announcementAttachments.announcementId,
      storageKey: announcementAttachments.storageKey,
      status: announcements.status,
    })
    .from(announcementAttachments)
    .innerJoin(
      announcements,
      eq(announcementAttachments.announcementId, announcements.id)
    )
    .where(
      and(
        eq(announcementAttachments.id, input.attachmentId),
        eq(announcements.id, input.announcementId),
        eq(announcements.organizationId, user.organizationId)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return formError("Attachment not found.");

  const decision = buildAnnouncementActionDecision({
    action: "remove_attachment",
    status: row.status as AnnouncementStatus,
    canView: perms.canView,
    canCreate: perms.canCreate,
    canUpdate: perms.canUpdate,
    canDelete: perms.canDelete,
    canPublish: perms.canPublish,
  });
  if (!decision.allowed) {
    return formError(
      decision.reason === "published.locked"
        ? "Attachments of a published announcement cannot be removed."
        : "You do not have permission to remove attachments."
    );
  }

  await db
    .delete(announcementAttachments)
    .where(eq(announcementAttachments.id, input.attachmentId));
  await deleteAnnouncementAttachment(row.storageKey);
  await audit(user.organizationId, user.id, "announcement.attachment.deleted", input.announcementId, {
    attachmentId: input.attachmentId,
  });
  revalidateAnnouncement(input.announcementId);

  return { ok: true, message: "Attachment removed.", announcementId: input.announcementId };
}

/**
 * Mark an announcement as read for the current employee. Lazily materializes
 * the recipient row (all-employee announcements never pre-materialize) and
 * bumps `read_count` exactly once. Idempotent: repeated opens never double-count.
 */
export async function markAnnouncementReadAction(input: {
  announcementId: string;
}): Promise<AnnouncementFormState> {
  const user = await requireUser();
  if (!user.organizationId) return formError("Your account has no organization.");

  const employee = await getEmployeeByUserId(user.id, user.organizationId);
  if (!employee) return formError("Your account is not linked to an employee record.");

  const row = await loadAnnouncementForOrganization({
    announcementId: input.announcementId,
    organizationId: user.organizationId,
  });
  if (!row) return formError("Announcement not found.");

  const recipientRows = await db
    .select({ readAt: announcementRecipients.readAt })
    .from(announcementRecipients)
    .where(
      and(
        eq(announcementRecipients.announcementId, input.announcementId),
        eq(announcementRecipients.employeeId, employee.id)
      )
    )
    .limit(1);

  const visible = buildAnnouncementVisibility({
    status: row.status,
    targetType: row.targetType,
    scheduledAt: row.scheduledAt,
    expiresAt: row.expiresAt,
    hasRecipient: Boolean(recipientRows[0]),
    asOf: new Date(),
  });
  if (!visible) return formError("This announcement is not available to you.");

  const readAt = new Date();
  const inserted = await db
    .insert(announcementRecipients)
    .values({
      announcementId: input.announcementId,
      organizationId: user.organizationId,
      employeeId: employee.id,
      readAt,
    })
    .onConflictDoNothing({
      target: [
        announcementRecipients.announcementId,
        announcementRecipients.employeeId,
      ],
    })
    .returning({ id: announcementRecipients.id });

  if (inserted.length === 0) {
    const updated = await db
      .update(announcementRecipients)
      .set({ readAt })
      .where(
        and(
          eq(announcementRecipients.announcementId, input.announcementId),
          eq(announcementRecipients.employeeId, employee.id),
          isNull(announcementRecipients.readAt)
        )
      )
      .returning({ id: announcementRecipients.id });
    if (updated.length > 0) {
      await db
        .update(announcements)
        .set({ readCount: sql`${announcements.readCount} + 1` })
        .where(eq(announcements.id, input.announcementId));
    }
  } else {
    await db
      .update(announcements)
      .set({ readCount: sql`${announcements.readCount} + 1` })
      .where(eq(announcements.id, input.announcementId));
  }

  await audit(user.organizationId, user.id, "announcement.read", input.announcementId, {
    employeeId: employee.id,
  });
  revalidateAnnouncement(input.announcementId);

  return { ok: true, message: "", announcementId: input.announcementId };
}