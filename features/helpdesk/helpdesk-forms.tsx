"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Field, FormDialog, useRunner } from "@/components/forms/record-kit";
import { HrisIcon } from "@/components/layout/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { notifier } from "@/lib/notifier";

import {
  addMessageAction,
  closeOwnTicketAction,
  createTicketAction,
  markTicketReadAction,
  saveCategoryAction,
  seedDefaultCategoriesAction,
  setCategoryActiveAction,
  updateTicketAction,
} from "./actions";
import { PRIORITY_LABELS, STATUS_LABELS } from "./rules";

const TEXTAREA =
  "min-h-[110px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none";

export interface Option {
  id: string;
  name: string;
}

/** Employee: open a ticket, then go straight to its thread. */
export function CreateTicketButton({ categories }: { categories: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="help" className="size-4" />
        Buat tiket
      </Button>
      {open ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Tanya Admin"
          description="Sampaikan pertanyaan atau kendala Anda. HR akan membalas di tiket ini."
          pending={pending}
          error={error}
          onSubmit={(fd) => {
            setError(null);
            startTransition(async () => {
              try {
                const result = await createTicketAction(fd);
                if (result.ok && result.id) {
                  notifier.success(result.message);
                  setOpen(false);
                  router.push(`/helpdesk/${result.id}`);
                } else {
                  setError(result.message);
                }
              } catch {
                setError("Gagal mengirim. Coba lagi.");
              }
            });
          }}
        >
          <Field label="Kategori" htmlFor="tk-category">
            <NativeSelect id="tk-category" name="categoryId" defaultValue="">
              <option value="">Pilih kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Prioritas" htmlFor="tk-priority">
            <NativeSelect id="tk-priority" name="priority" defaultValue="normal">
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Judul" htmlFor="tk-subject" wide>
            <Input id="tk-subject" name="subject" maxLength={150} placeholder="mis. Saldo cuti tidak sesuai" required />
          </Field>
          <Field label="Pertanyaan / kendala" htmlFor="tk-body" wide>
            <textarea id="tk-body" name="body" maxLength={5000} required className={TEXTAREA} placeholder="Jelaskan sedetail mungkin" />
          </Field>
        </FormDialog>
      ) : null}
    </>
  );
}

/** Reply box under the thread. Agents may write an internal note instead. */
export function ReplyBox({ ticketId, agent, finished }: { ticketId: string; agent: boolean; finished: boolean }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const { pending, error, run } = useRunner();
  return (
    <form
      className="hris-card space-y-3 rounded-[20px] border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => addMessageAction(ticketId, body, internal), () => setBody(""));
      }}
    >
      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <textarea
        aria-label="Tulis balasan"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={5000}
        className={TEXTAREA}
        placeholder={
          internal
            ? "Catatan internal (hanya terlihat oleh HR)"
            : finished && !agent
              ? "Tulis pesan untuk membuka kembali tiket ini"
              : "Tulis balasan"
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {agent ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Catatan internal
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending || body.trim() === ""}>
          <HrisIcon name="arrow-right" className="size-4" />
          {pending ? "Mengirim..." : internal ? "Simpan catatan" : "Kirim"}
        </Button>
      </div>
    </form>
  );
}

export function CloseTicketButton({ ticketId }: { ticketId: string }) {
  const { pending, run } = useRunner();
  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => closeOwnTicketAction(ticketId))}>
      <HrisIcon name="check" className="size-4" />
      Masalah selesai
    </Button>
  );
}

/** Marks HR replies as seen once the owner opens the ticket. */
export function MarkTicketRead({ ticketId }: { ticketId: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void markTicketReadAction(ticketId).catch(() => undefined);
  }, [ticketId]);
  return null;
}

export function TicketControls({
  ticketId,
  status,
  priority,
  categoryId,
  assignedTo,
  categories,
  assignees,
}: {
  ticketId: string;
  status: string;
  priority: string;
  categoryId: string | null;
  assignedTo: string | null;
  categories: Option[];
  assignees: Option[];
}) {
  const { pending, error, run } = useRunner();
  return (
    <form
      className="hris-card space-y-3 rounded-[20px] border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        run(() => updateTicketAction(ticketId, fd));
      }}
    >
      <h2 className="text-[15px] font-semibold">Kelola tiket</h2>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Field label="Status" htmlFor="tc-status">
        <NativeSelect id="tc-status" name="status" defaultValue={status}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Prioritas" htmlFor="tc-priority">
        <NativeSelect id="tc-priority" name="priority" defaultValue={priority}>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Kategori" htmlFor="tc-category">
        <NativeSelect id="tc-category" name="categoryId" defaultValue={categoryId ?? ""}>
          <option value="">Tanpa kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Petugas" htmlFor="tc-assignee">
        <NativeSelect id="tc-assignee" name="assignedTo" defaultValue={assignedTo ?? ""}>
          <option value="">Belum ditugaskan</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Menyimpan..." : "Simpan perubahan"}
      </Button>
    </form>
  );
}

export function CategoryCreateForm() {
  const [name, setName] = useState("");
  const { pending, run } = useRunner();
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData();
        fd.set("name", name);
        run(() => saveCategoryAction(fd), () => setName(""));
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nama kategori baru" aria-label="Nama kategori" />
      <Button type="submit" disabled={pending || name.trim().length < 2}>
        Tambah
      </Button>
    </form>
  );
}

export function SeedCategoriesButton() {
  const { pending, run } = useRunner();
  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => seedDefaultCategoriesAction())}>
      Tambah kategori standar
    </Button>
  );
}

export function CategoryActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { pending, run } = useRunner();
  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setCategoryActiveAction(id, !active))}>
      {active ? "Nonaktifkan" : "Aktifkan"}
    </Button>
  );
}
