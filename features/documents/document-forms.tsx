"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { EmployeeSelect, Field, FormDialog, useRunner, type EmployeeOption } from "@/components/forms/record-kit";
import { HrisIcon } from "@/components/layout/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { notifier } from "@/lib/notifier";

import {
  generateLetterAction,
  generatePkwtAction,
  issueNumberAction,
  saveLetterTemplateAction,
  seedLetterTemplatesAction,
  setLetterTemplateActiveAction,
  saveDocumentTypeAction,
  seedDocumentTypesAction,
  setDocumentTypeActiveAction,
  voidDocumentAction,
  type DocumentResult,
} from "./actions";
import { formatDocumentNumber, RESET_LABELS, validateNumberFormat } from "./numbering";
import {
  MERGE_FIELDS,
  paragraphs,
  promptedFields,
  renderTemplate,
  SAMPLE_VALUES,
  validateTemplateBody,
} from "./templates";

const TEXTAREA =
  "min-h-[80px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none";

export interface TypeOption {
  id: string;
  code: string;
  name: string;
}

/** Runs an issuing action, then opens the new letter. */
function useIssue() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(task: () => Promise<DocumentResult>, onDone: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await task();
        if (result.ok && result.id) {
          notifier.success(result.message);
          onDone();
          router.push(`/documents/${result.id}`);
        } else {
          setError(result.message);
        }
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }
  return { pending, error, run };
}

export function IssueNumberButton({
  types,
  employees,
  today,
}: {
  types: TypeOption[];
  employees: EmployeeOption[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useIssue();
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={types.length === 0}>
        <HrisIcon name="document" className="size-4" />
        Ambil nomor surat
      </Button>
      {open ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Ambil nomor surat"
          description="Nomor dibuat otomatis berurutan sesuai format jenis surat."
          pending={pending}
          error={error}
          onSubmit={(fd) => run(() => issueNumberAction(fd), () => setOpen(false))}
        >
          <Field label="Jenis surat" htmlFor="is-type">
            <NativeSelect id="is-type" name="documentTypeId" defaultValue="" required>
              <option value="">Pilih jenis surat</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Tanggal surat" htmlFor="is-date">
            <Input id="is-date" name="issuedDate" type="date" defaultValue={today} required />
          </Field>
          <Field label="Perihal" htmlFor="is-subject" wide>
            <Input id="is-subject" name="subject" maxLength={250} placeholder="mis. Surat Keterangan Kerja a.n. Budi" required />
          </Field>
          <Field label="Tujuan / penerima (opsional)" htmlFor="is-recipient">
            <Input id="is-recipient" name="recipient" maxLength={200} />
          </Field>
          <Field label="Karyawan terkait (opsional)" htmlFor="is-employee">
            <EmployeeSelect id="is-employee" employees={employees} />
          </Field>
          <Field label="Catatan (opsional)" htmlFor="is-notes" wide>
            <Input id="is-notes" name="notes" maxLength={1000} />
          </Field>
        </FormDialog>
      ) : null}
    </>
  );
}

export interface PkwtEmployeeOption extends EmployeeOption {
  position: string | null;
  department: string | null;
}

