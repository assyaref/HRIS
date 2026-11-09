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
      ) : null}
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
