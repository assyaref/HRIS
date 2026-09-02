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
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-destructive focus-visible:ring-destructive",
        className
      )}
      {...props}
    />
  );
}
