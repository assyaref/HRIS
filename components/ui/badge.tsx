import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeVariant = "primary" | "secondary" | "outline" | "destructive";

export interface BadgeVariants {
  variant?: BadgeVariant;
  className?: string;
}

const badgeVariantClasses: Record<BadgeVariant, string> = {
  primary: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "border-border bg-transparent text-foreground",
  destructive: "border-transparent bg-destructive text-destructive-foreground",
};

/** Shared class builder for styling non-<Badge> elements as badges. */
export function badgeVariants({
  variant = "secondary",
  className,
}: BadgeVariants = {}): string {
  return cn(
    "inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
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
