import "server-only";

import { dateStringInTimeZone } from "@/lib/attendance/time";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";

/** Today as "YYYY-MM-DD" in the app time zone (Asia/Jakarta by default). */
export function todayKey(): string {
  return dateStringInTimeZone(new Date(), APP_TIME_ZONE);
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A valid "YYYY-MM-DD" query value, else the fallback. */
export function dateParam(value: string | string[] | undefined, fallback: string): string {
  return typeof value === "string" && DATE_KEY.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : fallback;
}

/** First and last day of the month containing `day` ("YYYY-MM-DD"). */
export function monthRange(day: string): { from: string; to: string } {
  const [y, m] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Single string query value or undefined. */
export function textParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Positive page number from the query, default 1. */
export function pageParam(value: string | string[] | undefined): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}
