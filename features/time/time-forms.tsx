"use client";

import { useMemo, useState } from "react";

import {
  ConfirmDelete,
  EmployeeSelect,
  Field,
  FormDialog,
  useRunner,
  type EmployeeOption,
} from "@/components/forms/record-kit";
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

import { createPayrollComponentAction } from "@/features/payroll/actions";

import { OVERTIME_COMPONENT_CODE } from "./overtime-pay";

import {
  cancelOvertimeAction,
  createOvertimeForEmployeeAction,
  deleteHolidayAction,
  deleteShiftAction,
  deleteWorkGroupAction,
  reviewOvertimeAction,
  saveHolidayAction,
  saveShiftAction,
  saveWorkGroupAction,
  setShiftActiveAction,
  setWorkGroupMembersAction,
  submitOvertimeAction,
} from "./actions";
import { formatDuration, HOLIDAY_TYPE_LABELS, spanMinutes, WEEKDAYS } from "./rules";

const TEXTAREA =
  "min-h-[88px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none";

/* ------------------------------------------------------------------ */
/* Holidays                                                            */
/* ------------------------------------------------------------------ */

export function HolidayCreateButton({ defaultDate }: { defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRunner();
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="calendar" className="size-4" />
        Tambah hari libur
      </Button>
      {open ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Tambah hari libur"
          description="Libur nasional, cuti bersama, atau libur khusus perusahaan."
          pending={pending}
          error={error}
          onSubmit={(fd) => run(() => saveHolidayAction(fd), () => setOpen(false))}
        >
          <Field label="Tanggal" htmlFor="hol-date">
            <Input id="hol-date" name="holidayDate" type="date" defaultValue={defaultDate} required />
          </Field>
          <Field label="Jenis" htmlFor="hol-type">
            <NativeSelect id="hol-type" name="holidayType" defaultValue="national">
              {Object.entries(HOLIDAY_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Nama hari libur" htmlFor="hol-name" wide>
            <Input id="hol-name" name="name" maxLength={150} placeholder="mis. Hari Kemerdekaan RI" required />
          </Field>
        </FormDialog>
      ) : null}
    </>
  );
}

export function HolidayDeleteButton({ id, name }: { id: string; name: string }) {
  const { pending, run } = useRunner();
  return <ConfirmDelete label={`Hari libur "${name}"`} pending={pending} onConfirm={() => run(() => deleteHolidayAction(id))} />;
}

/* ------------------------------------------------------------------ */
/* Shifts                                                              */
/* ------------------------------------------------------------------ */

export interface ShiftInitial {
  id: string;
  name: string;
  color: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workingDays: number[];
  active: boolean;
}

function ShiftDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ShiftInitial | null;
}) {
  const { pending, error, run } = useRunner();
  const days = new Set(initial?.workingDays ?? [1, 2, 3, 4, 5]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah shift" : "Tambah shift"}
      description="Jam pulang lebih awal dari jam masuk berarti shift melewati tengah malam."
      pending={pending}
      error={error}
      onSubmit={(fd) => run(() => saveShiftAction(initial?.id ?? null, fd), () => onOpenChange(false))}
    >
      <Field label="Nama shift" htmlFor="sh-name">
        <Input id="sh-name" name="name" maxLength={100} defaultValue={initial?.name ?? ""} placeholder="mis. Pagi" required />
      </Field>
      <Field label="Warna" htmlFor="sh-color">
        <Input id="sh-color" name="color" type="color" defaultValue={initial?.color ?? "#3B82F6"} className="h-10 p-1" />
      </Field>
      <Field label="Jam masuk" htmlFor="sh-start">
        <Input id="sh-start" name="startTime" type="time" defaultValue={initial?.startTime ?? "08:00"} required />
      </Field>
      <Field label="Jam pulang" htmlFor="sh-end">
        <Input id="sh-end" name="endTime" type="time" defaultValue={initial?.endTime ?? "17:00"} required />
      </Field>
      <Field label="Istirahat (menit)" htmlFor="sh-break">
        <Input id="sh-break" name="breakMinutes" type="number" min={0} max={600} defaultValue={initial?.breakMinutes ?? 60} required />
      </Field>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-sm font-medium">Hari kerja</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <label
              key={day.value}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-muted px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary"
            >
              <input
                type="checkbox"
                name="workingDays"
                value={day.value}
                defaultChecked={days.has(day.value)}
                className="size-3.5 accent-[var(--primary)]"
              />
              {day.short}
            </label>
          ))}
        </div>
      </fieldset>
    </FormDialog>
  );
}

