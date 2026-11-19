/**
 * Agenda rules — PURE (unit-tested).
 */

import { nameKey } from "../org-master/rules.ts";

export const CATEGORY_LABELS: Record<string, string> = {
  meeting: "Rapat",
  training: "Training",
  event: "Acara",
  other: "Lainnya",
};
export const CATEGORY_COLORS: Record<string, string> = {
  meeting: "#3B82F6",
  training: "#8B5CF6",
  event: "#F59E0B",
  other: "#64748B",
};
export const RESPONSE_LABELS: Record<string, string> = {
  going: "Hadir",
  maybe: "Mungkin",
  not_going: "Tidak hadir",
};

/** Whether an event is meant for an employee of `department`. */
export function isForDepartment(audience: readonly string[], department: string | null): boolean {
  if (audience.length === 0) return true;
  if (!department) return false;
  const key = nameKey(department);
  return audience.some((d) => nameKey(d) === key);
}

export interface RsvpCount {
  going: number;
  maybe: number;
  notGoing: number;
  pending: number;
}

/** Counts answers against the invited employees (answers from others are ignored). */
export function rsvpSummary(invitedIds: readonly string[], responses: readonly { employeeId: string; response: string }[]): RsvpCount {
  const invited = new Set(invitedIds);
  const answered = new Map<string, string>();
  for (const r of responses) if (invited.has(r.employeeId)) answered.set(r.employeeId, r.response);
  let going = 0;
  let maybe = 0;
  let notGoing = 0;
  for (const value of answered.values()) {
    if (value === "going") going += 1;
    else if (value === "maybe") maybe += 1;
    else if (value === "not_going") notGoing += 1;
  }
  return { going, maybe, notGoing, pending: invited.size - answered.size };
}

/** "08:00" style validation for the time inputs. */
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Splits a department list typed or picked as "A, B" into clean names. */
export function parseAudience(values: readonly string[]): string[] {
  const out = new Map<string, string>();
  for (const v of values) {
    for (const part of v.split(",")) {
      const clean = part.trim().replace(/\s+/g, " ");
      if (clean && !out.has(nameKey(clean))) out.set(nameKey(clean), clean);
    }
  }
  return [...out.values()].slice(0, 50);
}

const TZ = "Asia/Jakarta";
const dateFmt = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/** "YYYY-MM-DD" of an instant in WIB. */
export function wibDay(instant: Date): string {
  return dayKeyFmt.format(instant);
}

/** "HH:MM" of an instant in WIB. */
export function wibTime(instant: Date): string {
  return timeFmt.format(instant).replace(".", ":");
}

/** Human time range, e.g. "Senin, 23 November 2026 · 09:00–10:00 WIB". */
export function whenLabel(startAt: Date, endAt: Date, allDay: boolean): string {
  const sameDay = wibDay(startAt) === wibDay(endAt);
  if (allDay) return sameDay ? `${dateFmt.format(startAt)} · sepanjang hari` : `${dateFmt.format(startAt)} – ${dateFmt.format(endAt)}`;
  return sameDay
    ? `${dateFmt.format(startAt)} · ${wibTime(startAt)}–${wibTime(endAt)} WIB`
    : `${dateFmt.format(startAt)} ${wibTime(startAt)} – ${dateFmt.format(endAt)} ${wibTime(endAt)} WIB`;
}
