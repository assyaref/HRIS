"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { switchActingOrganizationAction } from "@/features/acting-organization/actions";
import { cn } from "@/lib/utils/cn";

import { HrisIcon } from "./icons";
import type { ShellOrganizationOption } from "./shell-context";

/**
 * Super Administrator organization switcher.
 *
 * Lists the organizations the Super Administrator may operate in and calls the
 * server action that stores the (server-validated) choice. Every page and
 * server action then reads and writes that organization. It never decides
 * access itself: the action re-checks SUPERADMIN against PostgreSQL.
 */
/**
 * Organization identity: the uploaded logo stands in for the organization's
 * name wherever the name would be printed; without a logo the name is shown
 * as text. `plate` puts the logo on a white tile (for dark backgrounds).
 */
export function OrganizationIdentity({
  name,
  logoUrl,
  plate = false,
  imgClassName,
  textClassName,
  className,
}: {
  name: string;
  logoUrl: string | null;
  plate?: boolean;
  imgClassName?: string;
  textClassName?: string;
  className?: string;
}) {
  if (!logoUrl) {
    return (
      <span className={cn("block min-w-0 truncate", textClassName, className)}>
        {name}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center",
        plate && "rounded-xl bg-white px-2 py-1 shadow-sm",
        className
      )}
      title={name}
    >
      {/* Authenticated image route; next/image cannot optimise it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={name}
        className={cn("h-9 w-auto max-w-full object-contain object-left", imgClassName)}
      />
    </span>
  );
}

/** Compact identity for the collapsed sidebar: the logo, else the initial. */
export function OrganizationInitial({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return logoUrl ? (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt={name} className="size-full object-contain p-1" />
    </span>
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-primary text-base font-bold text-primary">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Two-letter monogram for text-only organization chips ("PT Len" → "PL"). */
function orgMonogram(name: string): string {
  const words = name
    .replace(/^(PT|CV|KSO)\.?\s*-?\s*/i, "")
    .split(/[\s.-]+/)
    .filter(Boolean);
  const letters = (words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "");
  return (letters || name.charAt(0) || "?").toUpperCase();
}

/** Text-only monogram tile used by the switcher (no logo). */
export function OrganizationMonogram({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-surface-primary font-bold tracking-tight text-primary",
        size === "sm" ? "size-8 text-[11px]" : "size-10 text-[13px]"
      )}
    >
      {orgMonogram(name)}
    </span>
  );
}

export function OrganizationSwitcher({
  name,
  activeOrganizationId,
  options,
  collapsed = false,
  className,
}: {
  name: string;
  logoUrl?: string | null;
  activeOrganizationId: string | null;
  options: readonly ShellOrganizationOption[];
  collapsed?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(organizationId: string) {
    setOpen(false);
    if (organizationId === activeOrganizationId) return;
    setError(null);
    startTransition(async () => {
      const result = await switchActingOrganizationAction(
        organizationId,
        pathname
      );
      if (result && !result.ok) setError(result.message);
    });
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Organisasi aktif: ${name}. Ganti organisasi`}
        title={collapsed ? name : "Ganti organisasi"}
        disabled={pending}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
          collapsed
            ? "justify-center"
            : "border border-sidebar-border bg-sidebar-panel px-2.5 py-2.5 hover:border-primary/30"
        )}
      >
        <OrganizationMonogram name={name} />
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium text-muted-foreground">
                {pending ? "Mengganti…" : "Organisasi aktif"}
              </span>
              <span className="mt-0.5 block truncate text-[14.5px] font-semibold text-foreground">
                {name}
              </span>
            </span>
            <HrisIcon
              name="chevron-down"
              className={cn(
                "size-[18px] shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </>
        )}
      </button>

      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {open ? (
        <div
          className={cn(
            "absolute z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card p-1.5 text-card-foreground shadow-[var(--shadow-xl)]",
            collapsed ? "left-0" : "inset-x-0 w-auto"
          )}
        >
          <ul role="listbox" aria-label="Pilih organisasi" className="max-h-72 space-y-0.5 overflow-y-auto">
            {options.map((option) => {
              const selected = option.id === activeOrganizationId;
              return (
                <li key={option.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => choose(option.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                      selected && "bg-surface-primary/60"
                    )}
                  >
                    <OrganizationMonogram name={option.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate font-medium text-foreground",
                          selected && "font-semibold text-primary"
                        )}
                        title={option.name}
                      >
                        {option.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {option.isSystem ? "Sistem" : option.code}
                      </span>
                    </span>
                    {selected ? (
                      <HrisIcon name="check" className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <Link
            href="/settings/organizations"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2 rounded-xl border-t border-border px-2 py-2 text-sm font-medium text-primary hover:bg-muted"
          >
            <HrisIcon name="settings" className="size-4" />
            Kelola organisasi
          </Link>
        </div>
      ) : null}
    </div>
  );
}
