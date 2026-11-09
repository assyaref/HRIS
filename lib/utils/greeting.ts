/**
 * Time-of-day helpers for the greeting hero.
 *
 * Servers (a VPS) usually run in UTC, so the greeting is computed in the
 * organization's time zone instead of the server clock. Override with
 * `NEXT_PUBLIC_APP_TIME_ZONE`; defaults to Asia/Jakarta (WIB).
 */
export const APP_TIME_ZONE =
  process.env.NEXT_PUBLIC_APP_TIME_ZONE?.trim() || "Asia/Jakarta";

/** Hour of day (0–23) in the app time zone. */
export function hourInAppZone(date: Date = new Date()): number {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: APP_TIME_ZONE,
      hour: "2-digit",
      hour12: false,
    }).format(date);
    return Number.parseInt(hour, 10) % 24;
  } catch {
    return date.getHours();
  }
}

/** "Selamat Pagi" / "Siang" / "Sore" / "Malam" for the app time zone. */
export function indonesianGreeting(date: Date = new Date()): string {
  const hour = hourInAppZone(date);
  if (hour >= 4 && hour < 11) return "Selamat Pagi";
  if (hour >= 11 && hour < 15) return "Selamat Siang";
  if (hour >= 15 && hour < 19) return "Selamat Sore";
  return "Selamat Malam";
}

/** "Senin, 9 November 2026" in the app time zone. */
export function longDateLabel(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Up to two initials from a display name ("Syarif Hidayatullah" → "SH"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}
