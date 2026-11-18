"use client";

import { useState } from "react";

import { Field, FormDialog, useRunner } from "@/components/forms/record-kit";
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

import {
  cancelProfileChangeAction,
  reviewProfileChangeAction,
  submitProfileChangeAction,
} from "./actions";
import { CHANGEABLE_FIELD_KEYS, CHANGEABLE_FIELDS, type ProfileValues } from "./fields";

const TEXTAREA =
  "min-h-[76px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none";

/** Employee: propose new values; only the fields that differ are sent to HR. */
export function ProfileChangeButton({ current, disabled }: { current: ProfileValues; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRunner();
  return (
    <>
      <Button type="button" variant="outline" className="w-full" disabled={disabled} onClick={() => setOpen(true)}>
        <HrisIcon name="edit" className="size-4" />
        Ajukan perubahan data
      </Button>
      {open ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Ajukan perubahan data"
          description="Ubah kolom yang perlu diperbarui. HR akan meninjau sebelum data berubah."
          pending={pending}
          error={error}
          onSubmit={(fd) => run(() => submitProfileChangeAction(fd), () => setOpen(false))}
        >
          {CHANGEABLE_FIELD_KEYS.map((field) => {
            const spec = CHANGEABLE_FIELDS[field];
            const id = `pc-${field}`;
            const value = current[field] ?? "";
            return (
              <Field key={field} label={spec.label} htmlFor={id}>
                {spec.kind === "select" ? (
                  <NativeSelect id={id} name={field} defaultValue={value}>
                    <option value="">—</option>
                    {spec.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    id={id}
                    name={field}
                    type={spec.kind === "date" ? "date" : spec.kind === "email" ? "email" : spec.kind === "phone" ? "tel" : "text"}
                    inputMode={field === "nik" ? "numeric" : undefined}
                    maxLength={spec.max}
                    placeholder={spec.hint}
                    defaultValue={value}
                  />
                )}
              </Field>
            );
          })}
          <Field label="Keterangan untuk HR (opsional)" htmlFor="pc-note" wide>
            <textarea id="pc-note" name="note" maxLength={500} className={TEXTAREA} placeholder="mis. Nomor HP lama hilang" />
          </Field>
        </FormDialog>
      ) : null}
    </>
  );
}

export function ProfileChangeCancelButton({ id }: { id: string }) {
  const { pending, run } = useRunner();
  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => cancelProfileChangeAction(id))}>
      Batalkan
    </Button>
  );
}

export function ProfileChangeReviewActions({ id, employeeName }: { id: string; employeeName: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const { pending, error, run } = useRunner();
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" size="sm" disabled={pending} onClick={() => run(() => reviewProfileChangeAction(id, "approved", ""))}>
        Setujui & terapkan
      </Button>
      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setRejecting(true)}>
        Tolak
      </Button>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak perubahan data</DialogTitle>
            <DialogDescription>Pengajuan {employeeName}. Alasan akan terlihat oleh karyawan.</DialogDescription>
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
              onClick={() => run(() => reviewProfileChangeAction(id, "rejected", note), () => setRejecting(false))}
            >
              Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
