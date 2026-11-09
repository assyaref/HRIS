import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tonal"
  | "outline"
  | "text"
  | "ghost"
  | "destructive";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonVariants {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

const baseButtonClasses =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed";

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-[#2F7BF6] to-primary text-primary-foreground hover:brightness-105 active:brightness-95 shadow-[var(--shadow-primary)] dark:from-primary dark:to-primary",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/90 active:bg-secondary/80",
  tonal:
    "bg-surface-primary text-primary hover:bg-accent active:bg-accent/80",
  outline:
    "border border-input bg-card text-foreground hover:border-primary/40 hover:bg-surface-primary hover:text-primary active:bg-accent",
  ghost: "bg-transparent text-foreground hover:bg-muted hover:text-primary active:bg-accent/60",
  text: "bg-transparent text-primary hover:bg-surface-primary active:bg-accent/60",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 shadow-[0_6px_14px_-6px_rgb(220_38_38/0.5)]",
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 rounded-[10px] px-3 text-[13px]",
  md: "h-10 px-4 py-2",
  lg: "h-11 rounded-xl px-6",
  icon: "size-10 rounded-xl",
};

/** Shared class builder so links can be styled exactly like <Button>. */
export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: ButtonVariants = {}): string {
  return cn(
    baseButtonClasses,
    buttonVariantClasses[variant],
    buttonSizeClasses[size],
    className
  );
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}
