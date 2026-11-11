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
  /** System-level Super Administrator: may delete UNPUBLISHED announcements. */
  isSuperAdmin?: boolean;
  /** Compact layout for table rows. */
  compact?: boolean;
}

/**
 * Publish / unpublish / delete controls for the management listing and detail
 * views. The delete affordance mirrors `buildAnnouncementDeletionDecision`:
 * drafts need `announcements.delete` (and no reads), unpublished posts are
 * Super Administrator only, published posts must be unpublished first. The
 * server re-checks every rule.
 */
export function ManageAnnouncementActions({
  announcementId,
  status,
  readCount,
  canPublish,
  canDelete,
  isSuperAdmin = false,
  compact = false,
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

  const deletable =
    status === "draft"
      ? canDelete && readCount === 0
      : status === "unpublished"
        ? isSuperAdmin
        : false;
  const deleteHint =
    status === "published"
      ? "Unpublish dulu sebelum menghapus."
      : status === "unpublished" && !isSuperAdmin
        ? "Hanya Super Administrator yang dapat menghapus pengumuman yang di-unpublish."
        : readCount > 0
          ? "Sudah dibaca karyawan — tidak dapat dihapus."
          : "Hapus pengumuman ini";
  const showDelete = canDelete || isSuperAdmin;

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center justify-end gap-1.5"
          : "flex flex-wrap items-center gap-2"
      }
    >
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

      {showDelete ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={pending || !deletable}
          title={deleteHint}
          onClick={() => {
            if (
              !window.confirm(
                "Hapus pengumuman ini beserta lampiran dan catatan bacanya? Tindakan ini tidak dapat dibatalkan."
              )
            ) {
              return;
            }
            run(() => deleteAnnouncementAction({ announcementId }));
          }}
        >
          {compact ? "Hapus" : "Delete"}
        </Button>
      ) : null}

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