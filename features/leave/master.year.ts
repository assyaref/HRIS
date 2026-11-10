import { APP_TIME_ZONE } from "@/lib/utils/greeting";

/** Current calendar year (YYYY) in the application time zone. */
export function currentYearInAppTimeZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
  }).format(now);
}
