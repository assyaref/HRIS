/**
 * Sensitive-data masking (Employee Master Data 2.0).
 *
 * Pure, dependency-free helpers used to render sensitive employee fields
 * (NIK, NPWP, BPJS, bank accounts, phone, personal email) masked by default.
 * The server layer decides whether the requesting role may view the raw value
 * (RBAC `employees.*.view`); these helpers only ever transform a string.
 *
 * Rules the rest of the stack relies on:
 * - Masking is applied server-side, never in the browser.
 * - A value that is `null`, `undefined` or `""` passes through unchanged.
 * - Masked output keeps the revealable digits at the END of the value, so an
 *   authorized reader can comfortably verify the tail of the identifier.
 */

function maskKeepingTail(
  value: string,
  visibleDigits: number,
  placeholder = "*"
): string {
  if (!value) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length <= visibleDigits) return digits;
  const keep = digits.slice(-visibleDigits);
  const masked = placeholder.repeat(digits.length - visibleDigits);
  return `${masked}${keep}`;
}

/** Group a string of digits into chunks (e.g. "1234123412341234" → "1234 1234 1234 1234"). */
function groupDigits(digits: string, size = 4): string {
  const chunks: string[] = [];
  for (let i = 0; i < digits.length; i += size) {
    chunks.push(digits.slice(i, i + size));
  }
  return chunks.join(" ");
}

/**
 * Mask an NIK (Indonesian identity number) keeping the last 4 digits in the
 * standard 4-4-4-4 grouping: `1234123412341234` → `**** **** **** 1234`.
 */
export function maskNIK(nik: string | null | undefined): string | null {
  if (!nik) return nik ?? null;
  const masked = maskKeepingTail(nik, 4);
  return groupDigits(masked);
}

/**
 * Mask an NPWP (tax number) keeping the last 3 digits, e.g.
 * `123456789012345` → `************123`.
 */
export function maskNpwp(npwp: string | null | undefined): string | null {
  if (!npwp) return npwp ?? null;
  const digits = npwp.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  return maskKeepingTail(npwp, 3);
}

/** Mask a BPJS number keeping the last 4 digits: `1234567890` → `******7890`. */
export function maskBpjsNumber(
  bpjsNumber: string | null | undefined
): string | null {
  if (!bpjsNumber) return bpjsNumber ?? null;
  const digits = bpjsNumber.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return maskKeepingTail(bpjsNumber, 4);
}

/** Mask a bank account keeping the last 4 digits: `12345678` → `**** 5678`. */
export function maskBankAccountNumber(
  accountNumber: string | null | undefined
): string | null {
  if (!accountNumber) return accountNumber ?? null;
  return maskKeepingTail(accountNumber, 4);
}

/** Mask a phone number keeping the last 4 digits: `081234567890` → `********7890`. */
export function maskPhoneNumber(
  phone: string | null | undefined
): string | null {
  if (!phone) return phone ?? null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return maskKeepingTail(phone, 4);
}

/**
 * Mask a personal email keeping the local-part prefix and the whole domain:
 * `johndoe@example.com` → `j****e@example.com`. A one-character local part is
 * masked entirely (`j***@...`, only "@" and domain survive when local ≤ 1).
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return email ?? null;
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return email;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  if (local.length <= 1) return `*${domain}`;
  const masked = `${local[0]}${"*".repeat(Math.max(local.length - 2, 1))}${
    local[local.length - 1]
  }`;
  return `${masked}${domain}`;
}

export type SensitiveFieldKind =
  | "nik"
  | "npwp"
  | "bpjs"
  | "bank_account"
  | "phone"
  | "email";

/**
 * Route a sensitive value to the correct masker by field kind. Used by the
 * server layer and the Excel export when writing masked columns.
 */
export function maskSensitiveField(
  kind: SensitiveFieldKind,
  value: string | null | undefined
): string | null {
  switch (kind) {
    case "nik":
      return maskNIK(value);
    case "npwp":
      return maskNpwp(value);
    case "bpjs":
      return maskBpjsNumber(value);
    case "bank_account":
      return maskBankAccountNumber(value);
    case "phone":
      return maskPhoneNumber(value);
    case "email":
      return maskEmail(value);
  }
}