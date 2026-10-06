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

import { createOrganizationAction, type OrganizationActionState } from "./actions";
import { ORGANIZATION_CODE_MAX_LENGTH, ORGANIZATION_NAME_MAX_LENGTH } from "./constants";

const initialState: OrganizationActionState = { status: "idle" };

/**
 * "Add Organization" dialog (client leaf). Creation runs in
 * `createOrganizationAction`, which re-authenticates, verifies the
 * system-level SUPERADMIN role and enforces code/name uniqueness server-side.
 */
export function CreateOrganizationDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createOrganizationAction,
    initialState
  );

  if (state.status === "success" && open) {
    notifier.success(state.message ?? "Organization created.");
    setOpen(false);
  }

  const nameError = state.fieldErrors?.name;
  const codeError = state.fieldErrors?.code;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add Organization
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Organization</DialogTitle>
            <DialogDescription>
              Create a new tenant organization. The code is a stable,
              uppercase identifier and must be unique across the platform.
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
              <Label htmlFor="organization-name">Name</Label>
              <Input
                id="organization-name"
                name="name"
                placeholder="Acme Corp"
                required
                maxLength={ORGANIZATION_NAME_MAX_LENGTH}
              />
              {nameError ? (
                <p className="text-xs text-destructive">{nameError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization-code">Code</Label>
              <Input
                id="organization-code"
                name="code"
                placeholder="ACME"
                required
                maxLength={ORGANIZATION_CODE_MAX_LENGTH}
                pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
              />
              <p className="text-xs text-muted-foreground">
                Letters, digits, dash and underscore. Stored uppercase.
              </p>
              {codeError ? (
                <p className="text-xs text-destructive">{codeError}</p>
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
                {isPending ? "Creating..." : "Create organization"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
