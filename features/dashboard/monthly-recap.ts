/**
 * Dashboard recap math — PURE (no database, no "server-only").
 *
 * The "Ringkasan Bulan Ini" card must never disagree with the Attendance
 * Recap module, so it reuses that module's rules verbatim
 * (`features/attendance/recap.ts`):
 * - working day = Mon–Fri, clipped to the employment window
 *   [hire_date, LEAST(termination_date, resignation_date)];
 * - precedence: accepted attendance (present|completed) → sick leave →
 *   leave → approved permission → absent;
 * - rate = present / working days.
 *
 * Dashboard-specific rules, both of which only ever REMOVE days:
 * - days after today are never counted (future approved leave does not
 *   inflate Cuti, and future working days are not Alpha);
 * - today is counted only once it is classified as something other than
 *   absent — the day is not over yet.
 *
 * Mapping to the card: Hadir = present, Cuti = leave + sick,
 * Izin = permission, Alpha = absent.
 *
 * There is no holiday/work-calendar system yet: public and company
 * holidays are counted like any other weekday, exactly as in the recap.
 */
import {
  classifyRecapDay,
  employmentWindow,
  isoDayOfDateString,
  listWorkingDays,
} from "../attendance/recap.ts";

export interface MonthlyRecap {
  /** "2026-11" */
  monthKey: string;
  hadir: number;
  izin: number;
  cuti: number;
  alpha: number;
  /** Expected working days counted so far (hadir + izin + cuti + alpha). */
  workingDays: number;
  /** hadir / workingDays, rounded to an integer percent (0 when none). */
  percentage: number;
}

export interface MonthlyRecapInput {
  monthKey: string;
  /** Today in the app time zone, "YYYY-MM-DD". */
  todayKey: string;
  hireDate: string | null;
  terminationDate: string | null;
  resignationDate: string | null;
  /** Days with accepted attendance (status present|completed). */
  acceptedAttendanceDays: ReadonlySet<string>;
  /** Approved leave days → leave type code (for the sick rule). */
  leaveDays: ReadonlyMap<string, string | null>;
  /** Days covered by an approved permission request. */
  permissionDays: ReadonlySet<string>;
}

/** First and last calendar day of a "YYYY-MM" month. */
export function monthBounds(monthKey: string): { first: string; last: string } {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { first: `${year}-${mm}-01`, last: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/** Every calendar day "YYYY-MM-DD" in [from, to] (inclusive, UTC dates). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const limit = new Date(`${to}T00:00:00.000Z`);
  while (cursor.getTime() <= limit.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function computeMonthlyRecap(input: MonthlyRecapInput): MonthlyRecap {
  const { first, last } = monthBounds(input.monthKey);
  const periodEnd = last < input.todayKey ? last : input.todayKey;
  const window = employmentWindow({
    hireDate: input.hireDate,
    terminationDate: input.terminationDate,
    resignationDate: input.resignationDate,
  });

  let hadir = 0;
  let izin = 0;
  let cuti = 0;
  let alpha = 0;

  for (const day of listWorkingDays(first, periodEnd, window)) {
    const leaveTypeCode = input.leaveDays.get(day);
    const bucket = classifyRecapDay({
      day,
      isoDay: isoDayOfDateString(day),
      inEmploymentWindow: true, // listWorkingDays already clipped the window
      attendanceAccepted: input.acceptedAttendanceDays.has(day),
      hasApprovedLeave: input.leaveDays.has(day),
      leaveTypeCode: leaveTypeCode ?? null,
      hasApprovedPermission: input.permissionDays.has(day),
    });
    if (day === input.todayKey && bucket === "absent") continue;
    if (bucket === "present") hadir += 1;
    else if (bucket === "leave" || bucket === "sick") cuti += 1;
    else if (bucket === "permission") izin += 1;
    else if (bucket === "absent") alpha += 1;
  }

  const workingDays = hadir + izin + cuti + alpha;
  return {
    monthKey: input.monthKey,
    hadir,
    izin,
    cuti,
    alpha,
    workingDays,
    percentage: workingDays > 0 ? Math.round((hadir / workingDays) * 100) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Attendance trend (management dashboard)                             */
/* ------------------------------------------------------------------ */

export interface AttendanceTrendPoint {
  /** "YYYY-MM-DD" */
  date: string;
  label: string;
  present: number;
  completed: number;
}

/** "YYYY-MM-DD" for a `date` column value (drizzle `mode: "date"` → Date). */
export function dateColumnKey(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

const TREND_WEEKDAY = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  timeZone: "UTC",
});

/**
 * Seven daily buckets ending at `todayKey`, filled from grouped attendance
 * rows. Rows outside the window are ignored.
 */
export function buildAttendanceTrend(
  todayKey: string,
  rows: ReadonlyArray<{ date: Date | string; status: string; count: number }>
): AttendanceTrendPoint[] {
  const end = new Date(`${todayKey}T00:00:00.000Z`);
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  const byDate = new Map<string, { present: number; completed: number }>();
  for (const key of eachDay(start.toISOString().slice(0, 10), todayKey)) {
    byDate.set(key, { present: 0, completed: 0 });
  }

  for (const row of rows) {
    const entry = byDate.get(dateColumnKey(row.date));
    if (!entry) continue;
    if (row.status === "present") entry.present = Number(row.count);
    if (row.status === "completed") entry.completed = Number(row.count);
  }

  return [...byDate.entries()].map(([date, values]) => ({
    date,
    label: TREND_WEEKDAY.format(new Date(`${date}T00:00:00.000Z`)),
    present: values.present,
    completed: values.completed,
  }));
}
