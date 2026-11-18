/**
 * Workforce insights for the management dashboard: profile completeness per
 * category ("Employee Data Progress"), gender split and age distribution.
 * Pure — the queries feed it plain rows.
 */

export interface InsightEmployee {
  gender: string | null;
  /** "YYYY-MM-DD" or null. */
  birthDate: string | null;
  // Personal
  nik: string | null;
  birthPlace: string | null;
  religion: string | null;
  maritalStatus: string | null;
  // Contact
  email: string | null;
  phone: string | null;
  personalEmail: string | null;
  // Employment
  position: string | null;
  department: string | null;
  workLocationId: string | null;
  employmentType: string | null;
  hireDate: string | null;
  // Related records (counts)
  addressCount: number;
  bankCount: number;
  hasInsurance: boolean;
}

export interface CompletenessCategory {
  key: string;
  label: string;
  /** Employees with every field of the category filled. */
  complete: number;
  total: number;
  percent: number;
}

const filled = (value: string | null | undefined) =>
  typeof value === "string" && value.trim() !== "";

const CATEGORIES: Array<{
  key: string;
  label: string;
  test: (e: InsightEmployee) => boolean;
}> = [
  {
    key: "personal",
    label: "Data Pribadi",
    test: (e) =>
      [e.gender, e.birthDate, e.birthPlace, e.religion, e.maritalStatus].every(filled),
  },
  { key: "identity", label: "Identitas (NIK)", test: (e) => filled(e.nik) },
  {
    key: "contact",
    label: "Kontak",
    test: (e) => filled(e.phone) && (filled(e.email) || filled(e.personalEmail)),
  },
  {
    key: "employment",
    label: "Kepegawaian",
    test: (e) =>
      [e.position, e.department, e.workLocationId, e.employmentType, e.hireDate].every(
        filled
      ),
  },
  { key: "address", label: "Alamat", test: (e) => e.addressCount > 0 },
  { key: "bank", label: "Rekening Bank", test: (e) => e.bankCount > 0 },
  { key: "insurance", label: "Asuransi / BPJS", test: (e) => e.hasInsurance },
];

const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : 0;

export function profileCompleteness(rows: readonly InsightEmployee[]): {
  categories: CompletenessCategory[];
  /** Average of the category percentages. */
  overall: number;
} {
  const total = rows.length;
  const categories = CATEGORIES.map(({ key, label, test }) => {
    const complete = rows.filter(test).length;
    return { key, label, complete, total, percent: pct(complete, total) };
  });
  const overall =
    categories.length > 0
      ? Math.round(
          (categories.reduce((sum, c) => sum + c.percent, 0) / categories.length) * 10
        ) / 10
      : 0;
  return { categories, overall };
}

export function genderSplit(rows: readonly InsightEmployee[]) {
  let male = 0;
  let female = 0;
  let unknown = 0;
  for (const row of rows) {
    const g = row.gender?.trim().toLowerCase();
    if (g === "male" || g === "laki-laki" || g === "l") male++;
    else if (g === "female" || g === "perempuan" || g === "p") female++;
    else unknown++;
  }
  return { male, female, unknown };
}

export const AGE_BUCKETS = ["< 25", "25–34", "35–44", "45–54", "55+"] as const;

/** Whole years between birth date and today ("YYYY-MM-DD" strings). */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

export function ageDistribution(rows: readonly InsightEmployee[], today: string) {
  const counts = Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])) as Record<
    (typeof AGE_BUCKETS)[number],
    number
  >;
  let unknown = 0;
  for (const row of rows) {
    if (!row.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.birthDate)) {
      unknown++;
      continue;
    }
    const age = ageOn(row.birthDate, today);
    if (age < 25) counts["< 25"]++;
    else if (age < 35) counts["25–34"]++;
    else if (age < 45) counts["35–44"]++;
    else if (age < 55) counts["45–54"]++;
    else counts["55+"]++;
  }
  return { buckets: AGE_BUCKETS.map((label) => ({ label, value: counts[label] })), unknown };
}
