import { QuickServiceCard, type QuickServiceItem } from "./quick-service-card";

/**
 * Responsive "Layanan Aplikasi" grid. Mobile/tablet use a comfortable
 * 4-column icon grid; wide desktop spreads the full set in a single row.
 */
export function QuickServiceGrid({
  items,
  className,
}: {
  items: QuickServiceItem[];
  className?: string;
}) {
  return (
    <div
      className={[
        "grid grid-cols-4 gap-3 sm:gap-4 xl:grid-cols-8",
        className ?? "",
      ].join(" ")}
      role="list"
    >
      {items.map((item) => (
        <div role="listitem" key={item.href}>
          <QuickServiceCard item={item} />
        </div>
      ))}
    </div>
  );
}
