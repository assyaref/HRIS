import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization, requirePermission } from "@/lib/auth/rbac";

import {
  getAnnouncementStatusCounts,
  listManageableAnnouncements,
} from "@/features/announcements/queries";
import {
  AnnouncementPriorityBadge,
  AnnouncementStatusBadge,
} from "@/features/announcements/announcement-badges";
import {
  ANNOUNCEMENT_STATUSES,
  ANNOUNCEMENT_STATUS_LABELS,
  isAnnouncementStatus,
} from "@/features/announcements/constants";
import { resolveAnnouncementPermissions } from "@/features/announcements/permissions";
import { formatDate } from "@/features/payroll/format";

export const metadata: Metadata = {
  title: "Announcement Management",
};

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Management console for announcements (R18).
 *
 * Guarded by `announcements.view`; create/publish/delete affordances render
 * per capability, while every server action independently re-checks its own
 * permission and org scope.
 */
export default async function AnnouncementManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const statusParam = readParam(params.status);
  const status =
    statusParam && isAnnouncementStatus(statusParam) ? statusParam : null;
  const query = readParam(params.q) ?? null;

  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ANNOUNCEMENTS_VIEW);
  if (!user.organizationId) {
    forbidden();
  }
  const organizationId = user.organizationId;

  const [authorization, announcements, counts] = await Promise.all([
    getUserAuthorization(user.id),
    listManageableAnnouncements({ organizationId, status, query }),
    getAnnouncementStatusCounts({ organizationId }),
  ]);
  const perms = resolveAnnouncementPermissions(
    authorization.permissionCodes
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Announcements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Publish official information to all employees or a selected
            audience.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2" action="/announcements/management">
            {status ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            <input
              type="search"
              name="q"
              defaultValue={query ?? ""}
              placeholder="Search title or content"
              className="border-input bg-background h-9 w-44 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-56"
            />
          </form>
          {perms.canCreate ? (
            <Link
              href="/announcements/management/new"
              className={buttonVariants({ size: "sm" })}
            >
              New announcement
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusFilter
          label={`All (${totalOf(counts)})`}
          href="/announcements/management"
          active={!status}
        />
        {ANNOUNCEMENT_STATUSES.map((value) => (
          <StatusFilter
            key={value}
            label={`${ANNOUNCEMENT_STATUS_LABELS[value]} (${counts[value]})`}
            href={`/announcements/management?status=${value}${
              query ? `&q=${encodeURIComponent(query)}` : ""
            }`}
            active={status === value}
          />
        ))}
      </div>

      {announcements.length === 0 ? (
        <EmptyState
          title="No announcements found"
          description={
            perms.canCreate
              ? "Create the first announcement to keep your team informed."
              : "Announcements created by management will appear here."
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Reads</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.map((announcement) => (
                    <TableRow key={announcement.id}>
                      <TableCell className="max-w-[24rem] font-medium">
                        <span className="block truncate">
                          {announcement.pinned ? "📌 " : ""}
                          {announcement.title}
                        </span>
                      </TableCell>
                      <TableCell>
                        <AnnouncementStatusBadge
                          status={announcement.status}
                        />
                      </TableCell>
                      <TableCell>
                        <AnnouncementPriorityBadge
                          priority={announcement.priority}
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        {announcement.targetType === "all_employees"
                          ? "All employees"
                          : "Selected"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {announcement.readCount}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {announcement.publishedAt
                          ? formatDate(announcement.publishedAt)
                          : announcement.scheduledAt
                            ? `→ ${formatDate(announcement.scheduledAt)}`
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/announcements/${announcement.id}`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                        >
                          Manage
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function totalOf(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function StatusFilter({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={buttonVariants({
        variant: active ? "primary" : "outline",
        size: "sm",
      })}
    >
      {label}
    </Link>
  );
}
