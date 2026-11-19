"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, FormDialog, useRunner } from "@/components/forms/record-kit";
import { HrisIcon } from "@/components/layout/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { notifier } from "@/lib/notifier";
import { cn } from "@/lib/utils/cn";

import { respondAgendaAction, saveAgendaEventAction, setAgendaCancelledAction } from "./actions";
import { CATEGORY_LABELS, RESPONSE_LABELS } from "./rules";

const TEXTAREA =
  "min-h-[90px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none";

export interface EventInitial {
  id: string;
  title: string;
  description: string | null;
  category: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string | null;
  audienceDepartments: string[];
  requireRsvp: boolean;
}

function EventDialog({
  open,
  onOpenChange,
  initial,
  departments,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: EventInitial | null;
  departments: string[];
  defaultDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [audience, setAudience] = useState<Set<string>>(() => new Set(initial?.audienceDepartments ?? []));
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Ubah agenda" : "Buat agenda"}
      description="Waktu dalam WIB. Tanpa departemen dipilih = untuk semua karyawan."
      pending={pending}
      error={error}
      onSubmit={(fd) => {
        setError(null);
        for (const d of audience) fd.append("audience", d);
        startTransition(async () => {
          try {
            const result = await saveAgendaEventAction(initial?.id ?? null, fd);
            if (!result.ok) return setError(result.message);
            notifier.success(result.message);
            onOpenChange(false);
            if (!initial && result.id) router.push(`/agenda/${result.id}`);
            else router.refresh();
          } catch {
            setError("Gagal menyimpan. Coba lagi.");
          }
        });
      }}
    >
      <Field label="Judul" htmlFor="ag-title" wide>
        <Input id="ag-title" name="title" maxLength={150} defaultValue={initial?.title ?? ""} placeholder="mis. Rapat bulanan seluruh tim" required />
      </Field>
      <Field label="Kategori" htmlFor="ag-category">
        <NativeSelect id="ag-category" name="category" defaultValue={initial?.category ?? "meeting"}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Lokasi" htmlFor="ag-location">
        <Input id="ag-location" name="location" maxLength={200} defaultValue={initial?.location ?? ""} placeholder="Ruang rapat / tautan online" />
      </Field>
      <Field label="Tanggal" htmlFor="ag-date">
        <Input id="ag-date" name="date" type="date" defaultValue={initial?.date ?? defaultDate} required />
      </Field>
      <Field label="Sampai tanggal (opsional)" htmlFor="ag-end-date">
        <Input id="ag-end-date" name="endDate" type="date" defaultValue={initial && initial.endDate !== initial.date ? initial.endDate : ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        Sepanjang hari
      </label>
      {!allDay ? (
        <>
          <Field label="Jam mulai" htmlFor="ag-start">
            <Input id="ag-start" name="startTime" type="time" defaultValue={initial?.startTime ?? "09:00"} required />
          </Field>
          <Field label="Jam selesai" htmlFor="ag-end">
            <Input id="ag-end" name="endTime" type="time" defaultValue={initial?.endTime ?? "10:00"} required />
          </Field>
        </>
      ) : null}
      <Field label="Deskripsi" htmlFor="ag-desc" wide>
        <textarea id="ag-desc" name="description" maxLength={3000} defaultValue={initial?.description ?? ""} className={TEXTAREA} />
      </Field>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-sm font-medium">Peserta</legend>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setAudience(new Set())}
            className={cn("rounded-full border px-3 py-1 text-sm", audience.size === 0 ? "border-primary bg-primary/10 text-primary" : "border-[var(--card-border)] bg-muted")}
          >
            Semua karyawan
          </button>
          {departments.map((d) => {
            const on = audience.has(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setAudience((prev) => {
                    const next = new Set(prev);
                    if (next.has(d)) next.delete(d);
                    else next.add(d);
                    return next;
                  })
                }
                className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary/10 text-primary" : "border-[var(--card-border)] bg-muted")}
              >
                {d}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="requireRsvp" defaultChecked={initial?.requireRsvp ?? true} className="size-4 accent-[var(--primary)]" />
        Minta konfirmasi kehadiran (RSVP)
      </label>
    </FormDialog>
  );
}

export function EventCreateButton({ departments, defaultDate }: { departments: string[]; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="calendar" className="size-4" />
        Buat agenda
      </Button>
      {open ? <EventDialog open={open} onOpenChange={setOpen} initial={null} departments={departments} defaultDate={defaultDate} /> : null}
    </>
  );
}

export function EventManageActions({ event, departments, cancelled }: { event: EventInitial; departments: string[]; cancelled: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Ubah
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cancelled ? undefined : "text-destructive"}
        disabled={pending}
        onClick={() => run(() => setAgendaCancelledAction(event.id, !cancelled))}
      >
        {cancelled ? "Aktifkan kembali" : "Batalkan agenda"}
      </Button>
      {open ? <EventDialog open={open} onOpenChange={setOpen} initial={event} departments={departments} defaultDate={event.date} /> : null}
    </div>
  );
}

export function RsvpButtons({ eventId, current }: { eventId: string; current: string | null }) {
  const { pending, run } = useRunner();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Konfirmasi kehadiran">
      {(["going", "maybe", "not_going"] as const).map((value) => (
        <button
          key={value}
          type="button"
          disabled={pending}
          aria-pressed={current === value}
          onClick={() => run(() => respondAgendaAction(eventId, value, ""))}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
            current === value
              ? value === "going"
                ? "border-[#16A34A] bg-[#DCFCE7] text-[#15803D] dark:bg-[#14301C] dark:text-[#86EFAC]"
                : value === "maybe"
                  ? "border-[#D97706] bg-[#FEF3C7] text-[#B45309] dark:bg-[#3A2A10] dark:text-[#FCD34D]"
                  : "border-[#DC2626] bg-[#FEE2E2] text-[#B91C1C] dark:bg-[#3A1515] dark:text-[#FCA5A5]"
              : "border-[var(--card-border)] bg-card hover:border-primary"
          )}
        >
          {RESPONSE_LABELS[value]}
        </button>
      ))}
    </div>
  );
}
