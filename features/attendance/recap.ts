/**
 * Attendance Recap — PURE reporting engine.
 *
 * This module is the single source of truth for the recap business rules and
 * mirrors `features/attendance/reconciliation.ts` in being deliberately pure:
 * no database access, no browser APIs, no authentication dependency. It never
 * makes an attendance decision — it is a READ-ONLY reporting layer over the
 * existing attendance system (attendance_records, leave_requests,
 * permission_requests, employees).
 *
 * Rules pinned here (the SQL layer in `recap.queries.ts` implements the SAME
 * rules for aggregation; constants are imported from this module so the two
 * cannot drift):
 *
 * 1. Working day = Monday–Friday. The HRIS has NO work-schedule/holiday
 *    calendar, so weekends are the only non-working days the recap can
 *    justify. When a schedule/holiday system lands, only
 *    `isWorkingDayIso`/`listWorkingDays` need to change.
 *
 * 2. Employment window: days before `hire_date` and days after
 *    `termination_date` (or `resignation_date`) are never expected from the
 *    employee — they are not counted as working days and never absent. Both
 *    boundary days themselves ARE counted.
 *
 * 3. Day classification precedence (exactly one bucket per working day):
 *      accepted attendance (present|completed)  → "present"
 *      approved leave with a sick leave type    → "sick"
 *      approved leave (other types)             → "leave"
 *      approved permission (absence) request    → "permission"
 *      otherwise                                → "absent"
 *
 * 4. Attendance Rate = present days / expected working days × 100, rounded
 *    to 2 decimals. Leave/sick/permission do NOT reduce the denominator.
 *
 * 5. Late is a recap-layer presentation metric: a present day whose check-in
 *    happened after the local work-start cutoff in the work-location
 *    timezone. The attendance engine itself has no schedule; the cutoff is
 *    one exported constant so it can be re-tuned in exactly one place.
 */

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** ISO weekday numbers counted as working days (1=Mon … 5=Fri). */
export const WORKING_DAY_ISO_DAYS: readonly number[] = [1, 2, 3, 4, 5];

/** Days that are not working days (6=Sat, 7=Sun). */
export const NON_WORKING_DAY_ISO_DAYS: readonly number[] = [6, 0];

/** Default work-start cutoff ("HH:MM", local work-location time). */
export const LATE_CHECK_IN_LOCAL_CUTOFF = "08:00";

/**
 * Leave-type codes matching this (case-insensitive) pattern classify an
 * approved leave day as "sick" instead of "leave".
 */
export const SICK_LEAVE_TYPE_CODE_PATTERN = "sick|sakit|medical";

/** Maximum accepted recap period length (bounds the SQL day expansion). */
export const RECAP_MAX_PERIOD_DAYS = 366;

/** Default rows per recap page (mirrors ATTENDANCE_PAGE_SIZE). */
export const RECAP_PAGE_SIZE = 20;

/** Maximum rows per recap page a client may request. */
export const RECAP_MAX_PAGE_SIZE = 100;

/** Number of decimals used when displaying/deriving the attendance rate. */
export const ATTENDANCE_RATE_DECIMALS = 2;

/** Attendance-rate indicator thresholds (percent). */
export const RATE_INDICATOR_THRESHOLDS = {
  /** >= this value → normal. */
  normal: 95,
  /** >= this value (and < normal) → attention. */
  attention: 90,
} as const;

/** Parse "HH:MM" into minutes past midnight. Returns null when malformed. */
export function parseLocalTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** One classified recap day. */
export type RecapDayBucket =
  | "present"
  | "sick"
  | "leave"
  | "permission"
  | "absent"
  /**
   * Accepted attendance on a day that is NOT an expected working day
   * (weekend, or outside the employment window). Real data stays visible
   * but never enters the working-day counters.
   */
  | "extra"
  /** A non-working day without attendance — counted as nothing at all. */
  | "none";

export const RECAP_DAY_BUCKETS: readonly RecapDayBucket[] = [
  "present",
  "sick",
  "leave",
  "permission",
  "absent",
  "extra",
  "none",
];

/** Human-readable bucket labels. */
export const RECAP_DAY_BUCKET_LABELS: Record<RecapDayBucket, string> = {
  present: "Present",
  sick: "Sick",
  leave: "Leave",
  permission: "Permission",
  absent: "Absent",
  extra: "Attendance outside expected days (not counted)",
  none: "Not counted",
};

/**
 * Raw per-day facts, as produced by the recap SQL for one employee-day (or
 * assembled in tests). The pure classifier turns facts into exactly one
 * bucket; `attendanceAccepted` mirrors the accepted attendance statuses of
 * the attendance engine (present|completed).
 */
