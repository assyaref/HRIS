/**
 * Overtime pay — PURE (no DB / framework imports; unit-tested).
 *
 * Indonesian rules (Kepmenakertrans 102/2004, PP 35/2021):
 * - Hourly wage = 1/173 × monthly wage, where the monthly wage is basic salary
 *   plus fixed allowances: here the employee's resolved FIXED EARNING payroll
 *   components (the LEMBUR component itself is never part of the base).
 * - Working day: first hour × 1.5, every further hour × 2.
 * - Rest day / public holiday, 5-day week: hours 1–8 × 2, hour 9 × 3,
 *   hours 10+ × 4.
 * - Rest day / public holiday, 6-day week: hours 1–7 × 2, hour 8 × 3,
 *   hours 9+ × 4.
 * Partial hours count proportionally (per minute). Money is integer IDR,
 * rounded once per employee.
 */

/**
 * Payroll component code that receives the computed overtime pay. Matched
 * case-insensitively (payroll component codes are stored lower-case:
 * "lembur").
 */
export const OVERTIME_COMPONENT_CODE = "LEMBUR";

export const HOURLY_DIVISOR = 173;

export interface OvertimeEntry {
  /** The overtime request this entry comes from (display only). */
  requestId?: string;
  /** "YYYY-MM-DD" */
  day: string;
  minutes: number;
  /** Rest day (not a scheduled working day) or public holiday. */
  restDay: boolean;
  /** The employee works six days a week (changes the rest-day tiers). */
  sixDayWeek: boolean;
}

type Tier = [limitMinutes: number, multiplier: number];

const WORKDAY: Tier[] = [
  [60, 1.5],
  [Infinity, 2],
];
const REST_5: Tier[] = [
  [8 * 60, 2],
  [60, 3],
  [Infinity, 4],
];
const REST_6: Tier[] = [
  [7 * 60, 2],
  [60, 3],
  [Infinity, 4],
];

/** Weighted (multiplied) hours of one overtime day. */
export function weightedHours(entry: Pick<OvertimeEntry, "minutes" | "restDay" | "sixDayWeek">): number {
  const tiers = entry.restDay ? (entry.sixDayWeek ? REST_6 : REST_5) : WORKDAY;
  let left = Math.max(0, Math.round(entry.minutes));
  let weightedMinutes = 0;
  for (const [limit, multiplier] of tiers) {
    if (left <= 0) break;
    const used = Math.min(left, limit);
    weightedMinutes += used * multiplier;
    left -= used;
  }
  return weightedMinutes / 60;
}

export interface OvertimePayResult {
  /** Approved overtime minutes in the period. */
  minutes: number;
  /** Sum of weighted hours (2 decimals). */
  weightedHours: number;
  /** Integer IDR. */
  amount: number;
  hourlyWage: number;
}

export function overtimePay(monthlyWage: number, entries: readonly OvertimeEntry[]): OvertimePayResult {
  const minutes = entries.reduce((sum, e) => sum + Math.max(0, e.minutes), 0);
  const weighted = entries.reduce((sum, e) => sum + weightedHours(e), 0);
  const base = Math.max(0, Math.trunc(monthlyWage));
  return {
    minutes,
    weightedHours: Math.round(weighted * 100) / 100,
    amount: Math.round((weighted * base) / HOURLY_DIVISOR),
    hourlyWage: Math.round(base / HOURLY_DIVISOR),
  };
}

/** Human note stored on the payroll item component. */
export function overtimeNote(result: OvertimePayResult): string {
  const hours = Math.round((result.minutes / 60) * 100) / 100;
  return `${hours.toLocaleString("id-ID")} jam lembur = ${result.weightedHours.toLocaleString("id-ID")} jam terhitung × upah/jam`;
}

interface ResultLike<C extends { componentId: string; componentType: string; amount: number }> {
  totalEarnings: number;
  totalDeductions: number;
  netAmount: number;
  components: C[];
}

/**
 * Returns a copy of a calculated employee result whose overtime component
 * holds `amount`, with totals recomputed the same way as the engine
 * (net clamped at zero). Unchanged when the component is not in the result.
 */
export function withOvertimeAmount<C extends { componentId: string; componentType: string; amount: number }, R extends ResultLike<C>>(
  result: R,
  componentId: string,
  amount: number
): R {
  if (!result.components.some((c) => c.componentId === componentId)) return result;
  const components = result.components.map((c) => (c.componentId === componentId ? { ...c, amount: Math.max(0, Math.round(amount)) } : { ...c }));
  let totalEarnings = 0;
  let totalDeductions = 0;
  for (const c of components) {
    if (c.componentType === "earning") totalEarnings += c.amount;
    else totalDeductions += c.amount;
  }
  return { ...result, components, totalEarnings, totalDeductions, netAmount: Math.max(0, totalEarnings - totalDeductions) };
}
