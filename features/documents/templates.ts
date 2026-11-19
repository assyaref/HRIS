/**
 * Letter templates — PURE (no framework imports; unit-tested).
 *
 * A template body is plain text: paragraphs separated by blank lines, with
 * {{field}} placeholders filled from employee / letter data. Rendering never
 * produces HTML (the letter view prints text), so a template cannot inject
 * markup. Unknown placeholders are rejected when a template is saved.
 */

export const MERGE_FIELDS = [
  { key: "nama", label: "Nama karyawan", sample: "Budi Santoso" },
  { key: "nomor_karyawan", label: "No. induk karyawan", sample: "EMP-0001" },
  { key: "nik", label: "NIK", sample: "3201234567890001" },
  { key: "jabatan", label: "Jabatan", sample: "Supervisor" },
  { key: "departemen", label: "Departemen", sample: "Akuntansi" },
  { key: "divisi", label: "Divisi", sample: "Keuangan" },
  { key: "lokasi_kerja", label: "Lokasi kerja", sample: "Kantor Pusat" },
  { key: "tanggal_masuk", label: "Tanggal masuk", sample: "18 Januari 2022" },
  { key: "jenis_kepegawaian", label: "Jenis kepegawaian", sample: "Tetap" },
  { key: "alamat", label: "Alamat (KTP)", sample: "Jl. Merdeka 1, Jakarta" },
  { key: "perusahaan", label: "Nama perusahaan", sample: "PT Contoh Sejahtera" },
  { key: "nomor_surat", label: "Nomor surat", sample: "001/SKK/HRD/XI/2026" },
  { key: "tanggal_surat", label: "Tanggal surat", sample: "19 November 2026" },
  { key: "kota", label: "Kota", sample: "Jakarta" },
  { key: "penandatangan", label: "Penandatangan", sample: "Siti Rahmawati" },
  { key: "jabatan_penandatangan", label: "Jabatan penandatangan", sample: "HR Manager" },
  { key: "keterangan", label: "Keterangan (diisi saat membuat surat)", sample: "keperluan pengajuan KPR" },
  { key: "tanggal_mulai", label: "Tanggal mulai (diisi saat membuat surat)", sample: "1 Desember 2026" },
  { key: "tanggal_selesai", label: "Tanggal selesai (diisi saat membuat surat)", sample: "31 Mei 2027" },
] as const;

export type MergeField = (typeof MERGE_FIELDS)[number]["key"];
export type MergeValues = Partial<Record<MergeField, string | null>>;

const KNOWN = new Set<string>(MERGE_FIELDS.map((f) => f.key));
const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Placeholders used by a body (unique, in order). */
export function placeholdersOf(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/** Error message for a template body, or null when it is valid. */
export function validateTemplateBody(body: string): string | null {
  const text = body.trim();
  if (text.length < 20) return "Isi templat minimal 20 karakter.";
  if (text.length > 10_000) return "Isi templat maksimal 10.000 karakter.";
  const unknown = placeholdersOf(text).filter((k) => !KNOWN.has(k));
  if (unknown.length > 0) return `Field tidak dikenal: ${unknown.map((k) => `{{${k}}}`).join(", ")}.`;
  const stray = text.replace(PLACEHOLDER, "");
  if (stray.includes("{{") || stray.includes("}}")) return "Ada kurung kurawal {{ }} yang tidak lengkap.";
  return null;
}

/** Fills placeholders; an empty value renders as "—". */
export function renderTemplate(body: string, values: MergeValues): string {
  return body.replace(PLACEHOLDER, (_, key: string) => {
    const value = values[key as MergeField];
    return value && value.trim() !== "" ? value.trim() : "—";
  });
}

/** Paragraphs of a rendered body (blank-line separated, trimmed, non-empty). */
export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Fields a template expects the user to type when creating a letter. */
export function promptedFields(body: string): ("keterangan" | "tanggal_mulai" | "tanggal_selesai")[] {
  const used = new Set(placeholdersOf(body));
  return (["keterangan", "tanggal_mulai", "tanggal_selesai"] as const).filter((k) => used.has(k));
}

export const SAMPLE_VALUES: MergeValues = Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.sample]));

