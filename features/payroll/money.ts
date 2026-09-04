/**
 * Integer-only money helpers (Phase 8).
 *
 * All payroll amounts are INTEGER IDR units. No floating-point money is ever
 * used for authoritative totals. Percentage components round with
 * `Math.round` on the integer product to stay deterministic.
 */

/** Format an integer IDR amount with thousand separators. */
export function formatIDR(amount: number | null | undefined): string {
  const value = Math.trunc(amount ?? 0);
  const formatted = Math.abs(value).toLocaleString("en-US");
  return `${value < 0 ? "-" : ""}Rp ${formatted}`;
}

/** Apply a percentage (as a number like 5 = 5%) to an integer base. */
export function applyPercentage(
  base: number,
  percent: number
): number {
  return Math.round((base * percent) / 100);
}

/** Clamp: money values are never negative unless explicitly allowed. */
export function nonNegative(value: number): number {
  return Math.max(0, value);
}