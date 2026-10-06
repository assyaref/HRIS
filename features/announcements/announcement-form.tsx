"use client";

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifier } from "@/lib/notifier";

import {
  createAnnouncementAction,
  updateAnnouncementAction,
} from "./actions";
import {
  ANNOUNCEMENT_CONTENT_MAX_LENGTH,
  ANNOUNCEMENT_MAX_ATTACHMENTS,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_PRIORITY_LABELS,
  ANNOUNCEMENT_TARGET_TYPES,
  ANNOUNCEMENT_TARGET_LABELS,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  type AnnouncementTargetType,
} from "./constants";
import type { AnnouncementDetail } from "./types";

export interface EmployeeOption {
  id: string;
  label: string;
}

export interface AnnouncementFormProps {
  mode: "create" | "edit";
  employees: EmployeeOption[];
  initial?: AnnouncementDetail | null;
}

const initialState = { ok: false, message: "" };

function toLocalDateTimeInput(value: Date | null | undefined): string {
  if (!value) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}`
  );
}

const selectClassName =
  "border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const textareaClassName =
  "border-input bg-background flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * Create/edit announcement form. Fields are validated twice: by the zod
 * schemas in `validation.ts` (server) and HTML constraints (client, UX only).
 */
export function AnnouncementForm({
  mode,
  employees,
  initial,
}: AnnouncementFormProps) {
  const router = useRouter();
  const action =
    mode === "create" ? createAnnouncementAction : updateAnnouncementAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [targetType, setTargetType] = useState<AnnouncementTargetType>(
    initial?.targetType ?? "all_employees"
  );

  useEffect(() => {
    if (!state.ok) return;
    notifier.success(state.message);
    router.push("/announcements/management");
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && initial ? (
        <input type="hidden" name="announcementId" value={initial.id} />
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="announcement-title">Title</Label>
        <Input
          id="announcement-title"
          name="title"
          placeholder="Announcement title"
          required
          maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
          defaultValue={initial?.title ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="announcement-content">Content</Label>
        <textarea
          id="announcement-content"
          name="content"
          required
          rows={8}
          maxLength={ANNOUNCEMENT_CONTENT_MAX_LENGTH}
          className={textareaClassName}
          defaultValue={initial?.content ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          Plain text only — HTML tags are not supported.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="announcement-priority">Priority</Label>
          <select
            id="announcement-priority"
            name="priority"
            defaultValue={initial?.priority ?? "normal"}
            className={selectClassName}
          >
            {ANNOUNCEMENT_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {ANNOUNCEMENT_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex h-10 items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="pinned"
              defaultChecked={initial?.pinned ?? false}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            Pin to the top
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="announcement-scheduled-at">Schedule for</Label>
          <Input
            id="announcement-scheduled-at"
            name="scheduledAt"
            type="datetime-local"
            defaultValue={toLocalDateTimeInput(initial?.scheduledAt ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to publish immediately.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="announcement-expires-at">Expires at</Label>
          <Input
            id="announcement-expires-at"
            name="expiresAt"
            type="datetime-local"
            defaultValue={toLocalDateTimeInput(initial?.expiresAt ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            The announcement disappears after this time.
          </p>
        </div>
      </div>

      {mode === "create" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="announcement-target">Target</Label>
            <select
              id="announcement-target"
              name="targetType"
              value={targetType}
              onChange={(event) =>
                setTargetType(event.target.value as AnnouncementTargetType)
              }
              className={selectClassName}
            >
              {ANNOUNCEMENT_TARGET_TYPES.map((target) => (
                <option key={target} value={target}>
                  {ANNOUNCEMENT_TARGET_LABELS[target]}
                </option>
              ))}
            </select>
          </div>

          {targetType === "selected_employees" ? (
            <div className="space-y-2">
              <Label htmlFor="announcement-employees">
                Employees
              </Label>
              <select
                id="announcement-employees"
                name="employeeIds"
                multiple
                required
                size={Math.min(8, Math.max(3, employees.length))}
                className={`${selectClassName} h-auto`}
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Hold Ctrl/Cmd to select multiple employees.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="announcement-attachments">Attachments (optional)</Label>
        <Input
          id="announcement-attachments"
          name="attachments"
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
        />
        <p className="text-xs text-muted-foreground">
          Up to {ANNOUNCEMENT_MAX_ATTACHMENTS} files, 10 MB each — PDF, PNG,
          JPG, DOC/DOCX or XLS/XLSX.
        </p>
      </div>

      {state.message && !state.ok ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create announcement"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}