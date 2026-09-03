"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import {
  cancelPermissionRequestAction,
  reviewPermissionRequestAction,
} from "./actions";

export interface PermissionRequestActionsProps {
  requestId: string;
  canCancel: boolean;
  canReview: boolean;
}

/** Cancellation (owner) + approval/rejection (reviewer) for permission requests. */
export function PermissionRequestActions({
  requestId,
  canCancel,
  canReview,
}: PermissionRequestActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  function cancel() {
    setMessage(null);
    startTransition(async () => {
      const result = await cancelPermissionRequestAction(requestId);
      setMessage({
        tone: result.ok ? "success" : "error",
        text: result.message,
      });
      router.refresh();
    });
  }

  function review(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await reviewPermissionRequestAction(requestId, {
        decision: String(formData.get("decision") ?? ""),
        reviewerNote:
          String(formData.get("reviewerNote") ?? "").trim() || undefined,
      });
      setMessage({
        tone: result.ok ? "success" : "error",
        text: result.message,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-md border px-3 py-2 text-sm ${
            message.tone === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {canCancel ? (
        <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
          Cancel request
        </Button>
      ) : null}

      {canReview ? (
        <form action={review} className="space-y-3 border-t border-border pt-4">
          <div className="space-y-2">
            <Label htmlFor="permission-review-decision">Decision</Label>
            <select
              id="permission-review-decision"
              name="decision"
              defaultValue="approved"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="permission-reviewer-note">
              Reviewer note (optional)
            </Label>
            <textarea
              id="permission-reviewer-note"
              name="reviewerNote"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Submit decision"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
