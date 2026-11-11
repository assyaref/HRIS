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
import { notifier } from "@/lib/notifier";

import { deleteAttendanceRecordAction } from "./management.actions";

/**
 * Delete one attendance record (Super Administrator only). The page renders
 * this only for SUPERADMIN sessions; the server action re-checks the role.
 */
export function AttendanceDeleteButton({
  attendanceId,
  summary,
  redirectTo,
  size = "sm",
}: {
  attendanceId: string;
  /** Human-readable "who / when" shown in the confirmation. */
  summary: string;
  /** Navigate here after a successful delete (detail page); else refresh. */
  redirectTo?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAttendanceRecordAction(attendanceId);
      if (result.ok) {
        notifier.success(result.message);
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size={size}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Hapus
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus data absensi?</DialogTitle>
            <DialogDescription>
              {summary}. Foto dan riwayat kejadian absensi ini ikut terhapus.
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={confirm}
            >
              {pending ? "Menghapus…" : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
