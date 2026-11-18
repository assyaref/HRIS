"use client";

import { useState } from "react";

import { HrisIcon } from "@/components/layout/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  ConfirmDelete,
  EmployeeSelect,
  Field,
  FormDialog,
  useRunner,
  type EmployeeOption,
} from "@/components/forms/record-kit";

import {
  addTrainingRequirementAction,
  deleteMcuAction,
  deleteTrainingAction,
  deleteTrainingMasterAction,
  deleteTrainingRequirementAction,
  saveMcuAction,
  saveTrainingAction,
  saveTrainingMasterAction,
  setTrainingMasterActiveAction,
} from "./records.actions";
import { MCU_RESULT_LABELS, TRAINING_TYPE_LABELS } from "./validity";

export type { EmployeeOption };
export interface MasterOption {
  id: string;
  name: string;
  validityMonths: number | null;
}

/* ------------------------------------------------------------------ */
/* MCU                                                                 */
/* ------------------------------------------------------------------ */

export interface McuInitial {
  id: string;
  employeeId: string;
  checkupDate: string;
  validUntil: string | null;
  provider: string | null;
  location: string | null;
  doctor: string | null;
  result: string;
  notes: string | null;
}

function McuDialog({
  open,
  onOpenChange,
  employees,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeOption[];
  initial: McuInitial | null;
}) {
  const { pending, error, run } = useRunner();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah data MCU" : "Catat MCU"}
      description="Hasil medical check-up dan masa berlakunya."
      pending={pending}
      error={error}
      onSubmit={(fd) => run(() => saveMcuAction(initial?.id ?? null, fd), () => onOpenChange(false))}
    >
      <Field label="Karyawan" htmlFor="mcu-employee" wide>
        <EmployeeSelect id="mcu-employee" employees={employees} value={initial?.employeeId} />
      </Field>
      <Field label="Tanggal pemeriksaan" htmlFor="mcu-date">
        <Input id="mcu-date" name="checkupDate" type="date" defaultValue={initial?.checkupDate ?? ""} required />
      </Field>
      <Field label="Berlaku sampai" htmlFor="mcu-valid">
        <Input id="mcu-valid" name="validUntil" type="date" defaultValue={initial?.validUntil ?? ""} />
      </Field>
      <Field label="Hasil" htmlFor="mcu-result">
        <NativeSelect id="mcu-result" name="result" defaultValue={initial?.result ?? "fit"}>
          {Object.entries(MCU_RESULT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Provider / klinik" htmlFor="mcu-provider">
        <Input id="mcu-provider" name="provider" maxLength={200} defaultValue={initial?.provider ?? ""} />
      </Field>
      <Field label="Lokasi" htmlFor="mcu-location">
        <Input id="mcu-location" name="location" maxLength={200} defaultValue={initial?.location ?? ""} />
      </Field>
      <Field label="Dokter" htmlFor="mcu-doctor">
        <Input id="mcu-doctor" name="doctor" maxLength={200} defaultValue={initial?.doctor ?? ""} />
      </Field>
      <Field label="Catatan" htmlFor="mcu-notes" wide>
        <Input id="mcu-notes" name="notes" maxLength={1000} defaultValue={initial?.notes ?? ""} />
      </Field>
    </FormDialog>
  );
}

export function McuCreateButton({ employees }: { employees: EmployeeOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="user-plus" className="size-4" />
        Catat MCU
      </Button>
      {open ? <McuDialog open={open} onOpenChange={setOpen} employees={employees} initial={null} /> : null}
    </>
  );
}

export function McuRowActions({ record, employees }: { record: McuInitial; employees: EmployeeOption[] }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Ubah
      </Button>
      <ConfirmDelete label="Data MCU ini" pending={pending} onConfirm={() => run(() => deleteMcuAction(record.id))} />
      {open ? <McuDialog open={open} onOpenChange={setOpen} employees={employees} initial={record} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Training records                                                    */
/* ------------------------------------------------------------------ */

export interface TrainingInitial {
  id: string;
  employeeId: string;
  trainingMasterId: string | null;
  title: string;
  certificateNumber: string | null;
  issuer: string | null;
  location: string | null;
  trainingDate: string;
  validUntil: string | null;
  notes: string | null;
}

function TrainingDialog({
  open,
  onOpenChange,
  employees,
  masters,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeOption[];
  masters: MasterOption[];
  initial: TrainingInitial | null;
}) {
  const { pending, error, run } = useRunner();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah data training" : "Catat training / sertifikat"}
      description="Kosongkan 'Berlaku sampai' untuk memakai masa berlaku dari master training."
      pending={pending}
      error={error}
      onSubmit={(fd) => run(() => saveTrainingAction(initial?.id ?? null, fd), () => onOpenChange(false))}
    >
      <Field label="Karyawan" htmlFor="tr-employee" wide>
        <EmployeeSelect id="tr-employee" employees={employees} value={initial?.employeeId} />
      </Field>
      <Field label="Master training" htmlFor="tr-master">
        <NativeSelect id="tr-master" name="trainingMasterId" defaultValue={initial?.trainingMasterId ?? ""}>
          <option value="">— Tanpa master —</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.validityMonths ? ` (${m.validityMonths} bln)` : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Judul (jika tanpa master)" htmlFor="tr-title">
        <Input id="tr-title" name="title" maxLength={200} defaultValue={initial?.title ?? ""} />
      </Field>
      <Field label="Tanggal training" htmlFor="tr-date">
        <Input id="tr-date" name="trainingDate" type="date" defaultValue={initial?.trainingDate ?? ""} required />
      </Field>
      <Field label="Berlaku sampai" htmlFor="tr-valid">
        <Input id="tr-valid" name="validUntil" type="date" defaultValue={initial?.validUntil ?? ""} />
      </Field>
      <Field label="No. sertifikat" htmlFor="tr-cert">
        <Input id="tr-cert" name="certificateNumber" maxLength={100} defaultValue={initial?.certificateNumber ?? ""} />
      </Field>
      <Field label="Penerbit" htmlFor="tr-issuer">
        <Input id="tr-issuer" name="issuer" maxLength={200} defaultValue={initial?.issuer ?? ""} />
      </Field>
      <Field label="Lokasi" htmlFor="tr-location">
        <Input id="tr-location" name="location" maxLength={200} defaultValue={initial?.location ?? ""} />
      </Field>
      <Field label="Catatan" htmlFor="tr-notes">
        <Input id="tr-notes" name="notes" maxLength={1000} defaultValue={initial?.notes ?? ""} />
      </Field>
    </FormDialog>
  );
}

export function TrainingCreateButton({ employees, masters }: { employees: EmployeeOption[]; masters: MasterOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="user-plus" className="size-4" />
        Catat training
      </Button>
      {open ? (
        <TrainingDialog open={open} onOpenChange={setOpen} employees={employees} masters={masters} initial={null} />
      ) : null}
    </>
  );
}

export function TrainingRowActions({
  record,
  employees,
  masters,
}: {
  record: TrainingInitial;
  employees: EmployeeOption[];
  masters: MasterOption[];
}) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Ubah
      </Button>
      <ConfirmDelete label="Data training ini" pending={pending} onConfirm={() => run(() => deleteTrainingAction(record.id))} />
      {open ? (
        <TrainingDialog open={open} onOpenChange={setOpen} employees={employees} masters={masters} initial={record} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Training masters                                                    */
/* ------------------------------------------------------------------ */

export interface MasterInitial {
  id: string;
  name: string;
  category: string | null;
  trainingType: string;
  durationHours: number | null;
  organizer: string | null;
  validityMonths: number | null;
  isMandatory: boolean;
  active: boolean;
  recordCount: number;
}

function MasterDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: MasterInitial | null;
}) {
  const { pending, error, run } = useRunner();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah master training" : "Tambah master training"}
      pending={pending}
      error={error}
      onSubmit={(fd) => run(() => saveTrainingMasterAction(initial?.id ?? null, fd), () => onOpenChange(false))}
    >
      <Field label="Nama training" htmlFor="tm-name" wide>
        <Input id="tm-name" name="name" maxLength={200} defaultValue={initial?.name ?? ""} required />
      </Field>
      <Field label="Tipe" htmlFor="tm-type">
        <NativeSelect id="tm-type" name="trainingType" defaultValue={initial?.trainingType ?? "internal"}>
          {Object.entries(TRAINING_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Kategori" htmlFor="tm-category">
        <Input id="tm-category" name="category" maxLength={100} defaultValue={initial?.category ?? ""} placeholder="mis. K3, Teknis" />
      </Field>
      <Field label="Durasi (jam)" htmlFor="tm-duration">
        <Input id="tm-duration" name="durationHours" type="number" min={0} defaultValue={initial?.durationHours ?? ""} />
      </Field>
      <Field label="Masa berlaku sertifikat (bulan)" htmlFor="tm-validity">
        <Input id="tm-validity" name="validityMonths" type="number" min={1} defaultValue={initial?.validityMonths ?? ""} placeholder="Kosong = tidak kedaluwarsa" />
      </Field>
      <Field label="Penyelenggara" htmlFor="tm-organizer">
        <Input id="tm-organizer" name="organizer" maxLength={200} defaultValue={initial?.organizer ?? ""} />
      </Field>
      <div className="flex items-center gap-2 self-end pb-2">
        <input id="tm-mandatory" name="isMandatory" type="checkbox" defaultChecked={initial?.isMandatory ?? false} className="size-4" />
        <Label htmlFor="tm-mandatory">Wajib</Label>
      </div>
    </FormDialog>
  );
}

export function MasterCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Tambah master
      </Button>
      {open ? <MasterDialog open={open} onOpenChange={setOpen} initial={null} /> : null}
    </>
  );
}

export function MasterRowActions({ master }: { master: MasterInitial }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Ubah
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setTrainingMasterActiveAction(master.id, !master.active))}
      >
        {master.active ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      {master.recordCount === 0 ? (
        <ConfirmDelete label={`Master "${master.name}"`} pending={pending} onConfirm={() => run(() => deleteTrainingMasterAction(master.id))} />
      ) : null}
      {open ? <MasterDialog open={open} onOpenChange={setOpen} initial={master} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matrix                                                              */
/* ------------------------------------------------------------------ */

export function RequirementForm({ positions, masters }: { positions: string[]; masters: MasterOption[] }) {
  const { pending, error, run } = useRunner();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fd = new FormData(form);
        run(() => addTrainingRequirementAction(fd), () => form.reset());
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="req-position">Jabatan</Label>
        <Input id="req-position" name="position" list="req-positions" maxLength={100} placeholder="Pilih atau ketik jabatan" required />
        <datalist id="req-positions">
          {positions.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="req-master">Training wajib</Label>
        <NativeSelect id="req-master" name="trainingMasterId" defaultValue="" required>
          <option value="">Pilih training</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" disabled={pending}>
        Tambahkan
      </Button>
      {error ? <p className="text-sm text-destructive sm:col-span-3">{error}</p> : null}
    </form>
  );
}

export function RequirementRemoveButton({ id, label }: { id: string; label: string }) {
  const { pending, run } = useRunner();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Hapus kewajiban ${label}`}
      onClick={() => run(() => deleteTrainingRequirementAction(id))}
      className="ml-1 inline-flex size-4 items-center justify-center rounded-full text-current opacity-60 hover:opacity-100 disabled:opacity-30"
    >
      <HrisIcon name="close" className="size-3" />
    </button>
  );
}
