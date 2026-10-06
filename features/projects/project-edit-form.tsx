"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateProjectAction,
  updateProjectStatusAction,
} from "./actions";
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
import { Badge } from "@/components/ui/badge";

type Project = {
  id: string;
  code: string;
  name: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
};

function formatDateInput(date: Date | null) {
  if (!date) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
  }).format(date);
}

function statusLabel(status: string) {
  switch (status) {
    case "active":
      return "Active";
    case "inactive":
      return "Inactive";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

function statusVariant(
  status: string
): "primary" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "primary";
    case "completed":
      return "secondary";
    case "inactive":
      return "outline";
    default:
      return "outline";
  }
}

export function ProjectEditForm({
  project,
  canManage,
}: {
  project: Project;
  canManage: boolean;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(project.status);

  const [pending, startTransition] = useTransition();

  const [message, setMessage] = useState("");
  const [messageSuccess, setMessageSuccess] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");
  const [statusMessageSuccess, setStatusMessageSuccess] =
    useState(false);

  if (!canManage) {
    return null;
  }

  function submitProject(formData: FormData) {
    const code = String(formData.get("code") ?? "");
    const name = String(formData.get("name") ?? "");
    const status = String(formData.get("status") ?? "");
    const startDateValue = String(formData.get("startDate") ?? "");
    const endDateValue = String(formData.get("endDate") ?? "");

    const input: Record<string, string> = {
      code,
      name,
      status,
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

      setMessage(result.message);
      setMessageSuccess(result.success);

      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  function submitStatus() {
    setStatusMessage("");
    setStatusMessageSuccess(false);

    startTransition(async () => {
      const result = await updateProjectStatusAction(project.id, {
        status: selectedStatus,
      });

      setStatusMessage(result.message);
      setStatusMessageSuccess(result.success);

      if (result.success) {
        setStatusOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setOpen(true)}>
          Edit Project
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSelectedStatus(project.status);
            setStatusMessage("");
            setStatusMessageSuccess(false);
            setStatusOpen(true);
          }}
        >
          Change Status
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update project information for the current organization.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitProject(new FormData(event.currentTarget));
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-project-code">
                Project Code
              </Label>

              <Input
                id="edit-project-code"
                name="code"
                defaultValue={project.code}
                required
                maxLength={32}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-project-name">
                Project Name
              </Label>

              <Input
                id="edit-project-name"
                name="name"
                defaultValue={project.name}
                required
                maxLength={150}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-project-status">
                Status
              </Label>

              <select
                id="edit-project-status"
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
                <Label htmlFor="edit-project-start-date">
                  Start Date
                </Label>

                <Input
                  id="edit-project-start-date"
                  name="startDate"
                  type="date"
                  defaultValue={formatDateInput(project.startDate)}
                  disabled={pending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-project-end-date">
                  End Date
                </Label>

                <Input
                  id="edit-project-end-date"
                  name="endDate"
                  type="date"
                  defaultValue={formatDateInput(project.endDate)}
                  disabled={pending}
                />
              </div>
            </div>

            {message && (
              <p
                className={
                  messageSuccess
                    ? "text-sm"
                    : "text-destructive text-sm"
                }
              >
                {message}
              </p>
            )}

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

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Project Status</DialogTitle>
            <DialogDescription>
              Change the operational status of this project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">
                  Current status
                </span>

                <Badge variant={statusVariant(project.status)}>
                  {statusLabel(project.status)}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-status-change">
                New Status
              </Label>

              <select
                id="project-status-change"
                value={selectedStatus}
                onChange={(event) =>
                  setSelectedStatus(event.target.value)
                }
                disabled={pending}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {statusMessage && (
              <p
                className={
                  statusMessageSuccess
                    ? "text-sm"
                    : "text-destructive text-sm"
                }
              >
                {statusMessage}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStatusOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={submitStatus}
                disabled={
                  pending ||
                  selectedStatus === project.status
                }
              >
                {pending ? "Updating..." : "Update Status"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
