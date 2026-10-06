import Link from "next/link";
import type { ReactNode } from "react";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

/** Friendly empty state for employee pages ("Belum ada data"). */
export function EmployeeEmptyState({
  title = "Belum ada data",
  description,
  icon = "info",
  action,
}: {
  title?: string;
  description?: string;
  icon?: HrisIconName;
  action?: ReactNode;
}) {
  return (
    <div className="emp-card flex flex-col items-center justify-center px-6 py-10 text-center">
      <span
        aria-hidden="true"
        className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"
      >
        <HrisIcon name={icon} className="size-6" />
      </span>
      <p className="text-sm font-semibold text-[#172554]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-sm text-[#64748b]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Error state with a retry affordance ("Coba Lagi"). */
export function EmployeeErrorState({
  title = "Gagal memuat data",
  description,
  retryHref,
  retryLabel = "Coba Lagi",
}: {
  title?: string;
  description?: string;
  retryHref?: string;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="emp-card flex flex-col items-center justify-center px-6 py-10 text-center"
    >
      <span
        aria-hidden="true"
        className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-500"
      >
        <HrisIcon name="alert" className="size-6" />
      </span>
      <p className="text-sm font-semibold text-[#172554]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-sm text-[#64748b]">{description}</p>
      ) : null}
      {retryHref ? (
        <Link
          href={retryHref}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#1677e8] px-4 text-sm font-semibold text-white"
        >
          <HrisIcon name="refresh" className="size-4" />
          {retryLabel}
        </Link>
      ) : null}
    </div>
  );
}

/** Skeleton block used while employee data streams in. */
export function EmployeeCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("emp-card space-y-3 p-5", className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}

/** A short list skeleton for history/notification feeds. */
export function EmployeeListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="emp-card flex items-center gap-3 p-4">
          <Skeleton className="size-10 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
