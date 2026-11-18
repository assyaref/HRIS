/**
 * Pure rules for the time-management module (holidays, shifts, overtime).
 * No database or framework imports, so they are unit-tested directly.
 */

export const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight for "HH:MM", or null when malformed. */
export function clockMinutes(value: string): number | null {
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Duration between two clock times. An end at or before the start crosses
 * midnight (22:00 → 02:00 = 240). Equal times are invalid (null) because a
 * 24-hour overtime is never what was meant.
 */
export function spanMinutes(start: string, end: string): number | null {
  const a = clockMinutes(start);
  const b = clockMinutes(end);
  if (a === null || b === null || a === b) return null;
  return b > a ? b - a : b + 24 * 60 - a;
}

/** Overtime longer than this in one request is rejected (12 hours). */
export const MAX_OVERTIME_MINUTES = 12 * 60;

/** Paid work time of a shift: span minus break, never negative. */
export function shiftWorkMinutes(start: string, end: string, breakMinutes: number): number | null {
  const span = spanMinutes(start, end);
  if (span === null) return null;
  return Math.max(0, span - Math.max(0, breakMinutes));
}

/** "2 j 30 m", "45 m", "3 j". */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} j` : `${h} j ${m} m`;
}

export const WEEKDAYS = [
  { value: 1, short: "Sen", label: "Senin" },
  { value: 2, short: "Sel", label: "Selasa" },
  { value: 3, short: "Rab", label: "Rabu" },
  { value: 4, short: "Kam", label: "Kamis" },
  { value: 5, short: "Jum", label: "Jumat" },
  { value: 6, short: "Sab", label: "Sabtu" },
  { value: 7, short: "Min", label: "Minggu" },
] as const;

/** "1,2,3" → [1,2,3]; keeps only 1–7, sorted and unique. */
export function parseWorkingDays(value: string): number[] {
  const days = new Set<number>();
  for (const part of value.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n >= 1 && n <= 7) days.add(n);
  }
  return [...days].sort((a, b) => a - b);
}

/** [1,2,3,4,5] → "Sen–Jum"; scattered days are listed. */
export function workingDaysLabel(days: number[]): string {
  if (days.length === 0) return "—";
  if (days.length === 7) return "Setiap hari";
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const short = (d: number) => WEEKDAYS[d - 1]?.short ?? String(d);
  if (contiguous && days.length > 2) return `${short(days[0])}–${short(days[days.length - 1])}`;
  return days.map(short).join(", ");
}

export const HOLIDAY_TYPE_LABELS: Record<string, string> = {
  national: "Libur nasional",
  collective_leave: "Cuti bersama",
  company: "Libur perusahaan",
};
export const HOLIDAY_TYPE_COLORS: Record<string, string> = {
  national: "#EF4444",
  collective_leave: "#F59E0B",
  company: "#3B82F6",
};

export const OVERTIME_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};
export const OVERTIME_STATUS_BADGE: Record<string, "warning" | "success" | "danger" | "outline"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "outline",
};

/** Calendar grid for a month: weeks of 7 "YYYY-MM-DD" (or null) cells, Monday first. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** ISO weekday (1 = Monday … 7 = Sunday) of "YYYY-MM-DD". */
export function isoWeekday(day: string): number {
  const d = new Date(`${day}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Totals by status over a list (minutes count approved requests only). */
export function summarizeOvertime(rows: { status: string; totalMinutes: number }[]) {
  const summary = { total: rows.length, pending: 0, approved: 0, rejected: 0, cancelled: 0, approvedMinutes: 0 };
  for (const row of rows) {
    if (row.status === "pending") summary.pending += 1;
    else if (row.status === "approved") {
      summary.approved += 1;
      summary.approvedMinutes += row.totalMinutes;
    } else if (row.status === "rejected") summary.rejected += 1;
    else if (row.status === "cancelled") summary.cancelled += 1;
  }
  return summary;
}
