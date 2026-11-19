/**
 * PKWT letter content (stored as a snapshot in issued_documents.content) and
 * formatting helpers. Pure; unit-tested.
 */

export interface PkwtContent {
  kind: "pkwt";
  employee: {
    name: string;
    employeeNumber: string;
    nik: string | null;
    birthPlace: string | null;
    birthDate: string | null;
    gender: string | null;
    address: string | null;
  };
  position: string;
  department: string | null;
  workLocation: string;
  contractStart: string;
  contractEnd: string;
  salary: number | null;
  workingHours: string | null;
  signatoryName: string;
  signatoryTitle: string;
  city: string;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Safe read of the stored JSON; null when it is not a PKWT. */
export function parsePkwtContent(value: unknown): PkwtContent | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.kind !== "pkwt") return null;
  const e = (v.employee ?? {}) as Record<string, unknown>;
  const start = str(v.contractStart);
  const end = str(v.contractEnd);
  if (!start || !end) return null;
  return {
    kind: "pkwt",
    employee: {
      name: str(e.name) ?? "—",
      employeeNumber: str(e.employeeNumber) ?? "—",
      nik: str(e.nik),
      birthPlace: str(e.birthPlace),
      birthDate: str(e.birthDate),
      gender: str(e.gender),
      address: str(e.address),
    },
    position: str(v.position) ?? "—",
    department: str(v.department),
    workLocation: str(v.workLocation) ?? "—",
    contractStart: start,
    contractEnd: end,
    salary: typeof v.salary === "number" && Number.isFinite(v.salary) ? v.salary : null,
    workingHours: str(v.workingHours),
    signatoryName: str(v.signatoryName) ?? "—",
    signatoryTitle: str(v.signatoryTitle) ?? "—",
    city: str(v.city) ?? "",
  };
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-11-19" → "19 November 2026". */
export function longDate(day: string | null): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return "—";
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
}

/** 5000000 → "Rp 5.000.000". */
export function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

export interface LetterContent {
  kind: "letter";
  templateName: string;
  title: string;
  paragraphs: string[];
  signatoryName: string;
  signatoryTitle: string;
  city: string;
}

/** Safe read of a template-generated letter; null for anything else. */
export function parseLetterContent(value: unknown): LetterContent | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.kind !== "letter" || !Array.isArray(v.paragraphs)) return null;
  return {
    kind: "letter",
    templateName: str(v.templateName) ?? "",
    title: str(v.title) ?? "SURAT",
    paragraphs: v.paragraphs.filter((p): p is string => typeof p === "string"),
    signatoryName: str(v.signatoryName) ?? "—",
    signatoryTitle: str(v.signatoryTitle) ?? "—",
    city: str(v.city) ?? "",
  };
}