export function ShiftCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="clock" className="size-4" />
        Tambah shift
      </Button>
      {open ? <ShiftDialog open={open} onOpenChange={setOpen} initial={null} /> : null}
    </>
  );
}

export function ShiftRowActions({ shift }: { shift: ShiftInitial }) {
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
        onClick={() => run(() => setShiftActiveAction(shift.id, !shift.active))}
      >
        {shift.active ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      <ConfirmDelete label={`Shift "${shift.name}"`} pending={pending} onConfirm={() => run(() => deleteShiftAction(shift.id))} />
      {open ? <ShiftDialog open={open} onOpenChange={setOpen} initial={shift} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Work groups                                                         */
/* ------------------------------------------------------------------ */

export interface ShiftOption {
  id: string;
  name: string;
  hours: string;
}
export interface WorkGroupInitial {
  id: string;
  name: string;
  shiftId: string | null;
  description: string | null;
  memberIds: string[];
}

function WorkGroupDialog({
  open,
  onOpenChange,
  initial,
  shifts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: WorkGroupInitial | null;
  shifts: ShiftOption[];
}) {
  const { pending, error, run } = useRunner();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah grup kerja" : "Tambah grup kerja"}
      description="Kelompokkan karyawan dengan jadwal shift yang sama."
      pending={pending}
      error={error}
      onSubmit={(fd) => run(() => saveWorkGroupAction(initial?.id ?? null, fd), () => onOpenChange(false))}
    >
      <Field label="Nama grup" htmlFor="wg-name">
        <Input id="wg-name" name="name" maxLength={100} defaultValue={initial?.name ?? ""} placeholder="mis. Tim Gudang A" required />
      </Field>
      <Field label="Shift" htmlFor="wg-shift">
        <NativeSelect id="wg-shift" name="shiftId" defaultValue={initial?.shiftId ?? ""}>
          <option value="">Tanpa shift</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.hours})
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Keterangan" htmlFor="wg-desc" wide>
        <Input id="wg-desc" name="description" maxLength={500} defaultValue={initial?.description ?? ""} />
      </Field>
    </FormDialog>
  );
}

export function WorkGroupCreateButton({ shifts }: { shifts: ShiftOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="users-cog" className="size-4" />
        Tambah grup
      </Button>
      {open ? <WorkGroupDialog open={open} onOpenChange={setOpen} initial={null} shifts={shifts} /> : null}
    </>
  );
}

