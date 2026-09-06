"use client";

import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

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

import {
  updateWorkLocationAction,
  toggleWorkLocationStatusAction,
  deleteWorkLocationAction,
  type WorkLocationActionState,
} from "./actions";
import type { WorkLocationListItem } from "./actions";
import type { WorkLocationProjectOption } from "./schemas";

// Submit button component
function SubmitButton({ pendingText = "Saving..." }: { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingText : "Save changes"}
    </Button>
  );
}

interface WorkLocationEditFormProps {
  location: WorkLocationListItem;
  /** Active projects in the caller's organization (server-provided). */
  projects: WorkLocationProjectOption[];
}

export function WorkLocationEditForm({ location, projects }: WorkLocationEditFormProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const initialState: WorkLocationActionState = { status: "idle" };
  // Follow same project pattern as role-create-dialog.tsx
  const boundUpdateAction = (_prevState: WorkLocationActionState, formData: FormData) =>
    updateWorkLocationAction(location.id, _prevState, formData);
  const [updateState, updateFormAction] = useActionState(boundUpdateAction, initialState);

  // Follow same project pattern as role-create-dialog.tsx
  const boundDeleteAction = (_prevState: WorkLocationActionState, formData: FormData) =>
    deleteWorkLocationAction(location.id, _prevState, formData);
  const [deleteState, deleteFormAction] = useActionState(boundDeleteAction, initialState);

  async function handleToggleStatus(newStatus: "active" | "inactive") {
    const result = await toggleWorkLocationStatusAction(location.id, newStatus);
    if (result.ok) {
      router.refresh();
    }
  }

  const isActive = location.status === "active";

  // Watch delete state to navigate after success
  if (deleteState.status === "success") {
    router.push("/settings/work-locations");
  }

  return (
    <div className="space-y-6">
      {/* Header section with status and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Badge variant={isActive ? "primary" : "secondary"}>
            {isActive ? "Active" : "Inactive"}
          </Badge>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleToggleStatus(isActive ? "inactive" : "active")}
          >
            {isActive ? "Mark inactive" : "Mark active"}
          </Button>
        </div>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setDeleteDialogOpen(true)}
        >
          Delete location
        </Button>
      </div>

      {/* Edit form */}
      <form action={updateFormAction} noValidate className="space-y-4">
        {updateState.message && updateState.status === "error" ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {updateState.message}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="wl-edit-name">Location name</Label>
          <Input
            id="wl-edit-name"
            name="name"
            defaultValue={location.name}
            placeholder="Head Office Jakarta"
            required
          />
          {updateState.fieldErrors?.name && (
            <p className="text-xs text-destructive">{updateState.fieldErrors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="wl-edit-project">Project</Label>
          <select
            id="wl-edit-project"
            name="projectId"
            required
            defaultValue={location.projectId ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              Select a project
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.code ? ` (${project.code})` : ""}
              </option>
            ))}
          </select>
          {!location.projectId ? (
            <p className="text-xs text-muted-foreground">
              This location is not assigned to a project yet. Select one to make
              it available for attendance check-ins.
            </p>
          ) : null}
          {updateState.fieldErrors?.projectId && (
            <p className="text-xs text-destructive">{updateState.fieldErrors.projectId}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wl-edit-latitude">Latitude</Label>
            <Input
              id="wl-edit-latitude"
              name="latitude"
              type="number"
              step="0.000001"
              defaultValue={location.latitude ?? ""}
              placeholder="-6.2088"
            />
            {updateState.fieldErrors?.latitude && (
              <p className="text-xs text-destructive">{updateState.fieldErrors.latitude}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-edit-longitude">Longitude</Label>
            <Input
              id="wl-edit-longitude"
              name="longitude"
              type="number"
              step="0.000001"
              defaultValue={location.longitude ?? ""}
              placeholder="106.8456"
            />
            {updateState.fieldErrors?.longitude && (
              <p className="text-xs text-destructive">{updateState.fieldErrors.longitude}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wl-edit-radius">Radius (meters)</Label>
            <Input
              id="wl-edit-radius"
              name="radiusMeters"
              type="number"
              step="1"
              defaultValue={location.radiusMeters ?? ""}
              placeholder="100"
            />
            {updateState.fieldErrors?.radiusMeters && (
              <p className="text-xs text-destructive">{updateState.fieldErrors.radiusMeters}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-edit-accuracy">Max GPS accuracy (m)</Label>
            <Input
              id="wl-edit-accuracy"
              name="maxGpsAccuracyMeters"
              type="number"
              step="1"
              defaultValue={location.maxGpsAccuracyMeters ?? ""}
              placeholder="100"
            />
            {updateState.fieldErrors?.maxGpsAccuracyMeters && (
              <p className="text-xs text-destructive">{updateState.fieldErrors.maxGpsAccuracyMeters}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wl-edit-timezone">Timezone</Label>
            <select
              id="wl-edit-timezone"
              name="timezone"
              defaultValue={location.timezone || "Asia/Jakarta"}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="Asia/Jakarta">Asia/Jakarta</option>
              <option value="Asia/Singapore">Asia/Singapore</option>
              <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur</option>
              <option value="UTC">UTC</option>
            </select>
            {updateState.fieldErrors?.timezone && (
              <p className="text-xs text-destructive">{updateState.fieldErrors.timezone}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-edit-status">Status</Label>
            <select
              id="wl-edit-status"
              name="status"
              defaultValue={location.status}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {updateState.fieldErrors?.status && (
              <p className="text-xs text-destructive">{updateState.fieldErrors.status}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <SubmitButton />
        </DialogFooter>
      </form>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete work location</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this work location? This action cannot be undone.
              Locations that are still used by employees or attendance records cannot be deleted.
            </DialogDescription>
            {deleteState.message && deleteState.status === "error" ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive mt-2"
              >
                {deleteState.message}
              </div>
            ) : null}
          </DialogHeader>
          <form action={deleteFormAction}>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
              >
                Delete
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}