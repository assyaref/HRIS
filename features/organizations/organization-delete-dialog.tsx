"use client";

import { startTransition, useActionState, useState } from "react";

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
import { Label } from "@/components/ui/label";

import {
  deleteOrganizationAction,
  forceDeleteOrganizationAction,
  type OrganizationActionState,
} from "./actions";
import type { OrganizationListItem } from "./queries";

const initialState: OrganizationActionState = { status: "idle" };

interface DeleteOrganizationDialogProps {
  organization: OrganizationListItem;
  /** Server-computed dependency totals for the confirmation copy. */
  dependencyTotal: number;
}

/**
 * Delete flow for one organization (client leaf): a warning toast, then a
 * confirmation dialog summarizing the tenant and its dependent-record count.
 * The actual deletion runs in `deleteOrganizationAction`, which re-verifies
 * the SUPERADMIN role and the full dependency policy server-side — including
 * the reserved SYSTEM tenant and protected history. The button is hidden
 * entirely when the server's pre-check already knows deletion is impossible.
 */
export function DeleteOrganizationDialog({
  organization,
  dependencyTotal,
}: DeleteOrganizationDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const withData = dependencyTotal > 0;
  const [state, formAction, isPending] = useActionState(
    async (_previous: OrganizationActionState, typed: string) => {
      const result = withData
        ? await forceDeleteOrganizationAction(organization.id, typed)
        : await deleteOrganizationAction(organization.id);
      // Announce here: on success the row (and this dialog) unmounts as the
      // list revalidates, so a render-time toast would never fire.
      if (result.status === "success") {
        notifier.success(result.message ?? "Organization deleted.");
      }
      return result;
    },
    initialState
  );
  const confirmed =
    !withData ||
    confirmation.trim().toUpperCase() === organization.code.toUpperCase();

  if (state.status === "success" && open) {
    setOpen(false);
  }

  function openWithWarning() {
    notifier.warning(
      "Deleting an organization is permanent and cannot be undone."
    );
    setOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={openWithWarning}
        aria-label={`Delete ${organization.name}`}
      >
        Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete organization
            </DialogTitle>
            <DialogDescription>
              {withData
                ? "Organisasi ini masih memiliki data terkait. Menghapusnya akan menghapus PERMANEN semua user, role, proyek, lokasi kerja, cuti, izin, absensi, payroll, dan pengumuman milik organisasi ini. Riwayat audit tetap disimpan. Tindakan ini tidak dapat dibatalkan."
                : "Organisasi ini kosong dan akan dihapus permanen."}
            </DialogDescription>
          </DialogHeader>

          {state.status === "error" && state.message ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </div>
          ) : null}

          <div className="space-y-3 rounded-md border border-destructive/40 p-4">
            <div className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="truncate font-medium">
                {organization.name}
              </span>
              <span className="text-muted-foreground">Code</span>
              <span className="font-mono">{organization.code}</span>
              <span className="text-muted-foreground">Dependent records</span>
              <span className="font-medium tabular-nums">
                {dependencyTotal === 0
                  ? "None — safe to delete"
                  : "Ada — semua ikut dihapus"}
              </span>
            </div>
            {withData ? (
              <p className="text-xs text-muted-foreground">
                Karyawan harus dihapus permanen lebih dulu lewat menu Karyawan.
                Pertimbangkan menonaktifkan organisasi bila datanya masih
                diperlukan.
              </p>
            ) : null}
          </div>

          {withData ? (
            <div className="space-y-2">
              <Label htmlFor={`org-delete-confirm-${organization.id}`}>
                Ketik <span className="font-mono font-semibold">{organization.code}</span> untuk konfirmasi
              </Label>
              <Input
                id={`org-delete-confirm-${organization.id}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending || !confirmed}
              onClick={() => startTransition(() => formAction(confirmation))}
            >
              {isPending
                ? "Menghapus..."
                : withData
                  ? "Hapus beserta data"
                  : "Delete organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
