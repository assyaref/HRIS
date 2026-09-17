const NIK_PATTERN = /^\d{1,32}$/;

function normalizeNik(nik: string): string {
  const normalized = nik.trim();

  if (!NIK_PATTERN.test(normalized)) {
    throw new Error("Employee NIK must contain 1–32 digits.");
  }

  return normalized;
}

function assertValidBirthDate(birthDate: Date): void {
  if (!(birthDate instanceof Date) || Number.isNaN(birthDate.getTime())) {
    throw new Error("Employee birth date is invalid.");
  }
}

/**
 * Legacy payslip PDF opening password.
 *
 * Contract V1:
 *   NIK + DD + YYYY
 *
 * This function exists only for controlled re-encryption of PDFs that were
 * created before the password contract changed.
 *
 * IMPORTANT:
 * The returned password must never be persisted, logged, audited,
 * returned to the browser, or written to the database.
 */
export function buildPayslipPasswordV1(
  nik: string,
  birthDate: Date
): string {
  const normalizedNik = normalizeNik(nik);

  assertValidBirthDate(birthDate);

  const day = String(birthDate.getUTCDate()).padStart(2, "0");
  const year = String(birthDate.getUTCFullYear());

  return `${normalizedNik}${day}${year}`;
}

/**
 * Current payslip PDF opening password.
 *
 * Contract V2:
 *   NIK + DD + MM + YYYY
 *
 * Birth date is interpreted as a date-only value using UTC components
 * to avoid server timezone changes affecting the generated password.
 *
 * IMPORTANT:
 * The returned password must never be persisted, logged, audited,
 * returned to the browser, or written to the database.
 */
export function buildPayslipPassword(
  nik: string,
  birthDate: Date
): string {
  const normalizedNik = normalizeNik(nik);

  assertValidBirthDate(birthDate);

  const day = String(birthDate.getUTCDate()).padStart(2, "0");
  const month = String(birthDate.getUTCMonth() + 1).padStart(2, "0");
  const year = String(birthDate.getUTCFullYear());

  return `${normalizedNik}${day}${month}${year}`;
}