export function PkwtButton({
  employees,
  today,
  defaultCity,
  canUpdateEmployee,
}: {
  employees: PkwtEmployeeOption[];
  today: string;
  defaultCity: string;
  canUpdateEmployee: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const { pending, error, run } = useIssue();
  const selected = employees.find((e) => e.id === employeeId);
  const nextYear = new Date(`${today}T00:00:00Z`);
  nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
  nextYear.setUTCDate(nextYear.getUTCDate() - 1);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="edit" className="size-4" />
        Buat PKWT
      </Button>
      {open ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Buat PKWT"
          description="Perjanjian Kerja Waktu Tertentu dari data karyawan. Nomor PKWT dibuat otomatis."
          pending={pending}
          error={error}
          onSubmit={(fd) => run(() => generatePkwtAction(fd), () => setOpen(false))}
        >
          <Field label="Karyawan" htmlFor="pk-employee" wide>
            <NativeSelect id="pk-employee" name="employeeId" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
              <option value="">Pilih karyawan</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employeeNumber} — {e.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {/* key: refill position/department when another employee is picked */}
          <Field label="Jabatan" htmlFor="pk-position">
            <Input key={`p-${employeeId}`} id="pk-position" name="position" maxLength={120} defaultValue={selected?.position ?? ""} required />
          </Field>
          <Field label="Departemen" htmlFor="pk-department">
            <Input key={`d-${employeeId}`} id="pk-department" name="department" maxLength={120} defaultValue={selected?.department ?? ""} />
          </Field>
          <Field label="Mulai kontrak" htmlFor="pk-start">
            <Input id="pk-start" name="contractStart" type="date" defaultValue={today} required />
          </Field>
          <Field label="Akhir kontrak" htmlFor="pk-end">
            <Input id="pk-end" name="contractEnd" type="date" defaultValue={nextYear.toISOString().slice(0, 10)} required />
          </Field>
          <Field label="Lokasi kerja" htmlFor="pk-location">
            <Input id="pk-location" name="workLocation" maxLength={200} defaultValue={defaultCity} required />
          </Field>
          <Field label="Upah pokok per bulan (Rp, opsional)" htmlFor="pk-salary">
            <Input id="pk-salary" name="salary" type="number" min={0} step={1000} inputMode="numeric" />
          </Field>
          <Field label="Jam kerja (opsional)" htmlFor="pk-hours" wide>
            <Input id="pk-hours" name="workingHours" maxLength={200} placeholder="mis. Senin–Jumat 08.00–17.00" />
          </Field>
          <Field label="Penandatangan (perusahaan)" htmlFor="pk-signer">
            <Input id="pk-signer" name="signatoryName" maxLength={120} required />
          </Field>
          <Field label="Jabatan penandatangan" htmlFor="pk-signer-title">
            <Input id="pk-signer-title" name="signatoryTitle" maxLength={120} defaultValue="HR Manager" required />
          </Field>
          <Field label="Kota penandatanganan" htmlFor="pk-city">
            <Input id="pk-city" name="city" maxLength={80} defaultValue={defaultCity} required />
          </Field>
          <Field label="Tanggal surat" htmlFor="pk-date">
            <Input id="pk-date" name="issuedDate" type="date" defaultValue={today} required />
          </Field>
          {canUpdateEmployee ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="updateEmployee" defaultChecked className="size-4 accent-[var(--primary)]" />
              Perbarui tanggal kontrak & jenis kepegawaian (Kontrak) di profil karyawan
            </label>
          ) : null}
        </FormDialog>
      ) : null}
    </>
  );
}

export function VoidDocumentButton({ id, documentNumber }: { id: string; documentNumber: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, error, run } = useRunner();
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        Batalkan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Batalkan nomor {documentNumber}?</DialogTitle>
            <DialogDescription>Nomor tetap tercatat sebagai batal dan tidak dipakai ulang.</DialogDescription>
          </DialogHeader>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <textarea aria-label="Alasan pembatalan" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={TEXTAREA} placeholder="Alasan pembatalan" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Kembali
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => voidDocumentAction(id, reason), () => setOpen(false))}>
              Batalkan nomor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Document types                                                      */
/* ------------------------------------------------------------------ */

export interface TypeInitial {
  id: string;
  code: string;
  name: string;
  numberFormat: string;
  sequencePadding: number;
  resetPeriod: string;
}

