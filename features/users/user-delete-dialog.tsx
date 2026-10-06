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

import { deleteUserAction, type UserActionState } from "./actions";
import type { UserAccountListItem } from "./queries";
import { UserStatusBadge } from "./status-badge";

const initialState: UserActionState = { status: "idle" };

interface DeleteUserDialogProps {
  user: UserAccountListItem;
}

/**
 * Delete flow for one account (client leaf): a warning toast fires when the
 * user hits Delete, then a confirmation dialog shows the account summary.
 * The actual deletion runs in `deleteUserAction` which re-checks `users.delete`
 * and the deletion safety policy (self/last-Super-Administrator/protected
 * history) server-side. The button is hidden entirely when the server-side
 * requirements prevent deletion.
 */
export function DeleteUserDialog({ user }: DeleteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    deleteUserAction.bind(null, user.id),
    initialState
  );

  if (state.status === "success" && open) {
    notifier.success(state.message ?? "User account deleted.");
    setOpen(false);
  }

  function openWithWarning() {
    notifier.warning(
      "Deleting this account is permanent and cannot be undone. Review the details and confirm."
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
        aria-label={`Delete ${user.email}`}
      >
        Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete user account
            </DialogTitle>
            <DialogDescription>
              This permanently removes the account and cannot be undone.
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
                {user.name ?? "—"}
              </span>
              <span className="text-muted-foreground">Email</span>
              <span className="truncate font-medium">{user.email}</span>
              <span className="text-muted-foreground">Role</span>
              <span className="truncate">{user.roleName ?? "—"}</span>
              <span className="text-muted-foreground">Organization</span>
              <span className="truncate">{user.organizationCode}</span>
              <span className="text-muted-foreground">Status</span>
              <span>
                <UserStatusBadge status={user.status} />
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              The server will re-check per-organization scope, self-deletion,
              the last-active Super Administrator guarantee and protected
              history before deleting.
            </p>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              type="button"
              variant="secondary"
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
              {isPending ? "Deleting..." : "Yes, delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}