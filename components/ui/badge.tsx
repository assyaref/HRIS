import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeVariant =
  | "primary"
  | "secondary"
  | "tonal"
  | "outline"
  | "destructive"
  | "success"
  | "warning"
  | "danger"
  | "info";

export interface BadgeVariants {
  variant?: BadgeVariant;
  className?: string;
}

const badgeVariantClasses: Record<BadgeVariant, string> = {
  primary: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  tonal: "border-transparent bg-accent text-accent-foreground",
  outline: "border-border bg-transparent text-foreground",
  destructive: "border-transparent bg-destructive text-destructive-foreground",
  success: "border-transparent bg-surface-success text-success",
  warning: "border-transparent bg-surface-warning text-warning",
  danger: "border-transparent bg-surface-danger text-danger",
  info: "border-transparent bg-surface-info text-info",
};

/** Shared class builder for styling non-<Badge> elements as badges. */
export function badgeVariants({
  variant = "secondary",
  className,
}: BadgeVariants = {}): string {
  return cn(
    "inline-flex w-fit items-center gap-1 rounded-lg border px-2.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
    badgeVariantClasses[variant],
    className
  );
}

export interface BadgeProps extends ComponentProps<"span"> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={badgeVariants({ variant, className })} {...props} />
  );
}