function MembersDialog({
  open,
  onOpenChange,
  group,
  employees,
  assigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: WorkGroupInitial;
  employees: EmployeeOption[];
  /** employeeId → name of the group they are in now (other groups only). */
  assigned: Record<string, string>;
}) {
  const { pending, error, run } = useRunner();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(group.memberIds));
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) || e.employeeNumber.toLowerCase().includes(q)
    );
  }, [employees, query]);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Anggota {group.name}</DialogTitle>
          <DialogDescription>
            {selected.size} karyawan dipilih. Karyawan dari grup lain akan dipindahkan ke grup ini.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari nama atau nomor karyawan"
          aria-label="Cari karyawan"
        />
        <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-xl border border-[var(--card-border)]">
          {visible.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Tidak ada karyawan yang cocok.</li>
          ) : (
            visible.map((e) => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    onChange={() => toggle(e.id)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{e.employeeNumber}</span>
                  </span>
                  {assigned[e.id] ? (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {assigned[e.id]}
                    </span>
                  ) : null}
                </label>
              </li>
            ))
          )}
        </ul>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => setWorkGroupMembersAction(group.id, [...selected]), () => onOpenChange(false))}
          >
            {pending ? "Menyimpan..." : "Simpan anggota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkGroupRowActions({
  group,
  shifts,
  employees,
  assigned,
}: {
  group: WorkGroupInitial;
  shifts: ShiftOption[];
  employees: EmployeeOption[];
  assigned: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [members, setMembers] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={() => setMembers(true)}>
        Atur anggota
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
        Ubah
      </Button>
      <ConfirmDelete
        label={`Grup "${group.name}" (anggota dilepas dari grup)`}
        pending={pending}
        onConfirm={() => run(() => deleteWorkGroupAction(group.id))}
      />
      {editing ? <WorkGroupDialog open={editing} onOpenChange={setEditing} initial={group} shifts={shifts} /> : null}
      {members ? (
        <MembersDialog open={members} onOpenChange={setMembers} group={group} employees={employees} assigned={assigned} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overtime                                                            */
/* ------------------------------------------------------------------ */

function OvertimeFields({ defaultDate }: { defaultDate: string }) {
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("19:00");
  const minutes = spanMinutes(start, end);
  return (
    <>
      <Field label="Tanggal lembur" htmlFor="ot-date">
        <Input id="ot-date" name="overtimeDate" type="date" defaultValue={defaultDate} required />
      </Field>
      <Field label="No. SPKL (opsional)" htmlFor="ot-spkl">
        <Input id="ot-spkl" name="spklNumber" maxLength={100} />
      </Field>
      <Field label="Jam mulai" htmlFor="ot-start">
        <Input id="ot-start" name="startTime" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
      </Field>
      <Field label="Jam selesai" htmlFor="ot-end">
        <Input id="ot-end" name="endTime" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
      </Field>
      <p className="text-sm text-muted-foreground sm:col-span-2" aria-live="polite">
        Durasi: <span className="font-semibold text-foreground">{minutes === null ? "—" : formatDuration(minutes)}</span>
        {minutes !== null && end < start ? " (melewati tengah malam)" : null}
      </p>
      <Field label="Uraian pekerjaan" htmlFor="ot-reason" wide>
        <textarea id="ot-reason" name="reason" maxLength={1000} required className={TEXTAREA} placeholder="Pekerjaan yang dilakukan selama lembur" />
      </Field>
    </>
  );
}

export function OvertimeSubmitButton({ defaultDate }: { defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRunner();
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="clock" className="size-4" />
        Ajukan lembur
      </Button>
      {open ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Ajukan lembur"
          description="Pengajuan akan ditinjau atasan / HR."
          pending={pending}
          error={error}
          onSubmit={(fd) => run(() => submitOvertimeAction(fd), () => setOpen(false))}
        >
          <OvertimeFields defaultDate={defaultDate} />
        </FormDialog>
      ) : null}
    </>
  );
}

export function OvertimeCancelButton({ id }: { id: string }) {
  const { pending, run } = useRunner();
  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => cancelOvertimeAction(id))}>
      Batalkan
    </Button>
  );
}

export function OvertimeCreateButton({ employees, defaultDate }: { employees: EmployeeOption[]; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRunner();
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="clock" className="size-4" />
        Catat lembur (SPKL)
      </Button>
      {open ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Catat lembur karyawan"
          description="Lembur yang dicatat HR langsung berstatus disetujui."
          pending={pending}
          error={error}
          onSubmit={(fd) => run(() => createOvertimeForEmployeeAction(fd), () => setOpen(false))}
        >
          <Field label="Karyawan" htmlFor="ot-employee" wide>
            <EmployeeSelect id="ot-employee" employees={employees} />
          </Field>
          <OvertimeFields defaultDate={defaultDate} />
        </FormDialog>
      ) : null}
    </>
  );
}

export function OvertimeReviewActions({ id, employeeName }: { id: string; employeeName: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const { pending, error, run } = useRunner();
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" size="sm" disabled={pending} onClick={() => run(() => reviewOvertimeAction(id, "approved", ""))}>
        Setujui
      </Button>
      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setRejecting(true)}>
        Tolak
      </Button>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak lembur</DialogTitle>
            <DialogDescription>Pengajuan lembur {employeeName}. Alasan akan terlihat oleh karyawan.</DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <textarea
            aria-label="Alasan penolakan"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className={TEXTAREA}
            placeholder="Alasan penolakan"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => reviewOvertimeAction(id, "rejected", note), () => setRejecting(false))}
            >
              Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Payroll managers: create the LEMBUR earning component in one click. */
export function OvertimeComponentSetupButton() {
  const { pending, run } = useRunner();
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() =>
        run(async () => {
          const result = await createPayrollComponentAction({
            code: OVERTIME_COMPONENT_CODE.toLowerCase(),
            name: "Lembur",
            type: "earning",
            calculationMethod: "manual",
            defaultAmount: 0,
            description: "Dihitung otomatis dari lembur yang disetujui (Kepmenaker 102/2004).",
          });
          return result.ok ? { ok: true, message: "Komponen Lembur dibuat." } : result;
        })
      }
    >
      Siapkan komponen Lembur
    </Button>
  );
}
