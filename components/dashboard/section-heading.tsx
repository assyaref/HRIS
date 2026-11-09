import type { ReactNode } from "react";

/** Section heading with an optional trailing action (e.g. "View all"). */
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
        <h2 className="text-section-title text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}