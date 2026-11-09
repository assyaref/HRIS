import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-[13px] leading-none font-semibold text-foreground",
        className
      )}
      {...props}
    />
  );
}