function TypeDialog({ open, onOpenChange, initial, today }: { open: boolean; onOpenChange: (o: boolean) => void; initial: TypeInitial | null; today: string }) {
  const { pending, error, run } = useRunner();
  const [code, setCode] = useState(initial?.code ?? "");
  const [format, setFormat] = useState(initial?.numberFormat ?? "{seq}/{code}/HRD/{roman}/{year}");
  const [padding, setPadding] = useState(initial?.sequencePadding ?? 3);
  const formatError = validateNumberFormat(format);
  const preview = formatError
    ? null
    : formatDocumentNumber(format, { sequence: 1, padding, code: code.toUpperCase() || "KODE", issuedDate: today });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah jenis surat" : "Tambah jenis surat"}
      description="Token: {seq} nomor urut, {code} kode, {roman} bulan romawi, {month} bulan, {year} tahun, {yy} 2 digit tahun."
      pending={pending}
      error={error}
      onSubmit={(fd) => run(() => saveDocumentTypeAction(initial?.id ?? null, fd), () => onOpenChange(false))}
    >
      <Field label="Kode" htmlFor="dt-code">
        <Input id="dt-code" name="code" maxLength={16} value={code} onChange={(e) => setCode(e.target.value)} placeholder="mis. SK" required />
      </Field>
      <Field label="Nama jenis surat" htmlFor="dt-name">
        <Input id="dt-name" name="name" maxLength={120} defaultValue={initial?.name ?? ""} placeholder="mis. Surat Keputusan" required />
      </Field>
      <Field label="Format nomor" htmlFor="dt-format" wide>
        <Input id="dt-format" name="numberFormat" maxLength={120} value={format} onChange={(e) => setFormat(e.target.value)} className="font-mono" required />
      </Field>
      <Field label="Digit nomor urut" htmlFor="dt-padding">
        <Input id="dt-padding" name="sequencePadding" type="number" min={1} max={8} value={padding} onChange={(e) => setPadding(Number(e.target.value) || 1)} />
      </Field>
      <Field label="Reset penomoran" htmlFor="dt-reset">
        <NativeSelect id="dt-reset" name="resetPeriod" defaultValue={initial?.resetPeriod ?? "yearly"}>
          {Object.entries(RESET_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <p className="rounded-xl bg-muted px-3 py-2 text-sm sm:col-span-2" aria-live="polite">
        {formatError ? (
          <span className="text-destructive">{formatError}</span>
        ) : (
          <>
            Contoh nomor pertama: <span className="font-mono font-semibold">{preview}</span>
          </>
        )}
      </p>
    </FormDialog>
  );
}

export function TypeCreateButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Tambah jenis surat
      </Button>
      {open ? <TypeDialog open={open} onOpenChange={setOpen} initial={null} today={today} /> : null}
    </>
  );
}

export function TypeRowActions({ type, active, today }: { type: TypeInitial; active: boolean; today: string }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Ubah
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setDocumentTypeActiveAction(type.id, !active))}>
        {active ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      {open ? <TypeDialog open={open} onOpenChange={setOpen} initial={type} today={today} /> : null}
    </div>
  );
}

export function SeedTypesButton() {
  const { pending, run } = useRunner();
  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => seedDocumentTypesAction())}>
      Tambah jenis surat standar
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Letter templates                                                    */
/* ------------------------------------------------------------------ */

export interface TemplateInitial {
  id: string;
  documentTypeId: string;
  name: string;
  title: string;
  body: string;
}

