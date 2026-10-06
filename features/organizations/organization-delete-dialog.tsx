"use client";

import { useActionState, useState } from "react";

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

import { deleteOrganizationAction, type OrganizationActionState } from "./actions";
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
  const [state, formAction, isPending] = useActionState(
    deleteOrganizationAction.bind(null, organization.id),
    initialState
  );

  if (state.status === "success" && open) {
    notifier.success(state.message ?? "Organization deleted.");
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
              This permanently removes the organization. Dependent records are
              never cascaded — deletion is rejected unless the tenant is
              completely empty.
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
                  : `${dependencyTotal} record(s)`}
              </span>
            </div>
            {dependencyTotal > 0 ? (
              <p className="text-xs text-muted-foreground">
                Deletion will be rejected. Deactivate the organization instead.
              </p>
            ) : null}
          </div>

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
              disabled={isPending}
              onClick={() => formAction()}
            >
              {isPending ? "Deleting..." : "Delete organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
