"use client";

import { useState, useTransition } from "react";
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

import { createPermissionRequestAction } from "./actions";
import {
  PERMISSION_TYPE_LABELS,
  PERMISSION_TYPES,
} from "./constants";

export function PermissionCreateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    const startLocal = String(formData.get("startAt") ?? "");
    const endLocal = String(formData.get("endAt") ?? "");
    startTransition(async () => {
      const result = await createPermissionRequestAction({
        permissionType: String(formData.get("permissionType") ?? ""),
        startAt: new Date(startLocal).toISOString(),
        endAt: new Date(endLocal).toISOString(),
        reason: String(formData.get("reason") ?? ""),
      });
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Request permission
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permission request</DialogTitle>
            <DialogDescription>
              Request time-based permission (for example, a short errand or a
              home-office session).
            </DialogDescription>
          </DialogHeader>
          <form action={submit} className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="permission-type">Type</Label>
              <select
                id="permission-type"
                name="permissionType"
                defaultValue={PERMISSION_TYPES[0]}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {PERMISSION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PERMISSION_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="permission-start">Start</Label>
                <Input
                  id="permission-start"
                  name="startAt"
                  type="datetime-local"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="permission-end">End</Label>
                <Input
                  id="permission-end"
                  name="endAt"
                  type="datetime-local"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="permission-reason">Reason</Label>
              <textarea
                id="permission-reason"
                name="reason"
                rows={3}
                required
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Submitting…" : "Submit request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
