/** Leave display helpers (Phase 7). */

export function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

export function formatDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Inclusive calendar-day difference between two date-only strings. */
export function inclusiveDayCount(
  startDate: string,
  endDate: string
): number | null {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const days = Math.round((end - start) / 86_400_000) + 1;
  return days > 0 ? days : null;
}

export function formatDayCount(value: number | null): string {
  if (value === null || value === undefined) return "—";
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted} day${value === 1 ? "" : "s"}`;
}
