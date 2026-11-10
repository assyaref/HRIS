"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { notifier } from "@/lib/notifier";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  deleteWorkLocationAction,
  toggleWorkLocationStatusAction,
} from "./actions";

export type WorkLocationRowActionsLocation = {
  id: string;
  name: string;
  status: string;
  projectName: string | null;
};

/**
 * Per-row actions on the Work Locations list: Edit, quick Activate/Deactivate,
 * and Delete (with confirmation). All authorization, org scoping, activation
 * guardrails and delete-safety checks run server-side in ./actions.
 */
export function WorkLocationRowActions({
  location,
}: {
  location: WorkLocationRowActionsLocation;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [togglePending, startToggle] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const isActive = location.status === "active";

  function toggleStatus() {
    startToggle(async () => {
      const result = await toggleWorkLocationStatusAction(
        location.id,
        isActive ? "inactive" : "active"
      );
      if (result.ok) {
        notifier.success(result.message ?? "Status updated.");
        router.refresh();
      } else {
        notifier.error(result.message ?? "Could not change the location status.");
      }
    });
  }

  function confirmDelete() {
    setDeleteError("");
    startDelete(async () => {
      const result = await deleteWorkLocationAction(
        location.id,
        { status: "idle" },
        new FormData()
      );
      if (result.status === "success") {
        notifier.success(result.message ?? "Work location deleted.");
        setDeleteOpen(false);
        router.refresh();
      } else {
        const message = result.message ?? "Failed to delete work location.";
        setDeleteError(message);
        notifier.error(message);
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={`/settings/work-locations/${location.id}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Edit
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={togglePending}
          onClick={toggleStatus}
        >
          {togglePending ? "Saving..." : isActive ? "Deactivate" : "Activate"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setDeleteError("");
            setDeleteOpen(true);
          }}
          aria-label={`Delete ${location.name}`}
        >
          Delete
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete work location
            </DialogTitle>
            <DialogDescription>
              This permanently removes the work location. Locations still used
              by attendance records or by a project with active employee
              assignments cannot be deleted. Deactivate them instead.
            </DialogDescription>
          </DialogHeader>

          {deleteError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {deleteError}
            </div>
          ) : null}

          <div className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 rounded-md border border-destructive/40 p-4 text-left text-sm">
            <span className="text-muted-foreground">Name</span>
            <span className="truncate font-medium">{location.name}</span>
            <span className="text-muted-foreground">Project</span>
            <span className="truncate">{location.projectName ?? "Not Assigned"}</span>
            <span className="text-muted-foreground">Status</span>
            <span>{isActive ? "Active" : "Inactive"}</span>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletePending}
              onClick={confirmDelete}
            >
              {deletePending ? "Deleting..." : "Delete location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
