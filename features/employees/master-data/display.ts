import {
  maskBankAccountNumber,
  maskBpjsNumber,
  maskEmail,
  maskNIK,
  maskNpwp,
  maskPhoneNumber,
} from "../masking";

/**
 * Reveal-aware display formatters for the employee detail tabs.
 *
 * `reveal` is decided SERVER-SIDE by the page from RBAC (the caller holds
 * the matching section update capability). When false, the masked form is
 * rendered and the raw value never reaches the browser.
 */

export function formatNik(value: string | null, reveal: boolean): string | null {
  return reveal ? value : maskNIK(value);
}

export function formatNpwp(value: string | null, reveal: boolean): string | null {
  return reveal ? value : maskNpwp(value);
}

export function formatBpjs(value: string | null, reveal: boolean): string | null {
  return reveal ? value : maskBpjsNumber(value);
}

export function formatBankAccount(
  value: string | null,
  reveal: boolean
): string | null {
  return reveal ? value : maskBankAccountNumber(value);
}

export function formatPhone(value: string | null, reveal: boolean): string {
  if (value === null) return "—";
  return (reveal ? value : maskPhoneNumber(value)) ?? "—";
}

export function formatPersonalEmail(
  value: string | null,
  reveal: boolean
): string {
  if (value === null) return "—";
  return (reveal ? value : maskEmail(value)) ?? "—";
}
