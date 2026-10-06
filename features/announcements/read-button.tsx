"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { markAnnouncementReadAction } from "./actions";

export function MarkAnnouncementReadButton({
  announcementId,
}: {
  announcementId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function markRead() {
    startTransition(async () => {
      await markAnnouncementReadAction({ announcementId });
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={markRead}
    >
      {pending ? "Marking…" : "Mark as read"}
    </Button>
  );
}