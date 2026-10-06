import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  announcementAttachments,
  announcementRecipients,
  announcements,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasAnyPermission } from "@/lib/auth/rbac";
import { writeAuditLog } from "@/lib/auth/audit";
import { getEmployeeByUserId } from "@/features/employees/queries";
import { readAnnouncementAttachment } from "@/lib/announcements/attachment-storage";
import { buildAnnouncementVisibility } from "@/features/announcements/policy";
import {
  extractExtension,
  sanitizeOriginalFilename,
} from "@/features/announcements/attachment-metadata";

export const dynamic = "force-dynamic";

/**
 * Announcements — attachment download route (R18).
 *
 * Authorization contract (server-side only; the client never supplies
 * tenant/authority identifiers):
 * - Unauthenticated callers get 401.
 * - Management (`announcements.view`) downloads attachments of announcements
 *   in their own organization.
 * - Employees WITHOUT the permission download only when the announcement is
 *   currently visible to them (published + inside the schedule/expiry window
 *   + recipient match for selected-audience posts).
 * - Foreign-organization or unknown ids respond with a generic 404 so the
 *   route never leaks cross-tenant existence.
 * - The storage key is taken exclusively from the database row; the file is
 *   streamed from the private volume with strict no-store headers.
 */

const FORBIDDEN_QUERY_KEYS = ["organizationId", "employeeId", "storageKey"] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function headerFilename(originalFilename: string, storageKey: string): string {
  const sanitized = sanitizeOriginalFilename(originalFilename);
  if (extractExtension(sanitized)) return sanitized;
  const extension = extractExtension(storageKey.split("/").pop() ?? "");
  return extension ? `${sanitized}.${extension}` : sanitized;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> }
): Promise<Response> {
  const search = new URL(request.url).searchParams;
  for (const key of FORBIDDEN_QUERY_KEYS) {
    if (search.has(key)) {
      return new Response("Bad Request", {
        status: 400,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (!user.organizationId) {
    return notFound();
  }
  const organizationId = user.organizationId;

  const { attachmentId } = await context.params;
  if (typeof attachmentId !== "string" || !UUID_PATTERN.test(attachmentId)) {
    return notFound();
  }

  const rows = await db
    .select({
      attachmentId: announcementAttachments.id,
      announcementId: announcements.id,
      originalFilename: announcementAttachments.originalFilename,
      storageKey: announcementAttachments.storageKey,
      mimeType: announcementAttachments.mimeType,
      fileSize: announcementAttachments.fileSize,
      status: announcements.status,
      targetType: announcements.targetType,
      scheduledAt: announcements.scheduledAt,
      expiresAt: announcements.expiresAt,
    })
    .from(announcementAttachments)
    .innerJoin(
      announcements,
      and(
        eq(
          announcementAttachments.announcementId,
          announcements.id
        ),
        eq(announcements.organizationId, organizationId)
      )
    )
    .where(
      and(
        eq(announcementAttachments.id, attachmentId),
        eq(announcementAttachments.organizationId, organizationId)
      )
    )
    .limit(1);

  const attachment = rows[0];
  if (!attachment) {
    return notFound();
  }

  const canManage = await hasAnyPermission(user.id, [
    PERMISSIONS.ANNOUNCEMENTS_VIEW,
  ]);

  let allowed = canManage;
  if (!allowed) {
    /*
     * Employee self-service boundary: the announcement must be currently
     * visible to the caller. Selected-audience posts additionally require a
     * recipient row for the caller's linked employee.
     */
    const linkedEmployee = await getEmployeeByUserId(
      user.id,
      organizationId
    );
    if (linkedEmployee) {
      const recipients = await db
        .select({ employeeId: announcementRecipients.employeeId })
        .from(announcementRecipients)
        .where(
          and(
            eq(
              announcementRecipients.announcementId,
              attachment.announcementId
            ),
            eq(
              announcementRecipients.employeeId,
              linkedEmployee.id
            )
          )
        )
        .limit(1);

      allowed = buildAnnouncementVisibility({
        status: attachment.status,
        targetType: attachment.targetType,
        scheduledAt: attachment.scheduledAt,
        expiresAt: attachment.expiresAt,
        hasRecipient: recipients.length > 0,
        asOf: new Date(),
      });
    }
  }

  if (!allowed) {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  let bytes: Buffer;
  try {
    bytes = await readAnnouncementAttachment(attachment.storageKey);
  } catch (error) {
    console.error("[announcements] attachment read failed", error);
    return notFound();
  }

  /*
   * Access audit — best effort, never fails the download. Carries ids only:
   * no storage key, filename or file contents.
   */
  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "announcement.attachment.downloaded",
      entityType: "announcement_attachment",
      entityId: attachment.attachmentId,
      metadata: {
        announcementId: attachment.announcementId,
      },
    });
  } catch (auditError) {
    console.error(
      "[announcements] attachment download audit failed",
      auditError
    );
  }

  const filename = headerFilename(
    attachment.originalFilename,
    attachment.storageKey
  );

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; frame-ancestors 'self'",
    },
  });
}
