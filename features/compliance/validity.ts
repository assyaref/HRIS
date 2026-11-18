/**
 * Validity of a dated compliance record (MCU, training certificate):
 *   expired   valid-until already passed          (merah)
 *   expiring  ends within the window (incl. today) (kuning)
 *   valid     ends later                          (hijau)
 *   no_expiry no valid-until date                 (biru)
 * Pure and date-string based ("YYYY-MM-DD").
 */
import { daysBetween } from "./contract-status.ts";

export const VALIDITY_WINDOW_DAYS = 30;

export const VALIDITY_STATUSES = ["expired", "expiring", "valid", "no_expiry"] as const;
export type ValidityStatus = (typeof VALIDITY_STATUSES)[number];

export const VALIDITY_LABELS: Record<ValidityStatus, string> = {
  expired: "Kedaluwarsa",
  expiring: "Akan habis",
  valid: "Berlaku",
  no_expiry: "Tanpa masa berlaku",
};

export const VALIDITY_BADGE: Record<ValidityStatus, "danger" | "warning" | "success" | "info"> = {
  expired: "danger",
  expiring: "warning",
  valid: "success",
  no_expiry: "info",
};

export const VALIDITY_COLORS: Record<ValidityStatus, string> = {
  expired: "#EF4444",
  expiring: "#F59E0B",
  valid: "#22C55E",
  no_expiry: "#0EA5E9",
};

export function isValidityStatus(value: unknown): value is ValidityStatus {
  return typeof value === "string" && (VALIDITY_STATUSES as readonly string[]).includes(value);
}

export function evaluateValidity(
  validUntil: string | null,
  today: string,
  windowDays = VALIDITY_WINDOW_DAYS
): { status: ValidityStatus; daysRemaining: number | null } {
  if (!validUntil) return { status: "no_expiry", daysRemaining: null };
  const daysRemaining = daysBetween(today, validUntil);
  if (daysRemaining < 0) return { status: "expired", daysRemaining };
  if (daysRemaining <= windowDays) return { status: "expiring", daysRemaining };
  return { status: "valid", daysRemaining };
}

/** "YYYY-MM-DD" + whole months (end-of-month safe: 31 Jan + 1 → 28/29 Feb). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export const MCU_RESULT_LABELS: Record<string, string> = {
  fit: "Fit",
  fit_with_note: "Fit dengan catatan",
  temporary_unfit: "Unfit sementara",
  unfit: "Unfit",
};

export const TRAINING_TYPE_LABELS: Record<string, string> = {
  internal: "Internal",
  external: "Eksternal",
  certification: "Sertifikasi",
};
