"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { createTabTrap } from "@/lib/utils/focus";
import { cn } from "@/lib/utils/cn";
import type { NavIconKey, NavItem } from "@/types/navigation";

import { HrisIcon } from "./icons";
import { useShell } from "./shell-context";

interface PaletteEntry {
  key: string;
  label: string;
  hint: string;
  href: string;
  icon: NavIconKey | "search";
}

/**
 * Ctrl/⌘ + K search: jumps to any authorized menu page, or searches the
 * employee directory when the user may view it. Only routes the server
 * already authorized are offered; every page still guards itself.
 */
export function CommandPalette() {
  const { sections, hrefs, paletteOpen, setPaletteOpen } = useShell();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  const pages = useMemo<PaletteEntry[]>(() => {
    const out: PaletteEntry[] = [];
    const walk = (items: NavItem[], group: string) => {
      for (const item of items) {
        if (item.children) {
          walk(item.children, item.title);
        } else {
          out.push({
            key: item.href,
            label: item.title,
            hint: group,
            href: item.href,
            icon: item.icon ?? "dashboard",
          });
        }
      }
    };
    for (const section of sections) walk(section.items, section.title ?? "Menu");
    return out;
  }, [sections]);

  const canSearchEmployees = hrefs.includes("/employees");
  const trimmed = query.trim();

  const results = useMemo<PaletteEntry[]>(() => {
    const needle = trimmed.toLowerCase();
    const matches = needle
      ? pages.filter(
          (page) =>
            page.label.toLowerCase().includes(needle) ||
            page.hint.toLowerCase().includes(needle)
        )
      : pages;
    const list = [...matches];
    if (needle && canSearchEmployees) {
      list.push({
        key: "employee-search",
        label: `Cari karyawan “${trimmed}”`,
        hint: "Direktori karyawan",
        href: `/employees?q=${encodeURIComponent(trimmed)}`,
        icon: "search",
      });
    }
    return list;
  }, [pages, trimmed, canSearchEmployees]);

  const close = () => {
    setPaletteOpen(false);
    setQuery("");
    setCursor(0);
  };

  const go = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    close();
    router.push(entry.href);
  };

  useEffect(() => {
    if (!paletteOpen) return;
    const panel = panelRef.current;
    const trap = createTabTrap(panel);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPaletteOpen(false);
        return;
      }
      trap(event);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [paletteOpen, setPaletteOpen]);

  if (!paletteOpen) return null;

  const active = Math.min(cursor, Math.max(results.length - 1, 0));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/40 px-4 pt-[12vh] backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <HrisIcon name="search" className="size-5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((value) => Math.min(value + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(results[active]);
              }
            }}
            placeholder="Cari karyawan, menu, atau data..."
            aria-label="Kata kunci pencarian"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Esc
          </kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              Tidak ada hasil untuk “{trimmed}”.
            </li>
          ) : (
            results.map((entry, index) => (
              <li key={entry.key} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(entry)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left",
                    index === active ? "bg-surface-primary text-primary" : "text-foreground"
                  )}
                >
                  <span className="hris-chip-blue flex size-9 shrink-0 items-center justify-center rounded-xl">
                    <HrisIcon name={entry.icon} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{entry.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.hint}
                    </span>
                  </span>
                  <HrisIcon name="arrow-right" className="size-4 shrink-0 opacity-60" />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
