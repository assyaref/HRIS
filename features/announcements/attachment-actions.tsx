"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { removeAnnouncementAttachmentAction } from "./actions";

export interface RemoveAttachmentButtonProps {
  announcementId: string;
  attachmentId: string;
  filename: string;
}

/** Remove an attachment (draft/unpublished announcements only). */
export function RemoveAttachmentButton({
  announcementId,
  attachmentId,
  filename,
}: RemoveAttachmentButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      await removeAnnouncementAttachmentAction({
        attachmentId,
        announcementId,
      });
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Remove ${filename}`}
      onClick={remove}
    >
      Remove
    </Button>
  );
}