/**
 * Display helpers for attendance times/dates (Phase 6).
 *
 * Times are stored as UTC instants. For display we render them in the
 * work-location timezone (when known) so a WIB site shows WIB times.
 * Inputs may be `Date` or raw PostgreSQL text (see `toInstant`); missing or
 * malformed values render as "—" instead of throwing.
 */

import { toInstant } from "../../lib/utils/instant.ts";

type InstantInput = Date | string | null | undefined;

export function formatDate(input: InstantInput): string {
  const value = toInstant(input);
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

export function formatTime(
  input: InstantInput,
  timeZone?: string | null
): string {
  const value = toInstant(input);
  if (!value) return "—";
  const zone = timeZone && timeZone.trim() !== "" ? timeZone : "UTC";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(value);
  } catch {
    return value.toISOString().slice(11, 16);
  }
}

export function formatDateTime(
  value: Date,
  timeZone?: string | null
): string {
  return `${formatDate(value)} ${formatTime(value, timeZone)}`;
}

export function metersLabel(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)} m`;
}
