/**
 * Contract monitoring rules (Document Control / Contract Monitoring).
 *
 * Status from the employee's contract end date, relative to "today" in the
 * app time zone:
 *   - expired   end date already passed                       (merah)
 *   - expiring  ends within EXPIRING_WINDOW_DAYS (incl. today) (kuning)
 *   - active    ends later                                     (hijau)
 *   - no_end    active employee without a contract end (e.g. permanent)
 *   - inactive  employee is inactive                           (abu-abu)
 *
 * Pure and date-string based ("YYYY-MM-DD") so it is deterministic in tests.
 */

export const EXPIRING_WINDOW_DAYS = 30;

export const CONTRACT_STATUSES = [
  "expired",
  "expiring",
  "active",
  "no_end",
  "inactive",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  expired: "Kedaluwarsa",
  expiring: "Akan habis",
  active: "Berlaku",
  no_end: "Tanpa batas",
  inactive: "Nonaktif",
};

/** Badge variant per status (see components/ui/badge). */
export const CONTRACT_STATUS_BADGE: Record<
  ContractStatus,
  "danger" | "warning" | "success" | "info" | "outline"
> = {
  expired: "danger",
  expiring: "warning",
  active: "success",
  no_end: "info",
  inactive: "outline",
};

export function isContractStatus(value: unknown): value is ContractStatus {
  return (
    typeof value === "string" &&
    (CONTRACT_STATUSES as readonly string[]).includes(value)
  );
}

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (both "YYYY-MM-DD"); negative if earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

export interface ContractStatusInput {
  employmentStatus: string;
  /** "YYYY-MM-DD" or null. */
  contractEnd: string | null;
  /** "YYYY-MM-DD" in the app time zone. */
  today: string;
  windowDays?: number;
}

export interface ContractStatusResult {
  status: ContractStatus;
  /** Days until the end date (negative when expired); null without an end. */
  daysRemaining: number | null;
}

export function evaluateContract(input: ContractStatusInput): ContractStatusResult {
  const windowDays = input.windowDays ?? EXPIRING_WINDOW_DAYS;
  const daysRemaining = input.contractEnd
    ? daysBetween(input.today, input.contractEnd)
    : null;
  if (input.employmentStatus !== "active") {
    return { status: "inactive", daysRemaining };
  }
  if (daysRemaining === null) return { status: "no_end", daysRemaining };
  if (daysRemaining < 0) return { status: "expired", daysRemaining };
  if (daysRemaining <= windowDays) return { status: "expiring", daysRemaining };
  return { status: "active", daysRemaining };
}

/** Human label for the remaining time ("12 hari lagi", "lewat 3 hari"). */
export function remainingLabel(daysRemaining: number | null): string {
  if (daysRemaining === null) return "—";
  if (daysRemaining === 0) return "Berakhir hari ini";
  if (daysRemaining > 0) return `${daysRemaining} hari lagi`;
  return `Lewat ${Math.abs(daysRemaining)} hari`;
}
