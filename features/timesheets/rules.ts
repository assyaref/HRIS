/**
 * Timesheet rules — PURE (no framework imports; unit-tested).
 */

/** Monday ("YYYY-MM-DD") of the ISO week containing `day`. */
export function weekStartOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (iso - 1));
  return d.toISOString().slice(0, 10);
}

/** The 7 days Monday → Sunday of the week starting `weekStart`. */
export function weekDays(weekStart: string): string[] {
  const out: string[] = [];
  const d = new Date(`${weekStart}T00:00:00Z`);
  for (let i = 0; i < 7; i += 1) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function shiftWeek(weekStart: string, delta: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

/** ISO week number and year of a Monday, e.g. { year: 2026, week: 47 }. */
export function isoWeek(weekStart: string): { year: number; week: number } {
  const thursday = new Date(`${weekStart}T00:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3); // the Thursday decides the ISO year
  const year = thursday.getUTCFullYear();
  const dayOfYear = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000);
  return { year, week: Math.floor(dayOfYear / 7) + 1 };
}

/** "1:30" / "1.5" / "90m" / "2" (hours) → minutes; null when invalid. */
export function parseDuration(value: string): number | null {
  const v = value.trim().toLowerCase().replace(",", ".");
  let minutes: number;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(v))) minutes = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d{1,4})\s*m(enit)?$/.exec(v))) minutes = Number(m[1]);
  else if ((m = /^(\d{1,2}(\.\d{1,2})?)\s*(j|jam|h)?$/.exec(v))) minutes = Math.round(Number(m[1]) * 60);
  else return null;
  return minutes > 0 && minutes <= MAX_MINUTES_PER_DAY ? minutes : null;
}

/** One entry may not exceed 16 h; a day is capped at 24 h in total. */
export const MAX_MINUTES_PER_DAY = 16 * 60;
export const MAX_MINUTES_DAY_TOTAL = 24 * 60;

/** "7 j 30 m" → "7:30" style for compact tables. */
export function hhmm(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draf",
  submitted: "Diajukan",
  approved: "Disetujui",
  rejected: "Ditolak",
};
export const STATUS_BADGE: Record<string, "outline" | "warning" | "success" | "danger"> = {
  draft: "outline",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
};

/**
 * Week status from its entries: any rejected → rejected; else any draft →
 * draft (still editable); else any submitted → submitted; else approved
 * (or "empty").
 */
export function weekStatus(statuses: readonly string[]): "empty" | "draft" | "submitted" | "approved" | "rejected" {
  if (statuses.length === 0) return "empty";
  if (statuses.includes("rejected")) return "rejected";
  if (statuses.includes("draft")) return "draft";
  if (statuses.includes("submitted")) return "submitted";
  return "approved";
}

/** Entries of a week can be edited while draft or rejected. */
export function isEditable(status: string): boolean {
  return status === "draft" || status === "rejected";
}

/** A valid ?week= value snapped to its Monday, else the current week. */
export function weekParam(value: string | string[] | undefined, today: string): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) return weekStartOf(v);
  return weekStartOf(today);
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "16 – 22 Nov 2026" */
export function weekLabel(weekStart: string): string {
  const days = weekDays(weekStart);
  const a = days[0];
  const b = days[6];
  const fmt = (d: string, withYear: boolean) =>
    `${Number(d.slice(8, 10))} ${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}${withYear ? ` ${d.slice(0, 4)}` : ""}`;
  return a.slice(0, 7) === b.slice(0, 7)
    ? `${Number(a.slice(8, 10))} – ${fmt(b, true)}`
    : `${fmt(a, a.slice(0, 4) !== b.slice(0, 4))} – ${fmt(b, true)}`;
}
