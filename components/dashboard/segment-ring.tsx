export interface RingSlice {
  label: string;
  value: number;
  color: string;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * Ring chart in two looks:
 * - `dashed`: many short rounded ticks, each coloured by the slice it falls
 *   in (center shows a total);
 * - `solid`: one thick rounded arc per slice with small gaps.
 * Pure SVG, server-renderable; empty data draws a neutral ring.
 */
export function SegmentRing({
  slices,
  size = 220,
  variant = "dashed",
  centerValue,
  centerLabel,
  ticks = 24,
}: {
  slices: RingSlice[];
  size?: number;
  variant?: "dashed" | "solid";
  centerValue?: React.ReactNode;
  centerLabel?: string;
  ticks?: number;
}) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const c = size / 2;
  const stroke = variant === "dashed" ? size * 0.075 : size * 0.12;
  const r = c - stroke / 2 - 2;
  // Round caps reach stroke/2 past each end: pull the arcs in by that much
  // (in degrees) plus a small visible spacing, so gaps stay open.
  const capDeg = ((stroke / 2) / r) * (180 / Math.PI);
  const spaceDeg = (4 / r) * (180 / Math.PI);
  const paths: Array<{ d: string; color: string; key: string }> = [];

  if (variant === "dashed") {
    const step = 360 / ticks;
    const inset = capDeg + spaceDeg / 2;
    for (let i = 0; i < ticks; i++) {
      const at = (i + 0.5) / ticks;
      let color = "var(--muted)";
      if (total > 0) {
        let acc = 0;
        for (const s of slices) {
          acc += Math.max(0, s.value) / total;
          if (at <= acc + 1e-9) {
            color = s.color;
            break;
          }
        }
      }
      paths.push({
        key: `t${i}`,
        d: arc(
          c,
          c,
          r,
          i * step + inset,
          Math.max(i * step + inset + 0.2, (i + 1) * step - inset)
        ),
        color,
      });
    }
  } else if (total > 0) {
    const visible = slices.filter((s) => s.value > 0);
    const inset = visible.length > 1 ? capDeg + spaceDeg * 1.5 : 0;
    let start = 0;
    for (const s of visible) {
      const sweep = (s.value / total) * 360;
      const from = start + inset;
      const to = Math.max(from + 0.2, start + sweep - inset);
      paths.push({
        key: s.label,
        d: arc(c, c, r, from, Math.min(to, from + 359.5)),
        color: s.color,
      });
      start += sweep;
    }
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={slices.map((s) => `${s.label}: ${s.value}`).join(", ")}
      >
        {variant === "solid" ? (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={stroke}
            opacity={total > 0 ? 0 : 1}
          />
        ) : null}
        {paths.map((p) => (
          <path
            key={p.key}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        ))}
      </svg>
      {centerValue !== undefined ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[30px] leading-none font-bold tracking-tight text-foreground tabular-nums">
            {centerValue}
          </span>
          {centerLabel ? (
            <span className="mt-1.5 text-[13px] text-muted-foreground">
              {centerLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Legend row: colored dot, label, optional value / percentage. */
export function RingLegend({
  slices,
  showPercent = true,
  columns = 1,
}: {
  slices: RingSlice[];
  showPercent?: boolean;
  columns?: 1 | 2;
}) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  return (
    <ul
      className={
        columns === 2
          ? "grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2"
          : "space-y-3.5"
      }
    >
      {slices.map((s) => (
        <li key={s.label} className="min-w-0">
          <span className="flex items-center gap-2 text-[14px] font-medium text-foreground">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: s.color }}
            />
            <span className="truncate">{s.label}</span>
          </span>
          <span className="mt-1 flex items-center gap-2 pl-[18px] text-[13px] tabular-nums">
            <span className="font-semibold text-foreground">{s.value}</span>
            {showPercent ? (
              <span className="font-semibold" style={{ color: s.color }}>
                {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : "0%"}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
