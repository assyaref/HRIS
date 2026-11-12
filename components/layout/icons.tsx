import type { NavIconKey } from "@/types/navigation";

/**
 * HRIS Lite Enterprise v2.0 icon set.
 *
 * One consistent outline vocabulary (24px grid, 1.8 stroke, round caps) used
 * by the navigation shell, dashboards and pages. Inline SVG — no external
 * icon package is required. Every legacy name is kept so existing pages keep
 * rendering; v2 adds the glyphs used by the redesigned shell.
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
  | "receipt-long"
  // v2 additions
  | "plane"
  | "clipboard"
  | "network"
  | "layers"
  | "megaphone"
  | "users-cog"
  | "link"
  | "fingerprint"
  | "qr-scan"
  | "target"
  | "search"
  | "menu"
  | "chevron-down"
  | "chevron-left"
  | "close"
  | "alert-triangle"
  | "bar-chart"
  | "user"
  | "sun"
  | "moon"
  | "sparkles"
  // v3 additions (mobile home + face attendance sheet)
  | "droplet"
  | "grid"
  | "mosque"
  | "camera"
  // v4 additions (employee profile)
  | "mail"
  | "phone"
  | "key"
  | "shield"
  | "sliders";

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
    case "home":
      return (
        <>
          <path d="M3 10.2 12 3l9 7.2" />
          <path d="M5 9v10.5A1.5 1.5 0 0 0 6.5 21H10v-6h4v6h3.5a1.5 1.5 0 0 0 1.5-1.5V9" />
        </>
      );
    case "face":
      return (
        <>
          <path d="M3 7.5V6a3 3 0 0 1 3-3h1.5M16.5 3H18a3 3 0 0 1 3 3v1.5M21 16.5V18a3 3 0 0 1-3 3h-1.5M7.5 21H6a3 3 0 0 1-3-3v-1.5" />
          <path d="M9 9.5v1M15 9.5v1" />
          <path d="M12 9.5v3.5h-1" />
          <path d="M9.5 16a3.6 3.6 0 0 0 5 0" />
        </>
      );
    case "employees":
    case "users":
      return (
        <>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
          <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
          <path d="M18 14.2a6.2 6.2 0 0 1 3.2 5.8" />
        </>
      );
    case "profile":
    case "user":
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </>
      );
    case "attendance":
    case "calendar-check":
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v3M16 3v3" />
          <path d="m9 15 2 2 4-4" />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v3M16 3v3" />
          <path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" />
        </>
      );
    case "leave":
    case "plane":
      return (
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
      );
    case "permission":
    case "clipboard":
      return (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2.5" />
          <path d="M9 4V3h6v1M9 4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1" />
          <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
        </>
      );
    case "payroll":
    case "wallet":
      return (
        <>
          <path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v3" />
          <path d="M3 6v12a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
          <path d="M21 12v4h-4a2 2 0 0 1 0-4z" />
        </>
      );
    case "payslip":
    case "receipt":
    case "receipt-long":
      return (
        <>
          <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" />
          <path d="M9 8h6M9 11.5h6M9 15h3.5" />
        </>
      );
    case "announcements":
    case "megaphone":
      return (
        <>
          <path d="m3 11 15-6v14L3 13z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
          <path d="M21 9v4" />
        </>
      );
    case "organizations":
    case "network":
      return (
        <>
          <rect x="9" y="2.5" width="6" height="5" rx="1.2" />
          <rect x="2.5" y="16.5" width="6" height="5" rx="1.2" />
          <rect x="15.5" y="16.5" width="6" height="5" rx="1.2" />
          <path d="M12 7.5V12M5.5 16.5V14a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v2.5" />
        </>
      );
    case "projects":
    case "layers":
      return (
        <>
          <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
          <path d="m3 12 9 4.5 9-4.5" />
          <path d="m3 16.5 9 4.5 9-4.5" />
        </>
      );
    case "roles":
    case "users-cog":
      return (
        <>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.8 20a6.2 6.2 0 0 1 9.7-5.1" />
          <circle cx="18" cy="17" r="2.2" />
          <path d="M18 13.3v1.5M18 19.2v1.5M21.2 15.2l-1.3.7M16.1 18.1l-1.3.7M21.2 18.8l-1.3-.7M16.1 15.9l-1.3-.7" />
        </>
      );
    case "permissions":
    case "lock":
      return (
        <>
          <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          <path d="M12 14.5v2.5" />
        </>
      );
    case "work-locations":
    case "map-pin":
      return (
        <>
          <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </>
      );
    case "employee-fields":
    case "document":
      return (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </>
      );
    case "test-data":
      return (
        <>
          <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
          <path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
          <path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
        </>
      );
    case "settings":
      return (
        <>
          <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.6a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.6a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </>
      );
    case "check-in":
      return (
        <>
          <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
          <path d="M10 17l5-5-5-5M15 12H4" />
        </>
      );
    case "check-out":
    case "logout":
      return (
        <>
          <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
          <path d="m16 17 5-5-5-5M21 12H9" />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
    case "history":
      return (
        <>
          <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
          <path d="M3 3v5h5M12 7v5l3 2" />
        </>
      );
    case "alert":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4.5M12 16h.01" />
        </>
      );
    case "alert-triangle":
      return (
        <>
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          <path d="M12 9v4M12 17h.01" />
        </>
      );
    case "arrow-right":
      return <path d="M5 12h14M13 6l6 6-6 6" />;
    case "external":
      return (
        <>
          <path d="M14 4h6v6M20 4l-9 9" />
          <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
        </>
      );
    case "building":
      return (
        <>
          <path d="M4 21V9l5-3v15M9 21V4l7-1.5V21M16 8l4 2v11" />
          <path d="M3 21h18M12 7h1M12 10.5h1M12 14h1M6 12h1M6 15.5h1" />
        </>
      );
    case "user-plus":
      return (
        <>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0M19 8v6M16 11h6" />
        </>
      );
    case "briefcase":
      return (
        <>
          <rect x="3" y="7" width="18" height="13" rx="2.5" />
          <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18" />
        </>
      );
    case "trend-up":
      return (
        <>
          <path d="m3 17 6-6 4 4 8-8" />
          <path d="M15 7h6v6" />
        </>
      );
    case "bar-chart":
      return (
        <>
          <path d="M6 20V12M12 20V5M18 20v-9" />
        </>
      );
    case "check":
      return <path d="m5 12.5 4.5 4.5L19 7.5" />;
    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5.5M12 7.5h.01" />
        </>
      );
    case "help":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.2a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.2-2.5 3.8M12 17h.01" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15 6 8.5z" />
          <path d="M10.3 20.5a2 2 0 0 0 3.4 0" />
        </>
      );
    case "scan":
    case "qr-scan":
      return (
        <>
          <path d="M3 7.5V5a2 2 0 0 1 2-2h2.5M16.5 3H19a2 2 0 0 1 2 2v2.5M21 16.5V19a2 2 0 0 1-2 2h-2.5M7.5 21H5a2 2 0 0 1-2-2v-2.5" />
          <rect x="7" y="7" width="4" height="4" rx=".6" />
          <rect x="13" y="7" width="4" height="4" rx=".6" />
          <rect x="7" y="13" width="4" height="4" rx=".6" />
          <path d="M13 13h1.5v1.5M17 13v.01M13 17h4v-2" />
        </>
      );
    case "droplet":
      return (
        <path d="M12 3.5c-2.6 3.1-6 7-6 10.4a6 6 0 0 0 12 0c0-3.4-3.4-7.3-6-10.4Z" />
      );
    case "grid":
      return (
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
        </>
      );
    case "mosque":
      return (
        <>
          <path d="M3.5 20.5h17" />
          <path d="M5 20.5v-7.5M19 20.5v-7.5" />
          <path d="M5 13h14" />
          <path d="M7.5 13a4.5 4.5 0 0 1 9 0" />
          <path d="M12 8.5V6.5M11 5.5h2" />
          <path d="M10 20.5V17a2 2 0 0 1 4 0v3.5" />
        </>
      );
    case "camera":
      return (
        <>
          <path d="M4 8.8A1.8 1.8 0 0 1 5.8 7H8l1.3-2h5.4L16 7h2.2A1.8 1.8 0 0 1 20 8.8v8.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 17.2z" />
          <circle cx="12" cy="13" r="3.4" />
        </>
      );
    case "fingerprint":
      return (
        <>
          <path d="M12 10a2 2 0 0 0-2 2c0 1.6-.2 3.2-.6 4.7" />
          <path d="M14 13.1c0 2.4 0 4.9-1 7.4" />
          <path d="M17.3 19.8c.2-1.2.6-3.5.7-5.8" />
          <path d="M2 12a10 10 0 0 1 18-6" />
          <path d="M2 16h.01M21.8 16c.2-2 .1-5.3 0-6" />
          <path d="M5 19.5c.5-1.5 1-3 1-7.5a6 6 0 0 1 .3-2" />
          <path d="M8.6 21.9c.2-.7.5-1.3.6-2" />
          <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
        </>
      );
    case "target":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.5" />
          <circle cx="12" cy="12" r="2" />
        </>
      );
    case "download":
      return (
        <>
          <path d="M12 4v11M7 10.5l5 5 5-5" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </>
      );
    case "edit":
      return (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </>
      );
    case "refresh":
      return (
        <>
          <path d="M20 11a8 8 0 0 0-14.6-4.5L3 9" />
          <path d="M3 4v5h5" />
          <path d="M4 13a8 8 0 0 0 14.6 4.5L21 15" />
          <path d="M21 20v-5h-5" />
        </>
      );
    case "chevron-right":
      return <path d="m9 6 6 6-6 6" />;
    case "chevron-left":
      return <path d="m15 6-6 6 6 6" />;
    case "chevron-down":
      return <path d="m6 9 6 6 6-6" />;
    case "close":
      return <path d="M18 6 6 18M6 6l12 12" />;
    case "menu":
      return <path d="M4 6.5h16M4 12h16M4 17.5h16" />;
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </>
      );
    case "link":
      return (
        <>
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </>
      );
    case "sun":
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      );
    case "moon":
      return <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />;
    case "sparkles":
      return (
        <>
          <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
        </>
      );
    case "mail":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2.2" />
          <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
        </>
      );
    case "phone":
      return (
        <path d="M5 3.5h3.2l1.6 4.2-2.1 1.4a11.5 11.5 0 0 0 7.2 7.2l1.4-2.1 4.2 1.6V19a1.8 1.8 0 0 1-1.9 1.8A16.6 16.6 0 0 1 3.2 5.4 1.8 1.8 0 0 1 5 3.5z" />
      );
    case "key":
      return (
        <>
          <circle cx="8" cy="15" r="4.5" />
          <path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14.5 8.5l2 2" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M12 3 4.5 6v5.6c0 4.5 3.1 8.2 7.5 9.4 4.4-1.2 7.5-4.9 7.5-9.4V6z" />
          <path d="m9 12 2.2 2.2L15.5 10" />
        </>
      );
    case "sliders":
      return (
        <>
          <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="17" r="2" />
        </>
      );
    default:
      return null;
  }
}

/** Render an HRIS icon by name (stroke-based, consistent line style). */
export function HrisIcon({ name, className = "size-5" }: IconPathProps) {
  return (
    <svg {...STROKE} className={className} aria-hidden="true" data-icon={name}>
      {paths(name)}
    </svg>
  );
}
