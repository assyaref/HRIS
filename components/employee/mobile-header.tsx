"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/features/auth/actions";
import { createTabTrap, getFocusableElements } from "@/lib/utils/focus";
import { HrisIcon } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

interface EmployeeProfile {
  name: string;
  employeeNumber: string;
  role: string;
  avatar: string | null;
}

interface DrawerMenuItem {
  key: string;
  href: string;
  label: string;
  icon: Parameters<typeof HrisIcon>[0]["name"];
}

const MENU_ITEMS: DrawerMenuItem[] = [
  { key: "home", href: "/dashboard", label: "Beranda", icon: "home" },
  { key: "attendance", href: "/attendance", label: "Absensi", icon: "calendar-check" },
  { key: "leave", href: "/leave", label: "Pengajuan Cuti", icon: "leave" },
  { key: "permission", href: "/permission", label: "Izin Kegiatan", icon: "permission" },
  { key: "payslip", href: "/payslip", label: "Payslip", icon: "payslip" },
  { key: "profile", href: "/settings/account", label: "Profil Saya", icon: "profile" },
  { key: "account", href: "/settings/account", label: "Pengaturan Akun", icon: "settings" },
  { key: "help", href: "/notifications", label: "Bantuan", icon: "help" },
];

interface EmployeeMobileHeaderProps {
  organizationName: string | null;
  employee: EmployeeProfile;
  notificationCount: number;
  authorizedHrefs: string[];
}

/**
 * Employee mobile header (HRIS Lite Enterprise).
 *
 * Self-contained slide-out drawer (focus trap, Esc, scroll lock, outside
 * click close). Hamburger menu · HRIS logo · application name · notification
 * icon with unread badge · employee avatar. Royal Blue profile header ·
 * white menu surface · active menu highlighted in blue · keyboard
 * accessibility · correct focus handling.
 *
 * Only routes present in `authorizedHrefs` are shown; the server resolves the
 * employee's authorized set before rendering.
 */
export function EmployeeMobileHeader({
  organizationName,
  employee,
  notificationCount,
  authorizedHrefs,
}: EmployeeMobileHeaderProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    const trapTab = createTabTrap(panel);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      trapTab(event);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = requestAnimationFrame(() => {
      getFocusableElements(panel)[0]?.focus();
    });

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  const isActive = (href: string): boolean => {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <header
        className="sticky top-0 z-fixed flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-lg lg:hidden"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Buka menu navigasi"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-5"
          >
            <path d="M3.75 6.75h16.5" />
            <path d="M3.75 12h16.5" />
            <path d="M3.75 17.25h16.5" />
          </svg>
        </button>

        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2"
        >
          <span
            className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/60"
          >
            <Image
              src="/brand/hris-logo.png"
              alt="HRIS Lite Enterprise"
              width={36}
              height={36}
              priority
              className="size-9 object-contain p-0.5"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-tight text-foreground">
              HRIS Lite Enterprise
            </span>
            {organizationName ? (
              <span className="block truncate text-[10px] font-medium text-muted-foreground">
                {organizationName}
              </span>
            ) : null}
          </span>
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Notifikasi"
            aria-haspopup="dialog"
            className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <HrisIcon name="bell" className="size-5" />
            {notificationCount > 0 ? (
              <span
                className="absolute -top-1 -right-1 flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 py-0.5 text-[10px] font-semibold text-primary-foreground ring-1 ring-background"
              >
                {notificationCount > 9 ? "9+" : notificationCount}
              </span>
            ) : null}
          </button>

          {employee.avatar ? (
            <Image
              src={employee.avatar}
              alt={employee.name}
              width={32}
              height={32}
              unoptimized
              className="size-8 shrink-0 rounded-full border border-border bg-card object-cover"
            />
          ) : (
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground select-none"
            >
              {employee.name
                .split(" ")
                .map((part) => part.charAt(0))
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </span>
          )}
        </div>
      </header>

      {open ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-0 transition-opacity duration-220 ease-in-out",
              open ? "bg-black/40" : "bg-transparent pointer-events-none"
            )}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigasi"
            className={cn(
              "absolute inset-y-0 left-0 z-50 lg:hidden flex w-80 max-w-[85%] flex-col border-r border-border bg-card shadow-xl transform transition-transform duration-220 ease-in-out",
              open ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border pr-2 pl-6">
              <Link
                href="/dashboard"
                className="flex items-center gap-2"
                aria-label="HRIS Lite Enterprise home"
              >
                <span
                  className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-border/60"
                >
                <Image
                  src="/brand/hris-logo.png"
                  alt="HRIS Lite Enterprise"
                  width={36}
                  height={36}
                  priority
                  className="size-9 object-contain p-0.5"
                />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold tracking-tight text-foreground">
                    HRIS Lite Enterprise
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup navigasi"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="size-5"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="relative px-5 py-5">
              <div
                className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none rounded-2xl"
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.14em] text-primary/70 uppercase">
                    HRIS Lite Enterprise
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground truncate">
                    {employee.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {employee.employeeNumber} · {employee.role}
                  </p>
                </div>
                <span className="relative shrink-0">
                  {employee.avatar ? (
                    <Image
                      src={employee.avatar}
                      alt={employee.name}
                      width={56}
                      height={56}
                      unoptimized
                      className="size-14 rounded-full border-2 border-white object-cover shadow-lg ring-2 ring-primary/30"
                    />
                  ) : (
                    <span
                      className="flex size-14 items-center justify-center rounded-full border-2 border-white bg-white text-sm font-semibold shadow-lg ring-2 ring-primary/30"
                    >
                      {employee.name
                        .split(" ")
                        .map((part) => part.charAt(0))
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <nav aria-label="Menu navigasi" className="flex-1 overflow-y-auto p-3">
              <ul className="space-y-0.5">
                {MENU_ITEMS.filter((item) =>
                  authorizedHrefs.includes(item.href)
                ).map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center transition-colors",
                            active
                              ? "text-primary-foreground"
                              : "text-muted-foreground group-hover:text-foreground"
                          )}
                        >
                          <HrisIcon name={item.icon} className="size-[18px]" />
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t border-border px-5 py-4 shrink-0">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <HrisIcon name="logout" className="size-5" />
                  Keluar
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
