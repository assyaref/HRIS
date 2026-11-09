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
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed";

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 shadow-sm",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70 shadow-sm",
  tonal:
    "bg-surface-primary text-accent-foreground hover:bg-surface-primary/90 active:bg-surface-primary/80 shadow-sm",
  outline:
    "border border-input bg-background hover:bg-accent hover:text-accent-foreground text-foreground active:bg-accent/80 shadow-sm",
  ghost: "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/60 shadow-sm",
  text: "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/60",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 shadow-sm",
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 rounded-md px-3 text-xs",
  md: "h-10 px-4 py-2",
  lg: "h-11 rounded-md px-8",
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
