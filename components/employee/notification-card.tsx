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
  announcement: { icon: "announcements", className: "hris-surface-primary text-primary" },
  approval: { icon: "check", className: "hris-surface-success text-success" },
  payroll: { icon: "payslip", className: "hris-surface-info text-info" },
  attendance: { icon: "clock", className: "hris-surface-warning text-warning" },
  system: { icon: "info", className: "bg-muted text-muted-foreground" },
};

export interface NotificationCardProps {
  tone: NotificationTone;
  title: string;
  description: string;
  timeLabel: string;
  unread?: boolean;
  href?: string;
}

/** Employee notification row. Icon + title + description + time + unread dot. Theme-adaptive. */
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
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {unread ? (
            <span
              aria-label="Belum dibaca"
              className="mt-1 size-2 shrink-0 rounded-full bg-primary"
            />
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
          {description}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{timeLabel}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "hris-card emp-card-tap block focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
          unread && "ring-1 ring-inset ring-primary/50"
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={cn("hris-card", unread && "ring-1 ring-inset ring-primary/50")}>{body}</div>;
}
