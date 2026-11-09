import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto rounded-2xl border border-[var(--card-border)] bg-card shadow-[var(--shadow-card)]">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead className={cn("bg-[#F6F9FF] dark:bg-muted/70 [&_tr]:border-b [&_tr]:border-border [&_tr]:hover:bg-transparent", className)} {...props} />
  );
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  );
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn("border-t border-border bg-muted/50 font-medium", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border/70 transition-colors hover:bg-surface-primary/40 data-[state=selected]:bg-surface-primary/60",
        className
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn(
        "h-11 px-4 text-left align-middle text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase",
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td className={cn("px-4 py-3 align-middle", className)} {...props} />
  );
}

export function TableCaption({
  className,
  ...props
}: ComponentProps<"caption">) {
  return (
    <caption
      className={cn("mt-3 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Tonal status badge for table status cells. */
export function TableStatusBadge({
  className,
  variant = "outline",
  ...props
}: {
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "success"
    | "warning"
    | "danger"
    | "info";
  className?: string;
  children?: React.ReactNode;
}) {
  const variantClasses: Record<string, string> = {
    primary: "border-transparent bg-surface-primary text-primary",
    secondary: "border-transparent bg-surface-indigo text-accent-foreground",
    outline: "border-border bg-card text-muted-foreground",
    success: "border-transparent bg-surface-success text-success",
    warning: "border-transparent bg-surface-warning text-warning",
    danger: "border-transparent bg-surface-danger text-danger",
    info: "border-transparent bg-surface-info text-info",
  };

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
