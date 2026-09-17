"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  createEmployeePayrollComponentAction,
  endEmployeePayrollComponentAction,
  updateEmployeePayrollComponentAction,
} from "./employee-payroll-component.actions";
import type { EmployeePayrollComponentRow } from "./employee-payroll-component.queries";
import {
  amountForMethodError,
  amountForMethodHelp,
  buildEmployeePayrollComponentCreateInput,
  buildEmployeePayrollComponentEndInput,
  buildEmployeePayrollComponentUpdateInput,
  COMPONENT_METHOD_LABELS,
  COMPONENT_TYPE_LABELS,
  END_CONFIRMATION_BUTTON,
  END_CONFIRMATION_TITLE,
  resolveEmployeePayrollComponentManagerMode,
} from "./employee-payroll-component.view";
import { formatIDR } from "./money";
import type { PayrollComponentRow } from "./queries";

/**
 * PM-03.3 — Employee payroll component manager (client leaf).
 *
 * Renders the employee's payroll component assignments and, for users with
 * `payroll.manage`, offers create / update / end dialogs. Every mutation
 * re-runs server-side authorization, organization ownership and business
 * rules; this UI is only a convenience surface, never a security boundary.
 * Ended assignments are displayed read-only (the server refuses edits).
 */

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const textareaClass =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(assignment: {
  calculationMethod: string;
  amount: number;
}): string {
  if (assignment.calculationMethod === "percentage") {
    return `${assignment.amount}%`;
  }
  return formatIDR(assignment.amount);
}

export interface EmployeePayrollComponentManagerProps {
  employeeId: string;
  assignments: EmployeePayrollComponentRow[];
  /** Active master components not already active for this employee. */
  assignableComponents: PayrollComponentRow[];
  /** `payroll.view` or `payroll.manage` — the page already gates on it. */
  canView: boolean;
  /** `payroll.manage` — reading never requires it; mutations always do. */
  canManage: boolean;
}

