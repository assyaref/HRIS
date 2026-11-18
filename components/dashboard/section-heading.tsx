import type { ReactNode } from "react";

/** Section heading with an optional trailing action (e.g. "Lihat semua"). */
export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          <span
            aria-hidden="true"
            className="h-5 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[#38BDF8] via-primary to-[var(--brand-navy)]"
          />
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 max-w-2xl pl-4 text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
