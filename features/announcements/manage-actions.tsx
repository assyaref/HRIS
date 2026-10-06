"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import {
  deleteAnnouncementAction,
  publishAnnouncementAction,
  unpublishAnnouncementAction,
} from "./actions";
import type { AnnouncementStatus } from "./constants";

export interface ManageAnnouncementActionsProps {
  announcementId: string;
  status: AnnouncementStatus;
  readCount: number;
  canPublish: boolean;
  canDelete: boolean;
}

/**
 * Publish / unpublish / delete controls for the management listing and detail
 * views. Deletion is disabled client-side once the announcement has been read
 * (the server enforces the same rule).
 */
export function ManageAnnouncementActions({
  announcementId,
  status,
  readCount,
  canPublish,
  canDelete,
}: ManageAnnouncementActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  function run(
    action: () => Promise<{ ok: boolean; message: string }>
  ) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      router.refresh();
    });
  }

  const deletable = canDelete && readCount === 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canPublish && status === "published" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => unpublishAnnouncementAction({ announcementId }))
          }
        >
          Unpublish
        </Button>
      ) : null}

      {canPublish && status !== "published" ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => publishAnnouncementAction({ announcementId }))
          }
        >
          Publish
        </Button>
      ) : null}

      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending || !deletable}
        title={
          readCount > 0
            ? "Already read by employees — cannot be deleted."
            : "Delete this announcement"
        }
        onClick={() =>
          run(() => deleteAnnouncementAction({ announcementId }))
        }
      >
        Delete
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
  );
}