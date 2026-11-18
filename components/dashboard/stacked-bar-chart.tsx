export interface StackedBarSeries {
  key: string;
  label: string;
  color: string;
}

export interface StackedBarPoint {
  label: string;
  values: Record<string, number>;
}

/**
 * Stacked rounded-pill bars (one column per point), segments separated by
 * a small gap. Pure CSS/HTML, server-renderable, scales to its container.
 */
export function StackedBarChart({
  series,
  points,
  height = 200,
}: {
  series: StackedBarSeries[];
  points: StackedBarPoint[];
  height?: number;
}) {
  const totals = points.map((p) =>
    series.reduce((sum, s) => sum + Math.max(0, p.values[s.key] ?? 0), 0)
  );
  const max = Math.max(1, ...totals);

  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
      <div
        className="flex items-end justify-between gap-1"
        style={{ height }}
        role="img"
        aria-label={points
          .map((p, i) => `${p.label}: ${totals[i]}`)
          .join(", ")}
      >
        {points.map((p, i) => (
          <div
            key={`${p.label}-${i}`}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            title={`${p.label}: ${series
              .map((s) => `${s.label} ${p.values[s.key] ?? 0}`)
              .join(" · ")}`}
          >
            <div className="flex w-2.5 flex-col-reverse items-stretch gap-1 sm:w-3">
              {totals[i] === 0 ? (
                <span className="block h-1.5 rounded-full bg-muted" />
              ) : (
                series.map((s) => {
                  const v = Math.max(0, p.values[s.key] ?? 0);
                  if (v === 0) return null;
                  // Leave room for the gaps between segments.
                  const h = Math.max(6, (v / max) * (height - 24));
                  return (
                    <span
                      key={s.key}
                      className="block rounded-full"
                      style={{ height: h, backgroundColor: s.color }}
                    />
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex justify-between gap-1">
        {points.map((p, i) => (
          <span
            key={`${p.label}-l${i}`}
            className="min-w-0 flex-1 truncate text-center text-[12px] text-muted-foreground"
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
