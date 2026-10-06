import Link from "next/link";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

export type NotificationTone =
  | "announcement"
  | "approval"
  | "payroll"
  | "attendance"
  | "system";

const toneStyles: Record<
  NotificationTone,
  { icon: HrisIconName; className: string }
> = {
  announcement: { icon: "announcements", className: "bg-blue-50 text-blue-600" },
  approval: { icon: "check", className: "bg-emerald-50 text-emerald-600" },
  payroll: { icon: "payslip", className: "bg-violet-50 text-violet-600" },
  attendance: { icon: "clock", className: "bg-cyan-50 text-cyan-600" },
  system: { icon: "info", className: "bg-slate-100 text-slate-600" },
};

export interface NotificationCardProps {
  tone: NotificationTone;
  title: string;
  description: string;
  timeLabel: string;
  unread?: boolean;
  href?: string;
}

/** Employee notification row. Icon + title + description + time + unread dot. */
export function NotificationCard({
  tone,
  title,
  description,
  timeLabel,
  unread = false,
  href,
}: NotificationCardProps) {
  const style = toneStyles[tone];

  const body = (
    <div className="flex items-start gap-3 p-4">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-2xl",
          style.className
        )}
      >
        <HrisIcon name={style.icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "text-sm font-semibold text-[#172554]",
              unread && "font-semibold"
            )}
          >
            {title}
          </p>
          {unread ? (
            <span
              aria-label="Belum dibaca"
              className="mt-1 size-2 shrink-0 rounded-full bg-[#1677e8]"
            />
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-[#64748b]">
          {description}
        </p>
        <p className="mt-1 text-xs text-[#94a3b8]">{timeLabel}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "emp-card emp-card-tap block focus-visible:ring-2 focus-visible:ring-[#1677e8] focus-visible:ring-offset-2 focus-visible:outline-none",
          unread && "ring-1 ring-blue-100"
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={cn("emp-card", unread && "ring-1 ring-blue-100")}>{body}</div>;
}
