import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead className={cn("[&_tr]:border-b border-border", className)} {...props} />
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
        "border-b border-border/50 transition-colors hover:bg-muted/30",
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
        "h-10 px-4 text-left align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase bg-muted/40",
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td className={cn("p-4 align-middle", className)} {...props} />
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
    primary: "bg-surface-primary text-primary border border-primary/40",
    secondary: "bg-surface-indigo text-accent-foreground border border-primary/40",
    outline: "border-border bg-transparent text-foreground",
    success: "bg-surface-success text-success border border-success/40",
    warning: "bg-surface-warning text-warning border border-warning/40",
    danger: "bg-surface-danger text-danger border border-danger/40",
    info: "bg-surface-info text-info border border-info/40",
  };

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-lg border px-2.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
