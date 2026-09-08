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

/**
 * PHASE 10.7C-55 — End-of-attendance-day expiration helper.
 *
 * Expiration semantics: a same-day attendance photo is readable while
 * `now < expiresAt` and expired at `now >= expiresAt` (half-open interval).
 * `expiresAt` is the FIRST INSTANT of the NEXT attendance day expressed in
 * the work-location IANA time zone — the local next midnight. It is NOT
 * `capturedAt + 24h` and NOT the server's local midnight.
 *
 * The `attendanceDate` argument follows the repository's `date`-column
 * convention: a `Date` whose UTC calendar date IS the attendance day label
 * (e.g. `2026-09-08` → `2026-09-08T00:00:00.000Z`, as produced by
 * `parseAttendanceDate`). The label is therefore read from the UTC fields of
 * the argument, not re-derived in the target zone (a negative-offset zone
 * would otherwise shift the label backwards).
 *
 * DST safety: the local-midnight instant is computed as the fixed point
 * `I = nextUtcMidnight - offset(zone, I)`, which converges because real-world
 * IANA transitions do not occur at local midnight; an invalid/unknown zone
 * falls back to UTC semantics (next UTC midnight), mirroring
 * `dateStringInTimeZone`'s deterministic fallback.
 */

interface TimeZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function timeZonePartsAt(
  timeZone: string,
  instant: Date
): TimeZoneParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return Number(found?.value ?? "0");
  };

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** Fixed UTC-offset of `instant` in `timeZone` (east-positive minutes). */
function timeZoneOffsetMinutes(timeZone: string, instant: Date): number {
  const local = timeZonePartsAt(timeZone, instant);
  const localAsUtcMs = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second
  );
  const utcMs = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
    instant.getUTCHours(),
    instant.getUTCMinutes(),
    instant.getUTCSeconds()
  );
  return Math.round((localAsUtcMs - utcMs) / 60000);
}

/**
 * The first instant of the day AFTER the attendance day label, in `timeZone`.
 *
 * Example (Asia/Jakarta, UTC+7):
 *   attendanceDate = 2026-09-08 (label) → expiresAt = 2026-09-08T17:00:00.000Z
 *   (== 2026-09-09 00:00:00 +07:00). NOT 2026-09-09T00:00Z.
 */
export function endOfAttendanceDay(
  attendanceDate: Date,
  timeZone?: string | null
): Date {
  const zone = timeZone && timeZone.trim() !== "" ? timeZone : FALLBACK_TIME_ZONE;
  const time = attendanceDate.getTime();
  if (!Number.isFinite(time)) {
    return new Date(NaN);
  }

  // The attendance day label is the UTC calendar date of the stored value.
  const nextUtcMidnight = Date.UTC(
    attendanceDate.getUTCFullYear(),
    attendanceDate.getUTCMonth(),
    attendanceDate.getUTCDate() + 1
  );

  // Local next midnight: I = nextUtcMidnight − offset(zone, I).
  // Iterate to a fixed point; a zone that cannot be parsed falls back to UTC.
  let result = nextUtcMidnight;
  try {
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const offset = timeZoneOffsetMinutes(zone, new Date(result));
      const next = nextUtcMidnight - offset * 60000;
      if (next === result) break;
      result = next;
    }
  } catch {
    // Unknown/invalid IANA identifier: UTC semantics (next UTC midnight).
    result = nextUtcMidnight;
  }

  return new Date(result);
}
