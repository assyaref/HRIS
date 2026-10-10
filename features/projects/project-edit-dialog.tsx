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

import { updateProjectAction } from "./actions";
import { OrganizationSelect, type OrganizationSelectOption } from "./organization-select";

export type EditableProject = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  organizationName: string;
  organizationCode: string;
};

interface ProjectEditDialogProps {
  project: EditableProject;
  /** Active organizations + the project's own organization (any status). */
  organizations: OrganizationSelectOption[];
  /** Server-computed: the project is safe to move when it has no references. */
  canChangeOrganization: boolean;
  /** Trigger label variant — row action (small) or detail-page (default). */
  compact?: boolean;
}

function formatDateInput(date: Date | null) {
  if (!date) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
  }).format(date);
}

/**
 * Edit Project dialog (client leaf). Loads its initial values from the
 * project row; the server action re-validates everything (duplicate code,
 * active organization, dependency-free organization move) before saving.
 *
 * The organization selector is disabled while the project holds dependent
 * records (assignments, attendance, work locations) — moving it would break
 * the same-organization invariant of those references. The server blocks the
 * move anyway; this just explains the rule up front.
 */
export function ProjectEditDialog({
  project,
  organizations,
  canChangeOrganization,
  compact = false,
}: ProjectEditDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState(
    project.organizationId
  );

  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [messageSuccess, setMessageSuccess] = useState(false);

  const organizationChanging = organizationId !== project.organizationId;

  function submitProject(formData: FormData) {
    const code = String(formData.get("code") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const status = String(formData.get("status") ?? "");
    const startDateValue = String(formData.get("startDate") ?? "");
    const endDateValue = String(formData.get("endDate") ?? "");

    const input: Record<string, string> = {
      code,
      name,
      status,
      organizationId,
    };

    if (startDateValue) {
      input.startDate = startDateValue;
    }

    if (endDateValue) {
      input.endDate = endDateValue;
    }

    setMessage("");
    setMessageSuccess(false);

    startTransition(async () => {
      const result = await updateProjectAction(project.id, input);

      if (result.success) {
        notifier.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        setMessage(result.message);
        setMessageSuccess(false);
        notifier.error(result.message);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "primary"}
        size={compact ? "sm" : "md"}
        onClick={() => {
          setOrganizationId(project.organizationId);
          setMessage("");
          setMessageSuccess(false);
          setOpen(true);
        }}
        aria-label={`Edit ${project.name}`}
      >
        Edit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update project information. The project code must remain unique
              within the selected organization.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitProject(new FormData(event.currentTarget));
            }}
            className="space-y-4"
          >
            <OrganizationSelect
              label="Organization"
              organizations={organizations}
              value={organizationId}
              onChange={setOrganizationId}
              disabled={pending || !canChangeOrganization}
              emptyMessage="No active organizations found."
            />

            {!canChangeOrganization ? (
              <p className="text-muted-foreground text-xs">
                This project is referenced by assignments, attendance records
                or work locations, so its organization is locked. Remove
                those references first to move it.
              </p>
            ) : organizationChanging ? (
              <p className="text-muted-foreground text-xs">
                Moving the project to another organization is allowed because
                it has no referenced records.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor={`edit-project-code-${project.id}`}>
                Project Code
              </Label>

              <Input
                id={`edit-project-code-${project.id}`}
                name="code"
                defaultValue={project.code}
                required
                maxLength={32}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-project-name-${project.id}`}>
                Project Name
              </Label>

              <Input
                id={`edit-project-name-${project.id}`}
                name="name"
                defaultValue={project.name}
                required
                maxLength={150}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-project-status-${project.id}`}>
                Status
              </Label>

              <select
                id={`edit-project-status-${project.id}`}
                name="status"
                defaultValue={project.status}
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
                <Label htmlFor={`edit-project-start-date-${project.id}`}>
                  Start Date
                </Label>

                <Input
                  id={`edit-project-start-date-${project.id}`}
                  name="startDate"
                  type="date"
                  defaultValue={formatDateInput(project.startDate)}
                  disabled={pending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`edit-project-end-date-${project.id}`}>
                  End Date
                </Label>

                <Input
                  id={`edit-project-end-date-${project.id}`}
                  name="endDate"
                  type="date"
                  defaultValue={formatDateInput(project.endDate)}
                  disabled={pending}
                />
              </div>
            </div>

            {message ? (
              <p
                role="alert"
                className={
                  messageSuccess
                    ? "text-sm"
                    : "text-destructive text-sm"
                }
              >
                {message}
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

              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
