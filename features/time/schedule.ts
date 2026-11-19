/**
 * Shift-aware attendance evaluation — PURE (no DB / framework imports).
 *
 * For each employee in a work group, every day of a period is compared with
 * the group's shift and the holiday calendar:
 *
 *   not a scheduled day (shift working days)      → "off"   (attendance there = "extra")
 *   holiday                                       → "holiday" (attendance there = "extra")
 *   outside the employment window                 → "not_employed"
 *   accepted attendance (present | completed)     → "present", with late / early minutes
 *   approved leave / approved permission          → "leave" / "permission"
 *   day still to come                             → "upcoming"
 *   otherwise                                     → "absent"
 *
 * Late = check-in after shift start + grace. Early leave = check-out before
 * shift end (an end at or before the start is on the next day). Times are
 * evaluated in the attendance's work-location time zone.
 */

import { clockMinutes, isoWeekday } from "./rules.ts";

export type DayKind =
  | "present"
  | "absent"
  | "leave"
  | "permission"
  | "holiday"
  | "off"
  | "not_employed"
  | "upcoming";

export interface ShiftSpec {
  startTime: string;
  endTime: string;
  workingDays: number[];
}

export interface AttendanceFact {
  /** "YYYY-MM-DD" (attendance_date). */
  day: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  timeZone: string;
}

export interface DayResult {
  day: string;
  kind: DayKind;
  lateMinutes: number;
  earlyMinutes: number;
  /** Attended a holiday or a non-scheduled day. */
  extra: boolean;
  missingCheckOut: boolean;
}

export interface EmployeeScheduleInput {
  shift: ShiftSpec;
  days: string[];
  today: string;
  hireDate: string | null;
  endDate: string | null;
  holidays: ReadonlySet<string>;
  attendance: ReadonlyMap<string, AttendanceFact>;
  leaveDays: ReadonlySet<string>;
  permissionDays: ReadonlySet<string>;
  graceMinutes: number;
}

export interface ScheduleSummary {
  scheduled: number;
  present: number;
  absent: number;
  leave: number;
  permission: number;
  late: number;
  lateMinutes: number;
  early: number;
  earlyMinutes: number;
  extra: number;
  missingCheckOut: number;
  /** present / (scheduled days so far) × 100, 1 decimal; null when nothing scheduled yet. */
  attendanceRate: number | null;
  /** on-time present days / present days × 100, 1 decimal. */
  punctualityRate: number | null;
}

/** All "YYYY-MM-DD" days from `from` to `to` inclusive (max 62). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && out.length < 62) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Offset (minutes, local − UTC) of `timeZone` at `instant`. */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/** The UTC instant of local `day` + `minutes` past midnight in `timeZone`. */
export function localInstant(day: string, minutes: number, timeZone: string): Date {
  const naive = new Date(`${day}T00:00:00Z`).getTime() + minutes * 60000;
  const offset = zoneOffsetMinutes(new Date(naive), timeZone);
  const guess = naive - offset * 60000;
  // Re-check once around DST changes.
  const offset2 = zoneOffsetMinutes(new Date(guess), timeZone);
  return new Date(naive - offset2 * 60000);
}

export function evaluateDay(input: EmployeeScheduleInput, day: string): DayResult {
  const base = { day, lateMinutes: 0, earlyMinutes: 0, extra: false, missingCheckOut: false };
  const fact = input.attendance.get(day);
  const attended = Boolean(fact?.checkInAt);
  if ((input.hireDate && day < input.hireDate) || (input.endDate && day > input.endDate)) {
    return { ...base, kind: "not_employed" };
  }
  if (input.holidays.has(day)) return { ...base, kind: "holiday", extra: attended };
  if (!input.shift.workingDays.includes(isoWeekday(day))) return { ...base, kind: "off", extra: attended };

  if (fact && fact.checkInAt) {
    const start = clockMinutes(input.shift.startTime) ?? 0;
    const endClock = clockMinutes(input.shift.endTime) ?? 0;
    const endMinutes = endClock <= start ? endClock + 24 * 60 : endClock;
    const expectedStart = localInstant(day, start, fact.timeZone);
    const expectedEnd = localInstant(day, endMinutes, fact.timeZone);
    const lateBy = Math.floor((fact.checkInAt.getTime() - expectedStart.getTime()) / 60000);
    const lateMinutes = lateBy > Math.max(0, input.graceMinutes) ? lateBy : 0;
    const earlyBy = fact.checkOutAt ? Math.floor((expectedEnd.getTime() - fact.checkOutAt.getTime()) / 60000) : 0;
    return {
      ...base,
      kind: "present",
      lateMinutes,
      earlyMinutes: earlyBy > 0 ? earlyBy : 0,
      missingCheckOut: !fact.checkOutAt && day < input.today,
    };
  }
  if (input.leaveDays.has(day)) return { ...base, kind: "leave" };
  if (input.permissionDays.has(day)) return { ...base, kind: "permission" };
  if (day >= input.today) return { ...base, kind: "upcoming" };
  return { ...base, kind: "absent" };
}

export function evaluateEmployee(input: EmployeeScheduleInput): { days: DayResult[]; summary: ScheduleSummary } {
  const days = input.days.map((day) => evaluateDay(input, day));
  const count = (kind: DayKind) => days.filter((d) => d.kind === kind).length;
  const present = days.filter((d) => d.kind === "present");
  const late = present.filter((d) => d.lateMinutes > 0);
  const early = present.filter((d) => d.earlyMinutes > 0);
  const scheduled = days.filter((d) => ["present", "absent", "leave", "permission", "upcoming"].includes(d.kind)).length;
  const due = days.filter((d) => ["present", "absent", "leave", "permission"].includes(d.kind)).length;
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    days,
    summary: {
      scheduled,
      present: present.length,
      absent: count("absent"),
      leave: count("leave"),
      permission: count("permission"),
      late: late.length,
      lateMinutes: late.reduce((s, d) => s + d.lateMinutes, 0),
      early: early.length,
      earlyMinutes: early.reduce((s, d) => s + d.earlyMinutes, 0),
      extra: days.filter((d) => d.extra).length,
      missingCheckOut: days.filter((d) => d.missingCheckOut).length,
      attendanceRate: due > 0 ? round((present.length / due) * 100) : null,
      punctualityRate: present.length > 0 ? round(((present.length - late.length) / present.length) * 100) : null,
    },
  };
}

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  present: "Hadir",
  absent: "Alpa",
  leave: "Cuti",
  permission: "Izin",
  holiday: "Libur",
  off: "Bukan hari kerja",
  not_employed: "Belum/tidak bekerja",
  upcoming: "Akan datang",
};
