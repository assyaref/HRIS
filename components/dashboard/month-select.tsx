"use client";

import { usePathname, useRouter } from "next/navigation";

import { HrisIcon } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

/**
 * Compact month picker ("Nov 2026 ⌄") that writes `?bulan=YYYY-MM` to the
 * URL so the server re-renders the recap for that month.
 */
export function MonthSelect({
  value,
  options,
  tone = "light",
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  /** "onBlue" for the blue card header, "light" for white surfaces. */
  tone?: "light" | "onBlue";
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-1 rounded-lg text-sm font-semibold",
        tone === "onBlue" ? "text-white" : "text-primary"
      )}
    >
      <span className="sr-only">Pilih bulan</span>
      <select
        value={value}
        onChange={(event) => {
          const params = new URLSearchParams({ bulan: event.target.value });
          router.push(`${pathname}?${params.toString()}`);
        }}
        className={cn(
          "cursor-pointer appearance-none bg-transparent py-1 pr-6 pl-1 font-semibold focus:outline-none",
          tone === "onBlue" ? "text-white [&>option]:text-foreground" : "text-primary"
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <HrisIcon
        name="chevron-down"
        className="pointer-events-none absolute right-0 size-4"
      />
    </label>
  );
}
