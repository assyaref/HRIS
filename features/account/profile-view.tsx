"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils/cn";

/**
 * Self-service "Profil Saya" (reference mobile layout).
 *
 * An identity card (photo with camera badge, name, position, employee ID and
 * status chips) above three tabs: Data Pegawai, Akun & Keamanan, Lainnya.
 * Panels are rendered on the server and passed in; this component only
 * switches between them and mirrors the active tab in `?tab=` so a reload
 * (or the camera badge) lands on the right panel. Nothing here grants
 * access — every action re-checks on the server.
 */

export type ProfileTabKey = "data" | "akun" | "lainnya";

const TABS: Array<{ key: ProfileTabKey; label: string; icon: HrisIconName }> = [
  { key: "data", label: "Data Pegawai", icon: "user" },
  { key: "akun", label: "Akun & Keamanan", icon: "lock" },
  { key: "lainnya", label: "Lainnya", icon: "grid" },
];

export function ProfileView({
  initialTab,
  identity,
  panels,
  overlapBand = false,
}: {
  initialTab: ProfileTabKey;
  /** Pull the identity card up over the blue band's wave (employee frame). */
  overlapBand?: boolean;
  identity: {
    displayName: string;
    subtitle: string | null;
    employeeNumber: string | null;
    photoUrl: string | null;
    statusLabel: string | null;
    statusActive: boolean;
    canEditPhoto: boolean;
  };
  panels: Record<ProfileTabKey, ReactNode>;
}) {
  const [tab, setTab] = useState<ProfileTabKey>(initialTab);
  const baseId = useId();
  const tabRefs = useRef<Record<ProfileTabKey, HTMLButtonElement | null>>({
    data: null,
    akun: null,
    lainnya: null,
  });
  const pendingScroll = useRef<string | null>(null);

  function select(next: ProfileTabKey, scrollTo?: string) {
    setTab(next);
    pendingScroll.current = scrollTo ?? null;
    try {
      const url = new URL(window.location.href);
      if (next === "data") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* URL sync is a convenience only */
    }
  }

  useEffect(() => {
    const target = pendingScroll.current;
    if (!target) return;
    pendingScroll.current = null;
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab]);

  function onTabKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((item) => item.key === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    const key = TABS[next].key;
    select(key);
    tabRefs.current[key]?.focus();
  }

  const initials =
    identity.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?";

  return (
    <div className="@container space-y-3">
      {/* Identity */}
      <section
        aria-label="Identitas"
        className={cn(
          "relative z-10 flex items-center gap-3.5 rounded-[22px] border border-[var(--card-border)] bg-card p-3.5 hris-card",
          overlapBand && "-mt-7"
        )}
      >
        <span className="relative shrink-0">
          <span className="flex size-[clamp(64px,19cqw,80px)] items-center justify-center overflow-hidden rounded-full bg-surface-primary shadow-[0_8px_18px_-10px_rgb(15_60_160/0.6)] ring-[3px] ring-card outline outline-1 outline-[var(--card-border)]">
            {identity.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={identity.photoUrl}
                alt={identity.displayName}
                className="size-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-primary">{initials}</span>
            )}
          </span>
          {identity.canEditPhoto ? (
            <button
              type="button"
              onClick={() => select("akun", "foto-profil")}
              aria-label="Ganti foto profil"
              className="hris-band absolute -right-1.5 -bottom-1 flex size-7 !min-h-0 items-center justify-center rounded-full ring-[3px] ring-card focus-visible:ring-ring focus-visible:outline-none"
            >
              <HrisIcon name="camera" className="size-3.5" />
            </button>
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[clamp(16px,4.6cqw,19px)] leading-tight font-bold tracking-tight text-foreground">
            {identity.displayName}
          </p>
          {identity.subtitle ? (
            <p className="mt-0.5 truncate text-[13.5px] text-muted-foreground">
              {identity.subtitle}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
            {identity.employeeNumber ? (
              <span className="inline-flex items-center rounded-full bg-surface-primary px-2.5 py-1 text-[12.5px] font-bold text-primary tabular-nums">
                ID: {identity.employeeNumber}
              </span>
            ) : (
              <span />
            )}
            {identity.statusLabel ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
                  identity.statusActive
                    ? "bg-[#E3F6E8] text-[#15803D] dark:bg-[#16301C] dark:text-[#86EFAC]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
                    identity.statusActive ? "bg-[#22C55E]" : "bg-muted-foreground/60"
                  )}
                />
                {identity.statusLabel}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Bagian profil"
        onKeyDown={onTabKey}
        className="grid grid-cols-3 gap-1 rounded-[20px] border border-[var(--card-border)] bg-card p-1.5 hris-card"
      >
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <button
              key={item.key}
              ref={(node) => {
                tabRefs.current[item.key] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.key}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${item.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(item.key)}
              className={cn(
                "flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "hris-band shadow-[0_10px_20px_-12px_rgb(30_94_235/0.9)]"
                  : "text-foreground/75 hover:bg-muted"
              )}
            >
              <HrisIcon name={item.icon} className="size-[22px]" />
              <span className="text-[clamp(11px,3.3cqw,13.5px)] leading-tight font-semibold text-balance">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {TABS.map((item) => (
        <div
          key={item.key}
          role="tabpanel"
          id={`${baseId}-panel-${item.key}`}
          aria-labelledby={`${baseId}-tab-${item.key}`}
          hidden={item.key !== tab}
          className="space-y-3"
        >
          {panels[item.key]}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel building blocks (server-renderable markup, client-safe)       */
/* ------------------------------------------------------------------ */

export function ProfileSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-4 rounded-[22px] border border-[var(--card-border)] bg-card px-4 pt-4 pb-2 hris-card",
        className
      )}
    >
      <h2 className="text-[17px] font-bold tracking-tight text-foreground">{title}</h2>
      {description ? (
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function InfoRows({
  rows,
}: {
  rows: Array<{ label: string; value: string | null; icon: HrisIconName }>;
}) {
  return (
    <dl className="divide-y divide-border border-t border-border">
      {rows.map((row) => {
        const value = row.value && row.value.trim() !== "" ? row.value : null;
        return (
          <div key={row.label} className="flex min-h-[46px] items-center gap-3 py-2">
            <dt className="flex min-w-0 shrink-0 items-center gap-3 text-[14px] text-foreground/80">
              <HrisIcon name={row.icon} className="size-5 shrink-0 text-primary" />
              {row.label}
            </dt>
            <dd
              className={cn(
                "min-w-0 flex-1 text-right text-[14px] font-semibold break-words",
                value ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {value ?? "—"}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

const ROW_CLASS =
  "flex min-h-[64px] w-full items-center gap-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none";

function RowIcon({ icon, tone = "blue" }: { icon: HrisIconName; tone?: "blue" | "red" }) {
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full",
        tone === "red" ? "bg-surface-danger text-[#EF4444]" : "hris-chip-blue"
      )}
    >
      <HrisIcon name={icon} className="size-[22px]" />
    </span>
  );
}

function RowText({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="row-title block text-[15px] leading-tight font-bold text-foreground transition-colors">{title}</span>
      {description ? (
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
          {description}
        </span>
      ) : null}
    </span>
  );
}

/** A tappable settings row that links to another page. */
export function LinkRow({
  href,
  icon,
  title,
  description,
  trailing,
}: {
  href: string;
  icon: HrisIconName;
  title: string;
  description?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <Link href={href} className={cn(ROW_CLASS, "active:bg-muted/60 [&:hover_.row-title]:text-primary")}>
      <RowIcon icon={icon} />
      <RowText title={title} description={description} />
      {trailing}
      <HrisIcon name="chevron-right" className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** A row that expands its content inline (e.g. the change-password form). */
export function ExpandableRow({
  icon,
  title,
  description,
  children,
}: {
  icon: HrisIconName;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(ROW_CLASS, "active:bg-muted/60 [&:hover_.row-title]:text-primary")}
      >
        <RowIcon icon={icon} />
        <RowText title={title} description={description} />
        <HrisIcon
          name="chevron-right"
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
      </button>
      <div id={panelId} hidden={!open} className="pt-1 pb-3">
        {children}
      </div>
    </div>
  );
}

/** Light / Dark / System theme picker (Preferensi). */
export function ThemePreferenceRow() {
  const { theme, setTheme } = useTheme();
  const options: Array<{ key: "light" | "dark" | "system"; label: string; icon: HrisIconName }> = [
    { key: "light", label: "Terang", icon: "sun" },
    { key: "dark", label: "Gelap", icon: "moon" },
    { key: "system", label: "Sistem", icon: "settings" },
  ];
  return (
    <div className="py-2.5">
      <div className="flex items-center gap-3">
        <RowIcon icon={theme === "dark" ? "moon" : "sun"} />
        <RowText title="Tema Tampilan" description="Pilih tampilan terang, gelap, atau ikuti perangkat." />
      </div>
      <div
        role="radiogroup"
        aria-label="Tema tampilan"
        className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1"
      >
        {options.map((option) => {
          const active = theme === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(option.key)}
              className={cn(
                "flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <HrisIcon name={option.icon} className="size-4" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Jump chips at the top of the Akun & Keamanan panel. */
export function SectionChips({
  items,
}: {
  items: Array<{ target: string; label: string; icon: HrisIconName }>;
}) {
  const [active, setActive] = useState(items[0]?.target);
  return (
    <nav
      aria-label="Bagian akun"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const on = item.target === active;
        return (
          <button
            key={item.target}
            type="button"
            onClick={() => {
              setActive(item.target);
              document
                .getElementById(item.target)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={cn(
              "inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[clamp(11.5px,3.4cqw,13.5px)] font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              on
                ? "hris-band shadow-[0_10px_20px_-12px_rgb(30_94_235/0.9)]"
                : "border border-[var(--card-border)] bg-card text-foreground/80 hris-card hover:bg-muted"
            )}
          >
            <HrisIcon name={item.icon} className="size-[17px] shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
