"use client";

import { useState } from "react";

import { ConfirmDelete, Field, FormDialog, useRunner } from "@/components/forms/record-kit";
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

import { deleteEntryAction, reviewWeekAction, saveEntryAction, submitWeekAction } from "./actions";
import { hhmm, parseDuration } from "./rules";

const TEXTAREA =
  "min-h-[76px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none";

export interface ProjectChoice {
  id: string;
  code: string;
  name: string;
}
export interface EntryInitial {
  id: string;
  workDate: string;
  projectId: string | null;
  task: string;
  minutes: number;
  notes: string | null;
}

function EntryDialog({
  open,
  onOpenChange,
  initial,
  projects,
  defaultDate,
  maxDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: EntryInitial | null;
  projects: ProjectChoice[];
  defaultDate: string;
  maxDate: string;
}) {
  const { pending, error, run } = useRunner();
  const [duration, setDuration] = useState(initial ? hhmm(initial.minutes) : "");
  const parsed = duration.trim() ? parseDuration(duration) : null;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah entri" : "Catat jam kerja"}
      description="Durasi: 1:30, 1,5 (jam) atau 90m."
      pending={pending}
      error={error}
      onSubmit={(fd) => run(() => saveEntryAction(initial?.id ?? null, fd), () => onOpenChange(false))}
    >
      <Field label="Tanggal" htmlFor="ts-date">
        <Input id="ts-date" name="workDate" type="date" max={maxDate} defaultValue={initial?.workDate ?? defaultDate} required />
      </Field>
      <Field label="Durasi" htmlFor="ts-duration">
        <Input id="ts-duration" name="duration" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="mis. 2:30" required />
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {duration.trim() ? (parsed ? `= ${hhmm(parsed)} jam` : "Format tidak dikenali") : " "}
        </span>
      </Field>
      <Field label="Proyek" htmlFor="ts-project" wide>
        <NativeSelect id="ts-project" name="projectId" defaultValue={initial?.projectId ?? ""}>
          <option value="">Tanpa proyek / internal</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Pekerjaan / tugas" htmlFor="ts-task" wide>
        <Input id="ts-task" name="task" maxLength={200} defaultValue={initial?.task ?? ""} placeholder="mis. Rekonsiliasi stok gudang" required />
      </Field>
      <Field label="Catatan (opsional)" htmlFor="ts-notes" wide>
        <textarea id="ts-notes" name="notes" maxLength={500} defaultValue={initial?.notes ?? ""} className={TEXTAREA} />
      </Field>
    </FormDialog>
  );
}

export function EntryCreateButton({ projects, defaultDate, maxDate, disabled }: { projects: ProjectChoice[]; defaultDate: string; maxDate: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={disabled}>
        <HrisIcon name="clock" className="size-4" />
        Catat jam kerja
      </Button>
      {open ? <EntryDialog open={open} onOpenChange={setOpen} initial={null} projects={projects} defaultDate={defaultDate} maxDate={maxDate} /> : null}
    </>
  );
}

export function EntryRowActions({ entry, projects, maxDate }: { entry: EntryInitial; projects: ProjectChoice[]; maxDate: string }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Ubah
      </Button>
      <ConfirmDelete label="Entri ini" pending={pending} onConfirm={() => run(() => deleteEntryAction(entry.id))} />
      {open ? <EntryDialog open={open} onOpenChange={setOpen} initial={entry} projects={projects} defaultDate={entry.workDate} maxDate={maxDate} /> : null}
    </div>
  );
}

export function SubmitWeekButton({ weekStart, hours }: { weekStart: string; hours: string }) {
  const { pending, run } = useRunner();
  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => submitWeekAction(weekStart))}>
      <HrisIcon name="check" className="size-4" />
      Ajukan minggu ini ({hours} jam)
    </Button>
  );
}

export function ReviewWeekActions({ employeeId, weekStart, employeeName }: { employeeId: string; weekStart: string; employeeName: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const { pending, error, run } = useRunner();
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" size="sm" disabled={pending} onClick={() => run(() => reviewWeekAction(employeeId, weekStart, "approved", ""))}>
        Setujui
      </Button>
      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setRejecting(true)}>
        Tolak
      </Button>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak timesheet</DialogTitle>
            <DialogDescription>Timesheet {employeeName}. Karyawan bisa memperbaiki lalu mengajukan ulang.</DialogDescription>
          </DialogHeader>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <textarea aria-label="Alasan penolakan" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={TEXTAREA} placeholder="Alasan penolakan" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
              Batal
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => reviewWeekAction(employeeId, weekStart, "rejected", note), () => setRejecting(false))}>
              Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
