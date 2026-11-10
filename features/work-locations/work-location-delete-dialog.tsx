"use client";

import { useState, useTransition } from "react";
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
import { Label } from "@/components/ui/label";

import { deleteWorkLocationAction } from "./actions";

export type DeletableWorkLocation = {
  id: string;
  name: string;
  status: string;
  projectName: string | null;
};

interface WorkLocationDeleteDialogProps {
  location: DeletableWorkLocation;
  /** "sm" ghost button for table rows, "md" destructive button for the edit page. */
  compact?: boolean;
  /** Where to go after a successful delete; refreshes in place when omitted. */
  redirectTo?: string;
}

/**
 * SUPERADMIN-only delete flow. Render it only for Super Administrators; the
 * server action re-checks the role. If the location is still in use, the
 * server refuses with `requiresConfirmation`, and the dialog then asks the
 * user to re-type the location name before the delete goes through.
 */
export function WorkLocationDeleteDialog({
  location,
  compact = false,
  redirectTo,
}: WorkLocationDeleteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();

  const confirmed =
    !needsConfirmation ||
    confirmation.trim().toLowerCase() === location.name.trim().toLowerCase();

  function reset() {
    setMessage("");
    setNeedsConfirmation(false);
    setConfirmation("");
  }

  function confirmDelete() {
    startTransition(async () => {
      const formData = new FormData();
      if (needsConfirmation) formData.set("confirmation", confirmation);

      const result = await deleteWorkLocationAction(
        location.id,
        { status: "idle" },
        formData
      );

      if (result.status === "success") {
        notifier.success(result.message ?? "Work location deleted.");
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
        return;
      }

      const text = result.message ?? "Failed to delete work location.";
      setMessage(text);
      if (result.requiresConfirmation) {
        setNeedsConfirmation(true);
        notifier.warning(text);
      } else {
        notifier.error(text);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "destructive"}
        size={compact ? "sm" : "md"}
        className={
          compact
            ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
            : undefined
        }
        onClick={() => {
          reset();
          setOpen(true);
        }}
        aria-label={`Delete ${location.name}`}
      >
        {compact ? "Delete" : "Delete location"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete work location
            </DialogTitle>
            <DialogDescription>
              {needsConfirmation
                ? "Lokasi ini masih digunakan. Menghapusnya akan melepas lokasi dari catatan absensi dan data karyawan (datanya tetap tersimpan). Tindakan ini tidak dapat dibatalkan."
                : "This permanently removes the work location. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          {message ? (
            <div
              role="alert"
              className={
                needsConfirmation
                  ? "rounded-md border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm text-amber-900"
                  : "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              }
            >
              {message}
            </div>
          ) : null}

          <div className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 rounded-md border border-destructive/40 p-4 text-left text-sm">
            <span className="text-muted-foreground">Name</span>
            <span className="truncate font-medium">{location.name}</span>
            <span className="text-muted-foreground">Project</span>
            <span className="truncate">
              {location.projectName ?? "Not Assigned"}
            </span>
            <span className="text-muted-foreground">Status</span>
            <span>{location.status === "active" ? "Active" : "Inactive"}</span>
          </div>

          {needsConfirmation ? (
            <div className="space-y-2">
              <Label htmlFor={`wl-delete-confirm-${location.id}`}>
                Ketik{" "}
                <span className="font-semibold">{location.name}</span> untuk
                konfirmasi
              </Label>
              <Input
                id={`wl-delete-confirm-${location.id}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !confirmed}
              onClick={confirmDelete}
            >
              {pending
                ? "Deleting..."
                : needsConfirmation
                  ? "Hapus lokasi"
                  : "Delete location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
