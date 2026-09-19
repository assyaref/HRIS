const IDENTITY_PATTERN = /^\d{1,32}$/;

function normalizeDigits(value: string, label: string): string {
  const normalized = value.trim();

  if (!IDENTITY_PATTERN.test(normalized)) {
    throw new Error(`${label} must contain 1–32 digits.`);
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
 * created before the password contract changed to the employee number. NIK is
 * intentionally kept out of every current password contract.
 *
 * IMPORTANT:
 * The returned password must never be persisted, logged, audited,
 * returned to the browser, or written to the database.
 */
export function buildPayslipPasswordV1(
  nik: string,
  birthDate: Date
): string {
  const normalizedNik = normalizeDigits(nik, "Employee NIK");

  assertValidBirthDate(birthDate);

  const day = String(birthDate.getUTCDate()).padStart(2, "0");
  const year = String(birthDate.getUTCFullYear());

  return `${normalizedNik}${day}${year}`;
}

/**
 * Current payslip PDF opening password.
 *
 * Contract V2:
 *   employee number + DD + MM + YYYY
 *
 * Example: employee number `03233`, birth date `25 August 1995` →
 * `0323325081995`.
 *
 * NIK must NOT be used: the password is always derived from the employee
 * number. Birth date is interpreted as a date-only value using UTC components
 * to avoid server timezone changes affecting the generated password.
 *
 * IMPORTANT:
 * The returned password must never be persisted, logged, audited,
 * returned to the browser, or written to the database.
 */
export function buildPayslipPassword(
  employeeNumber: string,
  birthDate: Date
): string {
  const normalizedEmployeeNumber = normalizeDigits(
    employeeNumber,
    "Employee number"
  );

  assertValidBirthDate(birthDate);

  const day = String(birthDate.getUTCDate()).padStart(2, "0");
  const month = String(birthDate.getUTCMonth() + 1).padStart(2, "0");
  const year = String(birthDate.getUTCFullYear());

  return `${normalizedEmployeeNumber}${day}${month}${year}`;
}