function TemplateDialog({
  open,
  onOpenChange,
  initial,
  types,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: TemplateInitial | null;
  types: TypeOption[];
}) {
  const { pending, error, run } = useRunner();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const area = useRef<HTMLTextAreaElement>(null);
  const bodyError = body.trim() ? validateTemplateBody(body) : null;
  const insert = (key: string) => {
    const el = area.current;
    const token = `{{${key}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Ubah templat surat" : "Tambah templat surat"}</DialogTitle>
          <DialogDescription>Paragraf dipisah baris kosong. Klik field untuk menyisipkannya di posisi kursor.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <form
          className="grid gap-4 lg:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            fd.set("body", body);
            run(() => saveLetterTemplateAction(initial?.id ?? null, fd), () => onOpenChange(false));
          }}
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama templat" htmlFor="tp-name">
                <Input id="tp-name" name="name" maxLength={120} defaultValue={initial?.name ?? ""} required />
              </Field>
              <Field label="Jenis surat (penomoran)" htmlFor="tp-type">
                <NativeSelect id="tp-type" name="documentTypeId" defaultValue={initial?.documentTypeId ?? ""} required>
                  <option value="">Pilih jenis</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Judul pada surat" htmlFor="tp-title">
              <Input id="tp-title" name="title" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
            <div className="space-y-2">
              <label htmlFor="tp-body" className="text-sm font-medium">
                Isi surat
              </label>
              <textarea
                id="tp-body"
                ref={area}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={`${TEXTAREA} min-h-[300px] font-mono text-[13px]`}
                maxLength={10000}
              />
              {bodyError ? <p className="text-sm text-destructive">{bodyError}</p> : null}
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Field otomatis">
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  title={f.label}
                  onClick={() => insert(f.key)}
                  className="rounded-full border border-[var(--card-border)] bg-muted px-2.5 py-1 font-mono text-[11.5px] hover:border-primary hover:text-primary"
                >
                  {`{{${f.key}}}`}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Pratinjau (data contoh)</p>
            <div className="max-h-[520px] overflow-y-auto rounded-xl border border-[var(--card-border)] bg-white p-5 font-serif text-[13px] leading-relaxed text-black">
              <p className="text-center font-bold uppercase underline">{title || "JUDUL SURAT"}</p>
              <p className="mb-3 text-center text-[12px]">Nomor: {SAMPLE_VALUES.nomor_surat}</p>
              {paragraphs(renderTemplate(body, SAMPLE_VALUES)).map((p, i) => (
                <p key={i} className="mb-2 text-justify whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
          </div>
          <DialogFooter className="lg:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending || Boolean(bodyError)}>
              {pending ? "Menyimpan..." : "Simpan templat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TemplateCreateButton({ types }: { types: TypeOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={types.length === 0}>
        Tambah templat
      </Button>
      {open ? <TemplateDialog open={open} onOpenChange={setOpen} initial={null} types={types} /> : null}
    </>
  );
}

export function TemplateRowActions({ template, active, types }: { template: TemplateInitial; active: boolean; types: TypeOption[] }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Ubah
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setLetterTemplateActiveAction(template.id, !active))}>
        {active ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      {open ? <TemplateDialog open={open} onOpenChange={setOpen} initial={template} types={types} /> : null}
    </div>
  );
}

export function SeedTemplatesButton() {
  const { pending, run } = useRunner();
  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => seedLetterTemplatesAction())}>
      Tambah templat standar
    </Button>
  );
}

export interface TemplateOption {
  id: string;
  name: string;
  typeCode: string;
  body: string;
}

export function GenerateLetterButton({
  templates,
  employees,
  today,
}: {
  templates: TemplateOption[];
  employees: EmployeeOption[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const { pending, error, run } = useIssue();
  const selected = templates.find((t) => t.id === templateId);
  const prompts = selected ? promptedFields(selected.body) : [];
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={templates.length === 0}>
        <HrisIcon name="document" className="size-4" />
        Buat surat dari templat
      </Button>
      {open ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Buat surat dari templat"
          description="Data karyawan diisi otomatis; nomor surat terbit sesuai jenis templat."
          pending={pending}
          error={error}
          onSubmit={(fd) => run(() => generateLetterAction(fd), () => setOpen(false))}
        >
          <Field label="Templat" htmlFor="lt-template">
            <NativeSelect id="lt-template" name="templateId" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
              <option value="">Pilih templat</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.typeCode} — {t.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Karyawan" htmlFor="lt-employee">
            <EmployeeSelect id="lt-employee" employees={employees} />
          </Field>
          {prompts.includes("keterangan") ? (
            <Field label="Keterangan" htmlFor="lt-note" wide>
              <textarea id="lt-note" name="keterangan" maxLength={1000} required className={TEXTAREA} placeholder="Isi untuk {{keterangan}} (mis. keperluan, pelanggaran, tugas)" />
            </Field>
          ) : null}
          {prompts.includes("tanggal_mulai") ? (
            <Field label="Tanggal mulai" htmlFor="lt-start">
              <Input id="lt-start" name="tanggalMulai" type="date" defaultValue={today} required />
            </Field>
          ) : null}
          {prompts.includes("tanggal_selesai") ? (
            <Field label="Tanggal selesai" htmlFor="lt-end">
              <Input id="lt-end" name="tanggalSelesai" type="date" required />
            </Field>
          ) : null}
          <Field label="Penandatangan" htmlFor="lt-signer">
            <Input id="lt-signer" name="signatoryName" maxLength={120} required />
          </Field>
          <Field label="Jabatan penandatangan" htmlFor="lt-signer-title">
            <Input id="lt-signer-title" name="signatoryTitle" maxLength={120} defaultValue="HR Manager" required />
          </Field>
          <Field label="Kota" htmlFor="lt-city">
            <Input id="lt-city" name="city" maxLength={80} required />
          </Field>
          <Field label="Tanggal surat" htmlFor="lt-date">
            <Input id="lt-date" name="issuedDate" type="date" defaultValue={today} required />
          </Field>
        </FormDialog>
      ) : null}
    </>
  );
}
