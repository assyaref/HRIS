import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HrisIcon } from "@/components/layout/icons";
import { requireUser } from "@/lib/auth/auth";
import { getUserAuthorization } from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { getAnnouncementDetail } from "@/features/announcements/queries";
import {
  AnnouncementPriorityBadge,
  AnnouncementStatusBadge,
} from "@/features/announcements/announcement-badges";
import { MarkAnnouncementReadButton } from "@/features/announcements/read-button";
import { ManageAnnouncementActions } from "@/features/announcements/manage-actions";
import {
  ANNOUNCEMENT_TARGET_LABELS,
  isAnnouncementTargetType,
} from "@/features/announcements/constants";
import { resolveAnnouncementPermissions } from "@/features/announcements/permissions";
import { formatDateTime } from "@/features/payroll/format";

export const metadata: Metadata = {
  title: "Announcement",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Announcement detail (R18).
 *
 * Same route for employees and management: the viewing capability decides
 * what is rendered (read button + attachments vs lifecycle actions). The
 * announcement row is loaded org-scoped; employees only ever see it when the
 * audience rules make it visible (enforced by the queries + policy).
 */
export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const { announcementId } = await params;
  if (!UUID_PATTERN.test(announcementId)) {
    notFound();
  }

  const user = await requireUser();
  if (!user.organizationId) {
    forbidden();
  }
  const organizationId = user.organizationId;

  const authorization = await getUserAuthorization(user.id);
  const perms = resolveAnnouncementPermissions(
    authorization.permissionCodes
  );
  const isEmployeeView = !perms.canView;

  const employee = isEmployeeView
    ? await getEmployeeByUserId(user.id, organizationId)
    : null;

  const detail = await getAnnouncementDetail({
    announcementId,
    organizationId,
    employeeId: employee?.id,
  });
  if (!detail) {
    notFound();
  }

  if (isEmployeeView && detail.status !== "published") {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={
              perms.canView
                ? "/announcements/management"
                : "/announcements"
            }
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <HrisIcon
              name="arrow-right"
              className="size-4 rotate-180"
            />
            {perms.canView ? "Management view" : "All announcements"}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {detail.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <AnnouncementStatusBadge status={detail.status} />
            <AnnouncementPriorityBadge priority={detail.priority} />
            {detail.pinned ? (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                Pinned
              </span>
            ) : null}
            <span>
              {isAnnouncementTargetType(detail.targetType)
                ? ANNOUNCEMENT_TARGET_LABELS[detail.targetType]
                : detail.targetType}
            </span>
            <span>·</span>
            <span>
              {detail.author
                ? `By ${detail.author.displayName}`
                : "By management"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {perms.canUpdate ? (
            <Link
              href={`/announcements/management/${detail.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit
            </Link>
          ) : null}
          {perms.canView ? (
            <ManageAnnouncementActions
              announcementId={detail.id}
              status={detail.status}
              readCount={detail.readCount}
              canPublish={perms.canPublish}
              canDelete={perms.canDelete}
            />
          ) : detail.status === "published" && !detail.myReadAt ? (
            <MarkAnnouncementReadButton announcementId={detail.id} />
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {detail.publishedAt
              ? `Published ${formatDateTime(detail.publishedAt)}`
              : detail.scheduledAt
                ? `Scheduled ${formatDateTime(detail.scheduledAt)}`
                : `Created ${formatDateTime(detail.createdAt)}`}
            {detail.expiresAt
              ? ` · expires ${formatDateTime(detail.expiresAt)}`
              : ""}
            {detail.myReadAt
              ? ` · you read this ${formatDateTime(detail.myReadAt)}`
              : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {detail.content}
          </p>
        </CardContent>
      </Card>

      {detail.attachments.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Attachments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {attachment.originalFilename}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {(attachment.fileSize / 1024).toFixed(0)} KB ·{" "}
                    {attachment.mimeType}
                  </span>
                </span>
                <a
                  href={`/api/announcements/${attachment.id}/download`}
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                  })}
                >
                  Download
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {isEmployeeView ? null : (
        <p className="text-xs text-muted-foreground">
          Read by {detail.readCount} employee(s)
          {detail.targetType === "selected_employees"
            ? ` · targeted ${detail.recipientIds.length} recipient(s)`
            : ""}
        </p>
      )}
    </div>
  );
}
