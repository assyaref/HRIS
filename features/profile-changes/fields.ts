/**
 * Which personal fields an employee may ask to change, and the pure
 * validation / diff used by both the submit and the approve actions.
 * No framework imports (unit-tested directly).
 *
 * Employment, payroll and identity-of-account data (name, employee number,
 * login email, position…) are deliberately NOT here: HR changes those.
 */

export type ChangeableField =
  | "phone"
  | "personalEmail"
  | "nickname"
  | "birthPlace"
  | "birthDate"
  | "religion"
  | "maritalStatus"
  | "nationality"
  | "nik";

interface FieldSpec {
  label: string;
  kind: "text" | "email" | "phone" | "date" | "select";
  max?: number;
  options?: readonly { value: string; label: string }[];
  hint?: string;
}

export const MARITAL_OPTIONS = [
  { value: "Single", label: "Belum menikah" },
  { value: "Married", label: "Menikah" },
  { value: "Divorced", label: "Cerai hidup" },
  { value: "Widowed", label: "Cerai mati" },
] as const;

export const CHANGEABLE_FIELDS: Record<ChangeableField, FieldSpec> = {
  phone: { label: "Nomor HP", kind: "phone", max: 30 },
  personalEmail: { label: "Email pribadi", kind: "email", max: 254 },
  nickname: { label: "Nama panggilan", kind: "text", max: 100 },
  birthPlace: { label: "Tempat lahir", kind: "text", max: 200 },
  birthDate: { label: "Tanggal lahir", kind: "date" },
  religion: { label: "Agama", kind: "text", max: 50 },
  maritalStatus: { label: "Status pernikahan", kind: "select", options: MARITAL_OPTIONS },
  nationality: { label: "Kewarganegaraan", kind: "text", max: 50 },
  nik: { label: "NIK (KTP)", kind: "text", max: 16, hint: "16 digit sesuai KTP" },
};

export const CHANGEABLE_FIELD_KEYS = Object.keys(CHANGEABLE_FIELDS) as ChangeableField[];

export function isChangeableField(value: string): value is ChangeableField {
  return Object.prototype.hasOwnProperty.call(CHANGEABLE_FIELDS, value);
}

export type ProfileValues = Partial<Record<ChangeableField, string | null>>;
export type ChangeSet = Partial<Record<ChangeableField, { from: string | null; to: string | null }>>;

const normalize = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/** Validates one proposed value; returns an error message or null. */
export function validateFieldValue(field: ChangeableField, value: string | null): string | null {
  const spec = CHANGEABLE_FIELDS[field];
  if (value === null) {
    return field === "phone" ? "Nomor HP tidak boleh dikosongkan." : null;
  }
  if (spec.max && value.length > spec.max) return `${spec.label} maksimal ${spec.max} karakter.`;
  switch (spec.kind) {
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "Email pribadi tidak valid.";
    case "phone":
      return /^\+?[0-9][0-9\s-]{6,24}$/.test(value) ? null : "Nomor HP tidak valid (angka, boleh diawali +).";
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        return "Tanggal tidak valid.";
      }
      return value > new Date().toISOString().slice(0, 10) ? "Tanggal lahir tidak boleh di masa depan." : null;
    case "select":
      return spec.options?.some((o) => o.value === value) ? null : `${spec.label} tidak valid.`;
    default:
      if (field === "nik" && !/^\d{16}$/.test(value)) return "NIK harus 16 digit angka.";
      return null;
  }
}

/**
 * Compares the submitted form against the current profile: only fields that
 * really change are kept. Fields not present in `input` are ignored.
 */
export function diffProfile(
  current: ProfileValues,
  input: Record<string, string | undefined>
): { changes: ChangeSet; errors: Partial<Record<ChangeableField, string>> } {
  const changes: ChangeSet = {};
  const errors: Partial<Record<ChangeableField, string>> = {};
  for (const field of CHANGEABLE_FIELD_KEYS) {
    if (!(field in input)) continue;
    const from = normalize(current[field]);
    const to = normalize(input[field]);
    if (from === to) continue;
    const error = validateFieldValue(field, to);
    if (error) errors[field] = error;
    else changes[field] = { from, to };
  }
  return { changes, errors };
}

/** Display value for a field ("—" when empty, labels for options). */
export function displayFieldValue(field: string, value: string | null): string {
  if (value === null || value === "") return "—";
  if (isChangeableField(field)) {
    const option = CHANGEABLE_FIELDS[field].options?.find((o) => o.value === value);
    if (option) return option.label;
  }
  return value;
}

export function fieldLabel(field: string): string {
  return isChangeableField(field) ? CHANGEABLE_FIELDS[field].label : field;
}