export interface RecapDayFact {
  /** "YYYY-MM-DD". */
  day: string;
  /** ISO weekday 1–7 (1=Mon … 7=Sun). */
  isoDay: number;
  /** True when the day is inside the employee's employment window. */
  inEmploymentWindow: boolean;
  /** Accepted attendance record exists (status present|completed). */
  attendanceAccepted: boolean;
  /** Approved leave request covers the day. */
  hasApprovedLeave: boolean;
  /** The covering approved leave type code, when any. */
  leaveTypeCode: string | null;
  /** Approved permission (absence) request covers the day. */
  hasApprovedPermission: boolean;
}

/** Per-employee recap counters for one period. */
export interface RecapEmployeeSummary {
  workingDays: number;
  present: number;
  late: number;
  leave: number;
  sick: number;
  permission: number;
  absent: number;
  /** Days with accepted attendance outside expected days (informational). */
  weekendAttendance: number;
  /** present / workingDays × 100 — null when workingDays is 0. */
  attendanceRate: number | null;
}

/** Attendance-rate performance indicator shown to management. */
export type RateIndicator = "normal" | "attention" | "warning";

export const RATE_INDICATOR_LABELS: Record<RateIndicator, string> = {
  normal: "Normal",
  attention: "Attention",
  warning: "Warning",
};

/** Check-in instant + its work-location timezone, used by the late rule. */
export interface RecapCheckIn {
  checkInAt: Date | null;
  timeZone: string | null;
}

/* ------------------------------------------------------------------ */
/* Working days / employment window                                    */
/* ------------------------------------------------------------------ */

/** ISO weekday of a "YYYY-MM-DD" string (1=Mon … 7=Sun). */
export function isoDayOfDateString(day: string): number {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getUTCDay() === 0 ? 7 : date.getUTCDay();
}

/** Whether a "YYYY-MM-DD" string is a Mon–Fri working day. */
export function isWorkingDayIso(isoDay: number): boolean {
  return WORKING_DAY_ISO_DAYS.includes(isoDay);
}

function dateStringIsValid(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(`${day}T00:00:00.000Z`).getTime());
}

/**
 * Employment window (inclusive) for the recap period: the day range the
 * employee was actually expected to attend. `null` bounds are unbounded.
 * Boundary days (hire date, termination date) are kept — days AFTER
 * termination / BEFORE hire are excluded by the caller, not the boundary.
 */
export interface EmploymentWindow {
  start: string | null;
  end: string | null;
}

export function employmentWindow(input: {
  hireDate: string | null;
  terminationDate: string | null;
  resignationDate: string | null;
}): EmploymentWindow {
  const start = input.hireDate && dateStringIsValid(input.hireDate)
    ? input.hireDate
    : null;
  const endCandidates = [input.terminationDate, input.resignationDate]
    .filter((value): value is string =>
      value !== null && dateStringIsValid(value)
    )
    .sort();
  return { start, end: endCandidates[0] ?? null };
}

/**
 * All working days (Mon–Fri) in [startDate, endDate] clipped to the
 * employment window. Returns "YYYY-MM-DD" strings in ascending order.
 */
export function listWorkingDays(
  startDate: string,
  endDate: string,
  window: EmploymentWindow
): string[] {
  const days: string[] = [];
  const from = [startDate, window.start]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const to = [endDate, window.end]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0);
  if (!from || !to || from > to) return days;

  const cursor = new Date(`${from}T00:00:00.000Z`);
  const limit = new Date(`${to}T00:00:00.000Z`);
  while (cursor.getTime() <= limit.getTime()) {
    const day = cursor.toISOString().slice(0, 10);
    const isoDay = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    if (isWorkingDayIso(isoDay)) days.push(day);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/** Whether a leave-type code classifies its approved days as "sick". */
export function isSickLeaveTypeCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return new RegExp(SICK_LEAVE_TYPE_CODE_PATTERN, "i").test(code);
}

/** Late rule: local check-in time strictly after the cutoff. */
export function isLateCheckIn(
  input: RecapCheckIn,
  cutoff: string = LATE_CHECK_IN_LOCAL_CUTOFF
): boolean {
  if (!input.checkInAt) return false;
  const cutoffMinutes = parseLocalTimeToMinutes(cutoff);
  if (cutoffMinutes === null) return false;
  const zone = input.timeZone && input.timeZone.trim() !== "" ? input.timeZone : "UTC";
  let localMinutes: number | null = null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(input.checkInAt);
    let hours = "0";
    let minutes = "0";
    for (const part of parts) {
      if (part.type === "hour") hours = part.value;
      if (part.type === "minute") minutes = part.value;
    }
    localMinutes = Number(hours) * 60 + Number(minutes);
  } catch {
    // Unknown/invalid zone: fall back to UTC deterministically (mirrors the
    // display helpers in features/attendance/format.ts).
    localMinutes =
      input.checkInAt.getUTCHours() * 60 + input.checkInAt.getUTCMinutes();
  }
  return localMinutes > cutoffMinutes;
}

