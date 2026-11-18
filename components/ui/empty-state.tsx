import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface EmptyStateProps extends ComponentProps<"div"> {
  title: string;
  description?: string;
  /** Decorative illustration/icon (rendered with aria-hidden). */
  icon?: ReactNode;
  /** Optional call-to-action, e.g. a Button. */
  action?: ReactNode;
}

/** Tray glyph used when a caller does not pass its own icon. */
function DefaultEmptyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-7"
    >
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-[var(--card-border)] bg-gradient-to-b from-card to-[#F3F7FF] px-6 py-12 text-center dark:to-muted/40",
        className
      )}
      {...props}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-primary text-primary shadow-[0_8px_20px_-12px_rgb(30_99_238/0.6)]"
        >
          {icon}
        </div>
      ) : (
        // Shown in the management shell only (hidden in the employee frame).
        <div
          aria-hidden="true"
          className="hris-empty-default hris-empty-art mt-3 mb-7 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#E8F0FF] to-[#D6E4FF] text-primary shadow-[0_12px_24px_-14px_rgb(11_92_197/0.7)] dark:from-surface-primary dark:to-surface-primary"
        >
          <DefaultEmptyIcon />
        </div>
      )}
      <h3 className="text-[15px] font-bold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
