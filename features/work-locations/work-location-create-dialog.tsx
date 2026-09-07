"use client";

import { useActionState, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";

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

import { createWorkLocationAction, type WorkLocationActionState } from "./actions";
import {
  WORK_LOCATION_STATUS_INACTIVE,
  WORK_LOCATION_STATUS_SUMMARY,
  parseWorkLocationNumber,
  workLocationZodFieldErrors,
} from "./guardrails";
import {
  createWorkLocationSchema,
  type WorkLocationProjectOption,
} from "./schemas";

const initialState: WorkLocationActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating..." : "Create location"}
    </Button>
  );
}

interface CreateWorkLocationDialogProps {
  /** Active projects in the caller's organization (server-provided). */
  projects: WorkLocationProjectOption[];
}

/**
 * "New work location" dialog (client leaf). Follows existing project pattern
 * using React's useActionState, native form, and server-side Zod validation.
 */
export function CreateWorkLocationDialog({
  projects,
}: CreateWorkLocationDialogProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [state, formAction] = useActionState(createWorkLocationAction, initialState);

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
    const parsed = createWorkLocationSchema.safeParse(input);
    if (!parsed.success) {
      event.preventDefault();
      setClientErrors(workLocationZodFieldErrors(parsed.error.issues));
      return;
    }
    setClientErrors({});
  }

  // Server field errors win once available; client errors give instant feedback.
  const fieldErrors = { ...clientErrors, ...(state.fieldErrors ?? {}) };
  const nameError = fieldErrors.name;
  const projectIdError = fieldErrors.projectId;
  const latitudeError = fieldErrors.latitude;
  const longitudeError = fieldErrors.longitude;
  const radiusMetersError = fieldErrors.radiusMeters;
  const maxGpsAccuracyMetersError = fieldErrors.maxGpsAccuracyMeters;
  const timezoneError = fieldErrors.timezone;
  const statusError = fieldErrors.status;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New work location
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create work location</DialogTitle>
            <DialogDescription>
              Add a new geofenced work location for attendance check-ins.
            </DialogDescription>
          </DialogHeader>

          {state.message && state.status === "error" ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </div>
          ) : null}

          {projects.length === 0 ? (
            <div
              role="status"
              className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
            >
              No active projects available. Create a project first.
            </div>
          ) : null}

          <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wl-name">
                Work location name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="wl-name"
                name="name"
                placeholder="Head Office Jakarta"
                required
                invalid={Boolean(nameError)}
                aria-invalid={Boolean(nameError)}
              />
              {nameError ? (
                <p className="text-sm text-destructive">{nameError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="wl-project">
                Project <span className="text-destructive">*</span>
              </Label>
              <select
                id="wl-project"
                name="projectId"
                required
                defaultValue=""
                aria-invalid={Boolean(projectIdError)}
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
              {projectIdError ? (
                <p className="text-sm text-destructive">{projectIdError}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wl-latitude">
                  Latitude <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="wl-latitude"
                  name="latitude"
                  type="number"
                  step="0.000001"
                  min="-90"
                  max="90"
                  placeholder="-6.2088"
                  invalid={Boolean(latitudeError)}
                  aria-invalid={Boolean(latitudeError)}
                />
                <p className="text-xs text-muted-foreground">
                  Contoh: -6.2088 (between -90 and 90)
                </p>
                {latitudeError ? (
                  <p className="text-sm text-destructive">{latitudeError}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="wl-longitude">
                  Longitude <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="wl-longitude"
                  name="longitude"
                  type="number"
                  step="0.000001"
                  min="-180"
                  max="180"
                  placeholder="106.8456"
                  invalid={Boolean(longitudeError)}
                  aria-invalid={Boolean(longitudeError)}
                />
                <p className="text-xs text-muted-foreground">
                  Contoh: 106.8456 (between -180 and 180)
                </p>
                {longitudeError ? (
                  <p className="text-sm text-destructive">{longitudeError}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wl-radius">
                  Radius (meters) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="wl-radius"
                  name="radiusMeters"
                  type="number"
                  step="1"
                  min="50"
                  max="50000"
                  defaultValue="100"
                  placeholder="100"
                  invalid={Boolean(radiusMetersError)}
                  aria-invalid={Boolean(radiusMetersError)}
                />
                <p className="text-xs text-muted-foreground">
                  Contoh: 100 meter (50 – 50.000)
                </p>
                {radiusMetersError ? (
                  <p className="text-sm text-destructive">{radiusMetersError}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="wl-accuracy">Max GPS accuracy (meters)</Label>
                <Input
                  id="wl-accuracy"
                  name="maxGpsAccuracyMeters"
                  type="number"
                  step="1"
                  min="1"
                  max="500"
                  defaultValue="100"
                  placeholder="100"
                  invalid={Boolean(maxGpsAccuracyMetersError)}
                  aria-invalid={Boolean(maxGpsAccuracyMetersError)}
                />
                <p className="text-xs text-muted-foreground">
                  Contoh: 100 meter (default 100 m when empty)
                </p>
                {maxGpsAccuracyMetersError ? (
                  <p className="text-sm text-destructive">{maxGpsAccuracyMetersError}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wl-timezone">Timezone</Label>
                <select
                  id="wl-timezone"
                  name="timezone"
                  defaultValue="Asia/Jakarta"
                  aria-invalid={Boolean(timezoneError)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="Asia/Jakarta">Asia/Jakarta</option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur</option>
                  <option value="UTC">UTC</option>
                </select>
                {timezoneError ? (
                  <p className="text-sm text-destructive">{timezoneError}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="wl-status">Status</Label>
                <select
                  id="wl-status"
                  name="status"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as "active" | "inactive")
                  }
                  aria-invalid={Boolean(statusError)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                {statusError ? (
                  <p className="text-sm text-destructive">{statusError}</p>
                ) : null}
              </div>
            </div>

            <div
              role="status"
              className={`rounded-md border px-3 py-2 text-sm ${
                status === WORK_LOCATION_STATUS_INACTIVE
                  ? "border-border bg-muted/50 text-muted-foreground"
                  : "border-transparent bg-transparent"
              }`}
            >
              {WORK_LOCATION_STATUS_SUMMARY[status]}
              {status === WORK_LOCATION_STATUS_INACTIVE
                ? " You may save an incomplete location as a draft and complete the coordinates later."
                : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <SubmitButton />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}