export function EmployeePayrollComponentManager({
  employeeId,
  assignments,
  assignableComponents,
  canView,
  canManage,
}: EmployeePayrollComponentManagerProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeePayrollComponentRow | null>(
    null
  );
  const [ending, setEnding] = useState<EmployeePayrollComponentRow | null>(null);
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  const mode = resolveEmployeePayrollComponentManagerMode(canView, canManage);
  const canManageMode = mode === "manage";

  if (mode === "hidden") return null;

  const activeCount = assignments.filter((assignment) => assignment.active).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Komponen gaji</CardTitle>
            <CardDescription>
              Komponen pendapatan dan potongan yang ditetapkan untuk karyawan
              ini. {assignments.length} tercatat · {activeCount} aktif.
            </CardDescription>
          </div>
          {canManageMode ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(true)}
              disabled={assignableComponents.length === 0}
              title={
                assignableComponents.length === 0
                  ? "Tidak ada komponen aktif yang tersedia."
                  : undefined
              }
            >
              Tambah komponen
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {message ? (
          <div
            role={message.tone === "error" ? "alert" : "status"}
            className={`mb-4 rounded-md border px-3 py-2 text-sm ${
              message.tone === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        {canManageMode && assignableComponents.length === 0 ? (
          <p className="mb-4 text-xs text-muted-foreground">
            Tidak ada komponen aktif yang tersedia dalam organisasi ini. Buat
            komponen terlebih dahulu di halaman komponen gaji.
          </p>
        ) : null}

        {!canManageMode ? (
          <p className="mb-4 text-xs text-muted-foreground">
            Anda memiliki akses baca saja untuk komponen gaji.
          </p>
        ) : null}

        {assignments.length === 0 ? (
          <EmptyState
            title="Belum ada komponen gaji"
            description="Tidak ada komponen gaji yang ditetapkan untuk karyawan ini."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {assignment.componentName}
                    <span className="font-mono text-xs text-muted-foreground">
                      {assignment.componentCode}
                    </span>
                    {assignment.componentType === "deduction" ? (
                      <Badge variant="secondary">Potongan</Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {COMPONENT_TYPE_LABELS[assignment.componentType] ??
                      assignment.componentType}{" "}
                    ·{" "}
                    {COMPONENT_METHOD_LABELS[assignment.calculationMethod] ??
                      assignment.calculationMethod}{" "}
                    · {formatAmount(assignment)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Berlaku {formatDate(assignment.effectiveFrom)} —{" "}
                    {assignment.effectiveTo
                      ? formatDate(assignment.effectiveTo)
                      : "selanjutnya"}
                  </p>
                  {assignment.notes ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {assignment.notes}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={assignment.active ? "primary" : "secondary"}>
                    {assignment.active ? "Aktif" : "Diakhiri"}
                  </Badge>
                  {canManageMode && assignment.active ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(assignment)}
                      >
                        Ubah
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEnding(assignment)}
                      >
                        Akhiri
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {createOpen ? (
        <ComponentFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          employeeId={employeeId}
          components={assignableComponents}
          onResult={(result) => {
            setMessage({ tone: result.ok ? "success" : "error", text: result.message });
            router.refresh();
          }}
          initial={null}
        />
      ) : null}

      {editing ? (
        <ComponentFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          employeeId={employeeId}
          components={assignableComponents}
          onResult={(result) => {
            setMessage({ tone: result.ok ? "success" : "error", text: result.message });
            router.refresh();
          }}
          initial={editing}
        />
      ) : null}

      {ending ? (
        <EndComponentDialog
          open={Boolean(ending)}
          onOpenChange={(open) => {
            if (!open) setEnding(null);
          }}
          assignment={ending}
          onResult={(result) => {
            setMessage({ tone: result.ok ? "success" : "error", text: result.message });
            setEnding(null);
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function formFromAssignment(
  assignment: EmployeePayrollComponentRow | null
): {
  componentId: string;
  calculationMethod: string;
  amount: number;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
} {
  return {
    componentId: assignment?.componentId ?? "",
    calculationMethod: assignment?.calculationMethod ?? "fixed",
    amount: assignment?.amount ?? 0,
    effectiveFrom: assignment
      ? assignment.effectiveFrom.toISOString().slice(0, 10)
      : "",
    effectiveTo: assignment?.effectiveTo
      ? new Date(assignment.effectiveTo).toISOString().slice(0, 10)
      : "",
    notes: assignment?.notes ?? "",
  };
}

function methodForComponent(
  components: PayrollComponentRow[],
  componentId: string
): string {
  return (
    components.find((component) => component.id === componentId)
      ?.calculationMethod ?? "fixed"
  );
}

interface ComponentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  components: PayrollComponentRow[];
  initial: EmployeePayrollComponentRow | null;
  onResult: (result: { ok: boolean; message: string }) => void;
}

function ComponentFormDialog({
  open,
  onOpenChange,
  employeeId,
  components,
  initial,
  onResult,
}: ComponentFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const defaults = formFromAssignment(initial);
  const [selectedComponentId, setSelectedComponentId] = useState(
    defaults.componentId
  );
  const calculationMethod = initial
    ? initial.calculationMethod
    : methodForComponent(components, selectedComponentId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const rawValues = {
      amount: Number(formData.get("amount") ?? 0),
      effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
      effectiveTo: String(formData.get("effectiveTo") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    };
    const amountError = amountForMethodError(
      calculationMethod,
      rawValues.amount
    );
    if (amountError) {
      setError(amountError);
      return;
    }
    startTransition(async () => {
      const result = initial
        ? await updateEmployeePayrollComponentAction(
            initial.id,
            buildEmployeePayrollComponentUpdateInput(rawValues)
          )
        : await createEmployeePayrollComponentAction(
            buildEmployeePayrollComponentCreateInput({
              employeeId,
              componentId: String(formData.get("componentId") ?? ""),
              ...rawValues,
            })
          );
      if (result.ok) {
        onOpenChange(false);
        onResult(result);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Ubah komponen gaji" : "Tetapkan komponen gaji"}
          </DialogTitle>
          <DialogDescription>
            Komponen dihitung sesuai metode yang didefinisikan pada komponen
            induk. Berlaku sampai dikosongkan berarti tanpa tanggal akhir.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={submit} noValidate className="space-y-4">
          {!initial ? (
            <div className="space-y-2">
              <Label htmlFor="epc-component">Komponen</Label>
              <select
                id="epc-component"
                name="componentId"
                required
                value={selectedComponentId}
                onChange={(event) => setSelectedComponentId(event.target.value)}
                className={selectClass}
              >
                <option value="" disabled>
                  Pilih komponen
                </option>
                {components.map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.name} ({component.code})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="epc-amount">
                {calculationMethod === "percentage"
                  ? "Persentase"
                  : "Jumlah (Rp)"}
              </Label>
              <Input
                id="epc-amount"
                name="amount"
                type="number"
                min={0}
                max={calculationMethod === "percentage" ? 100 : undefined}
                step={1}
                defaultValue={defaults.amount}
                required
              />
              <p className="text-xs text-muted-foreground">
                {amountForMethodHelp(calculationMethod)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="epc-effective-from">Berlaku sejak</Label>
              <Input
                id="epc-effective-from"
                name="effectiveFrom"
                type="date"
                defaultValue={defaults.effectiveFrom}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="epc-effective-to">Berlaku sampai (opsional)</Label>
              <Input
                id="epc-effective-to"
                name="effectiveTo"
                type="date"
                defaultValue={defaults.effectiveTo}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="epc-notes">Catatan (opsional)</Label>
              <textarea
                id="epc-notes"
                name="notes"
                rows={1}
                defaultValue={defaults.notes}
                className={textareaClass}
              />
            </div>
          </div>

          {initial ? (
            <p className="text-xs text-muted-foreground">
              Mengosongkan &quot;Berlaku sampai&quot; akan menghapus tanggal akhir
              yang telah dijadwalkan.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Menyimpan…"
                : initial
                  ? "Simpan perubahan"
                  : "Tetapkan komponen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EndComponentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: EmployeePayrollComponentRow;
  onResult: (result: { ok: boolean; message: string }) => void;
}

function EndComponentDialog({
  open,
  onOpenChange,
  assignment,
  onResult,
}: EndComponentDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const effectiveTo = String(formData.get("effectiveTo") ?? "");
    startTransition(async () => {
      const result = await endEmployeePayrollComponentAction(
        assignment.id,
        buildEmployeePayrollComponentEndInput(effectiveTo)
      );
      if (result.ok) {
        onResult(result);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{END_CONFIRMATION_TITLE}</DialogTitle>
          <DialogDescription>
            Konfirmasi untuk mengakhiri {assignment.componentName} (
            {assignment.componentCode}). Riwayat komponen tetap tersimpan untuk
            arsip dan perhitungan ulang.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="epc-end-to">
              Tanggal akhir (opsional, kosong = hari ini)
            </Label>
            <Input
              id="epc-end-to"
              name="effectiveTo"
              type="date"
              defaultValue=""
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Mengakhiri…" : END_CONFIRMATION_BUTTON}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}