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

import { createProjectAction, type ActionResult } from "./actions";
import { OrganizationSelect, type OrganizationSelectOption } from "./organization-select";

const initialState = {
  success: false,
  message: "",
};

interface ProjectCreateDialogProps {
  /** Active tenant organizations (loaded server-side from PostgreSQL). */
  organizations: OrganizationSelectOption[];
}

/**
 * Create Project dialog (client leaf). The Super Administrator picks the
 * owning organization here; the server action re-validates the organization,
 * the payload and the duplicate code before inserting, and audits the result.
 */
export function ProjectCreateDialog({ organizations }: ProjectCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState("");

  const [state, formAction, pending] = useActionState(
    createProjectAction,
    initialState
  );

  // Same render-phase adjustment as the organizations dialogs, with a
  // reference guard so a stale success state never re-fires when the dialog
  // is reopened; the server action already revalidated the route.
  const [handledState, setHandledState] = useState<ActionResult | null>(null);
  if (state.success && open && state !== handledState) {
    notifier.success(state.message);
    setOpen(false);
    setOrganizationId("");
    setHandledState(state);
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        disabled={organizations.length === 0}
        title={
          organizations.length === 0
            ? "Create an active organization first."
            : undefined
        }
      >
        New Project
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Create a project inside the selected organization. The project
              code must be unique within that organization.
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="space-y-4">
            <OrganizationSelect
              name="organizationId"
              organizations={organizations}
              value={organizationId}
              onChange={setOrganizationId}
              disabled={pending}
            />

            <div className="space-y-2">
              <Label htmlFor="project-code">Project Code</Label>
              <Input
                id="project-code"
                name="code"
                placeholder="PROJECT-001"
                required
                maxLength={32}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                name="name"
                placeholder="Project Name"
                required
                maxLength={150}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-status">Status</Label>
              <select
                id="project-status"
                name="status"
                defaultValue="active"
                disabled={pending}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project-start-date">Start Date</Label>
                <Input
                  id="project-start-date"
                  name="startDate"
                  type="date"
                  disabled={pending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-end-date">End Date</Label>
                <Input
                  id="project-end-date"
                  name="endDate"
                  type="date"
                  disabled={pending}
                />
              </div>
            </div>

            {state.message && !state.success ? (
              <p role="alert" className="text-destructive text-sm">
                {state.message}
              </p>
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

              <Button type="submit" disabled={pending || !organizationId}>
                {pending ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
