/**
 * Attendance date/time helpers (Phase 6).
 *
 * The *instant* of check-in/out is always the server time (`new Date()` at the
 * action boundary). The *calendar day* an attendance belongs to is derived in
 * the work-location timezone (fallback: UTC) so a WIB site does not split
 * attendance across the UTC midnight.
 */

const FALLBACK_TIME_ZONE = "UTC";

/** Build a `YYYY-MM-DD` string for `date` in the given IANA time zone. */
export function dateStringInTimeZone(
  date: Date,
  timeZone: string | null | undefined
): string {
  const zone = timeZone && timeZone.trim() !== "" ? timeZone : FALLBACK_TIME_ZONE;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const values: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") values[part.type] = part.value;
    }
    const year = values.year ?? "1970";
    const month = values.month ?? "01";
    const day = values.day ?? "01";
    return `${year}-${month}-${day}`;
  } catch {
    // Unknown/invalid time zone: fall back to UTC deterministically.
    return date.toISOString().slice(0, 10);
  }
}

/** Parse a `YYYY-MM-DD` string into a UTC-midnight Date (for `date` columns). */
export function parseAttendanceDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
