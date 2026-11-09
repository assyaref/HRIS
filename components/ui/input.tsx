import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends ComponentProps<"input"> {
  /** Marks the input as invalid for assistive technology. */
  invalid?: boolean;
}

export function Input({ className, type, invalid, ...props }: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 hover:border-primary/40 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/15",
        className
      )}
      {...props}
    />
  );
}
