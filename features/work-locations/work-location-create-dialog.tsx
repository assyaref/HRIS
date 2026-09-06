"use client";

import { useActionState, useState } from "react";
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
import type { WorkLocationProjectOption } from "./schemas";

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
  const [state, formAction] = useActionState(createWorkLocationAction, initialState);

  const nameError = state.fieldErrors?.name;
  const projectIdError = state.fieldErrors?.projectId;
  const latitudeError = state.fieldErrors?.latitude;
  const longitudeError = state.fieldErrors?.longitude;
  const radiusMetersError = state.fieldErrors?.radiusMeters;
  const maxGpsAccuracyMetersError = state.fieldErrors?.maxGpsAccuracyMeters;

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

          <form action={formAction} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wl-name">Location name</Label>
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
              <Label htmlFor="wl-project">Project</Label>
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
                <Label htmlFor="wl-latitude">Latitude</Label>
                <Input
                  id="wl-latitude"
                  name="latitude"
                  type="number"
                  step="0.000001"
                  placeholder="-6.2088"
                  invalid={Boolean(latitudeError)}
                  aria-invalid={Boolean(latitudeError)}
                />
                {latitudeError ? (
                  <p className="text-sm text-destructive">{latitudeError}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="wl-longitude">Longitude</Label>
                <Input
                  id="wl-longitude"
                  name="longitude"
                  type="number"
                  step="0.000001"
                  placeholder="106.8456"
                  invalid={Boolean(longitudeError)}
                  aria-invalid={Boolean(longitudeError)}
                />
                {longitudeError ? (
                  <p className="text-sm text-destructive">{longitudeError}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wl-radius">Radius (meters)</Label>
                <Input
                  id="wl-radius"
                  name="radiusMeters"
                  type="number"
                  step="1"
                  defaultValue="100"
                  placeholder="100"
                  invalid={Boolean(radiusMetersError)}
                  aria-invalid={Boolean(radiusMetersError)}
                />
                {radiusMetersError ? (
                  <p className="text-sm text-destructive">{radiusMetersError}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="wl-accuracy">Max GPS accuracy (m)</Label>
                <Input
                  id="wl-accuracy"
                  name="maxGpsAccuracyMeters"
                  type="number"
                  step="1"
                  defaultValue="100"
                  placeholder="100"
                  invalid={Boolean(maxGpsAccuracyMetersError)}
                  aria-invalid={Boolean(maxGpsAccuracyMetersError)}
                />
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="Asia/Jakarta">Asia/Jakarta</option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wl-status">Status</Label>
                <select
                  id="wl-status"
                  name="status"
                  defaultValue="active"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
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