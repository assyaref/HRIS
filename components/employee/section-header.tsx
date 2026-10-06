import type { ReactNode } from "react";

/**
 * Employee-app section heading. Larger, friendlier hierarchy than the
 * management `SectionHeading`, with an optional trailing action.
 */
export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-1",
        className ?? "",
      ].join(" ")}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-[#172554]">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-sm text-[#64748b]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
