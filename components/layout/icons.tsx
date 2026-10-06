import type { NavIconKey } from "@/types/navigation";

/**
 * Enterprise HRIS icon set.
 *
 * A single consistent vocabulary of inline SVGs used by the navigation shell
 * and the dashboard. Following the application's existing pattern (see
 * `app/(dashboard)/payroll/page.tsx`): stroke-based, `strokeWidth 1.8`,
 * round caps, `aria-hidden`. No external icon package is required.
 */

export type HrisIconName =
  | NavIconKey
  | "check-in"
  | "check-out"
  | "clock"
  | "wallet"
  | "receipt"
  | "calendar"
  | "alert"
  | "arrow-right"
  | "external"
  | "profile"
  | "building"
  | "user-plus"
  | "logout"
  | "briefcase"
  | "trend-up"
  | "check"
  | "info"
  | "home"
  | "bell"
  | "scan"
  | "document"
  | "help"
  | "download"
  | "edit"
  | "lock"
  | "refresh"
  | "chevron-right"
  | "map-pin"
  | "history"
  | "calendar-check"
  | "receipt-long";

interface IconPathProps {
  name: HrisIconName;
  className?: string;
}

const STROKE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function paths(name: HrisIconName) {
  switch (name) {
    case "dashboard":
      return (
        <>
          <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
          <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
          <rect x="13.5" y="12" width="7.5" height="9" rx="1.5" />
          <rect x="3" y="15.5" width="7.5" height="5.5" rx="1.5" />
        </>
      );
    case "face":
      return (
        <>
          <path d="M3 7a3 3 0 0 1 3-3h1M17 4h1a3 3 0 0 1 3 3v1M21 17v1a3 3 0 0 1-3 3h-1M7 21H6a3 3 0 0 1-3-3v-1" />
          <circle cx="9" cy="10" r="1" />
          <circle cx="15" cy="10" r="1" />
          <path d="M9.5 15a3.5 3.2 0 0 0 5 0" />
        </>
      );
    case "employees":
    case "users":
      return (
        <>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.8M17 13.6a5.5 5.5 0 0 1 3.8 5.4" />
        </>
      );
    case "attendance":
      return (
        <>
          <circle cx="12" cy="13" r="7.5" />
          <path d="M12 9.5V13l2.4 1.6" />
          <path d="M9 3h6" />
        </>
      );
    case "leave":
      return (
        <>
          <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
          <path d="M3.5 9.5h17" />
          <path d="M8 3v4M16 3v4" />
          <path d="M8 13h3M13 13h3M8 16.5h3M13 16.5h3" />
        </>
      );
    case "permission":
      return (
        <>
          <circle cx="12" cy="13" r="7.5" />
          <path d="M12 9.5V13l2.4 1.6" />
          <path d="M7 4.5l2 1.5" />
          <path d="M17 4.5l-2 1.5" />
        </>
      );
    case "payroll":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M15 15h3" />
        </>
      );
    case "payslip":
      return (
        <>
          <path d="M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v16L17 19.5l-2.5 1.5L12 19.5 9.5 21 7 19.5 4.5 21V5A1.5 1.5 0 0 1 6 3.5Z" />
          <path d="M9 8h6M9 11.5h6M9 15h3.5" />
        </>
      );
    case "announcements":
      return (
        <>
          <path d="M3 10.5v3a1.5 1.5 0 0 0 1.5 1.5H7l8.5 4.5a.9.9 0 0 0 1.3-.8V5.3a.9.9 0 0 0-1.3-.8L7 9H4.5A1.5 1.5 0 0 0 3 10.5Z" />
          <path d="M7 15v3.5a1.5 1.5 0 0 0 3 0V16" />
          <path d="M19.5 9.5a3.5 3.5 0 0 1 0 5" />
        </>
      );
    case "projects":
      return (
        <>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          <path d="M3 11h18" />
        </>
      );
    case "roles":
      return (
        <>
          <path d="M12 3 4 6v5c0 4.5 3.3 8.5 8 10 4.7-1.5 8-5.5 8-10V6Z" />
          <path d="M9.5 12l1.8 1.8 3.2-3.6" />
        </>
      );
    case "permissions":
      return (
        <>
          <circle cx="8" cy="14" r="4.5" />
          <path d="m11.2 11.2 8.3-8.3" />
          <path d="m18 3.5 2.5 2.5" />
        </>
      );
    case "work-locations":
      return (
        <>
          <path d="M12 21s-6.5-5.1-6.5-10.2A6.5 6.5 0 0 1 12 4.2a6.5 6.5 0 0 1 6.5 6.6C18.5 15.9 12 21 12 21Z" />
          <circle cx="12" cy="10.5" r="2.4" />
        </>
      );
    case "employee-fields":
      return (
        <>
          <path d="M4 6.5h16M4 12h16M4 17.5h10" />
          <circle cx="18.5" cy="17.5" r="2.2" />
        </>
      );
    case "test-data":
      return (
        <>
          <path d="M9 4.5h6M7 8h10l-.9 11.2a1.6 1.6 0 0 1-1.6 1.3H9.5a1.6 1.6 0 0 1-1.6-1.3Z" />
          <path d="m10.4 12.6 1.2 1.2 2-2.4" />
        </>
      );
    case "settings":
      return (
        <>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" />
        </>
      );
    case "check-in":
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M12 8v8" />
          <path d="M8.5 11.5 12 8l3.5 3.5" />
        </>
      );
    case "check-out":
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M12 16V8" />
          <path d="M15.5 12.5 12 16l-3.5-3.5" />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </>
      );
    case "wallet":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M15 15h3" />
        </>
      );
    case "receipt":
      return (
        <>
          <path d="M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v16L17 19.5l-2.5 1.5L12 19.5 9.5 21 7 19.5 4.5 21V5A1.5 1.5 0 0 1 6 3.5Z" />
          <path d="M9 8h6M9 11.5h6" />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </>
      );
    case "alert":
      return (
        <>
          <path d="M12 4 22 20H2Z" />
          <path d="M12 10v4" />
          <path d="M12 17h.01" />
        </>
      );
    case "arrow-right":
      return (
        <>
          <path d="M5 12h13" />
          <path d="m13 6 6 6-6 6" />
        </>
      );
    case "external":
      return (
        <>
          <path d="M14 4h6v6" />
          <path d="M20 4 11 13" />
          <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
        </>
      );
    case "profile":
      return (
        <>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
        </>
      );
    case "building":
      return (
        <>
          <path d="M4 21h16" />
          <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
          <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
        </>
      );
    case "user-plus":
      return (
        <>
          <circle cx="10" cy="8" r="3.2" />
          <path d="M4.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M18.5 9v6M15.5 12h6" />
        </>
      );
    case "logout":
      return (
        <>
          <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
          <path d="M14 12H4" />
          <path d="m10 8-4 4 4 4" />
          <path d="M19 12h-5" />
          <path d="m17 9 3 3-3 3" />
        </>
      );
    case "briefcase":
      return (
        <>
          <rect x="3" y="7.5" width="18" height="12" rx="2" />
          <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
          <path d="M3 12.5h18" />
        </>
      );
    case "trend-up":
      return (
        <>
          <path d="m4 16 5.5-5.5 3.5 3.5L20 8" />
          <path d="M15.5 8H20v4.5" />
        </>
      );
    case "check":
      return <path d="m5 12.5 4.5 4.5L19 7.5" />;
    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11v5" />
          <path d="M12 7.5h.01" />
        </>
      );
    case "home":
      return (
        <>
          <path d="M4 10.5 12 4l8 6.5" />
          <path d="M6 9.5V20h12V9.5" />
          <path d="M10 20v-5h4v5" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M6 9a6 6 0 0 1 12 0c0 4 1.2 5.3 1.8 6H4.2C4.8 14.3 6 13 6 9Z" />
          <path d="M10 18.5a2 2 0 0 0 4 0" />
        </>
      );
    case "scan":
      return (
        <>
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
          <path d="M8 12h8" />
        </>
      );
    case "document":
      return (
        <>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4" />
          <path d="M9 12h6M9 15.5h6M9 8.5h2" />
        </>
      );
    case "help":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.6 9.4a2.4 2.4 0 0 1 4.7.6c0 1.6-2.3 1.9-2.3 3.5" />
          <path d="M12 17h.01" />
        </>
      );
    case "download":
      return (
        <>
          <path d="M12 4v11" />
          <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
          <path d="M5 19h14" />
        </>
      );
    case "edit":
      return (
        <>
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
          <path d="m14.5 6.5 3 3" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
          <path d="M12 14.5v2" />
        </>
      );
    case "refresh":
      return (
        <>
          <path d="M20 11a8 8 0 0 0-14.3-4" />
          <path d="M4 5v4h4" />
          <path d="M4 13a8 8 0 0 0 14.3 4" />
          <path d="M20 19v-4h-4" />
        </>
      );
    case "chevron-right":
      return <path d="m9 6 6 6-6 6" />;
    case "map-pin":
      return (
        <>
          <path d="M12 21s-6.8-5.4-6.8-10.6A6.8 6.8 0 0 1 12 3.6a6.8 6.8 0 0 1 6.8 6.8C18.8 15.6 12 21 12 21Z" />
          <circle cx="12" cy="10.3" r="2.4" />
        </>
      );
    case "history":
      return (
        <>
          <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
          <path d="M4 4v3.8h3.8" />
          <path d="M12 8v4.5l3 1.8" />
        </>
      );
    case "calendar-check":
      return (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
          <path d="m9 15 1.8 1.8L14.5 13" />
        </>
      );
    case "receipt-long":
      return (
        <>
          <path d="M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v16L17 19.5l-2.5 1.5L12 19.5 9.5 21 7 19.5 4.5 21V5A1.5 1.5 0 0 1 6 3.5Z" />
          <path d="M9 8h6M9 11.5h6M9 15h4" />
        </>
      );
    default:
      return null;
  }
}

/** Render an HRIS icon by name (stroke-based, consistent line style). */
export function HrisIcon({ name, className = "size-5" }: IconPathProps) {
  return (
    <svg
      {...STROKE}
      className={className}
      aria-hidden="true"
      data-icon={name}
    >
      {paths(name)}
    </svg>
  );
}

export const NavIcon: typeof HrisIcon = HrisIcon;