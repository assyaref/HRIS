"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { HrisIcon } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

export interface HistoryRangeOption {
  key: string;
  label: string;
  href: string;
}

/**
 * The "7 Hari Terakhir ▾" period control on the attendance history card.
 * A native select (best on phones) that navigates to the option's href, so
 * the selected period lives in the URL and the server renders the list.
 */
export function HistoryRangeSelect({
  value,
  options,
  className,
}: {
  value: string;
  options: HistoryRangeOption[];
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label
      className={cn(
        "relative inline-flex h-11 shrink-0 items-center rounded-2xl border border-border bg-card pr-9 pl-4 text-[15px] font-semibold text-foreground shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
        pending && "opacity-70",
        className
      )}
    >
      <span className="sr-only">Periode riwayat</span>
      <select
        value={value}
        aria-busy={pending}
        onChange={(event) => {
          const next = options.find((option) => option.key === event.target.value);
          if (!next) return;
          startTransition(() => router.push(next.href));
        }}
        className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none truncate">
        {options.find((option) => option.key === value)?.label ?? value}
      </span>
      <HrisIcon
        name="chevron-down"
        className="pointer-events-none absolute right-3 size-5 text-foreground/80"
      />
    </label>
  );
}
