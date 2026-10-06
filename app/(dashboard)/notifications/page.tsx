import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import {
  NotificationCard,
  type NotificationTone,
} from "@/components/employee/notification-card";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { requireUser } from "@/lib/auth/auth";

import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  isNotificationCategory,
  type NotificationCategory,
} from "@/features/notifications/constants";
import { listMyNotifications } from "@/features/notifications/queries";

export const metadata: Metadata = {
  title: "Notifikasi",
};

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Employee notification centre.
 *
 * The feed is a server-derived read model over existing records for the
 * signed-in employee (announcements, leave/permission decisions, published
 * payslips). No client-supplied identifiers are used and nothing is fabricated.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const params = await searchParams;
  const categoryParam = readParam(params.category);
  const category: NotificationCategory = isNotificationCategory(
    categoryParam ?? ""
  )
    ? (categoryParam as NotificationCategory)
    : "all";

  const { items, unreadCount } = await listMyNotifications(
    user.id,
    organizationId
  );

  const filtered =
    category === "all"
      ? items
      : items.filter((item) => item.category === category);

  const hrefFor = (next: NotificationCategory) =>
    next === "all" ? "/notifications" : `/notifications?category=${next}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#172554]">
          Notifikasi
        </h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Pembaruan pengumuman, persetujuan, dan payroll Anda.
          {unreadCount > 0 ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-[#1677e8] px-2 py-0.5 text-xs font-semibold text-white">
              {unreadCount} baru
            </span>
          ) : null}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Kategori notifikasi"
        className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1"
      >
        {NOTIFICATION_CATEGORIES.map((entry) => {
          const active = category === entry;
          return (
            <Link
              key={entry}
              href={hrefFor(entry)}
              role="tab"
              aria-selected={active}
              className={[
                "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors",
                active
                  ? "bg-[#1677e8] text-white"
                  : "bg-white text-[#64748b] ring-1 ring-slate-200 hover:text-[#172554]",
              ].join(" ")}
            >
              {NOTIFICATION_CATEGORY_LABELS[entry]}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmployeeEmptyState
          icon="bell"
          title="Belum ada notifikasi"
          description="Pembaruan untuk Anda akan muncul di sini."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <NotificationCard
              key={item.id}
              tone={item.category as NotificationTone}
              title={item.title}
              description={item.description}
              timeLabel={DATE_FORMAT.format(item.time)}
              unread={item.unread}
              href={item.href ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
