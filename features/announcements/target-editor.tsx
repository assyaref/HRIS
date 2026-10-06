"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { updateAnnouncementTargetAction } from "./actions";
import {
  ANNOUNCEMENT_TARGET_LABELS,
  ANNOUNCEMENT_TARGET_TYPES,
} from "./constants";
import type { EmployeeOption } from "./announcement-form";

export interface AnnouncementTargetEditorProps {
  announcementId: string;
  targetType: string;
  recipientIds: string[];
  employees: EmployeeOption[];
}

/**
 * Audience editor for draft/unpublished announcements. Published items render
 * the audience as read-only (server-side policy rejects audience changes).
 */
export function AnnouncementTargetEditor({
  announcementId,
  targetType,
  recipientIds,
  employees,
}: AnnouncementTargetEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedType, setSelectedType] = useState(targetType);
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  function save(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateAnnouncementTargetAction({
        announcementId,
        targetType: String(formData.get("targetType") ?? "all_employees"),
        employeeIds: formData
          .getAll("employeeIds")
          .map((value) => String(value)),
      });
      setMessage({
        tone: result.ok ? "success" : "error",
        text: result.message,
      });
      router.refresh();
    });
  }

  return (
    <form action={save} className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="target-editor-type">Audience</Label>
          <select
            id="target-editor-type"
            name="targetType"
            value={selectedType}
            onChange={(event) => setSelectedType(event.target.value)}
            disabled={pending}
            className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {ANNOUNCEMENT_TARGET_TYPES.map((target) => (
              <option key={target} value={target}>
                {ANNOUNCEMENT_TARGET_LABELS[target]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedType === "selected_employees" ? (
        <div className="space-y-2">
          <Label htmlFor="target-editor-employees">Employees</Label>
          <select
            id="target-editor-employees"
            name="employeeIds"
            multiple
            size={Math.min(8, Math.max(3, employees.length))}
            defaultValue={recipientIds}
            className="border-input bg-background flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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

      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save audience"}
        </Button>
        {message ? (
          <span
            role={message.tone === "error" ? "alert" : "status"}
            className={
              message.tone === "success"
                ? "text-emerald-600 text-sm"
                : "text-destructive text-sm"
            }
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}