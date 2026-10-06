import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { badgeVariants } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { HrisIcon } from "@/components/layout/icons";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasAnyPermission } from "@/lib/auth/rbac";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { listMyAnnouncements } from "@/features/announcements/queries";
import { AnnouncementPriorityBadge } from "@/features/announcements/announcement-badges";
import { ANNOUNCEMENT_TARGET_LABELS } from "@/features/announcements/constants";
import { formatDateTime } from "@/features/payroll/format";

export const metadata: Metadata = {
  title: "Announcements",
};

/**
 * Employee information center (R18).
 *
 * Self-service feed: authentication is the only gate (plus a linked employee
 * record). Every row is resolved server-side from the caller's own
 * organization/employee id — the audience filter (all vs selected) is applied
 * in the query, never by the browser.
 */
export default async function AnnouncementsPage() {
  const user = await requireUser();
  if (!user.organizationId) {
    forbidden();
  }
  const organizationId = user.organizationId;

  const canManage = await hasAnyPermission(user.id, [
    PERMISSIONS.ANNOUNCEMENTS_VIEW,
  ]);

  const employee = await getEmployeeByUserId(user.id, organizationId);
  const announcements = employee
    ? await listMyAnnouncements({ organizationId, employeeId: employee.id })
    : [];
  const unread = announcements.filter((item) => !item.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Announcements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Official news and information from management.
            {unread > 0 ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {unread} unread
              </span>
            ) : null}
          </p>
        </div>
        {canManage ? (
          <Link
            href="/announcements/management"
            className={badgeVariants({
              variant: "outline",
              className: "h-9 gap-1.5 border-border px-3 text-sm font-medium hover:bg-accent",
            })}
          >
            <HrisIcon name="announcements" className="size-4" />
            Management view
          </Link>
        ) : null}
      </div>

      {!employee ? (
        <EmptyState
          title="No employee profile linked"
          description="Your account is not linked to an employee record yet, so announcements cannot be addressed to you. Contact your administrator."
        />
      ) : announcements.length === 0 ? (
        <EmptyState
          title="No announcements yet"
          description="New announcements from management will appear here."
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((item) => (
            <Card key={item.id} className={item.isRead ? "" : "border-blue-200"}>
              <CardContent className="p-4 sm:p-5">
                <Link
                  href={`/announcements/${item.id}`}
                  className="flex flex-col gap-2"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    {item.pinned ? (
                      <BadgePin />
                    ) : null}
                    <AnnouncementPriorityBadge priority={item.priority} />
                    {item.targetType === "selected_employees" ? (
                      <span className="text-xs text-muted-foreground">
                        {ANNOUNCEMENT_TARGET_LABELS[item.targetType]}
                      </span>
                    ) : null}
                    {!item.isRead ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        <span
                          aria-hidden="true"
                          className="size-1.5 rounded-full bg-primary"
                        />
                        New
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm font-semibold text-foreground sm:text-base">
                    {item.title}
                  </span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">
                    {item.content}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {item.author
                        ? `By ${item.author.displayName}`
                        : "By management"}
                    </span>
                    {item.publishedAt ? (
                      <span>Published {formatDateTime(item.publishedAt)}</span>
                    ) : null}
                    {item.attachmentCount > 0 ? (
                      <span>{item.attachmentCount} attachment(s)</span>
                    ) : null}
                  </span>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BadgePin() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
      Pinned
    </span>
  );
}
