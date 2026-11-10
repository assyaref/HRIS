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

import { deleteProjectAction } from "./actions";

export type DeletableProject = {
  id: string;
  code: string;
  name: string;
  organizationName: string;
};

interface ProjectDeleteDialogProps {
  project: DeletableProject;
  /** Server-computed dependency total (assignments + attendance + work locations). */
  dependencyTotal: number;
  compact?: boolean;
}

/**
 * Delete flow for one project (client leaf): a warning toast, then a
 * confirmation dialog showing exactly which project will be removed. The
 * actual deletion runs in `deleteProjectAction`, which re-verifies the
 * SUPERADMIN role and the full dependency policy server-side — a dependent
 * row appearing mid-flight maps to the same refusal (FK violations never
 * surface raw). The trigger is only rendered when the server's pre-check
 * already knows the project is safe to delete; the dialog still explains
 * the policy.
 */
export function ProjectDeleteDialog({
  project,
  dependencyTotal,
  compact = false,
}: ProjectDeleteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState("");
  const withReferences = dependencyTotal > 0;
  const confirmed =
    !withReferences ||
    confirmation.trim().toUpperCase() === project.code.toUpperCase();

  function confirmDelete() {
    setMessage("");

    startTransition(async () => {
      const result = await deleteProjectAction(
        project.id,
        withReferences ? confirmation : undefined
      );

      if (result.success) {
        notifier.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        setMessage(result.message);
        notifier.error(result.message);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "sm" : "md"}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          notifier.warning(
            "Deleting a project is permanent and cannot be undone."
          );
          setMessage("");
          setOpen(true);
        }}
        aria-label={`Delete ${project.name}`}
      >
        Delete
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete project
            </DialogTitle>
            <DialogDescription>
              {withReferences
                ? "Proyek ini masih dirujuk. Menghapusnya akan menghapus assignment karyawan ke proyek ini; riwayat absensi dan lokasi kerja tetap disimpan tanpa proyek. Tindakan ini tidak dapat dibatalkan."
                : "This permanently removes the project."}
            </DialogDescription>
          </DialogHeader>

          {message ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {message}
            </div>
          ) : null}

          <div className="space-y-3 rounded-md border border-destructive/40 p-4">
            <div className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="truncate font-medium">{project.name}</span>
              <span className="text-muted-foreground">Code</span>
              <span className="font-mono">{project.code}</span>
              <span className="text-muted-foreground">Organization</span>
              <span className="truncate font-medium">
                {project.organizationName}
              </span>
              <span className="text-muted-foreground">Referenced records</span>
              <span className="font-medium tabular-nums">
                {dependencyTotal === 0
                  ? "None — safe to delete"
                  : `${dependencyTotal} record(s)`}
              </span>
            </div>
          </div>

          {withReferences ? (
            <div className="space-y-2">
              <Label htmlFor={`project-delete-confirm-${project.id}`}>
                Ketik <span className="font-mono font-semibold">{project.code}</span> untuk konfirmasi
              </Label>
              <Input
                id={`project-delete-confirm-${project.id}`}
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
                : withReferences
                  ? "Hapus proyek"
                  : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
