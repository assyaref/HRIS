import { cn } from "@/lib/utils/cn";

import { MonthSelect } from "./month-select";

export interface MonthlyRecapView {
  monthKey: string;
  hadir: number;
  izin: number;
  cuti: number;
  alpha: number;
  percentage: number;
}

const SHORT_MONTH = new Intl.DateTimeFormat("id-ID", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-11" → "Nov 2026" */
export function monthKeyLabel(key: string): string {
  const [year, month] = key.split("-").map((part) => Number.parseInt(part, 10));
  return SHORT_MONTH.format(new Date(Date.UTC(year, month - 1, 1))).replace(".", "");
}

/** Attendance ring: green → blue gradient arc over a soft track. */
function AttendanceRing({
  percentage,
  size,
  idPrefix,
}: {
  percentage: number;
  size: number;
  idPrefix: string;
}) {
  const stroke = Math.round(size * 0.1);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, percentage));
  const offset = circumference * (1 - pct / 100);
  const gradientId = `${idPrefix}-ring`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22C55E" />
            <stop offset="0.55" stopColor="#1DB954" />
            <stop offset="1" stopColor="#1E63EE" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        {pct > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-extrabold tracking-tight text-foreground tabular-nums"
          style={{ fontSize: Math.round(size * 0.22) }}
        >
          {pct}%
        </span>
        <span className="text-xs font-medium text-muted-foreground sm:text-[13px]">
          Kehadiran
        </span>
      </div>
    </div>
  );
}

const LEGEND: Array<{
  key: "hadir" | "izin" | "cuti" | "alpha";
  label: string;
  dot: string;
}> = [
  { key: "hadir", label: "Hadir", dot: "bg-[#22C55E]" },
  { key: "izin", label: "Izin", dot: "bg-[#F5B400]" },
  { key: "cuti", label: "Cuti", dot: "bg-[#8B5CF6]" },
  { key: "alpha", label: "Alpha", dot: "bg-[#EF4444]" },
];

/**
 * "Ringkasan Bulan Ini" — the signed-in employee's attendance for a month:
 * a percentage ring and a Hadir / Izin / Cuti / Alpha legend, with a month
 * picker. `header="band"` draws the blue title bar used on the desktop
 * management dashboard; `header="plain"` is the mobile/employee card.
 */
export function MonthlyRecapCard({
  recap,
  monthOptions,
  header = "plain",
  className,
}: {
  recap: MonthlyRecapView;
  monthOptions: string[];
  header?: "band" | "plain";
  className?: string;
}) {
  const options = monthOptions.map((value) => ({
    value,
    label: monthKeyLabel(value),
  }));
  const band = header === "band";
  const headingId = band ? "ringkasan-bulan-ini-band" : "ringkasan-bulan-ini";

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "overflow-hidden rounded-[20px] border border-[var(--card-border)] bg-card hris-card",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3",
          band
            ? "hris-band m-1.5 rounded-2xl px-4 py-3"
            : "px-5 pt-5"
        )}
      >
        <h2
          id={headingId}
          className={cn(
            "text-[17px] font-bold tracking-tight",
            band ? "text-white" : "text-foreground"
          )}
        >
          Ringkasan Kehadiran Saya
        </h2>
        <MonthSelect
          value={recap.monthKey}
          options={options}
          tone={band ? "onBlue" : "light"}
        />
      </div>

      <div className="flex items-center gap-5 px-5 pt-4 pb-5 sm:gap-6">
        <AttendanceRing
          percentage={recap.percentage}
          size={band ? 132 : 140}
          idPrefix={band ? "recap-band" : "recap"}
        />
        <dl className="min-w-0 flex-1 divide-y divide-border">
          {LEGEND.map((item) => (
            <div key={item.key} className="flex items-center gap-2.5 py-2">
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", item.dot)} />
              <dt className="min-w-0 flex-1 truncate text-[15px] text-muted-foreground">
                {item.label}
              </dt>
              <dd className="text-[15px] font-bold text-foreground tabular-nums">
                {recap[item.key]} hari
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
