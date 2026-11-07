import { HrisIcon } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

/**
 * Leave balance summary card. Uses the employee's real balances for the
 * current period; nothing is hard-coded. Theme-adaptive.
 */
export function LeaveBalanceCard({
  leaveTypeName,
  leaveTypeCode,
  year,
  available,
  used,
  pending,
  entitlement,
  className,
}: {
  leaveTypeName: string;
  leaveTypeCode?: string | null;
  year: string;
  available: number;
  used: number;
  pending: number;
  entitlement: number;
  className?: string;
}) {
  const total = entitlement > 0 ? entitlement : available + used + pending;
  const pct = total > 0 ? Math.min(100, Math.round((available / total) * 100)) : 0;

  return (
    <div className={cn("hris-card p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {leaveTypeName}
          </p>
          <p className="text-xs text-muted-foreground">
            {leaveTypeCode ? `${leaveTypeCode} · ` : ""}
            {year}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl hris-surface-warning text-warning"
        >
          <HrisIcon name="leave" className="size-5" />
        </span>
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight text-foreground">
          {available}
        </span>
        <span className="text-sm text-muted-foreground">hari tersisa</span>
      </p>

      {total > 0 ? (
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted/50"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% saldo tersisa`}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div className="flex gap-1">
          <dt>Terpakai</dt>
          <dd className="font-semibold text-foreground">{used}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Menunggu</dt>
          <dd className="font-semibold text-foreground">{pending}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Hak</dt>
          <dd className="font-semibold text-foreground">{entitlement}</dd>
        </div>
      </dl>
    </div>
  );
}
