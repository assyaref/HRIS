import { Badge } from "@/components/ui/badge";

import {
  attendanceRateIndicator,
  formatAttendanceRate,
  RATE_INDICATOR_LABELS,
  type RateIndicator,
  type RecapDayBucket,
} from "./recap";

/**
 * Recap display badges. Reuses the shared Badge component; indicator tones
 * stay within the existing design system (no loud colors):
 * - normal    → soft blue (secondary)
 * - attention → outline + amber text
 * - warning   → outline + rose text
 */

const INDICATOR_BADGE_CLASS: Record<RateIndicator, string> = {
  normal: "",
  attention: "border-amber-200 bg-amber-50 text-amber-700",
  warning: "border-rose-200 bg-rose-50 text-rose-700",
};

/** Attendance-rate value + performance indicator in one badge. */
export function AttendanceRateBadge({ rate }: { rate: number | null }) {
  const indicator = attendanceRateIndicator(rate);
  return (
    <Badge
      variant="secondary"
      className={INDICATOR_BADGE_CLASS[indicator]}
      title={`${RATE_INDICATOR_LABELS[indicator]} attendance rate`}
    >
      {formatAttendanceRate(rate)}
    </Badge>
  );
}

const DAY_BUCKET_BADGE_CLASS: Partial<Record<RecapDayBucket, string>> = {
  absent: "border-rose-200 bg-rose-50 text-rose-700",
  leave: "border-sky-200 bg-sky-50 text-sky-700",
  sick: "border-violet-200 bg-violet-50 text-violet-700",
  permission: "border-amber-200 bg-amber-50 text-amber-700",
  extra: "text-muted-foreground",
  none: "text-muted-foreground",
};

const DAY_BUCKET_LABELS: Record<RecapDayBucket, string> = {
  present: "Present",
  sick: "Sick",
  leave: "Leave",
  permission: "Permission",
  absent: "Absent",
  extra: "Extra",
  none: "Not counted",
};

/** One classified recap day in the employee drill-down. */
export function RecapDayStatusBadge({
  bucket,
  late,
}: {
  bucket: RecapDayBucket;
  late?: boolean;
}) {
  if (bucket === "present" && late) {
    return (
      <Badge
        variant="secondary"
        className="border-amber-200 bg-amber-50 text-amber-700"
        title="Checked in after the work-start cutoff"
      >
        Late
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className={DAY_BUCKET_BADGE_CLASS[bucket] ?? ""}
    >
      {DAY_BUCKET_LABELS[bucket]}
    </Badge>
  );
}
