"use client";

import { usePathname } from "next/navigation";

import type { NavSection } from "@/types/navigation";

const preferredTitles = [
  "Dashboard",
  "Attendance",
  "Employees",
  "Payroll",
  "Payslip",
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function Icon({
  type,
  className = "size-5",
}: {
  type: string;
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (type) {
    case "Dashboard":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <rect x="14" y="14" width="6" height="6" rx="1" />
        </svg>
      );

    case "Attendance":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );

    case "Employees":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c.6-3.3 2.6-5 6-5s5.4 1.7 6 5" />
          <path d="M16 5.5a3 3 0 0 1 0 5.8" />
          <path d="M17 15c2.4.4 3.7 2 4 5" />
        </svg>
      );

    case "Payroll":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M15 15h3" />
        </svg>
      );

    case "Payslip":
      return (
        <svg {...common}>
          <path d="M6 3h9l3 3v15H6z" />
          <path d="M14 3v4h4" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );

    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

export function MobileBottomNav({
  sections,
}: {
  sections: NavSection[];
}) {
  const pathname = usePathname();

  const items = sections
    .flatMap((section) => section.items)
    .filter((item) => preferredTitles.includes(item.title))
    .sort(
      (a, b) =>
        preferredTitles.indexOf(a.title) -
        preferredTitles.indexOf(b.title),
    )
    .slice(0, 5);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.07)] backdrop-blur lg:hidden"
    >
      <div
        className={[
          "mx-auto grid max-w-lg gap-1",
          items.length === 5 ? "grid-cols-5" : "grid-cols-4",
        ].join(" ")}
      >
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);

          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition-colors",
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-blue-600",
              ].join(" ")}
            >
              <Icon
                type={item.title}
                className={active ? "size-5" : "size-[19px]"}
              />
              <span className="max-w-full truncate">{item.title}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
