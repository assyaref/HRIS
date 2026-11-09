import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm hris-card",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "text-lg leading-6 font-semibold tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      className={cn("text-sm leading-5 text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
  );
}

/** Pastel accent card variant for stat/icon cards. */
export function CardTone({
  tone,
  className,
  ...props
}: {
  tone?:
    | "primary"
    | "soft-blue"
    | "indigo"
    | "lavender"
    | "pink"
    | "coral"
    | "peach"
    | "amber"
    | "mint"
    | "teal"
    | "success"
    | "warning"
    | "danger"
    | "info";
  className?: string;
  children?: React.ReactNode;
}) {
  const toneClasses: Record<string, string> = {
    primary: "bg-surface-primary text-accent-foreground",
    "soft-blue": "bg-surface-soft-blue text-accent-foreground",
    indigo: "bg-surface-indigo text-accent-foreground",
    lavender: "bg-surface-lavender text-accent-foreground",
    pink: "bg-surface-pink text-accent-foreground",
    coral: "bg-surface-coral text-accent-foreground",
    peach: "bg-surface-peach text-accent-foreground",
    amber: "bg-surface-amber text-accent-foreground",
    mint: "bg-surface-mint text-accent-foreground",
    teal: "bg-surface-teal text-accent-foreground",
    success: "bg-surface-success text-success-foreground",
    warning: "bg-surface-warning text-warning-foreground",
    danger: "bg-surface-danger text-danger-foreground",
    info: "bg-surface-info text-info-foreground",
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border shadow-sm hris-card-hover",
        toneClasses[tone ?? "primary"],
        className
      )}
      {...props}
    />
  );
}
