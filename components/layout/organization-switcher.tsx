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

export function OrganizationSwitcher({
  name,
  logoUrl = null,
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
          "flex w-full items-center gap-3 rounded-lg text-left transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
          collapsed && "justify-center"
        )}
      >
        {collapsed ? (
          <OrganizationInitial name={name} logoUrl={logoUrl} />
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                {pending ? "Mengganti…" : "Organisasi aktif"}
              </span>
              <OrganizationIdentity
                name={name}
                logoUrl={logoUrl}
                className="mt-1"
                imgClassName="h-10"
                textClassName="text-[15px] font-semibold text-foreground"
              />
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
            "absolute z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg",
            collapsed ? "left-0" : "inset-x-0 w-auto"
          )}
        >
          <ul role="listbox" aria-label="Pilih organisasi" className="max-h-72 overflow-y-auto py-1">
            {options.map((option) => {
              const selected = option.id === activeOrganizationId;
              return (
                <li key={option.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => choose(option.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      selected && "font-semibold text-primary"
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <OrganizationIdentity
                        name={option.name}
                        logoUrl={option.logoUrl ?? null}
                        imgClassName="h-7"
                      />
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        {option.isSystem ? "Sistem" : option.code}
                      </span>
                    </span>
                    {selected ? (
                      <HrisIcon name="check" className="size-4 shrink-0" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <Link
            href="/settings/organizations"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-3 py-2 text-sm font-medium text-primary hover:bg-accent"
          >
            Kelola organisasi
          </Link>
        </div>
      ) : null}
    </div>
  );
}
