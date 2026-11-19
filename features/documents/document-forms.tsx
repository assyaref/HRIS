"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
  generatePkwtAction,
  issueNumberAction,
  saveDocumentTypeAction,
  seedDocumentTypesAction,
  setDocumentTypeActiveAction,
  voidDocumentAction,
  type DocumentResult,
} from "./actions";
import { formatDocumentNumber, RESET_LABELS, validateNumberFormat } from "./numbering";

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
