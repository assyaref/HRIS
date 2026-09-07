"use client";

import { useState, useActionState, type FormEvent } from "react";
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
import {
  WORK_LOCATION_STATUS_SUMMARY,
  collectWorkLocationWarnings,
  parseWorkLocationNumber,
  workLocationZodFieldErrors,
} from "./guardrails";
import {
  updateWorkLocationSchema,
  type WorkLocationProjectOption,
} from "./schemas";

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
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [toggleError, setToggleError] = useState<string | null>(null);
  // Draft status override. While the user edits the status <select>, that value
  // wins; any server change (e.g. the header toggle + router.refresh) is picked
  // up automatically because the fallback derives from `location.status`.
  const [statusDraft, setStatusDraft] = useState<"active" | "inactive" | null>(
    null
  );
  const status: "active" | "inactive" =
    statusDraft ?? (location.status === "inactive" ? "inactive" : "active");

  const initialState: WorkLocationActionState = { status: "idle" };
  // Follow same project pattern as role-create-dialog.tsx
  const boundUpdateAction = (_prevState: WorkLocationActionState, formData: FormData) =>
    updateWorkLocationAction(location.id, _prevState, formData);
  const [updateState, updateFormAction] = useActionState(boundUpdateAction, initialState);

  // Follow same project pattern as role-create-dialog.tsx
  const boundDeleteAction = (_prevState: WorkLocationActionState, formData: FormData) =>
    deleteWorkLocationAction(location.id, _prevState, formData);
  const [deleteState, deleteFormAction] = useActionState(boundDeleteAction, initialState);

  /**
   * Operational warnings (Phase 9.5 step 6) computed from the server-loaded
   * location. These are warnings only — Management may keep the configuration.
   */
  const warnings = collectWorkLocationWarnings({
    status: location.status,
    projectStatus: location.projectStatus,
    hasActiveAssignments: location.hasActiveAssignments,
  });

  async function handleToggleStatus(newStatus: "active" | "inactive") {
    setToggleError(null);
    const result = await toggleWorkLocationStatusAction(location.id, newStatus);
    if (result.ok) {
      setStatusDraft(null);
      router.refresh();
    } else {
      setToggleError(
        result.message ?? "Could not change the location status."
      );
    }
  }

  /**
   * Supplementary client-side validation (Phase 9.5 step 9). The server action
   * remains authoritative — this only gives instant feedback for the same
   * shared Zod schema before a round trip.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const input = {
      name: formData.get("name")?.toString() ?? "",
      projectId: formData.get("projectId")?.toString() ?? "",
      latitude: parseWorkLocationNumber(formData.get("latitude")),
      longitude: parseWorkLocationNumber(formData.get("longitude")),
      radiusMeters: parseWorkLocationNumber(formData.get("radiusMeters")),
      maxGpsAccuracyMeters: parseWorkLocationNumber(
        formData.get("maxGpsAccuracyMeters")
      ),
      timezone: formData.get("timezone")?.toString(),
      status,
    };
    const parsed = updateWorkLocationSchema.safeParse(input);
    if (!parsed.success) {
      event.preventDefault();
      setClientErrors(workLocationZodFieldErrors(parsed.error.issues));
      return;
    }
    setClientErrors({});
  }

  // Server field errors win once available; client errors give instant feedback.
  const fieldErrors = { ...clientErrors, ...(updateState.fieldErrors ?? {}) };
  const savedIsActive = location.status === "active";

  // Watch delete state to navigate after success
  if (deleteState.status === "success") {
    router.push("/settings/work-locations");
  }

  return (
    <div className="space-y-6">
      {/* Header section with status and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-start gap-1">
            <Badge variant={savedIsActive ? "primary" : "secondary"}>
              {savedIsActive ? "Active" : "Inactive"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {savedIsActive
                ? "Available for attendance resolution"
                : "Not available for attendance"}
            </span>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleToggleStatus(savedIsActive ? "inactive" : "active")}
          >
            {savedIsActive ? "Mark inactive" : "Mark active"}
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

      {toggleError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {toggleError}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div
          role="status"
          className="space-y-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-900"
        >
          {warnings.map((warning) => (
            <p key={warning}>⚠ {warning}</p>
          ))}
        </div>
      ) : null}

      {/* Edit form */}
      <form
        action={updateFormAction}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
      >
        {updateState.message && updateState.status === "error" ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {updateState.message}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="wl-edit-name">
            Work location name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wl-edit-name"
            name="name"
            defaultValue={location.name}
            placeholder="Head Office Jakarta"
            required
            invalid={Boolean(fieldErrors.name)}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name && (
            <p className="text-xs text-destructive">{fieldErrors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="wl-edit-project">
            Project <span className="text-destructive">*</span>
          </Label>
          <select
            id="wl-edit-project"
            name="projectId"
            required
            defaultValue={location.projectId ?? ""}
            aria-invalid={Boolean(fieldErrors.projectId)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              Select a project
            </option>
            {location.projectId &&
            location.projectName &&
            !projects.some((project) => project.id === location.projectId) ? (
              <option value={location.projectId}>
                {location.projectName} (current: {location.projectStatus})
              </option>
            ) : null}
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
          {fieldErrors.projectId && (
            <p className="text-xs text-destructive">{fieldErrors.projectId}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wl-edit-latitude">
              Latitude <span className="text-destructive">*</span>
            </Label>
            <Input
              id="wl-edit-latitude"
              name="latitude"
              type="number"
              step="0.000001"
              min="-90"
              max="90"
              defaultValue={location.latitude ?? ""}
              placeholder="-6.2088"
              invalid={Boolean(fieldErrors.latitude)}
              aria-invalid={Boolean(fieldErrors.latitude)}
            />
            <p className="text-xs text-muted-foreground">
              Contoh: -6.2088 (between -90 and 90)
            </p>
            {fieldErrors.latitude && (
              <p className="text-xs text-destructive">{fieldErrors.latitude}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-edit-longitude">
              Longitude <span className="text-destructive">*</span>
            </Label>
            <Input
              id="wl-edit-longitude"
              name="longitude"
              type="number"
              step="0.000001"
              min="-180"
              max="180"
              defaultValue={location.longitude ?? ""}
              placeholder="106.8456"
              invalid={Boolean(fieldErrors.longitude)}
              aria-invalid={Boolean(fieldErrors.longitude)}
            />
            <p className="text-xs text-muted-foreground">
              Contoh: 106.8456 (between -180 and 180)
            </p>
            {fieldErrors.longitude && (
              <p className="text-xs text-destructive">{fieldErrors.longitude}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wl-edit-radius">
              Radius (meters) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="wl-edit-radius"
              name="radiusMeters"
              type="number"
              step="1"
              min="50"
              max="50000"
              defaultValue={location.radiusMeters ?? ""}
              placeholder="100"
              invalid={Boolean(fieldErrors.radiusMeters)}
              aria-invalid={Boolean(fieldErrors.radiusMeters)}
            />
            <p className="text-xs text-muted-foreground">
              Contoh: 100 meter (50 – 50.000)
            </p>
            {fieldErrors.radiusMeters && (
              <p className="text-xs text-destructive">{fieldErrors.radiusMeters}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-edit-accuracy">Max GPS accuracy (meters)</Label>
            <Input
              id="wl-edit-accuracy"
              name="maxGpsAccuracyMeters"
              type="number"
              step="1"
              min="1"
              max="500"
              defaultValue={location.maxGpsAccuracyMeters ?? ""}
              placeholder="100"
              invalid={Boolean(fieldErrors.maxGpsAccuracyMeters)}
              aria-invalid={Boolean(fieldErrors.maxGpsAccuracyMeters)}
            />
            <p className="text-xs text-muted-foreground">
              Contoh: 100 meter (default 100 m when empty)
            </p>
            {fieldErrors.maxGpsAccuracyMeters && (
              <p className="text-xs text-destructive">{fieldErrors.maxGpsAccuracyMeters}</p>
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
              aria-invalid={Boolean(fieldErrors.timezone)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="Asia/Jakarta">Asia/Jakarta</option>
              <option value="Asia/Singapore">Asia/Singapore</option>
              <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur</option>
              <option value="UTC">UTC</option>
            </select>
            {fieldErrors.timezone && (
              <p className="text-xs text-destructive">{fieldErrors.timezone}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-edit-status">Status</Label>
            <select
              id="wl-edit-status"
              name="status"
              value={status}
              onChange={(event) =>
                setStatusDraft(event.target.value as "active" | "inactive")
              }
              aria-invalid={Boolean(fieldErrors.status)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {fieldErrors.status && (
              <p className="text-xs text-destructive">{fieldErrors.status}</p>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground" role="status">
          {WORK_LOCATION_STATUS_SUMMARY[status]}
        </p>

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