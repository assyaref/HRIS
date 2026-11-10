"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notifier } from "@/lib/notifier";

import {
  createLeaveTypeAction,
  deleteLeaveBalanceAction,
  deleteLeaveTypeAction,
  generateLeaveBalancesAction,
  saveLeaveBalanceAction,
  setLeaveTypeActiveAction,
  updateLeaveTypeAction,
  type LeaveMasterResult,
} from "./master.actions";
import type {
  LeaveBalanceAdminRow,
  LeaveEmployeeOption,
  LeaveTypeAdminRow,
} from "./master.queries";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

type Notice = { tone: "success" | "error"; text: string } | null;

function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={
        notice.tone === "success"
          ? "rounded-md border border-success/40 bg-surface-success px-3 py-2 text-sm text-success"
          : "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      }
    >
      {notice.text}
    </div>
  );
}

function formatDays(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })} hari`;
}

function useRunner(setNotice: (notice: Notice) => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(
    task: () => Promise<LeaveMasterResult>,
    onSuccess?: () => void
  ) {
    setNotice(null);
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        // Success is announced as a toast: the form dialog that started the
        // task closes, so an inline message there would never be seen.
        notifier.success(result.message);
        onSuccess?.();
        router.refresh();
      } else {
        setNotice({ tone: "error", text: result.message });
      }
    });
  }
  return { pending, run };
}

/* ------------------------------------------------------------------ */
/* Leave types                                                         */
/* ------------------------------------------------------------------ */

function LeaveTypeDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: LeaveTypeAdminRow | null;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const { pending, run } = useRunner(setNotice);

  function submit(formData: FormData) {
    const values = {
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      defaultAllowanceDays: String(formData.get("defaultAllowanceDays") ?? ""),
    };
    run(
      () =>
        initial
          ? updateLeaveTypeAction(initial.id, values)
          : createLeaveTypeAction(values),
      () => onOpenChange(false)
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Ubah jenis cuti" : "Jenis cuti baru"}</DialogTitle>
          <DialogDescription>
            Jatah default dipakai sebagai saldo awal saat karyawan belum punya
            saldo untuk tahun berjalan. Kosongkan bila saldo harus diatur
            manual.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          {notice?.tone === "error" ? <NoticeBanner notice={notice} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="leave-type-code">Kode</Label>
              <Input
                id="leave-type-code"
                name="code"
                defaultValue={initial?.code ?? ""}
                placeholder="ANNUAL"
                autoCapitalize="characters"
                spellCheck={false}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leave-type-name">Nama</Label>
              <Input
                id="leave-type-name"
                name="name"
                defaultValue={initial?.name ?? ""}
                placeholder="Cuti Tahunan"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="leave-type-allowance">Jatah default per tahun (hari)</Label>
            <Input
              id="leave-type-allowance"
              name="defaultAllowanceDays"
              type="number"
              min={0}
              max={366}
              step={0.5}
              defaultValue={initial?.defaultAllowanceDays ?? ""}
              placeholder="12"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="leave-type-description">Deskripsi (opsional)</Label>
            <textarea
              id="leave-type-description"
              name="description"
              rows={2}
              defaultValue={initial?.description ?? ""}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : initial ? "Simpan perubahan" : "Buat jenis cuti"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveTypeManager({ types }: { types: LeaveTypeAdminRow[] }) {
  const [notice, setNotice] = useState<Notice>(null);
  const { pending, run } = useRunner(setNotice);
  const [dialog, setDialog] = useState<{ open: boolean; initial: LeaveTypeAdminRow | null }>({
    open: false,
    initial: null,
  });

  function remove(type: LeaveTypeAdminRow) {
    if (!window.confirm(`Hapus jenis cuti ${type.name}? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    run(() => deleteLeaveTypeAction(type.id));
  }

  return (
    <section className="space-y-4" aria-labelledby="leave-types-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="leave-types-heading" className="text-lg font-semibold">
            Jenis Cuti
          </h2>
          <p className="text-sm text-muted-foreground">
            {types.length} jenis · {types.filter((type) => type.active).length} aktif
          </p>
        </div>
        <Button type="button" onClick={() => setDialog({ open: true, initial: null })}>
          Tambah jenis cuti
        </Button>
      </div>

      <NoticeBanner notice={notice} />

      {types.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          Belum ada jenis cuti. Karyawan tidak dapat mengajukan cuti sampai
          minimal satu jenis cuti aktif dibuat.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jenis cuti</TableHead>
              <TableHead>Jatah default</TableHead>
              <TableHead>Dipakai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((type) => {
              const inUse = type.requestCount > 0 || type.balanceCount > 0;
              return (
                <TableRow key={type.id}>
                  <TableCell>
                    <span className="font-medium">{type.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {type.code}
                    </span>
                    {type.description ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {type.description}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatDays(type.defaultAllowanceDays)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {type.requestCount} pengajuan · {type.balanceCount} saldo
                  </TableCell>
                  <TableCell>
                    <Badge variant={type.active ? "success" : "outline"}>
                      {type.active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDialog({ open: true, initial: type })}
                      >
                        Ubah
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => setLeaveTypeActiveAction(type.id, !type.active))}
                      >
                        {type.active ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={pending || inUse}
                        title={inUse ? "Sudah dipakai — nonaktifkan saja" : undefined}
                        onClick={() => remove(type)}
                      >
                        Hapus
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {dialog.open ? (
        <LeaveTypeDialog
          key={dialog.initial?.id ?? "new"}
          open={dialog.open}
          onOpenChange={(open) => setDialog((state) => ({ ...state, open }))}
          initial={dialog.initial}
        />
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Leave balances                                                      */
/* ------------------------------------------------------------------ */

function BalanceDialog({
  open,
  onOpenChange,
  initial,
  types,
  employees,
  year,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: LeaveBalanceAdminRow | null;
  types: LeaveTypeAdminRow[];
  employees: LeaveEmployeeOption[];
  year: string;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const { pending, run } = useRunner(setNotice);

  function submit(formData: FormData) {
    const values = {
      employeeId: initial?.employeeId ?? String(formData.get("employeeId") ?? ""),
      leaveTypeId: initial?.leaveTypeId ?? String(formData.get("leaveTypeId") ?? ""),
      year: initial?.year ?? String(formData.get("year") ?? ""),
      entitlement: String(formData.get("entitlement") ?? ""),
      adjustment: String(formData.get("adjustment") ?? "0") || "0",
    };
    run(() => saveLeaveBalanceAction(values), () => onOpenChange(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Ubah saldo cuti" : "Saldo cuti baru"}</DialogTitle>
          <DialogDescription>
            {initial
              ? `${initial.employeeName} · ${initial.leaveTypeName} · ${initial.year}. Terpakai ${formatDays(initial.used)}, menunggu ${formatDays(initial.pending)}.`
              : "Bila karyawan sudah punya saldo untuk jenis dan tahun yang sama, saldo tersebut diperbarui."}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          {notice?.tone === "error" ? <NoticeBanner notice={notice} /> : null}
          {initial ? null : (
            <>
              <div className="space-y-2">
                <Label htmlFor="balance-employee">Karyawan</Label>
                <select id="balance-employee" name="employeeId" required className={selectClass}>
                  <option value="">Pilih karyawan…</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} ({employee.employeeNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="balance-type">Jenis cuti</Label>
                  <select id="balance-type" name="leaveTypeId" required className={selectClass}>
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                        {type.active ? "" : " (nonaktif)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="balance-year">Tahun</Label>
                  <Input
                    id="balance-year"
                    name="year"
                    inputMode="numeric"
                    pattern="\d{4}"
                    defaultValue={year}
                    required
                  />
                </div>
              </div>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="balance-entitlement">Hak cuti (hari)</Label>
              <Input
                id="balance-entitlement"
                name="entitlement"
                type="number"
                min={0}
                max={366}
                step={0.5}
                defaultValue={initial?.entitlement ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="balance-adjustment">Penyesuaian (±hari)</Label>
              <Input
                id="balance-adjustment"
                name="adjustment"
                type="number"
                min={-366}
                max={366}
                step={0.5}
                defaultValue={initial?.adjustment ?? 0}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan saldo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({
  open,
  onOpenChange,
  types,
  year,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: LeaveTypeAdminRow[];
  year: string;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const { pending, run } = useRunner(setNotice);
  const activeTypes = types.filter((type) => type.active);

  function submit(formData: FormData) {
    const values = {
      leaveTypeId: String(formData.get("leaveTypeId") ?? ""),
      year: String(formData.get("year") ?? ""),
      entitlement: String(formData.get("entitlement") ?? ""),
    };
    run(() => generateLeaveBalancesAction(values), () => onOpenChange(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat saldo massal</DialogTitle>
          <DialogDescription>
            Membuat saldo untuk semua karyawan aktif yang belum punya saldo pada
            jenis dan tahun yang dipilih. Saldo yang sudah ada tidak diubah.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          {notice?.tone === "error" ? <NoticeBanner notice={notice} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="generate-type">Jenis cuti</Label>
              <select id="generate-type" name="leaveTypeId" required className={selectClass}>
                {activeTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} ({formatDays(type.defaultAllowanceDays)})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="generate-year">Tahun</Label>
              <Input
                id="generate-year"
                name="year"
                inputMode="numeric"
                pattern="\d{4}"
                defaultValue={year}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="generate-entitlement">Hak cuti (hari, opsional)</Label>
            <Input
              id="generate-entitlement"
              name="entitlement"
              type="number"
              min={0}
              max={366}
              step={0.5}
              placeholder="Kosongkan untuk memakai jatah default"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending || activeTypes.length === 0}>
              {pending ? "Memproses…" : "Buat saldo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveBalanceManager({
  balances,
  types,
  employees,
  year,
  leaveTypeId,
  q,
}: {
  balances: LeaveBalanceAdminRow[];
  types: LeaveTypeAdminRow[];
  employees: LeaveEmployeeOption[];
  year: string;
  leaveTypeId: string;
  q: string;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const { pending, run } = useRunner(setNotice);
  const [editor, setEditor] = useState<{ open: boolean; initial: LeaveBalanceAdminRow | null }>({
    open: false,
    initial: null,
  });
  const [generateOpen, setGenerateOpen] = useState(false);

  function remove(balance: LeaveBalanceAdminRow) {
    if (
      !window.confirm(
        `Hapus saldo ${balance.leaveTypeName} ${balance.year} milik ${balance.employeeName}?`
      )
    ) {
      return;
    }
    run(() => deleteLeaveBalanceAction(balance.id));
  }

  return (
    <section className="space-y-4" aria-labelledby="leave-balances-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="leave-balances-heading" className="text-lg font-semibold">
            Saldo Cuti
          </h2>
          <p className="text-sm text-muted-foreground">
            {balances.length} saldo untuk tahun {year}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={types.length === 0}
            onClick={() => setGenerateOpen(true)}
          >
            Buat saldo massal
          </Button>
          <Button
            type="button"
            disabled={types.length === 0 || employees.length === 0}
            onClick={() => setEditor({ open: true, initial: null })}
          >
            Tambah saldo
          </Button>
        </div>
      </div>

      <form
        method="get"
        action="/leave/types"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-end"
      >
        <div className="space-y-2">
          <Label htmlFor="balance-filter-year">Tahun</Label>
          <Input
            id="balance-filter-year"
            name="year"
            inputMode="numeric"
            pattern="\d{4}"
            defaultValue={year}
            className="sm:w-28"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="balance-filter-type">Jenis cuti</Label>
          <select
            id="balance-filter-type"
            name="leaveTypeId"
            defaultValue={leaveTypeId}
            className={selectClass}
          >
            <option value="">Semua jenis</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="balance-filter-q">Cari karyawan</Label>
          <Input
            id="balance-filter-q"
            name="q"
            defaultValue={q}
            placeholder="Nama atau nomor karyawan"
          />
        </div>
        <Button type="submit" variant="secondary">
          Terapkan
        </Button>
      </form>

      <NoticeBanner notice={notice} />

      {balances.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          Belum ada saldo cuti untuk filter ini. Gunakan &quot;Buat saldo
          massal&quot; untuk membuat saldo semua karyawan aktif sekaligus.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead className="text-right">Hak</TableHead>
              <TableHead className="text-right">Penyesuaian</TableHead>
              <TableHead className="text-right">Terpakai</TableHead>
              <TableHead className="text-right">Menunggu</TableHead>
              <TableHead className="text-right">Sisa</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balances.map((balance) => {
              const locked = balance.used > 0 || balance.pending > 0;
              return (
                <TableRow key={balance.id}>
                  <TableCell>
                    <span className="font-medium">{balance.employeeName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {balance.employeeNumber}
                    </span>
                  </TableCell>
                  <TableCell>{balance.leaveTypeName}</TableCell>
                  <TableCell className="text-right tabular-nums">{balance.entitlement}</TableCell>
                  <TableCell className="text-right tabular-nums">{balance.adjustment}</TableCell>
                  <TableCell className="text-right tabular-nums">{balance.used}</TableCell>
                  <TableCell className="text-right tabular-nums">{balance.pending}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {balance.available}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditor({ open: true, initial: balance })}
                      >
                        Ubah
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={pending || locked}
                        title={locked ? "Saldo sudah dipakai" : undefined}
                        onClick={() => remove(balance)}
                      >
                        Hapus
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {editor.open ? (
        <BalanceDialog
          key={editor.initial?.id ?? "new"}
          open={editor.open}
          onOpenChange={(open) => setEditor((state) => ({ ...state, open }))}
          initial={editor.initial}
          types={types}
          employees={employees}
          year={year}
        />
      ) : null}
      {generateOpen ? (
        <GenerateDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          types={types}
          year={year}
        />
      ) : null}
    </section>
  );
}
