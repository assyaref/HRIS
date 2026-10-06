const IDENTITY_PATTERN = /^\d{1,32}$/;

/**
 * A calendar date, never an instant.
 *
 * Canonical form is the `YYYY-MM-DD` string exactly as stored in a PostgreSQL
 * `DATE` column, which carries no timezone at all.
 *
 * A `Date` is also accepted because the employees table uses the Drizzle
 * `date(..., { mode: "date" })` column, which returns a JavaScript `Date`.
 * node-postgres materialises a `DATE` at **local** midnight
 * (`pg.defaults.parseInputDatesAsUTC === false`, i.e. `new Date(y, m - 1, d)`),
 * so for such a value the *local* calendar components are the stored database
 * date. Reading the UTC components of that value would yield the previous day
 * on any host east of UTC — for example `1999-05-07` becomes
 * `1999-05-06T17:00:00.000Z` in Asia/Jakarta and `getUTCDate()` returns 6.
 *
 * The string form is timezone independent by construction and is preferred at
 * every new call site.
 */
export type PayslipBirthDate = string | Date;

function normalizeDigits(value: string, label: string): string {
  const normalized = value.trim();

  if (!IDENTITY_PATTERN.test(normalized)) {
    throw new Error(`${label} must contain 1–32 digits.`);
  }

  return normalized;
}

interface CalendarDate {
  year: string;
  month: string;
  day: string;
}

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Rejects dates that do not exist, such as `1999-02-30` or `1999-13-01`.
 *
 * The probe is built and read entirely in UTC so that validation cannot depend
 * on the host timezone.
 */
function assertRealCalendarDate(
  date: CalendarDate,
  label: string
): CalendarDate {
  const year = Number(date.year);
  const month = Number(date.month);
  const day = Number(date.day);

  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`${label} is invalid.`);
  }

  return date;
}

/**
 * Resolves a birth date into plain calendar components.
 *
 * This is the single place where a `Date` is turned into a date, and it always
 * uses the local calendar day, which is what node-postgres preserves for a
 * PostgreSQL `DATE`. Nothing here is derived from an instant, so the result is
 * stable regardless of the host timezone or DST.
 */
function resolveCalendarDate(
  birthDate: PayslipBirthDate,
  label: string
): CalendarDate {
  if (typeof birthDate === "string") {
    const match = CALENDAR_DATE_PATTERN.exec(birthDate.trim());

    if (!match) {
      throw new Error(`${label} is invalid.`);
    }

    return assertRealCalendarDate(
      { year: match[1], month: match[2], day: match[3] },
      label
    );
  }

  if (!(birthDate instanceof Date) || Number.isNaN(birthDate.getTime())) {
    throw new Error(`${label} is invalid.`);
  }

  return assertRealCalendarDate(
    {
      year: String(birthDate.getFullYear()).padStart(4, "0"),
      month: String(birthDate.getMonth() + 1).padStart(2, "0"),
      day: String(birthDate.getDate()).padStart(2, "0"),
    },
    label
  );
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
  birthDate: PayslipBirthDate
): string {
  const normalizedNik = normalizeDigits(nik, "Employee NIK");
  const { day, year } = resolveCalendarDate(
    birthDate,
    "Employee birth date"
  );

  return `${normalizedNik}${day}${year}`;
}

/**
 * Current payslip PDF opening password.
 *
 * Contract V2:
 *   employee number + DD + MM + YYYY
 *
 * Example: employee number `03233`, birth date `07 May 1999` →
 * `0323307051999`.
 *
 * NIK must NOT be used: the password is always derived from the employee
 * number. The birth date is a calendar date, so `1999-05-07` always yields
 * `07051999` no matter which timezone the server runs in.
 *
 * IMPORTANT:
 * The returned password must never be persisted, logged, audited,
 * returned to the browser, or written to the database.
 */
export function buildPayslipPassword(
  employeeNumber: string,
  birthDate: PayslipBirthDate
): string {
  const normalizedEmployeeNumber = normalizeDigits(
    employeeNumber,
    "Employee number"
  );
  const { day, month, year } = resolveCalendarDate(
    birthDate,
    "Employee birth date"
  );

  return `${normalizedEmployeeNumber}${day}${month}${year}`;
}
