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
  | "nik"
  // Domicile address (employee_addresses, type "domicile")
  | "domicileAddress"
  | "domicileCity"
  | "domicileProvince"
  | "domicilePostalCode"
  // Primary bank account (employee_bank_accounts)
  | "bankName"
  | "bankAccountNumber"
  | "bankAccountHolder"
  | "bankBranch";

/** Which data a field belongs to (decides the reviewer's permission). */
export type FieldGroup = "personal" | "address" | "bank";

interface FieldSpec {
  label: string;
  kind: "text" | "email" | "phone" | "date" | "select" | "digits";
  group: FieldGroup;
  max?: number;
  min?: number;
  options?: readonly { value: string; label: string }[];
  hint?: string;
  /** Cannot be emptied once set. */
  required?: boolean;
}

export const MARITAL_OPTIONS = [
  { value: "Single", label: "Belum menikah" },
  { value: "Married", label: "Menikah" },
  { value: "Divorced", label: "Cerai hidup" },
  { value: "Widowed", label: "Cerai mati" },
] as const;

export const CHANGEABLE_FIELDS: Record<ChangeableField, FieldSpec> = {
  phone: { label: "Nomor HP", kind: "phone", group: "personal", max: 30, required: true },
  personalEmail: { label: "Email pribadi", kind: "email", group: "personal", max: 254 },
  nickname: { label: "Nama panggilan", kind: "text", group: "personal", max: 100 },
  birthPlace: { label: "Tempat lahir", kind: "text", group: "personal", max: 200 },
  birthDate: { label: "Tanggal lahir", kind: "date", group: "personal" },
  religion: { label: "Agama", kind: "text", group: "personal", max: 50 },
  maritalStatus: { label: "Status pernikahan", kind: "select", group: "personal", options: MARITAL_OPTIONS },
  nationality: { label: "Kewarganegaraan", kind: "text", group: "personal", max: 50 },
  nik: { label: "NIK (KTP)", kind: "text", group: "personal", max: 16, hint: "16 digit sesuai KTP" },
  domicileAddress: { label: "Alamat domisili", kind: "text", group: "address", max: 300 },
  domicileCity: { label: "Kota domisili", kind: "text", group: "address", max: 100 },
  domicileProvince: { label: "Provinsi domisili", kind: "text", group: "address", max: 100 },
  domicilePostalCode: { label: "Kode pos domisili", kind: "digits", group: "address", min: 5, max: 5 },
  bankName: { label: "Nama bank", kind: "text", group: "bank", max: 100, required: true },
  bankAccountNumber: { label: "Nomor rekening", kind: "digits", group: "bank", min: 5, max: 20, required: true },
  bankAccountHolder: { label: "Nama pemilik rekening", kind: "text", group: "bank", max: 100, required: true },
  bankBranch: { label: "Cabang bank", kind: "text", group: "bank", max: 100 },
};

export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  personal: "Data pribadi",
  address: "Alamat domisili",
  bank: "Rekening gaji",
};

export function fieldGroup(field: string): FieldGroup {
  return isChangeableField(field) ? CHANGEABLE_FIELDS[field].group : "personal";
}

/** Groups touched by a change set. */
export function groupsOf(changes: Record<string, unknown>): FieldGroup[] {
  return [...new Set(Object.keys(changes).map(fieldGroup))];
}

/** "1234567890" → "••••••7890" (bank numbers for viewers without bank access). */
export function maskValue(value: string | null): string | null {
  if (!value) return value;
  return value.length <= 4 ? "••••" : `${"•".repeat(Math.min(6, value.length - 4))}${value.slice(-4)}`;
}

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
    return spec.required ? `${spec.label} tidak boleh dikosongkan.` : null;
  }
  if (spec.min && value.length < spec.min) return `${spec.label} minimal ${spec.min} karakter.`;
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
    case "digits":
      return /^\d+$/.test(value) ? null : `${spec.label} hanya boleh berisi angka.`;
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
  // A changed bank account must stay complete (bank, number, holder).
  if (Object.keys(changes).some((f) => fieldGroup(f) === "bank")) {
    for (const field of ["bankName", "bankAccountNumber", "bankAccountHolder"] as const) {
      const after = field in changes ? changes[field]!.to : normalize(current[field]);
      if (!after && !errors[field]) errors[field] = `${CHANGEABLE_FIELDS[field].label} wajib diisi untuk rekening baru.`;
    }
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