/**
 * Classify one day fact into exactly one bucket.
 *
 * Days that are not expected working days (weekend, or outside the
 * employment window) are never "absent": with accepted attendance they are
 * "extra" (visible, not counted), without it they are "none".
 */
export function classifyRecapDay(fact: RecapDayFact): RecapDayBucket {
  const expectedDay = isWorkingDayIso(fact.isoDay) && fact.inEmploymentWindow;
  if (!expectedDay) {
    return fact.attendanceAccepted ? "extra" : "none";
  }
  if (fact.attendanceAccepted) return "present";
  if (fact.hasApprovedLeave) {
    return isSickLeaveTypeCode(fact.leaveTypeCode) ? "sick" : "leave";
  }
  if (fact.hasApprovedPermission) return "permission";
  return "absent";
}

/* ------------------------------------------------------------------ */
/* Rate + indicators                                                   */
/* ------------------------------------------------------------------ */

/** Attendance rate in percent (2 decimals) — null when workingDays is 0. */
export function computeAttendanceRate(
  present: number,
  workingDays: number
): number | null {
  if (workingDays <= 0) return null;
  const factor = 10 ** ATTENDANCE_RATE_DECIMALS;
  return Math.round((present / workingDays) * 100 * factor) / factor;
}

/** Display label for a rate — "—" when the employee had no expected days. */
export function formatAttendanceRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${rate.toFixed(ATTENDANCE_RATE_DECIMALS)}%`;
}

/** Performance indicator for a rate (null rate → warning-free "normal"). */
export function attendanceRateIndicator(rate: number | null): RateIndicator {
  if (rate === null) return "normal";
  if (rate >= RATE_INDICATOR_THRESHOLDS.normal) return "normal";
  if (rate >= RATE_INDICATOR_THRESHOLDS.attention) return "attention";
  return "warning";
}

/* ------------------------------------------------------------------ */
/* Summaries                                                           */
/* ------------------------------------------------------------------ */

/** Neutral zeroed summary. */
export function emptyRecapSummary(): RecapEmployeeSummary {
  return {
    workingDays: 0,
    present: 0,
    late: 0,
    leave: 0,
    sick: 0,
    permission: 0,
    absent: 0,
    weekendAttendance: 0,
    attendanceRate: null,
  };
}

/**
 * Aggregate day facts into the per-employee summary. Only expected working
 * days enter the counters; "extra" attendance is tracked separately and
 * "none" days are skipped entirely — so the summary always equals the recap
 * table numbers.
 */
export function summarizeRecapDays(
  facts: readonly RecapDayFact[]
): RecapEmployeeSummary {
  const summary = emptyRecapSummary();
  for (const fact of facts) {
    const bucket = classifyRecapDay(fact);
    if (bucket === "none") continue;
    if (bucket === "extra") {
      summary.weekendAttendance += 1;
      continue;
    }
    summary.workingDays += 1;
    switch (bucket) {
      case "present":
        summary.present += 1;
        break;
      case "sick":
        summary.sick += 1;
        break;
      case "leave":
        summary.leave += 1;
        break;
      case "permission":
        summary.permission += 1;
        break;
      case "absent":
        summary.absent += 1;
        break;
    }
  }
  summary.attendanceRate = computeAttendanceRate(
    summary.present,
    summary.workingDays
  );
  return summary;
}

/** Late count for a set of present-day check-ins (detail-page usage). */
export function countLateCheckIns(
  checkIns: readonly RecapCheckIn[]
): number {
  return checkIns.filter((checkIn) => isLateCheckIn(checkIn)).length;
}

/* ------------------------------------------------------------------ */
/* Default period                                                      */
/* ------------------------------------------------------------------ */

/** Inclusive "YYYY-MM-DD" month range containing `reference`. */
export function monthPeriodOf(
  reference: Date,
  timeZone: string | null
): { startDate: string; endDate: string } {
  let year: number;
  let month: number;
  const zone = timeZone && timeZone.trim() !== "" ? timeZone : "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(reference);
    const values: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") values[part.type] = part.value;
    }
    year = Number(values.year);
    month = Number(values.month);
  } catch {
    year = reference.getUTCFullYear();
    month = reference.getUTCMonth() + 1;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}
