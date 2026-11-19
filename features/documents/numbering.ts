/**
 * Pure letter-numbering rules (no framework imports; unit-tested).
 *
 * A document type has a format such as "{seq}/{code}/HRD/{roman}/{year}".
 * Tokens:
 *   {seq}   running number, zero-padded to the type's padding
 *   {code}  the type code (e.g. "SK")
 *   {month} 01–12        {roman} I–XII
 *   {year}  2026         {yy}    26
 */

export const NUMBER_TOKENS = ["{seq}", "{code}", "{month}", "{roman}", "{year}", "{yy}"] as const;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function romanMonth(month: number): string {
  return ROMAN[month - 1] ?? String(month);
}

/** Errors in a format, or null when it is usable. */
export function validateNumberFormat(format: string): string | null {
  const value = format.trim();
  if (value.length < 5 || value.length > 120) return "Format nomor 5–120 karakter.";
  if (!value.includes("{seq}")) return "Format harus memuat {seq} (nomor urut).";
  const unknown = [...value.matchAll(/\{[^}]*\}/g)].map((m) => m[0]).filter((t) => !(NUMBER_TOKENS as readonly string[]).includes(t));
  if (unknown.length > 0) return `Token tidak dikenal: ${unknown.join(", ")}.`;
  if (/[{}]/.test(value.replace(/\{[a-z]+\}/g, ""))) return "Kurung kurawal tidak lengkap.";
  return null;
}

/** Numbering period for a date ("YYYY-MM-DD"): "2026", "2026-11" or "all". */
export function numberingPeriod(resetPeriod: string, issuedDate: string): string {
  if (resetPeriod === "monthly") return issuedDate.slice(0, 7);
  if (resetPeriod === "never") return "all";
  return issuedDate.slice(0, 4);
}

export function formatDocumentNumber(
  format: string,
  input: { sequence: number; padding: number; code: string; issuedDate: string }
): string {
  const year = input.issuedDate.slice(0, 4);
  const month = Number(input.issuedDate.slice(5, 7));
  const padding = Math.min(Math.max(input.padding, 1), 8);
  return format
    .replaceAll("{seq}", String(input.sequence).padStart(padding, "0"))
    .replaceAll("{code}", input.code)
    .replaceAll("{month}", String(month).padStart(2, "0"))
    .replaceAll("{roman}", romanMonth(month))
    .replaceAll("{year}", year)
    .replaceAll("{yy}", year.slice(2));
}

export const RESET_LABELS: Record<string, string> = {
  yearly: "Reset tiap tahun",
  monthly: "Reset tiap bulan",
  never: "Tidak pernah reset",
};

/** Starter types offered when an organization has none. */
export const DEFAULT_DOCUMENT_TYPES = [
  { code: "PKWT", name: "Perjanjian Kerja Waktu Tertentu", numberFormat: "{seq}/PKWT/HRD/{roman}/{year}" },
  { code: "SK", name: "Surat Keputusan", numberFormat: "{seq}/SK/HRD/{roman}/{year}" },
  { code: "SKK", name: "Surat Keterangan Kerja", numberFormat: "{seq}/SKK/HRD/{roman}/{year}" },
  { code: "SP", name: "Surat Peringatan", numberFormat: "{seq}/SP/HRD/{roman}/{year}" },
  { code: "ST", name: "Surat Tugas", numberFormat: "{seq}/ST/HRD/{roman}/{year}" },
] as const;

/**
 * Whole months of a contract term, counting the end date as the last working
 * day: 2026-01-01 → 2026-12-31 is 12 months, 2026-01-15 → 2026-07-14 is 6.
 */
export function contractMonths(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  b.setUTCDate(b.getUTCDate() + 1);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** Indonesian words for whole numbers 0–999 999 999 (salary in words). */
export function terbilang(value: number): string {
  const n = Math.floor(Math.abs(value));
  const words = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  const say = (x: number): string => {
    if (x < 12) return words[x];
    if (x < 20) return `${say(x - 10)} belas`;
    if (x < 100) return `${say(Math.floor(x / 10))} puluh ${say(x % 10)}`;
    if (x < 200) return `seratus ${say(x - 100)}`;
    if (x < 1000) return `${say(Math.floor(x / 100))} ratus ${say(x % 100)}`;
    if (x < 2000) return `seribu ${say(x - 1000)}`;
    if (x < 1_000_000) return `${say(Math.floor(x / 1000))} ribu ${say(x % 1000)}`;
    if (x < 1_000_000_000) return `${say(Math.floor(x / 1_000_000))} juta ${say(x % 1_000_000)}`;
    return String(x);
  };
  if (n === 0) return "nol";
  return say(n).replace(/\s+/g, " ").trim();
}
