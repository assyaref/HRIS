"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { notifier } from "@/lib/notifier";

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

import {
  bulkPermanentlyDeleteEmployeesAction,
  type EmployeeBulkPermanentDeleteState,
} from "./actions";

interface BulkDeleteEmployeeTarget {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
}

interface EmployeeBulkDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  /** The employees the operator explicitly selected on the current page. */
  employees: BulkDeleteEmployeeTarget[];
  /** The organization the listing is scoped to (all selected employees belong to it). */
  organizationId: string;
  /** Display name of that organization, when known. */
  organizationName?: string;
}

const initialState: EmployeeBulkPermanentDeleteState = { status: "idle" };

/**
 * Confirmation dialog for the Super Administrator's bulk permanent delete.
 *
 * The destructive action is gated on typing the exact phrase
 * `DELETE <count> EMPLOYEES`, so the operator must reconcile the count with
 * the selection shown in the dialog. The server action re-authorizes
 * (SUPERADMIN + `employees.permanent_delete`), re-scopes every id to the
 * listing's organization, and runs the whole batch in one transaction.
 */
export function EmployeeBulkDeleteDialog({
  open,
  onClose,
  employees,
  organizationId,
  organizationName,
}: EmployeeBulkDeleteDialogProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const handledSuccess = useRef(false);
  const [state, formAction, isPending] = useActionState(
    bulkPermanentlyDeleteEmployeesAction.bind(null, organizationId),
    initialState
  );

  const selectedCount = employees.length;
  const expectedConfirmation = `DELETE ${selectedCount} EMPLOYEES`;
  const confirmationMatches = confirmation === expectedConfirmation;
  const canSubmitDelete = confirmationMatches && acknowledged && !isPending;

  const displayLines = employees.map(
    (employee) =>
      `${employee.firstName} ${employee.lastName} (${employee.employeeNumber})`
  );

  function reset() {
    setConfirmation("");
    setAcknowledged(false);
  }

  useEffect(() => {
    if (state.status !== "success" || handledSuccess.current) return;
    handledSuccess.current = true;
    notifier.success(
      state.message ?? "Karyawan terpilih berhasil dihapus permanen."
    );
    reset();
    router.refresh();
    onClose();
  }, [state, router, onClose]);

  function submit() {
    const formData = new FormData();
    formData.set("employeeIds", JSON.stringify(employees.map((e) => e.id)));
    formData.set("confirmation", confirmation);
    formData.set(
      "acknowledgedBulkPermanentDelete",
      acknowledged ? "true" : ""
    );
    formAction(formData);
  }

  return (
    <>
      {/* Opened from the selection bar in EmployeeTable, which only appears
          once employees are checked — no standalone trigger here. */}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (isPending) return;
          if (!nextOpen) {
            reset();
            return;
          }
          setConfirmation("");
          setAcknowledged(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Hapus Permanen Karyawan Terpilih?
            </DialogTitle>
            <DialogDescription>
              Anda akan menghapus permanen {selectedCount} data karyawan terpilih. Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
              <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                <span className="text-muted-foreground">
                  Karyawan terpilih
                </span>
                <span className="font-mono font-medium">{selectedCount}</span>
                {organizationName ? (
                  <>
                    <span className="text-muted-foreground">Organisasi</span>
                    <span className="truncate">{organizationName}</span>
                  </>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {displayLines.join(" · ")}
              </p>
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Dampak ke data terkait
              </p>
              <p className="text-sm text-muted-foreground">
                Data terkait yang dapat dihapus (payroll, slip gaji, dokumen, Face ID, penugasan proyek, dan data profil lainnya) dihapus bersama setiap karyawan dalam satu transaksi. Data historis yang dilindungi (absensi, cuti, izin, dan riwayat kepegawaian) disimpan untuk keperluan hukum dan audit dan tidak pernah dihapus.
              </p>
            </div>

            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              <p className="font-medium text-destructive">
                Tindakan ini tidak dapat dibatalkan.
              </p>
              <p className="mt-1 text-destructive/90">
                Data karyawan yang dihapus beserta data terkait yang dapat dihapus akan hilang permanen. Data historis yang dilindungi tetap disimpan.
              </p>
            </div>

            <p className="text-sm font-medium">
              Ketik frasa konfirmasi untuk mengaktifkan penghapusan
            </p>
            <div className="space-y-2">
              <label
                htmlFor="bulk-delete-confirmation"
                className="text-xs text-muted-foreground"
              >
                Frasa konfirmasi
              </label>
              <Input
                id="bulk-delete-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={expectedConfirmation}
                autoComplete="off"
                autoFocus
                disabled={isPending}
                className="font-mono"
              />
              <p
                id="bulk-delete-confirmation-help"
                className="text-xs text-muted-foreground"
              >
                Ketik persis{" "}
                <span className="font-mono font-medium">{expectedConfirmation}</span>{" "}
                untuk mengaktifkan penghapusan.
              </p>
              {confirmation !== "" && !confirmationMatches && (
                <p
                  className="text-xs text-destructive"
                  data-testid="bulk-delete-confirmation-mismatch"
                >
                  Frasa tidak cocok dengan {selectedCount} karyawan terpilih.
                </p>
              )}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                disabled={isPending}
                className="mt-0.5"
                data-testid="bulk-delete-acknowledgement"
              />
              <span>
                Saya mengerti bahwa tindakan ini tidak dapat dibatalkan dan saya ingin menghapus permanen {selectedCount} karyawan ini.
              </span>
            </label>

            {state.status === "error" && state.message ? (
              <div
                role="alert"
                className="whitespace-pre-line rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                data-testid="bulk-delete-error"
              >
                {state.message}
              </div>
            ) : null}

            {state.status === "success" ? (
              <div
                className="space-y-2 rounded-md border border-emerald-600/40 bg-emerald-500/5 px-3 py-2 text-sm"
                data-testid="bulk-delete-final-result"
              >
                <p className="font-medium text-emerald-700">
                  {state.deletedCount ?? 0} karyawan berhasil dihapus permanen.
                </p>
                {state.deletedEmployeeNumbers &&
                state.deletedEmployeeNumbers.length > 0 ? (
                  <p className="text-xs font-medium text-muted-foreground">
                    {state.deletedEmployeeNumbers.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            {state.status === "success" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onClose();
                  reset();
                }}
                data-testid="bulk-delete-final-result-close"
              >
                Tutup
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={reset}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!canSubmitDelete}
                  aria-disabled={!canSubmitDelete}
                  onClick={() => {
                    if (!canSubmitDelete) return;
                    submit();
                  }}
                >
                  {isPending
                    ? "Menghapus…"
                    : `Hapus ${selectedCount} Karyawan`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
