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
import { Label } from "@/components/ui/label";

import { updateProjectStatusAction } from "./actions";
import { ProjectStatusBadge } from "./project-status-badge";

interface ProjectStatusDialogProps {
  project: {
    id: string;
    name: string;
    status: string;
  };
}

/**
 * Explicit lifecycle transition dialog (extracted from the former
 * project-edit-form). The server action re-verifies the SUPERADMIN role.
 */
export function ProjectStatusDialog({ project }: ProjectStatusDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(project.status);
  const [message, setMessage] = useState("");

  const [pending, startTransition] = useTransition();

  function submitStatus() {
    setMessage("");

    startTransition(async () => {
      const result = await updateProjectStatusAction(project.id, {
        status: selectedStatus,
      });

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
        variant="outline"
        onClick={() => {
          setSelectedStatus(project.status);
          setMessage("");
          setOpen(true);
        }}
      >
        Change Status
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
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
                <span className="text-sm font-medium">Current status</span>
                <ProjectStatusBadge status={project.status} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-status-change">New Status</Label>
              <select
                id="project-status-change"
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                disabled={pending}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {message ? (
              <p role="alert" className="text-destructive text-sm">
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

              <Button
                type="button"
                onClick={submitStatus}
                disabled={pending || selectedStatus === project.status}
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
