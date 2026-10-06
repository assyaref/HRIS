"use client";

import { useState, useActionState } from "react";

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

import { updateOrganizationAction, type OrganizationActionState } from "./actions";
import { SYSTEM_ORGANIZATION_CODE } from "@/lib/auth/roles";
import {
  ORGANIZATION_CODE_MAX_LENGTH,
  ORGANIZATION_NAME_MAX_LENGTH,
} from "./constants";
import type { OrganizationListItem } from "./queries";

const initialState: OrganizationActionState = { status: "idle" };

const selectClasses =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

interface EditOrganizationDialogProps {
  organization: OrganizationListItem;
}

/**
 * Edit one organization (client leaf). The reserved SYSTEM tenant's code and
 * status are frozen — the fields render disabled and the server re-enforces
 * the same rule in `updateOrganizationAction`.
 */
export function EditOrganizationDialog({
  organization,
}: EditOrganizationDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    updateOrganizationAction.bind(null, organization.id),
    initialState
  );

  if (state.status === "success" && open) {
    notifier.success(state.message ?? "Organization updated.");
    setOpen(false);
  }

  const nameError = state.fieldErrors?.name;
  const codeError = state.fieldErrors?.code;
  const statusError = state.fieldErrors?.status;
  const isSystem = organization.code === SYSTEM_ORGANIZATION_CODE;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${organization.name}`}
      >
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit organization</DialogTitle>
            <DialogDescription>
              {isSystem
                ? "The reserved system organization's code and status are immutable."
                : "Update the tenant name, code or status."}
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="space-y-4">
            {state.status === "error" && state.message ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {state.message}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor={`edit-name-${organization.id}`}>Name</Label>
              <Input
                id={`edit-name-${organization.id}`}
                name="name"
                defaultValue={organization.name}
                required
                maxLength={ORGANIZATION_NAME_MAX_LENGTH}
              />
              {nameError ? (
                <p className="text-xs text-destructive">{nameError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-code-${organization.id}`}>Code</Label>
              <Input
                id={`edit-code-${organization.id}`}
                name="code"
                defaultValue={organization.code}
                required
                disabled={isSystem}
                maxLength={ORGANIZATION_CODE_MAX_LENGTH}
                pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
              />
              {codeError ? (
                <p className="text-xs text-destructive">{codeError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-status-${organization.id}`}>Status</Label>
              <select
                id={`edit-status-${organization.id}`}
                name="status"
                defaultValue={organization.status}
                disabled={isSystem}
                className={selectClasses}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Deactivating hides the organization from sign-in and tenant
                selectors without deleting any data.
              </p>
              {statusError ? (
                <p className="text-xs text-destructive">{statusError}</p>
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
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
