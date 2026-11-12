import Link from "next/link";
import type { ReactNode } from "react";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { StatusBadge, type StatusTone } from "@/components/employee/status-badge";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";

/**
 * Detail view shared by leave and permission requests, in the self-service
 * card style: back link, a summary card (type, status, period, reason,
 * reviewer note), an optional actions card and the request timeline.
 * Presentation only — the pages keep their own authorization checks.
 */

const STATUS_TONES: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

const EVENT_LABELS: Record<string, string> = {
  submitted: "Pengajuan dikirim",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

export function formatRequestTimestamp(value: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(value);
}

export function RequestDetail({
  backHref,
  title,
  subtitle,
  icon,
  typeLabel,
  status,
  statusLabel,
  rows,
  reviewedAt,
  actions,
  events,
}: {
  backHref: string;
  /** Page heading (visually hidden in the employee frame). */
  title: string;
  subtitle: string;
  icon: HrisIconName;
  typeLabel: string;
  status: string;
  statusLabel: string;
  rows: Array<{ label: string; value: ReactNode }>;
  reviewedAt: Date | null;
  actions: ReactNode;
  events: Array<{ id: string; eventType: string; actorName: string | null; createdAt: Date }>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Link
          href={backHref}
          className="inline-flex h-10 items-center gap-1 rounded-full border border-[var(--card-border)] bg-card pr-4 pl-2.5 text-[13.5px] font-semibold text-foreground hris-card hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <HrisIcon name="chevron-left" className="size-4" />
          Kembali
        </Link>
      </div>

      <section className="rounded-[22px] border border-[var(--card-border)] bg-card p-4 hris-card">
        <div className="flex items-start gap-3">
          <span className="hris-chip-blue flex size-11 shrink-0 items-center justify-center rounded-xl">
            <HrisIcon name={icon} className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] leading-tight font-bold text-foreground">{typeLabel}</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>
          </div>
          <StatusBadge tone={STATUS_TONES[status] ?? "neutral"}>{statusLabel}</StatusBadge>
        </div>
        <dl className="mt-3 divide-y divide-border border-t border-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start gap-3 py-2.5">
              <dt className="w-28 shrink-0 text-[13.5px] text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 flex-1 text-right text-[13.5px] font-semibold break-words text-foreground">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {reviewedAt ? (
          <p className="mt-1 text-[12px] text-muted-foreground">
            Ditinjau {formatRequestTimestamp(reviewedAt)}
          </p>
        ) : null}
      </section>

      {actions ? (
        <section className="rounded-[22px] border border-[var(--card-border)] bg-card p-4 hris-card">
          <h2 className="mb-3 text-[15px] font-bold text-foreground">Tindakan</h2>
          {actions}
        </section>
      ) : null}

      <section className="rounded-[22px] border border-[var(--card-border)] bg-card p-4 hris-card">
        <h2 className="text-[15px] font-bold text-foreground">Riwayat</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">Belum ada riwayat.</p>
        ) : (
          <ol className="mt-3 space-y-0">
            {events.map((event, index) => (
              <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < events.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-4 bottom-0 left-[7px] w-px bg-border"
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className="relative mt-1 size-[15px] shrink-0 rounded-full border-[3px] border-card bg-primary ring-1 ring-primary/30"
                />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-foreground">
                    {EVENT_LABELS[event.eventType] ?? event.eventType}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {[event.actorName, formatRequestTimestamp(event.createdAt)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
