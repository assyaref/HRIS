import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/** Native <select> styled like <Input> (filters, simple forms). */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground transition-[border-color,box-shadow] hover:border-primary/40 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}