/** Ready-made templates (type code → created with the default letter types). */
export const DEFAULT_TEMPLATES: { typeCode: string; name: string; title: string; body: string }[] = [
  {
    typeCode: "SKK",
    name: "Surat Keterangan Kerja",
    title: "SURAT KETERANGAN KERJA",
    body: `Yang bertanda tangan di bawah ini, {{penandatangan}}, selaku {{jabatan_penandatangan}} {{perusahaan}}, dengan ini menerangkan bahwa:

Nama: {{nama}}
No. Induk Karyawan: {{nomor_karyawan}}
NIK: {{nik}}
Jabatan: {{jabatan}}
Departemen: {{departemen}}

adalah benar karyawan {{perusahaan}} yang bekerja sejak tanggal {{tanggal_masuk}} sampai dengan saat surat ini diterbitkan, dengan status kepegawaian {{jenis_kepegawaian}}.

Surat keterangan ini dibuat untuk {{keterangan}}, dan dapat dipergunakan sebagaimana mestinya.`,
  },
  {
    typeCode: "SP",
    name: "Surat Peringatan Pertama (SP-1)",
    title: "SURAT PERINGATAN PERTAMA (SP-1)",
    body: `Ditujukan kepada:

Nama: {{nama}}
No. Induk Karyawan: {{nomor_karyawan}}
Jabatan: {{jabatan}}
Departemen: {{departemen}}

Berdasarkan evaluasi perusahaan, Saudara/i telah melakukan pelanggaran berupa: {{keterangan}}.

Sehubungan dengan hal tersebut, perusahaan memberikan Surat Peringatan Pertama (SP-1) yang berlaku sejak {{tanggal_mulai}} sampai dengan {{tanggal_selesai}}. Apabila dalam masa berlaku surat ini Saudara/i kembali melakukan pelanggaran, perusahaan dapat memberikan sanksi lebih lanjut sesuai peraturan perusahaan.

Demikian surat peringatan ini disampaikan agar menjadi perhatian dan perbaikan.`,
  },
  {
    typeCode: "SP",
    name: "Surat Peringatan Kedua (SP-2)",
    title: "SURAT PERINGATAN KEDUA (SP-2)",
    body: `Ditujukan kepada:

Nama: {{nama}}
No. Induk Karyawan: {{nomor_karyawan}}
Jabatan: {{jabatan}}
Departemen: {{departemen}}

Menindaklanjuti peringatan sebelumnya, Saudara/i kembali melakukan pelanggaran berupa: {{keterangan}}.

Oleh karena itu, perusahaan memberikan Surat Peringatan Kedua (SP-2) yang berlaku sejak {{tanggal_mulai}} sampai dengan {{tanggal_selesai}}. Pelanggaran berikutnya dalam masa berlaku surat ini dapat berakibat pada Surat Peringatan Ketiga.

Demikian surat peringatan ini disampaikan untuk diperhatikan.`,
  },
  {
    typeCode: "SP",
    name: "Surat Peringatan Ketiga (SP-3)",
    title: "SURAT PERINGATAN KETIGA (SP-3)",
    body: `Ditujukan kepada:

Nama: {{nama}}
No. Induk Karyawan: {{nomor_karyawan}}
Jabatan: {{jabatan}}
Departemen: {{departemen}}

Saudara/i telah menerima Surat Peringatan Pertama dan Kedua, namun kembali melakukan pelanggaran berupa: {{keterangan}}.

Perusahaan memberikan Surat Peringatan Ketiga (SP-3) yang berlaku sejak {{tanggal_mulai}} sampai dengan {{tanggal_selesai}}. Pelanggaran selanjutnya dapat ditindaklanjuti dengan pemutusan hubungan kerja sesuai peraturan perusahaan dan peraturan perundang-undangan.

Demikian surat peringatan ini disampaikan untuk diperhatikan dengan sungguh-sungguh.`,
  },
  {
    typeCode: "ST",
    name: "Surat Tugas",
    title: "SURAT TUGAS",
    body: `Yang bertanda tangan di bawah ini, {{penandatangan}}, selaku {{jabatan_penandatangan}} {{perusahaan}}, menugaskan kepada:

Nama: {{nama}}
No. Induk Karyawan: {{nomor_karyawan}}
Jabatan: {{jabatan}}

untuk melaksanakan tugas: {{keterangan}}, pada tanggal {{tanggal_mulai}} sampai dengan {{tanggal_selesai}}.

Setelah melaksanakan tugas, yang bersangkutan wajib menyampaikan laporan kepada atasan. Demikian surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.`,
  },
  {
    typeCode: "SK",
    name: "SK Pengangkatan Karyawan Tetap",
    title: "SURAT KEPUTUSAN PENGANGKATAN KARYAWAN TETAP",
    body: `Direksi {{perusahaan}}, menimbang hasil evaluasi kinerja dan kebutuhan perusahaan, memutuskan:

Menetapkan Saudara/i {{nama}} (No. Induk Karyawan {{nomor_karyawan}}), yang bekerja sejak {{tanggal_masuk}}, diangkat sebagai karyawan tetap pada jabatan {{jabatan}}, Departemen {{departemen}}, terhitung mulai tanggal {{tanggal_mulai}}.

Hak dan kewajiban yang bersangkutan mengikuti peraturan perusahaan dan peraturan perundang-undangan yang berlaku.

Keputusan ini berlaku sejak tanggal ditetapkan, dengan ketentuan apabila di kemudian hari terdapat kekeliruan akan diperbaiki sebagaimana mestinya.`,
  },
];
