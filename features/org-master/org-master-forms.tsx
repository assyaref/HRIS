"use client";

import { useState } from "react";

import { Field, FormDialog, useRunner } from "@/components/forms/record-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

import {
  importFromEmployeesAction,
  saveDepartmentAction,
  saveGradeAction,
  savePositionAction,
  setMasterActiveAction,
  unifySpellingAction,
} from "./actions";

const TEXTAREA =
  "min-h-[110px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none";

function RenameCheckbox({ usage }: { usage: number }) {
  if (usage === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm sm:col-span-2">
      <input type="checkbox" name="renameEmployees" defaultChecked className="size-4 accent-[var(--primary)]" />
      Jika nama diubah, perbarui juga {usage} data karyawan yang memakai nama ini
    </label>
  );
}

/* Departments ------------------------------------------------------- */

export interface DepartmentInitial {
  id: string;
  name: string;
  division: string | null;
  description: string | null;
}

function DepartmentDialog({ open, onOpenChange, initial, usage, divisions }: { open: boolean; onOpenChange: (o: boolean) => void; initial: DepartmentInitial | null; usage: number; divisions: string[] }) {
  const { pending, error, run } = useRunner();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah departemen" : "Tambah departemen"}
      pending={pending}
      error={error}
      onSubmit={(fd) => run(() => saveDepartmentAction(initial?.id ?? null, fd), () => onOpenChange(false))}
    >
      <Field label="Nama departemen" htmlFor="dp-name">
        <Input id="dp-name" name="name" maxLength={100} defaultValue={initial?.name ?? ""} required />
      </Field>
      <Field label="Divisi" htmlFor="dp-division">
        <Input id="dp-division" name="division" list="om-divisions" maxLength={100} defaultValue={initial?.division ?? ""} />
        <datalist id="om-divisions">
          {divisions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </Field>
      <Field label="Keterangan" htmlFor="dp-desc" wide>
        <Input id="dp-desc" name="description" maxLength={500} defaultValue={initial?.description ?? ""} />
      </Field>
      {initial ? <RenameCheckbox usage={usage} /> : null}
    </FormDialog>
  );
}

export function DepartmentCreateButton({ divisions }: { divisions: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Tambah departemen
      </Button>
      {open ? <DepartmentDialog open={open} onOpenChange={setOpen} initial={null} usage={0} divisions={divisions} /> : null}
    </>
  );
}

export function DepartmentRowActions({ item, active, usage, divisions }: { item: DepartmentInitial; active: boolean; usage: number; divisions: string[] }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Ubah
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setMasterActiveAction("department", item.id, !active))}>
        {active ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      {open ? <DepartmentDialog open={open} onOpenChange={setOpen} initial={item} usage={usage} divisions={divisions} /> : null}
    </div>
  );
}

/* Grades ------------------------------------------------------------ */

export interface GradeInitial {
  id: string;
  code: string;
  name: string;
  level: number;
  description: string | null;
}

function GradeDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: GradeInitial | null }) {
  const { pending, error, run } = useRunner();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah grade" : "Tambah grade"}
      description="Level lebih tinggi = lebih senior."
      pending={pending}
      error={error}
      onSubmit={(fd) => run(() => saveGradeAction(initial?.id ?? null, fd), () => onOpenChange(false))}
    >
      <Field label="Kode" htmlFor="gr-code">
        <Input id="gr-code" name="code" maxLength={16} defaultValue={initial?.code ?? ""} placeholder="mis. G5" required />
      </Field>
      <Field label="Tingkat" htmlFor="gr-level">
        <Input id="gr-level" name="level" type="number" min={1} max={99} defaultValue={initial?.level ?? 1} required />
      </Field>
      <Field label="Nama grade" htmlFor="gr-name" wide>
        <Input id="gr-name" name="name" maxLength={100} defaultValue={initial?.name ?? ""} placeholder="mis. Supervisor" required />
      </Field>
      <Field label="Keterangan" htmlFor="gr-desc" wide>
        <Input id="gr-desc" name="description" maxLength={500} defaultValue={initial?.description ?? ""} />
      </Field>
    </FormDialog>
  );
}

export function GradeCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Tambah grade
      </Button>
      {open ? <GradeDialog open={open} onOpenChange={setOpen} initial={null} /> : null}
    </>
  );
}

export function GradeRowActions({ item, active }: { item: GradeInitial; active: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Ubah
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setMasterActiveAction("grade", item.id, !active))}>
        {active ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      {open ? <GradeDialog open={open} onOpenChange={setOpen} initial={item} /> : null}
    </div>
  );
}

/* Positions --------------------------------------------------------- */

export interface PositionInitial {
  id: string;
  name: string;
  departmentId: string | null;
  gradeId: string | null;
  jobDescription: string | null;
}
export interface Option {
  id: string;
  label: string;
}

function PositionDialog({
  open,
  onOpenChange,
  initial,
  usage,
  departments,
  grades,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: PositionInitial | null;
  usage: number;
  departments: Option[];
  grades: Option[];
}) {
  const { pending, error, run } = useRunner();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah jabatan" : "Tambah jabatan"}
      pending={pending}
      error={error}
      onSubmit={(fd) => run(() => savePositionAction(initial?.id ?? null, fd), () => onOpenChange(false))}
    >
      <Field label="Nama jabatan" htmlFor="ps-name" wide>
        <Input id="ps-name" name="name" maxLength={100} defaultValue={initial?.name ?? ""} required />
      </Field>
      <Field label="Departemen" htmlFor="ps-dept">
        <NativeSelect id="ps-dept" name="departmentId" defaultValue={initial?.departmentId ?? ""}>
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Grade" htmlFor="ps-grade">
        <NativeSelect id="ps-grade" name="gradeId" defaultValue={initial?.gradeId ?? ""}>
          <option value="">—</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Job description" htmlFor="ps-jd" wide>
        <textarea id="ps-jd" name="jobDescription" maxLength={5000} defaultValue={initial?.jobDescription ?? ""} className={TEXTAREA} placeholder="Tanggung jawab utama, wewenang, kualifikasi…" />
      </Field>
      {initial ? <RenameCheckbox usage={usage} /> : null}
    </FormDialog>
  );
}

export function PositionCreateButton({ departments, grades }: { departments: Option[]; grades: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Tambah jabatan
      </Button>
      {open ? <PositionDialog open={open} onOpenChange={setOpen} initial={null} usage={0} departments={departments} grades={grades} /> : null}
    </>
  );
}

export function PositionRowActions({ item, active, usage, departments, grades }: { item: PositionInitial; active: boolean; usage: number; departments: Option[]; grades: Option[] }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Ubah
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setMasterActiveAction("position", item.id, !active))}>
        {active ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      {open ? <PositionDialog open={open} onOpenChange={setOpen} initial={item} usage={usage} departments={departments} grades={grades} /> : null}
    </div>
  );
}

/* Data cleanup ------------------------------------------------------ */

export function ImportButton({ kind, count }: { kind: "department" | "position"; count: number }) {
  const { pending, run } = useRunner();
  return (
    <Button type="button" size="sm" disabled={pending || count === 0} onClick={() => run(() => importFromEmployeesAction(kind))}>
      Tambahkan {count} ke master
    </Button>
  );
}

export function UnifyButton({ kind, count }: { kind: "department" | "position"; count: number }) {
  const { pending, run } = useRunner();
  return (
    <Button type="button" size="sm" variant="outline" disabled={pending || count === 0} onClick={() => run(() => unifySpellingAction(kind))}>
      Seragamkan {count} data karyawan
    </Button>
  );
}
